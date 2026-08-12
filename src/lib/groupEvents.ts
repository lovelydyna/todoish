import { Item, EventGroup } from "../types";
import { parseDueDate } from "./groupTasks";

/** The date an event sorts by: its start time, or its deadline when untimed. */
export function eventAnchor(event: Item): Date | null {
  const raw = event.start ?? event.deadline;
  return raw ? parseDueDate(raw) : null;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days from today to `date`: 0 = today, 1 = tomorrow, -1 = yesterday. */
export function dayOffset(date: Date, now = new Date()): number {
  const ms = startOfDay(date).getTime() - startOfDay(now).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** How far past tomorrow the UPCOMING section looks. */
export const UPCOMING_DAYS = 5;

const byAnchor = (a: Item, b: Item) => {
  const da = eventAnchor(a)?.getTime() ?? 0;
  const db = eventAnchor(b)?.getTime() ?? 0;
  return da - db;
};

/**
 * Buckets items into TODAY / TOMORROW / UPCOMING by their anchor date.
 * Items that already started today stay in TODAY — a meeting you are late
 * for is more useful on screen than hidden. Done items are dropped: the
 * calendar answers "what is coming", not "what happened".
 *
 * UPCOMING is a fixed five-day horizon (offsets 2–6). Anything further out is
 * the month view's job, so the list stays short enough to read at a glance.
 */
export function groupEvents(
  events: Item[],
  now = new Date()
): Record<EventGroup, Item[]> {
  const groups: Record<EventGroup, Item[]> = {
    TODAY: [],
    TOMORROW: [],
    UPCOMING: [],
  };

  for (const event of events) {
    if (event.status === "Done") continue;
    const anchor = eventAnchor(event);
    if (!anchor) continue;

    const offset = dayOffset(anchor, now);
    if (offset <= 0) groups.TODAY.push(event);
    else if (offset === 1) groups.TOMORROW.push(event);
    else if (offset <= 1 + UPCOMING_DAYS) groups.UPCOMING.push(event);
  }

  groups.TODAY.sort(byAnchor);
  groups.TOMORROW.sort(byAnchor);
  groups.UPCOMING.sort(byAnchor);

  return groups;
}

export interface DaySection {
  date: Date;
  items: Item[];
}

/**
 * Items from `from` forward, split into one dated section per day.
 *
 * `days` bounds the horizon; anything past it is the month grid's job. Days
 * with nothing on them are omitted, so the list stays dense.
 */
export function daySections(
  events: Item[],
  from: Date,
  days: number
): DaySection[] {
  const sections = new Map<number, DaySection>();

  for (const event of events) {
    if (event.status === "Done") continue;
    const anchor = eventAnchor(event);
    if (!anchor) continue;

    const offset = dayOffset(anchor, from);
    if (offset < 0 || offset >= days) continue;

    const existing = sections.get(offset);
    if (existing) {
      existing.items.push(event);
      continue;
    }
    const date = new Date(from);
    date.setDate(date.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    sections.set(offset, { date, items: [event] });
  }

  return [...sections.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, section]) => ({ ...section, items: section.items.sort(byAnchor) }));
}

/**
 * UPCOMING split into one section per day, so each carries its own date.
 * Starts the day after tomorrow — TODAY and TOMORROW have their own headings.
 */
export function upcomingByDay(events: Item[], now = new Date()): DaySection[] {
  const from = new Date(now);
  from.setDate(from.getDate() + 2);
  from.setHours(0, 0, 0, 0);
  return daySections(events, from, UPCOMING_DAYS);
}

/** A deadline that has already passed. */
export function isDeadlinePassed(event: Item, now = new Date()): boolean {
  if (!event.deadline) return false;
  return parseDueDate(event.deadline).getTime() < now.getTime();
}

/** "9:00a", "9:00a–10:30a", or "all day" for a date-only start. */
export function timeRangeLabel(event: Item): string {
  if (!event.start) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.start)) return "all day";

  const fmt = (d: Date) =>
    d
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(" AM", "a")
      .replace(" PM", "p");

  const start = fmt(parseDueDate(event.start));
  if (!event.end) return start;
  return `${start}–${fmt(parseDueDate(event.end))}`;
}

/** Short deadline marker shown on the row, e.g. "due in 3d" or "due 2d ago". */
export function deadlineLabel(event: Item, now = new Date()): string {
  if (!event.deadline) return "";
  const offset = dayOffset(parseDueDate(event.deadline), now);
  if (offset === 0) return "due today";
  if (offset === 1) return "due tmrw";
  if (offset < 0) return `due ${Math.abs(offset)}d ago`;
  return `due in ${offset}d`;
}
