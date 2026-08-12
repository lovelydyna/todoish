import { Item, TaskGroup } from "../types";

/** Parse a date string as local time.
 *  Date-only strings (YYYY-MM-DD) are treated as local midnight, not UTC. */
export function parseDueDate(s: string): Date {
  // Date-only: append time so JS parses as local, not UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  return new Date(s);
}

/**
 * When you have to act on an item. The deadline wins over the scheduled time:
 * a meeting on Friday whose prep is due Tuesday belongs in Tuesday's bucket.
 */
export function actionDate(item: Item): string | null {
  return item.deadline ?? item.start;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Week boundaries, Sunday-start to match the calendar grids.
 * Returns the first instant *after* this week and after next week.
 */
function weekBounds(now: Date): { endOfThisWeek: Date; endOfNextWeek: Date } {
  const startOfNextWeek = startOfDay(now);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + (7 - now.getDay()));
  const startOfWeekAfter = new Date(startOfNextWeek);
  startOfWeekAfter.setDate(startOfWeekAfter.getDate() + 7);
  return { endOfThisWeek: startOfNextWeek, endOfNextWeek: startOfWeekAfter };
}

/** CSS-safe slug for a group name, e.g. "THIS WEEK" → "this-week". */
export function groupSlug(group: string): string {
  return group.toLowerCase().replace(/\s+/g, "-");
}

export function groupTasks(
  items: Item[],
  showAllDone = false,
  now = new Date()
): Record<TaskGroup, Item[]> {
  const endToday = startOfDay(now);
  endToday.setHours(23, 59, 59, 999);
  const { endOfThisWeek, endOfNextWeek } = weekBounds(now);

  const groups: Record<TaskGroup, Item[]> = {
    NOW: [],
    "THIS WEEK": [],
    "NEXT WEEK": [],
    LATER: [],
    DONE: [],
  };

  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const item of items) {
    if (item.status === "Done") {
      // Hide done items older than 24h unless archive view is on
      if (!showAllDone && item.last_edited_time && new Date(item.last_edited_time) < cutoff) {
        continue;
      }
      groups.DONE.push(item);
      continue;
    }

    const when = actionDate(item);
    if (!when) {
      groups.LATER.push(item);
      continue;
    }
    const due = parseDueDate(when);
    // Overdue lands in NOW rather than a past bucket — it still needs doing.
    if (due <= endToday) groups.NOW.push(item);
    else if (due < endOfThisWeek) groups["THIS WEEK"].push(item);
    else if (due < endOfNextWeek) groups["NEXT WEEK"].push(item);
    else groups.LATER.push(item);
  }

  const byDate = (a: Item, b: Item) => {
    const da = actionDate(a);
    const db = actionDate(b);
    if (!da || !db) return 0;
    return parseDueDate(da).getTime() - parseDueDate(db).getTime();
  };
  groups.NOW.sort(byDate);
  groups["THIS WEEK"].sort(byDate);
  groups["NEXT WEEK"].sort(byDate);

  return groups;
}

export const TASK_GROUP_ORDER: TaskGroup[] = [
  "NOW",
  "THIS WEEK",
  "NEXT WEEK",
  "LATER",
  "DONE",
];

export function flattenGroups(groups: Record<TaskGroup, Item[]>): Item[] {
  return TASK_GROUP_ORDER.flatMap((group) => groups[group]);
}
