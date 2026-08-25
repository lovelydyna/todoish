import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteSummary } from "../types";

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

const AUTOSAVE_DELAY = 600;

/**
 * The saved-notes browser: a list on the left, the selected note's full text
 * on the right — a scratchpad you come back to, not a form. Edits autosave a
 * short beat after you stop typing, the way Raycast's own Notes does, so
 * there is never a save step to remember.
 */
export function NotesPanel() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ filename: string; content: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setLoadingContent(true);
    setError(null);
    try {
      setContent(await invoke<string>("read_note", { filename }));
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

  const handleContentChange = (value: string) => {
    setContent(value);
    if (!selected) return;
    setStatus("saving");
    pendingSave.current = { filename: selected, content: value };
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      await flushPending();
      setStatus("saved");
    }, AUTOSAVE_DELAY);
  };

  const selectNote = async (filename: string) => {
    if (filename === selected) return;
    await flushPending();
    await openNote(filename);
  };

  const createNote = async () => {
    await flushPending();
    setError(null);
    try {
      const filename = await invoke<string>("save_note", { name: "untitled", content: "" });
      await loadList();
      await openNote(filename);
      textareaRef.current?.focus();
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteNote = async (filename: string) => {
    try {
      await invoke("delete_note", { filename });
      const list = await loadList();
      if (selected === filename) {
        pendingSave.current = null;
        if (list[0]) await openNote(list[0].filename);
        else { setSelected(null); setContent(""); }
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const selectedTitle = notes.find((n) => n.filename === selected)?.title ?? "";

  return (
    <div className="notes-panel-view">
      <div className="notes-list-col">
        <button type="button" className="notes-new-btn" onClick={createNote}>
          + new note
        </button>
        <div className="notes-list">
          {!loadingList && notes.length === 0 && (
            <div className="notes-list-empty">
              nothing saved yet — [{"q"}] captures one from anywhere
            </div>
          )}
          {notes.map((note) => (
            <div
              key={note.filename}
              className={`notes-list-item${note.filename === selected ? " notes-list-item--active" : ""}`}
              onClick={() => selectNote(note.filename)}
            >
              <div className="notes-list-item-row">
                <span className="notes-list-item-title">{note.title}</span>
                <span className="notes-list-item-time">{relativeStamp(note.modified)}</span>
              </div>
              {note.preview && <div className="notes-list-item-preview">{note.preview}</div>}
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
      </div>

      <div className="notes-editor-col">
        {selected ? (
          <>
            <div className="notes-editor-header">
              <span className="notes-editor-title">{selectedTitle}</span>
              <span className="notes-editor-status">
                {status === "saving" && "saving…"}
                {status === "saved" && "saved"}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              className="notes-editor-textarea"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              disabled={loadingContent}
              spellCheck={false}
            />
          </>
        ) : (
          !loadingList && (
            <div className="notes-editor-empty">
              {notes.length === 0 ? "create a note to get started" : "select a note"}
            </div>
          )
        )}
        {error && <div className="quickadd-problem notes-editor-error">{error}</div>}
      </div>
    </div>
  );
}
