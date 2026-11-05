import { useState, useEffect } from "react";
import { useKeybindings } from "../hooks/useKeybindings";
import {
  ACTION_LABELS,
  ACTION_SECTIONS,
  Action,
  keyLabel,
  actionForKey,
} from "../lib/keybindings";
import { eventToAccelerator, acceleratorLabel } from "../lib/accelerator";

/** Keys that can't be rebound, listed so the shortcuts page is complete. */
const FIXED: { title: string; rows: [string, string][] }[] = [
  {
    title: "always",
    rows: [
      ["move down / up (as well as the arrows)", "j / k"],
      ["previous / next week or month (calendar)", "← / →"],
      ["close a dialog or go back", "esc"],
      ["hide window", "⌘W / ⌘H"],
      ["quit", "⌘Q"],
      ["refresh", "⌘R"],
    ],
  },
  {
    title: "notes terminal",
    rows: [
      ["list / change folder", "ls · cd"],
      ["make a folder (with parents)", "mkdir -p"],
      ["open or create a note", "vim name"],
      ["complete a name", "tab"],
      ["back to tasks", "esc"],
    ],
  },
  {
    title: "notes editor",
    rows: [
      ["start / stop typing", "i · esc"],
      ["save · save and close", ":w · :wq"],
      ["close · close without saving", ":q · :q!"],
      ["go to line 12", ":12"],
      ["select all, then delete", "⌘A · d"],
      ["delete / copy / paste a line", "dd · yy · p"],
      ["undo", "u"],
    ],
  },
];

interface KeybindingsEditorProps {
  /** Tauri accelerator, e.g. "CmdOrControl+Shift+T". Empty disables it. */
  globalShortcut: string;
  onGlobalShortcutChange: (accelerator: string) => void;
}

/**
 * The keybinding list and rebinder, living in the settings keybindings tab.
 *
 * While capturing, this swallows the next keypress at the window level so the
 * key being bound doesn't also trigger whatever it is currently bound to.
 */
export function KeybindingsEditor({
  globalShortcut,
  onGlobalShortcutChange,
}: KeybindingsEditorProps) {
  const { bindings, updateBinding, resetBindings } = useKeybindings();
  const [capturing, setCapturing] = useState<Action | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturingGlobal, setCapturingGlobal] = useState(false);

  // The global shortcut is an OS-level accelerator rather than a single key,
  // so it captures modifiers too and stores a different format.
  useEffect(() => {
    if (!capturingGlobal) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturingGlobal(false); setCaptureError(null); return; }

      const { accelerator, error } = eventToAccelerator(e);
      if (error) { setCaptureError(error); return; }
      if (!accelerator) return; // modifiers still going down

      setCaptureError(null);
      onGlobalShortcutChange(accelerator);
      setCapturingGlobal(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturingGlobal, onGlobalShortcutChange]);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturing(null); setCaptureError(null); return; }
      // Modifier-only presses aren't a binding yet — wait for the real key.
      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
      if (e.metaKey) { setCaptureError("⌘ shortcuts are reserved"); return; }

      const existing = actionForKey(bindings, e.key);
      if (existing && existing !== capturing) {
        setCaptureError(`already used by "${ACTION_LABELS[existing]}" — reassigning`);
      } else {
        setCaptureError(null);
      }
      updateBinding(capturing, e.key);
      setCapturing(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, bindings, updateBinding]);

  return (
    <div className="keybindings">
      <div className="kb-toolbar">
        <span className="setting-note">
          {capturing || capturingGlobal ? "Press the new key. Esc cancels." : "Click a shortcut to change it."}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => { resetBindings(); setCaptureError(null); }}
        >
          Reset all
        </button>
      </div>

      {captureError && <div className="callout callout--warn">{captureError}</div>}

      {ACTION_SECTIONS.map((section) => (
        <div key={section.label} className="kb-section">
          <h2 className="kb-section-title">{section.label}</h2>
          {section.actions.map((action) => {
            const isCapturing = capturing === action;
            return (
              <button
                type="button"
                key={action}
                className={`kb-row${isCapturing ? " kb-row--capturing" : ""}`}
                onClick={() => {
                  setCapturing(action);
                  setCapturingGlobal(false);
                  setCaptureError(null);
                }}
              >
                <span className="kb-label">{ACTION_LABELS[action]}</span>
                <kbd className={`kbd kbd--lg${isCapturing ? " kbd--capturing" : ""}`}>
                  {isCapturing ? "press a key…" : keyLabel(bindings[action])}
                </kbd>
              </button>
            );
          })}
        </div>
      ))}

      <div className="kb-section">
        <h2 className="kb-section-title">from any app</h2>
        <button
          type="button"
          className={`kb-row${capturingGlobal ? " kb-row--capturing" : ""}`}
          onClick={() => {
            setCapturing(null);
            setCapturingGlobal(true);
            setCaptureError(null);
          }}
        >
          <span className="kb-label">show / hide todoish</span>
          <kbd className={`kbd kbd--lg${capturingGlobal ? " kbd--capturing" : ""}`}>
            {capturingGlobal ? "press a combo…" : acceleratorLabel(globalShortcut)}
          </kbd>
        </button>
        <div className="kb-note">
          Needs a modifier like ⌘ or ⌥. Takes effect when you save.
          {globalShortcut && (
            <button
              type="button"
              className="link-btn"
              onClick={() => { onGlobalShortcutChange(""); setCapturingGlobal(false); }}
            >
              Turn off
            </button>
          )}
        </div>
      </div>

      {FIXED.map(({ title, rows }) => (
        <div key={title} className="kb-section">
          <h2 className="kb-section-title">{title}</h2>
          {rows.map(([label, keys]) => (
            <div key={label} className="kb-row kb-row--static">
              <span className="kb-label">{label}</span>
              <kbd className="kbd kbd--lg">{keys}</kbd>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
