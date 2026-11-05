//! Notes: `~/.todoish/notes/*.md`.
//!
//! The quick-capture overlay writes a note in two keystrokes and gets out of
//! the way; the notes tab in settings is where you come back to browse,
//! reopen, and keep editing them. Both read and write the same plain folder
//! of markdown files — there is no separate index or database, so the folder
//! is always the whole truth and stays legible to any other editor, note
//! app, or just Finder.

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

fn notes_dir() -> PathBuf {
    let home = dirs::home_dir().expect("could not find home directory");
    home.join(".todoish").join("notes")
}

/// Turns free-typed text into a filesystem-safe basename.
///
/// Slashes would otherwise be read as subdirectories, and a name of just
/// dots (".", "..") would collide with the directory entries of the same
/// name — both are rejected outright rather than silently mangled, since a
/// mangled name is a note saved somewhere other than where the user thinks.
fn sanitize_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("A note needs a name.".into());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("That name is reserved — pick another.".into());
    }

    let cleaned: String = trimmed
        .chars()
        .map(|c| match c {
            '/' | '\\' | '\0' => '-',
            c => c,
        })
        .collect();

    // A leading dot would make the file invisible in Finder/`ls` by
    // convention — surprising for something meant to be quickly found again.
    let cleaned = cleaned.trim_start_matches('.').trim();
    if cleaned.is_empty() {
        return Err("A note needs a name.".into());
    }

    Ok(cleaned.chars().take(120).collect())
}

/// Saves a note, returning the filename it was actually saved under.
///
/// A name already in use gets a numeric suffix rather than overwriting —
/// two brainstorms an hour apart with the same auto-generated name are two
/// different notes, not one clobbering the other.
/// `dir` is a folder relative to the notes root ("" or None for the root);
/// the returned path is relative to the root too, e.g. "work/idea.md".
pub fn save_note(name: &str, content: &str, dir: Option<&str>) -> Result<String, String> {
    let base = sanitize_name(name)?;
    let rel_dir = dir.unwrap_or("").trim_matches('/');
    let dir = rel_path(rel_dir)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut filename = format!("{base}.md");
    let mut attempt = 2;
    while dir.join(&filename).exists() {
        filename = format!("{base}-{attempt}.md");
        attempt += 1;
    }

    fs::write(dir.join(&filename), content).map_err(|e| e.to_string())?;
    Ok(join_rel(rel_dir, &filename))
}

fn join_rel(dir: &str, name: &str) -> String {
    if dir.is_empty() { name.to_string() } else { format!("{dir}/{name}") }
}

/// One entry in a notes folder: a note, or a sub-folder (`is_dir`).
/// `filename` is the path relative to the notes root — what every command
/// below takes and returns, so the frontend never builds a path itself.
#[derive(Debug, Clone, serde::Serialize)]
pub struct NoteSummary {
    pub filename: String,
    /// Last path component, without ".md" for notes.
    pub title: String,
    /// Unix seconds. Compared client-side for sorting; the frontend formats
    /// it for display in whatever style the rest of the app uses.
    pub modified: i64,
    /// First non-empty line, for a one-line preview in the list.
    pub preview: String,
    pub is_dir: bool,
}

/// Resolves a "/"-separated path relative to the notes root. Every
/// component must be a plain name — no "..", ".", hidden names, backslashes
/// or absolute paths — so nothing a caller passes can reach outside the
/// notes folder. The empty string is the root itself.
fn rel_path(rel: &str) -> Result<PathBuf, String> {
    let mut path = notes_dir();
    if rel.is_empty() {
        return Ok(path);
    }
    for part in rel.split('/') {
        if part.is_empty()
            || part.starts_with('.')
            || part.contains('\\')
            || part.contains('\0')
        {
            return Err("Not a valid note path.".into());
        }
        path.push(part);
    }
    Ok(path)
}

fn note_path(filename: &str) -> Result<PathBuf, String> {
    if filename.is_empty() {
        return Err("Not a valid note filename.".into());
    }
    rel_path(filename)
}

/// Creates a folder (and any missing parents) under the notes root.
pub fn make_dir(rel: &str) -> Result<String, String> {
    let rel = rel.trim().trim_matches('/');
    if rel.is_empty() {
        return Err("A folder needs a name.".into());
    }
    fs::create_dir_all(rel_path(rel)?).map_err(|e| e.to_string())?;
    Ok(rel.to_string())
}

fn preview_of(content: &str) -> String {
    content
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim()
        .chars()
        .take(140)
        .collect()
}

