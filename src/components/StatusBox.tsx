interface StatusBoxProps {
  status: string;
  onCycle: () => void;
}

const LABELS: Record<string, string> = {
  "Todo": "not started — click to start",
  "In Progress": "in progress — click to complete",
  "Done": "done — click to reset",
};

/**
 * Notion-style checkbox: a rounded square that fills in when checked.
 *
 * Todoish has three states rather than two, so "In Progress" gets the
 * indeterminate treatment — a dash in an outlined box — which reads as
 * "started but not finished" without inventing a new shape.
 */
export function StatusBox({ status, onCycle }: StatusBoxProps) {
  const variant =
    status === "Done" ? "done" : status === "In Progress" ? "progress" : "todo";

  return (
    <button
      type="button"
      className={`statusbox statusbox--${variant}`}
      title={LABELS[status] ?? LABELS.Todo}
      aria-label={status}
      aria-pressed={status === "Done"}
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
    >
      {variant === "done" && (
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M3 7.4 5.8 10 11 4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {variant === "progress" && (
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 7 L7 1.75 A5.25 5.25 0 0 1 7 12.25 Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
