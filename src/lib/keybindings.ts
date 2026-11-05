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
  | "notes";

/** What each key does, in the words the shortcuts list shows. Scope notes
 *  ("task list", "calendar") mark the ones that only work in one view. */
export const ACTION_LABELS: Record<Action, string> = {
  "move-down":    "move down",
  "move-up":      "move up",
  "add":          "new task or event",
  "cycle-status": "change status",
  "edit":         "edit selected",
  "delete":       "delete selected",
  "undo":         "undo delete (task list)",
  "toggle-done":  "show all done tasks (task list)",
  "calendar":     "switch tasks ⇄ calendar",
  "notes-view":   "open notes",
  "month":        "month view (calendar)",
  "expand":       "show description",
  "today":        "jump to today",
  "refresh":      "refresh from Notion",
  "settings":     "settings",
  "help":         "keyboard shortcuts",
  "notes":        "new note",
};

export const ACTION_SECTIONS: { label: string; actions: Action[] }[] = [
  { label: "moving around", actions: ["move-down", "move-up", "today"] },
  { label: "tasks and events", actions: ["add", "cycle-status", "edit", "delete", "undo", "expand"] },
  { label: "views", actions: ["calendar", "month", "toggle-done", "notes-view"] },
  { label: "app", actions: ["notes", "refresh", "settings", "help"] },
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
};

const STORAGE_KEY = "todoish:keybindings";

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    // Drop saved keys for actions that no longer exist (e.g. the old notes
    // browser), so they can't block a key in the duplicate check.
    const saved = Object.entries(JSON.parse(raw)).filter(([a]) => a in DEFAULTS);
    return { ...DEFAULTS, ...Object.fromEntries(saved) } as Bindings;
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
