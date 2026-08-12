import { Item } from "../types";
import { eventAnchor } from "./groupEvents";

/** Local YYYY-MM-DD, the key both grids and the item index agree on. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, n: number): Date {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** How many undone items land on each day, keyed by `dayKey`. */
export function countByDay(items: Item[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.status === "Done") continue;
    const anchor = eventAnchor(item);
    if (!anchor) continue;
    const key = dayKey(anchor);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** The seven days of the week containing `now`, Sunday first. */
export function weekDays(now = new Date()): Date[] {
  const sunday = addDays(now, -now.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

/**
 * "Aug 9 – 15" for a week inside one month, "Aug 30 – Sep 5" when it straddles
 * two, and either with the year appended when it is not the current one.
 */
export function weekRangeHeading(week: Date[], today = new Date()): string {
  const first = week[0];
  const last = week[week.length - 1];
  const month = (d: Date) => d.toLocaleDateString([], { month: "short" });

  const sameMonth = first.getMonth() === last.getMonth();
  const range = sameMonth
    ? `${month(first)} ${first.getDate()} – ${last.getDate()}`
    : `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}`;

  return last.getFullYear() === today.getFullYear()
    ? range
    : `${range}, ${last.getFullYear()}`;
}

/**
 * A month as whole weeks, Sunday first — the Itsycal layout. Always six rows
 * so the grid does not resize as you page between months.
 */
export function monthGrid(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, week * 7 + d))
  );
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** "TUE AUG 11" — the heading for a day section. */
export function dayHeading(d: Date): string {
  return d
    .toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

/** "August 2026" — the month view's title. */
export function monthHeading(d: Date): string {
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}
