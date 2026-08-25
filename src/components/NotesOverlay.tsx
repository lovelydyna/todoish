import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface NotesOverlayProps {
  onClose: () => void;
}

/** A short filesystem-friendly title from the note's own first line, or a
 *  timestamp if there's nothing usable — either way, something reasonable
 *  is always ready to save under without asking. */
function autoName(content: string): string {
  const firstLine = content.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (firstLine) return firstLine.slice(0, 60);

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `note-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * A quick-capture notepad, no different in spirit from opening a scratch
 * file — write freely, then close it. Saved as its own markdown file in
 * ~/.todoish/notes/ under an auto-generated name, no prompt in the way;
 * todoish never reads them back.
 */
export function NotesOverlay({ onClose }: NotesOverlayProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const finishWriting = async () => {
    if (!content.trim()) { onClose(); return; }
    try {
      await invoke("save_note", { name: autoName(content), content });
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="overlay" onClick={finishWriting}>
      <div className="notes-panel" onClick={(e) => e.stopPropagation()}>
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
        {error && <div className="quickadd-problem">{error}</div>}
      </div>
    </div>
  );
}
