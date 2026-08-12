export type AppView = "tasks" | "calendar";

interface ViewSwitchProps {
  active: AppView;
  onSelect: (view: AppView) => void;
  /** Key that toggles between the two, shown in the tooltip. */
  toggleKey: string;
}

const VIEWS: { id: AppView; label: string }[] = [
  { id: "tasks", label: "tasks" },
  { id: "calendar", label: "calendar" },
];

/**
 * The tasks ↔ calendar toggle, sitting where the brand used to.
 *
 * Modelled on the Home/Code switch in Claude's own UI: a recessed track with
 * one raised neutral chip that slides between the halves. The contrast is
 * elevation, not colour — the active side looks lit from above and the
 * inactive side recedes, which reads instantly without tinting the chrome.
 */
export function ViewSwitch({ active, onSelect, toggleKey }: ViewSwitchProps) {
  return (
    <div className="view-switch" role="tablist" title={`[${toggleKey}] switch view`}>
      <span
        className="view-switch-thumb"
        style={{ transform: active === "calendar" ? "translateX(100%)" : "none" }}
      />
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={active === v.id}
          className={`view-switch-btn${active === v.id ? " view-switch-btn--active" : ""}`}
          onClick={() => onSelect(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
