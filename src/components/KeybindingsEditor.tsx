import { useState, useEffect } from "react";
import { useKeybindings } from "../hooks/useKeybindings";
import {
  ACTION_LABELS,
  ACTION_SECTIONS,
  Action,
  keyLabel,
  actionForKey,
  DEFAULTS,
} from "../lib/keybindings";
import { eventToAccelerator, acceleratorLabel } from "../lib/accelerator";

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
      <div className="keybindings-header">
        <span className="field-label">click a key to rebind</span>
        <button
          type="button"
          className="help-reset"
          title="reset all keybindings to defaults"
          onClick={() => { resetBindings(); setCaptureError(null); }}
        >
          ↺
        </button>
      </div>

      {captureError && <div className="help-capture-error">{captureError}</div>}

      {ACTION_SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="help-section">{section.label}</div>
          {section.actions.map((action) => {
            const isCapturing = capturing === action;
            const isDefault = bindings[action] === DEFAULTS[action];
            return (
              <div
                key={action}
                className={`help-row help-row--bindable${isCapturing ? " help-row--capturing" : ""}`}
                onClick={() => {
                  setCapturing(action);
                  setCapturingGlobal(false);
                  setCaptureError(null);
                }}
                title="click to rebind"
              >
                <span className={`help-key${!isDefault ? " help-key--custom" : ""}`}>
                  {isCapturing ? "press a key…" : keyLabel(bindings[action])}
                </span>
                {ACTION_LABELS[action]}
              </div>
            );
          })}
        </div>
      ))}

      <div className="help-section">system-wide</div>
      <div
        className={`help-row help-row--bindable${capturingGlobal ? " help-row--capturing" : ""}`}
        onClick={() => {
          setCapturing(null);
          setCapturingGlobal(true);
          setCaptureError(null);
        }}
        title="click to rebind — works from any app"
      >
        <span className={`help-key${globalShortcut ? " help-key--custom" : ""}`}>
          {capturingGlobal ? "press a combo…" : acceleratorLabel(globalShortcut)}
        </span>
        show / hide todoish
      </div>
      {globalShortcut && (
        <div
          className="help-row help-row--bindable help-row--clear"
          onClick={() => { onGlobalShortcutChange(""); setCapturingGlobal(false); }}
          title="disable the global shortcut"
        >
          <span className="help-key">clear</span>
          turn the global shortcut off
        </div>
      )}
      <div className="help-note">needs a modifier · applies after a restart</div>

      <div className="help-section">app (fixed)</div>
      <div className="help-row"><span className="help-key">⌘W / ⌘H</span> hide</div>
      <div className="help-row"><span className="help-key">⌘Q</span> quit</div>
      <div className="help-row"><span className="help-key">⌘R</span> refresh</div>

      <div className="help-dismiss">esc cancels a capture</div>
    </div>
  );
}
