import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteSummary } from "../types";
import { WindowControls } from "./WindowControls";
import { IconTag } from "./IconTag";
import { ViewSwitch } from "./ViewSwitch";
import { GearIcon } from "./Icons";
import { useKeybindings } from "../hooks/useKeybindings";
import { normalKey, lineCol, VimBuffer } from "../lib/vim";
import { renderMarkdown } from "../lib/markdown";

/** "3:14p" today, "Tue" this week, "Aug 12" further back. */
function relativeStamp(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const d = new Date(unixSeconds * 1000);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(" AM", "a").replace(" PM", "p");
  }
  const daysAgo = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (daysAgo < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const parentDir = (path: string) => path.split("/").slice(0, -1).join("/");

/** Resolves a `:cd` argument against the current folder, terminal-style. */
function resolveDir(cwd: string, arg: string): string {
  if (!arg || arg === "~" || arg === "/") return "";
  const parts = arg.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  for (const p of arg.split("/").filter(Boolean)) {
    if (p === "..") parts.pop();
    else if (p !== ".") parts.push(p);
  }
  return parts.join("/");
}

/** A readable default name for a quick note: "2026-11-04 1903". */
function stampName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const AUTOSAVE_DELAY = 600;
type Mode = "normal" | "insert";

interface NotesPanelProps {
  /** Start on a fresh note rather than the file browser. */
  startNew?: boolean;
  onHome: () => void;
  onCalendar: () => void;
  onSettings: () => void;
}

/**
 * Notes as a tiny terminal: a folder listing you move through with vim keys
 * (j/k, l to open, h to go up), a modal editor for the note itself, and a
 * status line at the bottom that doubles as the `:` command line.
 *
 * Notes still autosave a beat after you stop typing, so `:w` is a
 * convenience rather than the only thing standing between you and lost text.
 */
export function NotesPanel({ startNew, onHome, onCalendar, onSettings }: NotesPanelProps) {
  const { bindings } = useKeybindings();

  // ── Browser state ──
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<NoteSummary[]>([]);
  const [row, setRow] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Editor state ──
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>("normal");
  const [preview, setPreview] = useState(false);
  const register = useRef("");
  const pendingKey = useRef("");
  const undoStack = useRef<{ text: string; cursor: number }[]>([]);

  // ── Status / command line ──
  const [command, setCommand] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteSummary | null>(null);
  const [dirty, setDirty] = useState(false);

  const browserRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ filename: string; content: string } | null>(null);

  const say = (text: string, error = false) => setMessage({ text, error });

  // Rows as shown, with "../" leading whenever we're inside a folder.
  const rows = useMemo<(NoteSummary | "..")[]>(
    () => (cwd ? ["..", ...entries] : entries),
    [cwd, entries]
  );

  const loadDir = useCallback(async (dir: string, select?: string) => {
    setLoading(true);
    try {
      const list = await invoke<NoteSummary[]>("list_notes", { dir });
      setCwd(dir);
      setEntries(list);
      const idx = select ? list.findIndex((e) => e.filename === select) : -1;
      setRow(idx >= 0 ? idx + (dir ? 1 : 0) : 0);
      return list;
    } catch (e) {
      say(String(e), true);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Saving ──
  const flushPending = useCallback(async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const pending = pendingSave.current;
    if (!pending) return true;
    pendingSave.current = null;
    try {
      await invoke("update_note", pending);
      setDirty(false);
      return true;
    } catch (e) {
      say(String(e), true);
      return false;
    }
  }, []);

  useEffect(() => () => { flushPending(); }, [flushPending]);

  const changeText = useCallback((next: string) => {
    setText(next);
    if (!open) return;
    setDirty(true);
    pendingSave.current = { filename: open, content: next };
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(flushPending, AUTOSAVE_DELAY);
  }, [open, flushPending]);

  // ── Opening and closing notes ──
  const openNote = useCallback(async (filename: string, startInsert = false) => {
    await flushPending();
    try {
      const content = await invoke<string>("read_note", { filename });
      setOpen(filename);
      setText(content);
      setCursor(startInsert ? content.length : 0);
      setMode(startInsert ? "insert" : "normal");
      setPreview(false);
      setDirty(false);
      undoStack.current = [];
      setMessage(null);
    } catch (e) {
      say(String(e), true);
    }
  }, [flushPending]);

  const closeNote = useCallback(async () => {
    await flushPending();
    const was = open;
    setOpen(null);
    setMode("normal");
    await loadDir(was ? parentDir(was) : cwd, was ?? undefined);
  }, [flushPending, open, cwd, loadDir]);

  const newNote = useCallback(async (name: string, dir: string) => {
    try {
      const filename = await invoke<string>("save_note", { name, content: "", dir });
      await openNote(filename, true);
    } catch (e) {
      say(String(e), true);
    }
  }, [openNote]);

  // Arrival: a fresh note when asked (the "q" quick-note key), else the root folder.
  useEffect(() => {
    if (startNew) newNote(stampName(), "");
    else loadDir("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Commands ──
  const runCommand = async (raw: string) => {
    setCommand(null);
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const arg = rest.join(" ");
    const here = open ? parentDir(open) : cwd;

    switch (cmd) {
      case "w":
        if (await flushPending()) say(`"${open}" written`);
        return;
      case "q": case "wq": case "x":
        if (open) await closeNote();
        else onHome();
        return;
      case "e": case "new": {
        if (!arg) { say("Usage: :e name", true); return; }
        const existing = entries.find((e) => !e.is_dir && e.title === arg.replace(/\.md$/, ""));
        if (existing && !open) await openNote(existing.filename);
        else await newNote(arg.replace(/\.md$/, ""), here);
        return;
      }
      case "mkdir": {
        if (!arg) { say("Usage: :mkdir name", true); return; }
        try {
          const made = await invoke<string>("make_note_dir", { path: resolveDir(here, arg) });
          if (open) await closeNote();
          await loadDir(parentDir(made), made);
          say(`Created ${made}/`);
        } catch (e) { say(String(e), true); }
        return;
      }
      case "cd": {
        if (open) await closeNote();
        const target = resolveDir(here, arg);
        try {
          await invoke("list_notes", { dir: target });
          await loadDir(target);
        } catch (e) { say(String(e), true); }
        return;
      }
      case "preview":
        if (open) setPreview((v) => !v);
        return;
      case "":
        return;
      default:
        say(`Not a command: ${cmd}`, true);
    }
  };

  // ── Browser keys ──
  const enterRow = (r: NoteSummary | "..") => {
    if (r === "..") loadDir(parentDir(cwd), cwd);
    else if (r.is_dir) loadDir(r.filename);
    else openNote(r.filename);
  };

  const deleteEntry = async (entry: NoteSummary) => {
    setConfirmDelete(null);
    try {
      await invoke("delete_note", { filename: entry.filename });
      const keep = row;
      const list = await loadDir(cwd);
      setRow(Math.min(keep, Math.max(0, list.length + (cwd ? 1 : 0) - 1)));
      say(`Deleted ${entry.title}${entry.is_dir ? "/" : ""}`);
    } catch (e) {
      say(String(e), true);
    }
  };

  const onBrowserKey = (e: React.KeyboardEvent) => {
    if (e.metaKey) return;
    const k = e.key;
    if (message && !confirmDelete) setMessage(null);
    if (confirmDelete) {
      e.preventDefault();
      if (k === "y") deleteEntry(confirmDelete);
      else { setConfirmDelete(null); setMessage(null); }
      return;
    }
    const current = rows[row];
    const combo = pendingKey.current + k;
    pendingKey.current = "";

    if (k === "j" || k === "ArrowDown") setRow((r) => Math.min(r + 1, rows.length - 1));
    else if (k === "k" || k === "ArrowUp") setRow((r) => Math.max(r - 1, 0));
    else if ((k === "l" || k === "Enter" || k === "ArrowRight") && current) enterRow(current);
    else if ((k === "h" || k === "-" || k === "ArrowLeft" || k === "Backspace") && cwd) loadDir(parentDir(cwd), cwd);
    else if (combo === "gg") setRow(0);
    else if (k === "G") setRow(rows.length - 1);
    else if (combo === "dd" && current && current !== "..") setConfirmDelete(current);
    else if (k === "g" || k === "d") pendingKey.current = k;
    else if (k === ":") { e.preventDefault(); setCommand(""); }
    else if (k === "Escape") onHome();
    else if (k === bindings["calendar"]) onCalendar();
    else if (k === bindings["settings"]) onSettings();
    else return;
    e.preventDefault();
  };

  // ── Editor keys ──
  const onEditorKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.metaKey) return;
    const el = e.currentTarget;
    if (message) setMessage(null);
    if (mode === "insert") {
      if (e.key === "Escape") {
        e.preventDefault();
        setCursor(Math.max(0, el.selectionStart - 1));
        setMode("normal");
      }
      return;
    }

    e.preventDefault();
    const k = e.key;
    if (k === ":") { setCommand(""); return; }
    if (k === "u") {
      const prev = undoStack.current.pop();
      if (prev) { changeText(prev.text); setCursor(prev.cursor); }
      else say("Already at oldest change");
      return;
    }
    if (k === "-") { closeNote(); return; }
    if (k.length > 1 && !k.startsWith("Arrow")) return; // Shift, Tab, etc.

    const buf: VimBuffer = { text, cursor, register: register.current };
    const pending = pendingKey.current;
    const result = normalKey(buf, k, pending);
    pendingKey.current = result.pending ?? "";
    register.current = result.register;
    if (result.text !== text) {
      undoStack.current.push({ text, cursor });
      changeText(result.text);
    } else if (result.insert) {
      undoStack.current.push({ text, cursor });
    }
    setCursor(result.cursor);
    if (result.insert) setMode("insert");
  };

  // Normal mode shows a block cursor by selecting the character under it.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !open || command !== null) return;
    el.focus();
    if (mode === "normal") el.setSelectionRange(cursor, Math.min(cursor + 1, text.length));
    else el.setSelectionRange(cursor, cursor);
    // In Insert mode the textarea owns the caret, so typing doesn't re-run
    // this; in Normal mode an edit (dd, x, p) re-places the block cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, mode, open, command, preview, mode === "normal" ? text : null]);

  useEffect(() => {
    if (!open && command === null) browserRef.current?.focus();
  }, [open, command, entries]);

  useEffect(() => { if (command !== null) commandRef.current?.focus(); }, [command]);

  // Keeps the highlighted browser row in view.
  useEffect(() => {
    browserRef.current?.querySelector(".vim-row--selected")?.scrollIntoView({ block: "nearest" });
  }, [row]);

  // ⌘O / ⌘E / ⌘N work from anywhere in the view, as before.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "o") { e.preventDefault(); if (open) closeNote(); }
      else if (e.key === "e" && open) { e.preventDefault(); setPreview((v) => !v); }
      else if (e.key === "n") { e.preventDefault(); newNote(stampName(), open ? parentDir(open) : cwd); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cwd, closeNote, newNote]);

  const pos = lineCol(text, cursor);
  const path = `~/notes/${open ?? (cwd ? `${cwd}/` : "")}`;
  const hints = open
    ? mode === "insert"
      ? "esc to stop typing"
      : "i type · :w save · :q close · - files"
    : "j/k move · l open · h up · :e new · :mkdir · dd delete";

  return (
    <div className="main notes-view" tabIndex={-1}>
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left">
          <WindowControls />
        </div>
        <div className="topbar-center">
          <ViewSwitch active="notes" onSelect={(v) => (v === "tasks" ? onHome() : onCalendar())} />
        </div>
        <div className="topbar-right">
          <IconTag label="settings" keyHint={bindings["settings"]}>
            <button className="topbar-icon-btn" aria-label="settings" onClick={onSettings}><GearIcon /></button>
          </IconTag>
        </div>
      </div>

      <div className="vim-path" title={path}>
        {/* Each segment is a link back up the tree, like a clickable prompt. */}
        <button type="button" className="vim-crumb" onClick={() => { if (open) closeNote(); loadDir(""); }}>~/notes</button>
        {(open ?? cwd).split("/").filter(Boolean).map((part, i, all) => {
          const target = all.slice(0, i + 1).join("/");
          const isFile = !!open && i === all.length - 1;
          return (
            <span key={target}>
              <span className="vim-sep">/</span>
              {isFile ? (
                <span className="vim-crumb vim-crumb--file">{part}</span>
              ) : (
                <button type="button" className="vim-crumb"
                  onClick={async () => { if (open) await closeNote(); loadDir(target); }}>
                  {part}
                </button>
              )}
            </span>
          );
        })}
        {dirty && <span className="vim-dirty">[+]</span>}
      </div>

      {open ? (
        preview ? (
          <div
            className="notes-write-preview vim-preview"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) || '<p class="notes-preview-empty">Nothing written yet.</p>' }}
          />
        ) : (
          <textarea
            ref={textRef}
            className={`vim-text vim-text--${mode}`}
            value={text}
            readOnly={mode === "normal"}
            onChange={(e) => changeText(e.target.value)}
            onKeyDown={onEditorKey}
            onMouseUp={(e) => setCursor(e.currentTarget.selectionStart)}
            spellCheck={false}
            aria-label={`note ${open}, ${mode} mode`}
          />
        )
      ) : (
        <div
          ref={browserRef}
          className="vim-browser"
          tabIndex={0}
          role="listbox"
          aria-label={`files in ${path}`}
          onKeyDown={onBrowserKey}
        >
          {rows.map((r, i) => {
            const name = r === ".." ? "../" : r.is_dir ? `${r.title}/` : r.title;
            return (
              <div
                key={r === ".." ? ".." : r.filename}
                role="option"
                aria-selected={i === row}
                className={
                  "vim-row" +
                  (i === row ? " vim-row--selected" : "") +
                  (r === ".." || r.is_dir ? " vim-row--dir" : "")
                }
                onClick={() => { setRow(i); enterRow(r); }}
              >
                <span className="vim-name">{name}</span>
                {r !== ".." && !r.is_dir && (
                  <>
                    <span className="vim-preview-line">{r.preview}</span>
                    <span className="vim-time">{relativeStamp(r.modified)}</span>
                  </>
                )}
              </div>
            );
          })}
          {!loading && entries.length === 0 && (
            <div className="vim-empty">
              Empty folder. Type <kbd className="kbd">:e name</kbd> to start a note.
            </div>
          )}
        </div>
      )}

      <div className={`vim-status${message?.error ? " vim-status--error" : ""}`}>
        {command !== null ? (
          <form
            className="vim-command"
            onSubmit={(e) => { e.preventDefault(); runCommand(command); }}
          >
            <span>:</span>
            <input
              ref={commandRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setCommand(null); } }}
              spellCheck={false}
              autoComplete="off"
              aria-label="command"
            />
          </form>
        ) : (
          <>
            <span className={`vim-mode vim-mode--${open ? mode : "files"}`}>
              {open ? (mode === "insert" ? "INSERT" : "NORMAL") : "FILES"}
            </span>
            <span className="vim-message">
              {confirmDelete
                ? `Delete ${confirmDelete.title}${confirmDelete.is_dir ? "/" : ""}? y/n`
                : message?.text ?? hints}
            </span>
            {open && <span className="vim-pos">{pos.line}:{pos.col}</span>}
          </>
        )}
      </div>
    </div>
  );
}
