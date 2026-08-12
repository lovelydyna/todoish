import { Item } from "../types";
import { dayKey, dayHeading, isSameDay, addDays } from "./calendarGrid";

export type ActivityKind = "created" | "edited" | "completed";

export interface ActivityEntry {
  /** Unique per row — an item contributes more than one entry. */
  key: string;
  item: Item;
  kind: ActivityKind;
  at: Date;
}

export interface ActivityDay {
  date: Date;
  entries: ActivityEntry[];
}

/**
 * Notion records only the last edit, so an item that was created and never
 * touched again reports the same instant twice. Treat edits within this window
 * of creation as the creation itself rather than showing a duplicate row.
 */
const EDIT_MERGE_MS = 60 * 1000;

/**
 * Flattens items into a reverse-chronological activity log.
 *
 * Notion gives us two page timestamps — `created_time` and `last_edited_time`
 * — so this is a coarse log, not a full audit trail: only the most recent edit
 * of each item is known. A done item's last edit is reported as a completion,
 * which is right in the common case of completing being the last thing you did.
 */
export function activityFeed(items: Item[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const item of items) {
    const created = item.created_time ? new Date(item.created_time) : null;
    const edited = item.last_edited_time ? new Date(item.last_edited_time) : null;

    if (created && !isNaN(created.getTime())) {
      entries.push({ key: `${item.id}:created`, item, kind: "created", at: created });
    }

    if (!edited || isNaN(edited.getTime())) continue;

    const isEcho =
      created && Math.abs(edited.getTime() - created.getTime()) < EDIT_MERGE_MS;
    if (isEcho) continue;

    entries.push({
      key: `${item.id}:edited`,
      item,
      kind: item.status === "Done" ? "completed" : "edited",
      at: edited,
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** The feed split into day sections, newest day first. */
export function activityByDay(items: Item[]): ActivityDay[] {
  const days = new Map<string, ActivityDay>();

  for (const entry of activityFeed(items)) {
    const key = dayKey(entry.at);
    const existing = days.get(key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    const date = new Date(entry.at);
    date.setHours(0, 0, 0, 0);
    days.set(key, { date, entries: [entry] });
  }

  return [...days.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** "TODAY" / "YESTERDAY" / "TUE, AUG 11" for an activity day heading. */
export function activityDayHeading(date: Date, now = new Date()): string {
  if (isSameDay(date, now)) return "TODAY";
  if (isSameDay(date, addDays(now, -1))) return "YESTERDAY";
  return dayHeading(date);
}

export const ACTIVITY_VERBS: Record<ActivityKind, string> = {
  created: "added",
  edited: "edited",
  completed: "completed",
};

/** "9:04a" — the clock time an entry happened. */
export function activityTime(at: Date): string {
  return at
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(" AM", "a")
    .replace(" PM", "p");
}
