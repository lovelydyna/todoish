import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteSummary } from "../types";
import { WindowControls } from "./WindowControls";

/** "3:14p" today, "Tue" this week, "Aug 12" further back — same grain as the
 *  rest of the app's date labels, just applied to a note's last-edit time. */
function relativeStamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(" AM", "a").replace(" PM", "p");
  }
  const daysAgo = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (daysAgo < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** A note's content is stored as one plain-text file with no title field of
 *  its own — the first line *is* the title, Bear/Apple-Notes style. This
 *  keeps the filename an internal storage handle only, so retitling a note
 *  never needs a rename on disk. */
function splitTitleBody(content: string): { title: string; body: string } {
  const idx = content.indexOf("\n");
  if (idx === -1) return { title: content, body: "" };
  return { title: content.slice(0, idx), body: content.slice(idx + 1) };
}

function joinTitleBody(title: string, body: string): string {
  return body ? `${title}\n${body}` : title;
}

/** The browse list shows what the note actually says, not its filename —
 *  `preview` is already the first non-empty line of content. */
function displayTitle(note: NoteSummary): string {
  return note.preview.trim() || "Untitled";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline markers only — the caller has already stripped any block-level
 *  prefix (heading hash, list bullet, blockquote arrow) off the line. */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

/** Renders exactly the markdown subset the formatting toolbar produces —
 *  headings, bold/italic/strike/underline/code, links, code blocks,
 *  blockquotes, and the three list flavors — not general-purpose markdown. */
function renderMarkdown(source: string): string {
  const lines = escapeHtml(source).split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | "check" | null = null;
  let inCode = false;
  const codeLines: string[] = [];

  const closeList = () => {
    if (list === "ol") html.push("</ol>");
    else if (list) html.push("</ul>");
    list = null;
  };

  for (const raw of lines) {
    if (raw.trim() === "```") {
      if (inCode) {
        html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        codeLines.length = 0;
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    const heading = raw.match(/^(#{1,3})\s+(.*)$/);
    const check = raw.match(/^-\s\[( |x)\]\s(.*)$/);
    const bullet = raw.match(/^-\s(.*)$/);
    const ordered = raw.match(/^\d+\.\s(.*)$/);
    const quote = raw.match(/^&gt;\s?(.*)$/);

    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (check) {
      if (list !== "check") { closeList(); html.push('<ul class="notes-preview-checklist">'); list = "check"; }
      const checked = check[1] === "x";
      html.push(`<li><input type="checkbox" disabled ${checked ? "checked" : ""} />${renderInline(check[2])}</li>`);
    } else if (bullet) {
      if (list !== "ul") { closeList(); html.push("<ul>"); list = "ul"; }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
    } else if (ordered) {
      if (list !== "ol") { closeList(); html.push("<ol>"); list = "ol"; }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
    } else if (quote) {
      closeList();
      html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
    } else if (raw.trim() === "") {
      closeList();
    } else {
      closeList();
      html.push(`<p>${renderInline(raw)}</p>`);
    }
  }
  closeList();
  if (inCode && codeLines.length) html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);

  return html.join("\n");
}

interface Selection {
  value: string;
  start: number;
  end: number;
}

/** Wraps the current selection in a marker pair — `**bold**`, `*italic*`,
 *  etc. With nothing selected, the markers land around the cursor so typing
 *  continues right inside them. */
function wrapSelection({ value, start, end }: Selection, before: string, after: string = before): Selection {
  const selected = value.slice(start, end);
  return {
    value: value.slice(0, start) + before + selected + after + value.slice(end),
    start: start + before.length,
    end: start + before.length + selected.length,
  };
}

/** Prefixes every line the selection touches — used for lists and quotes,
 *  where the marker belongs at the start of each line, not around the text. */
function prefixLines({ value, start, end }: Selection, makePrefix: (lineIndex: number) => string): Selection {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.length ? block.split("\n") : [""];
  const prefixed = lines.map((line, i) => makePrefix(i) + line).join("\n");
  return {
    value: value.slice(0, lineStart) + prefixed + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + prefixed.length,
  };
}

const AUTOSAVE_DELAY = 600;

interface NotesPanelProps {
  onHome: () => void;
  onSettings: () => void;
}

/**
 * A single-note writing surface: title up top, body below, autosaving a
 * short beat after you stop typing. Other notes live behind the browse
 * icon rather than in a permanent side list — this is a page you write on,
 * not a filing cabinet.
 */
export function NotesPanel({ onHome, onSettings }: NotesPanelProps) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ filename: string; content: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const browseRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const list = await invoke<NoteSummary[]>("list_notes");
      setNotes(list);
      return list;
    } catch (e) {
      setError(String(e));
      return [];
    } finally {
      setLoadingList(false);
    }
  }, []);

  const openNote = useCallback(async (filename: string) => {
    setSelected(filename);
    setPreviewing(false);
    setLoadingContent(true);
    setError(null);
    try {
      const content = await invoke<string>("read_note", { filename });
      const split = splitTitleBody(content);
      setTitle(split.title);
      setBody(split.body);
      setStatus("idle");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    loadList().then((list) => { if (list[0]) openNote(list[0].filename); });
  }, [loadList, openNote]);

  // Closes the browse dropdown on an outside click or Escape.
  useEffect(() => {
    if (!browsing) return;
    const onDown = (e: MouseEvent) => {
      if (browseRef.current && !browseRef.current.contains(e.target as Node)) setBrowsing(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBrowsing(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [browsing]);

  /** Flushes a still-pending autosave immediately — called before switching
   *  notes or unmounting, so a note never loses its last half-second of
   *  typing to a debounce that never got to fire. */
  const flushPending = useCallback(async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    try {
      await invoke("update_note", pending);
      setNotes((prev) =>
        prev.map((n) =>
          n.filename === pending.filename
            ? { ...n, preview: pending.content.split("\n").find((l) => l.trim())?.trim().slice(0, 140) ?? "" }
            : n
        )
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => () => { flushPending(); }, [flushPending]);

  const scheduleSave = useCallback((nextTitle: string, nextBody: string) => {
    if (!selected) return;
    setStatus("saving");
    pendingSave.current = { filename: selected, content: joinTitleBody(nextTitle, nextBody) };
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      await flushPending();
      setStatus("saved");
    }, AUTOSAVE_DELAY);
  }, [selected, flushPending]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    scheduleSave(value, body);
  };

  const handleBodyChange = (value: string) => {
    setBody(value);
    scheduleSave(title, value);
  };

  // After a formatting button rewrites the body, the selection has to be
  // restored on the next render — a controlled textarea's cursor snaps to
  // the end otherwise, undoing the point of wrapping just the selected text.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => {
    const pending = pendingSelection.current;
    if (!pending || !bodyRef.current) return;
    bodyRef.current.focus();
    bodyRef.current.setSelectionRange(pending.start, pending.end);
    pendingSelection.current = null;
  }, [body]);

  const applyFormat = (transform: (sel: Selection) => Selection) => {
    const el = bodyRef.current;
    if (!el) return;
    const result = transform({ value: body, start: el.selectionStart, end: el.selectionEnd });
    pendingSelection.current = { start: result.start, end: result.end };
    handleBodyChange(result.value);
  };

  const insertLink = (sel: Selection): Selection => {
    const selected = sel.value.slice(sel.start, sel.end);
    const before = `[${selected || "link"}](`;
    const url = "url";
    const value = sel.value.slice(0, sel.start) + before + url + ")" + sel.value.slice(sel.end);
    const urlStart = sel.start + before.length;
    return { value, start: urlStart, end: urlStart + url.length };
  };

  const renderedBody = useMemo(() => renderMarkdown(body), [body]);

  const formatButtons: { key: string; label: string; title: string; onClick: () => void }[] = [
    { key: "h",     label: "H",   title: "heading",       onClick: () => applyFormat((s) => prefixLines(s, () => "## ")) },
    { key: "b",     label: "B",   title: "bold",           onClick: () => applyFormat((s) => wrapSelection(s, "**")) },
    { key: "i",     label: "I",   title: "italic",         onClick: () => applyFormat((s) => wrapSelection(s, "*")) },
    { key: "s",     label: "S",   title: "strikethrough",  onClick: () => applyFormat((s) => wrapSelection(s, "~~")) },
    { key: "u",     label: "U",   title: "underline",      onClick: () => applyFormat((s) => wrapSelection(s, "<u>", "</u>")) },
    { key: "code",  label: "</>", title: "inline code",    onClick: () => applyFormat((s) => wrapSelection(s, "`")) },
    { key: "link",  label: "🔗",  title: "link",           onClick: () => applyFormat(insertLink) },
    { key: "block", label: "{ }", title: "code block",     onClick: () => applyFormat((s) => wrapSelection(s, "```\n", "\n```")) },
    { key: "quote", label: "❝",  title: "quote",          onClick: () => applyFormat((s) => prefixLines(s, () => "> ")) },
    { key: "ol",    label: "1.", title: "numbered list",  onClick: () => applyFormat((s) => prefixLines(s, (i) => `${i + 1}. `)) },
    { key: "ul",    label: "•",  title: "bullet list",    onClick: () => applyFormat((s) => prefixLines(s, () => "- ")) },
    { key: "check", label: "☑",  title: "checklist",      onClick: () => applyFormat((s) => prefixLines(s, () => "- [ ] ")) },
  ];

  const selectNote = async (filename: string) => {
    setBrowsing(false);
    if (filename === selected) return;
    await flushPending();
    await openNote(filename);
  };

  const createNote = useCallback(async () => {
    setBrowsing(false);
    await flushPending();
    setError(null);
    try {
      const filename = await invoke<string>("save_note", { name: `untitled-${Date.now()}`, content: "" });
      await loadList();
      await openNote(filename);
      titleRef.current?.focus();
    } catch (e) {
      setError(String(e));
    }
  }, [flushPending, loadList, openNote]);

  const deleteNote = async (filename: string) => {
    try {
      await invoke("delete_note", { filename });
      const list = await loadList();
      if (selected === filename) {
        pendingSave.current = null;
        if (list[0]) await openNote(list[0].filename);
        else { setSelected(null); setTitle(""); setBody(""); }
      }
    } catch (e) {
      setError(String(e));
    }
  };

  // A note-scoped shortcut layer, separate from the app's global keybindings —
  // ⌘N/⌘O only make sense while a note is actually the thing in focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !browsing) { onHome(); return; }
      if (!e.metaKey) return;
      if (e.key === "n") { e.preventDefault(); createNote(); }
      else if (e.key === "o") { e.preventDefault(); setBrowsing((v) => !v); }
      else if (e.key === "e" && selected) { e.preventDefault(); setFormatting(false); setPreviewing((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createNote, onHome, browsing, selected]);

  return (
    <div className="main notes-view" tabIndex={-1}>
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left">
          <WindowControls />
        </div>
        <div className="topbar-center" data-tauri-drag-region />
        <div className="topbar-right" ref={browseRef} style={{ position: "relative" }}>
          {status === "saving" && <span className="notes-save-hint">saving…</span>}
          {selected && (
            <button
              type="button"
              className={`topbar-icon-btn${previewing ? " topbar-icon-btn--on" : ""}`}
              title={previewing ? "edit [⌘E]" : "preview [⌘E]"}
              onClick={() => { setFormatting(false); setPreviewing((v) => !v); }}
            >{previewing ? "✎" : "◎"}</button>
          )}
          <button
            type="button"
            className="topbar-icon-btn"
            title="browse notes [⌘O]"
            onClick={() => setBrowsing((v) => !v)}
          >☰</button>
          <button
            type="button"
            className="topbar-icon-btn"
            title="new note [⌘N]"
            onClick={createNote}
          >+</button>
          <button className="topbar-icon-btn" title="settings" onClick={onSettings}>⚙</button>

          {browsing && (
            <div className="notes-browse-dropdown">
              {!loadingList && notes.length === 0 && (
                <div className="notes-list-empty">
                  nothing saved yet — [q] captures one from anywhere
                </div>
              )}
              {notes.map((note) => (
                <div
                  key={note.filename}
                  className={`notes-list-item${note.filename === selected ? " notes-list-item--active" : ""}`}
                  onClick={() => selectNote(note.filename)}
                >
                  <div className="notes-list-item-row">
                    <span className="notes-list-item-title">{displayTitle(note)}</span>
                    <span className="notes-list-item-time">{relativeStamp(note.modified)}</span>
                  </div>
                  <button
                    type="button"
                    className="notes-list-item-delete"
                    title="delete note"
                    onClick={(e) => { e.stopPropagation(); deleteNote(note.filename); }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="notes-write">
          <div className="notes-write-title-row">
            <button type="button" className="notes-back-btn" title="back to tasks [esc]" onClick={onHome}>‹</button>
            <input
              ref={titleRef}
              className="notes-write-title"
              value={title}
              placeholder="Untitled"
              onChange={(e) => handleTitleChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bodyRef.current?.focus(); } }}
              disabled={loadingContent}
            />
          </div>
          {previewing ? (
            <div
              className="notes-write-preview"
              dangerouslySetInnerHTML={{ __html: renderedBody || '<p class="notes-preview-empty">Nothing written yet.</p>' }}
            />
          ) : (
            <textarea
              ref={bodyRef}
              className="notes-write-body"
              value={body}
              placeholder="Start writing..."
              onChange={(e) => handleBodyChange(e.target.value)}
              disabled={loadingContent}
              spellCheck={false}
            />
          )}
          <div className="notes-write-footer">
            <span>{body.length} characters</span>
            {!previewing && (
              <button
                type="button"
                className={`notes-format-toggle${formatting ? " notes-format-toggle--active" : ""}`}
                title="formatting"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setFormatting((v) => !v)}
              >T</button>
            )}
          </div>
          {formatting && !previewing && (
            <div className="notes-format-bar">
              {formatButtons.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  className="notes-format-btn"
                  title={btn.title}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={btn.onClick}
                >{btn.label}</button>
              ))}
              <div className="notes-format-bar-spacer" />
              <button
                type="button"
                className="notes-format-btn"
                title="hide formatting"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setFormatting(false)}
              >✕</button>
            </div>
          )}
        </div>
      ) : (
        !loadingList && (
          <div className="notes-editor-empty">
            <button type="button" className="notes-new-btn" onClick={createNote}>+ new note</button>
          </div>
        )
      )}

      {error && <div className="quickadd-problem notes-editor-error">{error}</div>}
    </div>
  );
}
