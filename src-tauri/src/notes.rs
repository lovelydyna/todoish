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
pub fn save_note(name: &str, content: &str) -> Result<String, String> {
    let base = sanitize_name(name)?;
    let dir = notes_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut filename = format!("{base}.md");
    let mut attempt = 2;
    while dir.join(&filename).exists() {
        filename = format!("{base}-{attempt}.md");
        attempt += 1;
    }

    fs::write(dir.join(&filename), content).map_err(|e| e.to_string())?;
    Ok(filename)
}

/// One note, for the list in settings. `title` is the filename with its
/// extension dropped — that pair is what every command below takes and
/// returns, so the frontend never has to reconstruct a path itself.
#[derive(Debug, Clone, serde::Serialize)]
pub struct NoteSummary {
    pub filename: String,
    pub title: String,
    /// Unix seconds. Compared client-side for sorting; the frontend formats
    /// it for display in whatever style the rest of the app uses.
    pub modified: i64,
    /// First non-empty line, for a one-line preview in the list.
    pub preview: String,
}

fn note_path(filename: &str) -> Result<PathBuf, String> {
    // filename always comes back from list_notes or save_note — this guards
    // against a path smuggled in some other way (e.g. a hand-edited call)
    // reading or overwriting something outside the notes folder.
    if filename.is_empty()
        || filename.contains('/')
        || filename.contains('\\')
        || filename == "."
        || filename == ".."
    {
        return Err("Not a valid note filename.".into());
    }
    Ok(notes_dir().join(filename))
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

/// Every saved note, most recently modified first.
pub fn list_notes() -> Result<Vec<NoteSummary>, String> {
    let dir = notes_dir();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        // No notes folder yet just means no notes have been saved — not an error.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };

    let mut notes = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let filename = entry.file_name().to_string_lossy().into_owned();
        let title = filename.strip_suffix(".md").unwrap_or(&filename).to_string();
        let content = fs::read_to_string(&path).unwrap_or_default();
        let modified = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        notes.push(NoteSummary { filename, title, modified, preview: preview_of(&content) });
    }

    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(notes)
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

pub fn delete_note(filename: &str) -> Result<(), String> {
    fs::remove_file(note_path(filename)?).map_err(|e| e.to_string())
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
        assert!(note_path("sub/dir.md").is_err());
        assert!(note_path("").is_err());
        assert!(note_path(".").is_err());
    }

    #[test]
    fn note_path_accepts_an_ordinary_filename() {
        let path = note_path("idea.md").unwrap();
        assert_eq!(path.file_name().unwrap(), "idea.md");
    }
}
