import { parseDueDate } from "./groupTasks";

/**
 * The date marker on a task row.
 *
 * Rows show a *date*, not a clock time: a task list answers "which day" far
 * more often than "what minute", and a column of "9:00 AM" reads as noise when
 * every row has one. The clock still appears in the calendar, where the time
 * of day is the whole point.
 */
export function timeHint(due: string | null, now = new Date()): string {
  if (!due) return "";

  const date = parseDueDate(due);
  if (isNaN(date.getTime())) return "";

  const startOf = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const days = Math.round(
    (startOf(date).getTime() - startOf(now).getTime()) / (24 * 60 * 60 * 1000)
  );

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  // Inside the coming week a weekday is easier to place than a date.
  if (days < 7) return date.toLocaleDateString([], { weekday: "short" });

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** True when the marker represents a date that has already passed. */
export function isOverdue(due: string | null, now = new Date()): boolean {
  if (!due) return false;
  const hint = timeHint(due, now);
  return hint === "yesterday" || hint.endsWith("overdue");
}
