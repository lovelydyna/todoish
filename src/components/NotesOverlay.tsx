import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface NotesOverlayProps {
  onClose: () => void;
}

/** A short filesystem-friendly title from the note's own first line, or a
 *  timestamp if there's nothing usable — either way, something reasonable
 *  is always ready by the time the name prompt appears. */
function autoName(content: string): string {
  const firstLine = content.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (firstLine) return firstLine.slice(0, 60);

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `note-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * A quick-capture notepad, no different in spirit from opening a scratch
 * file — write freely, then give it a name (or accept the suggested one) on
 * the way out. Saved as its own markdown file in ~/.todoish/notes/ for
 * organizing properly later; todoish never reads them back.
 */
export function NotesOverlay({ onClose }: NotesOverlayProps) {
  const [content, setContent] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => {
    if (!naming) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [naming]);

  /** Escape from the textarea: nothing typed just closes, anything typed
   *  moves to naming it rather than silently discarding a brainstorm. */
  const finishWriting = () => {
    if (!content.trim()) { onClose(); return; }
    setName(autoName(content));
    setNaming(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await invoke("save_note", { name: name.trim() || autoName(content), content });
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={naming ? undefined : finishWriting}>
      <div className="notes-panel" onClick={(e) => e.stopPropagation()}>
        {!naming ? (
          <>
            <div className="notes-title">notes</div>
            <textarea
              ref={textareaRef}
              className="notes-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); finishWriting(); }
              }}
              placeholder="brainstorm here…"
              spellCheck={false}
            />
            <div className="notes-hint">esc when done</div>
          </>
        ) : (
          <>
            <div className="notes-title">save as</div>
            <input
              ref={nameRef}
              className="quickadd-input notes-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") { e.preventDefault(); setNaming(false); }
              }}
              spellCheck={false}
              autoComplete="off"
            />
            {error && <div className="quickadd-problem">{error}</div>}
            <div className="notes-hint">
              {saving ? "saving…" : "↵ save · esc back to writing"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
