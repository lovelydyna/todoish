export type AppView = "tasks" | "calendar";

interface ViewSwitchProps {
  active: AppView;
  onSelect: (view: AppView) => void;
  /** Key that toggles between the two, shown in the tooltip. */
  toggleKey: string;
}

const TasksIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5 8.2 7 10.2 11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const VIEWS: { id: AppView; label: string; Icon: () => JSX.Element }[] = [
  { id: "tasks", label: "tasks", Icon: TasksIcon },
  { id: "calendar", label: "calendar", Icon: CalendarIcon },
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
      {VIEWS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          aria-label={label}
          title={`${label} [${toggleKey}]`}
          className={`view-switch-btn${active === id ? " view-switch-btn--active" : ""}`}
          onClick={() => onSelect(id)}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
