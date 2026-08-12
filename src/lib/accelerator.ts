/**
 * Tauri accelerator strings — the format the global shortcut is stored in,
 * e.g. "CmdOrControl+Shift+T".
 *
 * These are separate from the in-app keybindings, which are plain
 * `KeyboardEvent.key` values. A global shortcut is captured by the OS before
 * any app sees it, so it must carry at least one modifier: binding a bare
 * letter would swallow that key everywhere on the system.
 */

/** Order matters — Tauri parses left to right and this is its conventional order. */
const MODIFIER_ORDER = ["CmdOrControl", "Control", "Alt", "Shift"] as const;

const MODIFIER_SYMBOLS: Record<string, string> = {
  CmdOrControl: "⌘",
  Command: "⌘",
  Cmd: "⌘",
  Super: "⌘",
  Control: "⌃",
  Ctrl: "⌃",
  Alt: "⌥",
  Option: "⌥",
  Shift: "⇧",
};

/** Named keys Tauri accepts, mapped from their KeyboardEvent.key spelling. */
const NAMED_KEYS: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  ";": "Semicolon",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
};

export const MODIFIER_KEY_NAMES = ["Meta", "Control", "Alt", "Shift"];

/** True while only modifiers are held — not a complete combo yet. */
export function isModifierOnly(key: string): boolean {
  return MODIFIER_KEY_NAMES.includes(key);
}

/** Normalises the non-modifier half of a combo, or null if unbindable. */
export function normalizeKey(key: string): string | null {
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  return null;
}

export interface AcceleratorResult {
  accelerator: string | null;
  /** Why the combo was rejected, for showing back to the user. */
  error: string | null;
}

/**
 * Turns a keypress into a Tauri accelerator.
 *
 * `null` with no error means "keep waiting" — the user is still holding
 * modifiers down and hasn't pressed the real key yet.
 */
export function eventToAccelerator(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): AcceleratorResult {
  if (isModifierOnly(e.key)) return { accelerator: null, error: null };

  const modifiers: string[] = [];
  if (e.metaKey) modifiers.push("CmdOrControl");
  if (e.ctrlKey) modifiers.push("Control");
  if (e.altKey) modifiers.push("Alt");
  if (e.shiftKey) modifiers.push("Shift");

  if (modifiers.length === 0) {
    return {
      accelerator: null,
      error: "needs a modifier — a bare key would be captured system-wide",
    };
  }

  const key = normalizeKey(e.key);
  if (!key) return { accelerator: null, error: `${e.key} can't be used in a shortcut` };

  const ordered = MODIFIER_ORDER.filter((m) => modifiers.includes(m));
  return { accelerator: [...ordered, key].join("+"), error: null };
}

/** "CmdOrControl+Shift+T" → "⌘⇧T", for display. */
export function acceleratorLabel(accelerator: string): string {
  if (!accelerator.trim()) return "off";

  const parts = accelerator.split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts[parts.length - 1] ?? "";
  const symbols = parts
    .slice(0, -1)
    .map((m) => MODIFIER_SYMBOLS[m] ?? `${m}+`)
    .join("");

  return `${symbols}${key}`;
}