/// One folder's contents: sub-folders first (A–Z), then notes, most
/// recently modified first. `dir` is relative to the notes root.
pub fn list_notes(dir: Option<&str>) -> Result<Vec<NoteSummary>, String> {
    let rel_dir = dir.unwrap_or("").trim_matches('/');
    let path = rel_path(rel_dir)?;
    let entries = match fs::read_dir(&path) {
        Ok(e) => e,
        // No notes folder yet just means no notes have been saved — not an error.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };

    let mut dirs = Vec::new();
    let mut notes = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let modified = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        if path.is_dir() {
            dirs.push(NoteSummary {
                filename: join_rel(rel_dir, &name),
                title: name,
                modified,
                preview: String::new(),
                is_dir: true,
            });
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let title = name.strip_suffix(".md").unwrap_or(&name).to_string();
        let content = fs::read_to_string(&path).unwrap_or_default();
        notes.push(NoteSummary {
            filename: join_rel(rel_dir, &name),
            title,
            modified,
            preview: preview_of(&content),
            is_dir: false,
        });
    }

    dirs.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    dirs.extend(notes);
    Ok(dirs)
}

/// A note's full content.
pub fn read_note(filename: &str) -> Result<String, String> {
    fs::read_to_string(note_path(filename)?).map_err(|e| e.to_string())
}

/// Overwrites an existing note in place — unlike `save_note`, which is built
/// to never collide, this is specifically for editing the one file the
/// caller already has open, so a missing file is an error rather than
/// something to paper over by creating it fresh.
pub fn update_note(filename: &str, content: &str) -> Result<(), String> {
    let path = note_path(filename)?;
    if !path.exists() {
        return Err("That note no longer exists — it may have been deleted or moved.".into());
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

/// Deletes a note, or a folder only when it is already empty — a folder
/// delete never takes notes with it.
pub fn delete_note(filename: &str) -> Result<(), String> {
    let path = note_path(filename)?;
    if path.is_dir() {
        return fs::remove_dir(&path).map_err(|e| {
            if fs::read_dir(&path).map(|mut d| d.next().is_some()).unwrap_or(false) {
                "That folder isn't empty — delete its notes first.".to_string()
            } else {
                e.to_string()
            }
        });
    }
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slashes_are_replaced_rather_than_read_as_directories() {
        assert_eq!(sanitize_name("ideas/for later").unwrap(), "ideas-for later");
    }

    #[test]
    fn a_blank_name_is_rejected() {
        assert!(sanitize_name("   ").is_err());
    }

    #[test]
    fn dot_and_dotdot_are_rejected() {
        assert!(sanitize_name(".").is_err());
        assert!(sanitize_name("..").is_err());
    }

    #[test]
    fn a_leading_dot_is_stripped_so_the_file_stays_visible() {
        assert_eq!(sanitize_name(".hidden thought").unwrap(), "hidden thought");
    }

    #[test]
    fn a_very_long_name_is_truncated() {
        let long = "x".repeat(500);
        assert_eq!(sanitize_name(&long).unwrap().len(), 120);
    }

    #[test]
    fn preview_skips_leading_blank_lines() {
        assert_eq!(preview_of("\n\n  \nidea: widget\nmore detail"), "idea: widget");
    }

    #[test]
    fn preview_of_empty_content_is_empty() {
        assert_eq!(preview_of("\n \n"), "");
    }

    #[test]
    fn preview_is_truncated() {
        let long = "x".repeat(300);
        assert_eq!(preview_of(&long).len(), 140);
    }

    #[test]
    fn note_path_rejects_a_smuggled_directory_traversal() {
        assert!(note_path("../secrets.md").is_err());
        assert!(note_path("work/../../secrets.md").is_err());
        assert!(note_path("/etc/passwd").is_err());
        assert!(note_path("work//idea.md").is_err());
        assert!(note_path("work\\idea.md").is_err());
        assert!(note_path(".hidden/idea.md").is_err());
        assert!(note_path("").is_err());
        assert!(note_path(".").is_err());
    }

    #[test]
    fn note_path_accepts_a_note_in_a_subfolder() {
        let path = note_path("work/2026/idea.md").unwrap();
        assert!(path.starts_with(notes_dir()));
        assert!(path.ends_with("work/2026/idea.md"));
    }

    #[test]
    fn join_rel_handles_the_root() {
        assert_eq!(join_rel("", "idea.md"), "idea.md");
        assert_eq!(join_rel("work", "idea.md"), "work/idea.md");
    }

    #[test]
    fn note_path_accepts_an_ordinary_filename() {
        let path = note_path("idea.md").unwrap();
        assert_eq!(path.file_name().unwrap(), "idea.md");
    }
}
