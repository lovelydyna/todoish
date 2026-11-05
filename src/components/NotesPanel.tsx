import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteSummary } from "../types";
import { WindowControls } from "./WindowControls";
import { IconTag } from "./IconTag";
import { ViewSwitch } from "./ViewSwitch";
import { GearIcon } from "./Icons";
import { useKeybindings } from "../hooks/useKeybindings";
import { normalKey, lineCol, lineToPos, VimBuffer } from "../lib/vim";
import { resolveDir, splitTarget, promptPath, commonPrefix } from "../lib/notesShell";

/** One line of terminal scrollback. */
interface Out {
  kind: "cmd" | "out" | "err";
  text?: string;
  /** The prompt a typed command was entered at. */
  prompt?: string;
  /** `ls` output, so folders can be coloured. */
  items?: { name: string; dir: boolean }[];
}

type Mode = "normal" | "insert" | "visual";

const SCROLLBACK = 500;
const parentDir = (path: string) => path.split("/").slice(0, -1).join("/");

const HELP = [
  "ls [dir]          list a folder",
  "cd <dir>          change folder (.. up, ~ home)",
  "pwd               show the current folder",
  "mkdir [-p] <dir>  make a folder (-p: with parents)",
  "vim <note>        open or create a note",
  "touch <note>      create an empty note",
  "cat <note>        print a note",
  "rm <note>         delete a note",
  "rmdir <dir>       delete an empty folder",
  "clear             clear the screen",
  "exit              back to Tasks",
];

/** A readable default name for a quick note: "2026-11-04 1903". */
function stampName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}

interface NotesPanelProps {
  /** Start on a fresh note rather than the prompt. */
  startNew?: boolean;
  onHome: () => void;
  onCalendar: () => void;
  onSettings: () => void;
}

/**
 * Notes as a small terminal over ~/.todoish/notes: you move around with
 * `cd`, see what's there with `ls`, and open a note with `vim <name>`.
 * Notes open in a modal editor with line numbers; like vim, nothing is
 * written until `:w` (or `:wq`), and `:q!` throws changes away.
 */
