export type Action =
  | "move-down"
  | "move-up"
  | "add"
  | "cycle-status"
  | "edit"
  | "delete"
  | "undo"
  | "toggle-done"
  | "calendar"
  | "notes-view"
  | "month"
  | "expand"
  | "today"
  | "refresh"
  | "settings"
  | "help"
  | "notes"
  | "browse-notes"
  | "notes-preview";

export const ACTION_LABELS: Record<Action, string> = {
  "move-down":    "move down",
  "move-up":      "move up",
  "add":          "add item",
  "cycle-status": "cycle status",
  "edit":         "edit",
  "delete":       "delete",
  "undo":         "undo delete",
  "toggle-done":  "toggle done archive",
  "calendar":     "switch tasks ⇄ calendar",
  "notes-view":   "notes view",
  "month":        "month view",
  "expand":       "expand description",
  "today":        "jump to today",
  "refresh":      "refresh",
  "settings":     "settings",
  "help":         "help",
  "notes":        "new note",
  "browse-notes": "browse notes",
  "notes-preview": "toggle note preview",
};

export const ACTION_SECTIONS: { label: string; actions: Action[] }[] = [
  { label: "navigation", actions: ["move-down", "move-up"] },
  { label: "tasks",      actions: ["add", "cycle-status", "edit", "delete", "undo"] },
  { label: "view",       actions: ["toggle-done", "calendar", "notes-view", "month", "today", "expand", "refresh"] },
  { label: "app",        actions: ["settings", "help", "notes", "browse-notes", "notes-preview"] },
];

export type Bindings = Record<Action, string>;

export const DEFAULTS: Bindings = {
  "move-down":    "ArrowDown",
  "move-up":      "ArrowUp",
  "add":          "n",
  "cycle-status": " ",
  "edit":         "e",
  "delete":       "d",
  "undo":         "u",
  "toggle-done":  "D",
  "calendar":     "c",
  "notes-view":   "w",
  "month":        "m",
  "expand":       "x",
  "today":        "T",
  "refresh":      "r",
  "settings":     ",",
  "help":         "?",
  "notes":        "q",
  "browse-notes": "b",
  "notes-preview": "p",
};

const STORAGE_KEY = "todoish:keybindings";

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBindings(b: Bindings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
}

/** Display label for a key value */
export function keyLabel(key: string): string {
  if (key === " ") return "space";
  if (key === "ArrowDown") return "↓";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "Escape") return "esc";
  if (key === "Enter") return "enter";
  if (key === "Backspace") return "⌫";
  if (key === "Tab") return "tab";
  return key;
}

/** Find which action a key is bound to (for duplicate detection) */
export function actionForKey(bindings: Bindings, key: string): Action | null {
  for (const [action, k] of Object.entries(bindings)) {
    if (k === key) return action as Action;
  }
  return null;
}
