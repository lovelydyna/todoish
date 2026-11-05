import { useKeybindings } from "../hooks/useKeybindings";
import { keyLabel } from "../lib/keybindings";

export type AppView = "tasks" | "calendar" | "notes";

interface ViewSwitchProps {
  active: AppView;
  onSelect: (view: AppView) => void;
}

const VIEWS: { id: AppView; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "calendar", label: "Calendar" },
  { id: "notes", label: "Notes" },
];

/**
 * The app's three places as one labelled segmented control in the centre of
 * the toolbar, in the same spot in every view, so where you are and where
 * you can go are both always visible.
 */
export function ViewSwitch({ active, onSelect }: ViewSwitchProps) {
  const { bindings } = useKeybindings();
  const keys: Record<AppView, string> = {
    // From notes, Escape is the way back to tasks.
    tasks: active === "notes" ? "Escape" : bindings["calendar"],
    calendar: bindings["calendar"],
    notes: bindings["notes-view"],
  };

  return (
    <div className="view-switch" role="tablist" aria-label="view">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          title={`${label} [${keyLabel(keys[id])}]`}
          className={`view-switch-btn${active === id ? " view-switch-btn--active" : ""}`}
          onClick={() => { if (id !== active) onSelect(id); }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