export function NotesPanel({ startNew, onHome, onCalendar, onSettings }: NotesPanelProps) {
  const { bindings } = useKeybindings();

  // ── Terminal ──
  const [cwd, setCwd] = useState("");
  const [out, setOut] = useState<Out[]>([]);
  const [input, setInput] = useState("");
  const history = useRef<string[]>([]);
  const historyAt = useRef(-1);

  // ── Editor ──
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>("normal");
  const [command, setCommand] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const register = useRef("");
  const pendingKey = useRef("");
  const undoStack = useRef<{ text: string; cursor: number }[]>([]);
  const dirty = open !== null && text !== saved;
  // Read by onSelect, which can fire in the same tick as the Esc that leaves
  // Insert mode — state would still say "insert" there and undo the move.
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;

  const promptRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);

  const print = useCallback((...lines: Out[]) => {
    setOut((o) => [...o, ...lines].slice(-SCROLLBACK));
  }, []);
  const err = (text: string) => print({ kind: "err", text });

  const list = (dir: string) => invoke<NoteSummary[]>("list_notes", { dir });

  const dirExists = async (dir: string) =>
    !dir || (await list(parentDir(dir))).some((e) => e.is_dir && e.filename === dir);

  // ── Editor: open, save, close ──
  const openFile = useCallback(async (filename: string, insert = false) => {
    const content = await invoke<string>("read_note", { filename });
    setOpen(filename);
    setText(content);
    setSaved(content);
    setCursor(insert ? content.length : 0);
    setMode(insert ? "insert" : "normal");
    setCommand(null);
    setMessage(null);
    undoStack.current = [];
    pendingKey.current = "";
  }, []);

  /** `vim name` / `:e name`: opens a note, creating it when it's new. */
  const openByName = async (arg: string, report: (msg: string) => void) => {
    const { dir, name } = splitTarget(cwd, arg.trim());
    if (!name) { report("vim: give a note name, e.g. vim ideas"); return; }
    if (!(await dirExists(dir))) { report(`vim: ${arg}: no such folder`); return; }
    const hit = (await list(dir)).find((e) => e.title === name);
    if (hit?.is_dir) { report(`vim: ${arg}: is a folder`); return; }
    const filename = hit?.filename ?? await invoke<string>("save_note", { name, content: "", dir });
    await openFile(filename);
  };

  const save = async () => {
    if (!open) return false;
    try {
      await invoke("update_note", { filename: open, content: text });
      setSaved(text);
      setMessage({ text: `"${open.split("/").pop()}" ${text.split("\n").length}L written` });
      return true;
    } catch (e) {
      setMessage({ text: String(e), error: true });
      return false;
    }
  };

  const closeEditor = () => {
    setOpen(null);
    setMode("normal");
    setCommand(null);
    setMessage(null);
  };

  // Switching views isn't `:q!` — unsaved text is written on the way out.
  const latest = useRef({ open, text, saved });
  latest.current = { open, text, saved };
  useEffect(() => () => {
    const { open, text, saved } = latest.current;
    if (open && text !== saved) invoke("update_note", { filename: open, content: text });
  }, []);

  // Arrival: a fresh note for the "q" quick-note key, else the prompt.
  useEffect(() => {
    if (!startNew) return;
    invoke<string>("save_note", { name: stampName(), content: "", dir: "" })
      .then((f) => openFile(f, true))
      .catch((e) => err(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shell ──
  const run = async (line: string) => {
    print({ kind: "cmd", prompt: promptPath(cwd), text: line });
    const trimmed = line.trim();
    if (!trimmed) return;
    if (history.current[history.current.length - 1] !== trimmed) history.current.push(trimmed);
    historyAt.current = -1;

    const [cmd] = trimmed.split(/\s+/, 1);
    const arg = trimmed.slice(cmd.length).trim();

    try {
      switch (cmd) {
        case "ls": {
          const dir = arg ? resolveDir(cwd, arg) : cwd;
          if (!(await dirExists(dir))) { err(`ls: ${arg}: no such folder`); return; }
          const entries = await list(dir);
          if (entries.length) print({ kind: "out", items: entries.map((e) => ({ name: e.title, dir: e.is_dir })) });
          return;
        }
        case "cd": {
          const dir = resolveDir(cwd, arg);
          if (!(await dirExists(dir))) { err(`cd: no such folder: ${arg}`); return; }
          setCwd(dir);
          return;
        }
        case "pwd":
          print({ kind: "out", text: promptPath(cwd) });
          return;
        case "mkdir": {
          const parents = /^-p\s+/.test(arg);
          const name = arg.replace(/^-p\s+/, "");
          if (!name) { err("mkdir: give a folder name"); return; }
          const dir = resolveDir(cwd, name);
          if (await dirExists(dir)) { err(`mkdir: ${name}: already exists`); return; }
          if (!parents && !(await dirExists(parentDir(dir)))) {
            err(`mkdir: ${name}: no such folder (use mkdir -p)`);
            return;
          }
          await invoke("make_note_dir", { path: dir });
          return;
        }
        case "vim": case "vi": case "nvim":
          await openByName(arg, err);
          return;
        case "touch": {
          const { dir, name } = splitTarget(cwd, arg);
          if (!name) { err("touch: give a note name"); return; }
          if (!(await dirExists(dir))) { err(`touch: ${arg}: no such folder`); return; }
          if (!(await list(dir)).some((e) => e.title === name)) {
            await invoke("save_note", { name, content: "", dir });
          }
          return;
        }
        case "cat": case "rm": case "rmdir": {
          const { dir, name } = splitTarget(cwd, arg);
          if (!name) { err(`${cmd}: give a name`); return; }
          const hit = (await dirExists(dir)) ? (await list(dir)).find((e) => e.title === name) : undefined;
          if (!hit) { err(`${cmd}: ${arg}: no such ${cmd === "rmdir" ? "folder" : "note"}`); return; }
          if (cmd !== "rmdir" && hit.is_dir) { err(`${cmd}: ${arg}: is a folder`); return; }
          if (cmd === "rmdir" && !hit.is_dir) { err(`rmdir: ${arg}: not a folder`); return; }
          if (cmd === "cat") {
            const content = await invoke<string>("read_note", { filename: hit.filename });
            print(...content.split("\n").map((t) => ({ kind: "out" as const, text: t })));
          } else {
            await invoke("delete_note", { filename: hit.filename });
          }
          return;
        }
        case "clear":
          setOut([]);
          return;
        case "help":
          print(...HELP.map((t) => ({ kind: "out" as const, text: t })));
          return;
        case "exit":
          onHome();
          return;
        default:
          err(`command not found: ${cmd}`);
      }
    } catch (e) {
      err(`${cmd}: ${String(e)}`);
    }
  };

  /** Tab: completes the argument against the folder it points into. */
  const complete = async () => {
    const space = input.indexOf(" ");
    if (space === -1) return;
    const cmd = input.slice(0, space);
    const arg = input.slice(space + 1).replace(/^-p\s+/, "");
    const flag = input.slice(space + 1, input.length - arg.length);
    const slash = arg.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : arg.slice(0, slash + 1);
    const base = arg.slice(slash + 1);
    const dir = dirPart ? resolveDir(cwd, dirPart) : cwd;
    const foldersOnly = ["cd", "ls", "mkdir", "rmdir"].includes(cmd);
    const matches = (await list(dir).catch(() => []))
      .filter((e) => (!foldersOnly || e.is_dir) && e.title.startsWith(base))
      .map((e) => (e.is_dir ? `${e.title}/` : e.title));
    if (matches.length === 0) return;
    const filled = matches.length === 1 ? matches[0] : commonPrefix(matches);
    if (filled.length > base.length) setInput(`${cmd} ${flag}${dirPart}${filled}`);
    else {
      print({ kind: "cmd", prompt: promptPath(cwd), text: input },
        { kind: "out", items: matches.map((m) => ({ name: m.replace(/\/$/, ""), dir: m.endsWith("/") })) });
    }
  };

  const onPromptKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); const line = input; setInput(""); run(line); }
    else if (e.key === "Tab") { e.preventDefault(); complete(); }
    else if (e.key === "Escape") onHome();
    else if (e.ctrlKey && e.key === "l") { e.preventDefault(); setOut([]); }
    else if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      print({ kind: "cmd", prompt: promptPath(cwd), text: `${input}^C` });
      setInput("");
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const h = history.current;
      if (!h.length) return;
      let at = historyAt.current === -1 ? h.length : historyAt.current;
      at = e.key === "ArrowUp" ? Math.max(0, at - 1) : at + 1;
      historyAt.current = at >= h.length ? -1 : at;
      setInput(at >= h.length ? "" : h[at]);
    }
  };

  // ── Editor commands (`:`) ──
  const changeText = (next: string, at: number) => {
    undoStack.current.push({ text, cursor });
    setText(next);
    setCursor(at);
  };

  const runEx = async (raw: string) => {
    setCommand(null);
    const c = raw.trim();
    const say = (t: string, error = false) => setMessage({ text: t, error });
    const unsaved = "E37: No write since last change (add ! to override)";

    if (/^\d+$/.test(c)) { setCursor(lineToPos(text, Number(c))); return; }
    if (c === "$") { setCursor(lineToPos(text, Infinity)); return; }
    if (c === "%d") { register.current = text; changeText("", 0); say(`${text.split("\n").length} fewer lines`); return; }

    switch (c) {
      case "w": await save(); return;
      case "wq": case "x": if (await save()) closeEditor(); return;
      case "q": if (dirty) say(unsaved, true); else closeEditor(); return;
      case "q!": closeEditor(); return;
      case "e": setMode("insert"); return;
      case "e!": setText(saved); setCursor(0); say("reverted to last write"); return;
      case "": return;
    }
    if (c.startsWith("e ")) {
      if (dirty) { say(unsaved, true); return; }
      await openByName(c.slice(2), (m) => say(m, true));
      return;
    }
    say(`E492: Not an editor command: ${c}`, true);
  };

  // ── Editor keys ──
  const onEditorKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (message && !e.metaKey) setMessage(null);

    // ⌘A selects the whole note; then d / x / ⌫ deletes it, y copies it.
    if (e.metaKey && e.key === "a" && mode !== "insert") { e.preventDefault(); setMode("visual"); return; }
    if (e.metaKey) return;

    if (mode === "insert") {
      if (e.key === "Escape") {
        e.preventDefault();
        modeRef.current = "normal";
        const at = e.currentTarget.selectionStart;
        // Vim steps back one on Esc, but never onto the previous line.
        setCursor(at > 0 && text[at - 1] !== "\n" ? at - 1 : at);
        setMode("normal");
      }
      return;
    }

    e.preventDefault();
    const k = e.key;
    if (mode === "visual") {
      setMode("normal");
      if (["d", "x", "Backspace", "Delete"].includes(k)) {
        register.current = text;
        changeText("", 0);
      } else if (k === "y") {
        register.current = text;
        setMessage({ text: `${text.split("\n").length} lines yanked` });
      }
      return;
    }

    if (k === ":") { setCommand(""); return; }
    if (k === "u") {
      const prev = undoStack.current.pop();
      if (prev) { setText(prev.text); setCursor(prev.cursor); }
      else setMessage({ text: "Already at oldest change" });
      return;
    }
    if (k.length > 1 && !k.startsWith("Arrow")) return; // Shift, Tab, Escape…

    const buf: VimBuffer = { text, cursor, register: register.current };
    const result = normalKey(buf, k, pendingKey.current);
    pendingKey.current = result.pending ?? "";
    register.current = result.register;
    if (result.text !== text || result.insert) undoStack.current.push({ text, cursor });
    setText(result.text);
    setCursor(result.cursor);
    if (result.insert) setMode("insert");
  };

  // Normal mode shows a block cursor by selecting the character under it;
  // visual mode selects everything.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !open || command !== null) return;
    el.focus();
    if (mode === "visual") el.setSelectionRange(0, text.length);
    else if (mode === "normal") el.setSelectionRange(cursor, Math.min(cursor + 1, text.length));
    else el.setSelectionRange(cursor, cursor);
    // In Insert mode the textarea owns the caret, so typing doesn't re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, mode, open, command, mode === "insert" ? null : text]);

  useEffect(() => { if (command !== null) commandRef.current?.focus(); }, [command]);
  useEffect(() => { if (!open) promptRef.current?.focus(); }, [open]);
  useEffect(() => {
    screenRef.current?.scrollTo({ top: screenRef.current.scrollHeight });
  }, [out]);

  const pos = lineCol(text, cursor);
  const lineCount = text.split("\n").length;

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

      {open ? (
        <>
          <div className="vim-editor">
            <div className="vim-gutter" ref={gutterRef} aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className={`vim-ln${i + 1 === pos.line ? " vim-ln--current" : ""}`}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textRef}
              className={`vim-text vim-text--${mode}`}
              value={text}
              wrap="off"
              readOnly={mode !== "insert"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onEditorKey}
              onSelect={(e) => { if (modeRef.current === "insert") setCursor(e.currentTarget.selectionStart); }}
              onMouseUp={(e) => {
                if (modeRef.current === "normal") setCursor(e.currentTarget.selectionStart);
              }}
              onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
              spellCheck={false}
              aria-label={`note ${open}, ${mode} mode`}
            />
          </div>

          <div className={`vim-status${message?.error ? " vim-status--error" : ""}`}>
            {command !== null ? (
              <form className="vim-command" onSubmit={(e) => { e.preventDefault(); runEx(command); }}>
                <span>:</span>
                <input
                  ref={commandRef}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setCommand(null); } }}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="editor command"
                />
              </form>
            ) : (
              <>
                <span className={`vim-mode vim-mode--${mode}`}>{mode.toUpperCase()}</span>
                <span className="vim-message">
                  {message?.text ?? `${open}${dirty ? " [+]" : ""}`}
                </span>
                <span className="vim-pos">{pos.line}:{pos.col}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="term" ref={screenRef} onClick={() => promptRef.current?.focus()}>
          {out.map((o, i) => (
            <div key={i} className={`term-line term-line--${o.kind}`}>
              {o.kind === "cmd" && <span className="term-prompt">{o.prompt} $ </span>}
              {o.items
                ? o.items.map((it) => (
                    <span key={it.name} className={`term-item${it.dir ? " term-item--dir" : ""}`}>
                      {it.dir ? `${it.name}/` : it.name}
                    </span>
                  ))
                : o.text}
            </div>
          ))}
          <div className="term-line term-input-line">
            <span className="term-prompt">{promptPath(cwd)} $ </span>
            <input
              ref={promptRef}
              className="term-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onPromptKey}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="notes terminal"
            />
          </div>
        </div>
      )}
    </div>
  );
}
