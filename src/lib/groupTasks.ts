import { Task, TaskGroup } from "../types";

/** Parse a due string as local time.
 *  Date-only strings (YYYY-MM-DD) are treated as local midnight, not UTC. */
export function parseDueDate(s: string): Date {
  // Date-only: append time so JS parses as local, not UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  return new Date(s);
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function groupTasks(tasks: Task[], showAllDone = false): Record<TaskGroup, Task[]> {
  const endToday = endOfToday();
  const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const groups: Record<TaskGroup, Task[]> = {
    NOW: [],
    NEXT: [],
    LATER: [],
    SNOOZED: [],
    DONE: [],
  };

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const task of tasks) {
    if (task.status === "Done") {
      // Hide done tasks older than 24h unless archive view is on
      if (!showAllDone && task.last_edited_time && new Date(task.last_edited_time) < cutoff) {
        continue;
      }
      groups.DONE.push(task);
      continue;
    }
    if (task.status === "Snoozed") {
      groups.SNOOZED.push(task);
      continue;
    }
    if (!task.due) {
      groups.LATER.push(task);
      continue;
    }
    const due = parseDueDate(task.due);
    if (due <= endToday) {
      groups.NOW.push(task);
    } else if (due <= threeDays) {
      groups.NEXT.push(task);
    } else {
      groups.LATER.push(task);
    }
  }

  return groups;
}

export function flattenGroups(groups: Record<TaskGroup, Task[]>): Task[] {
  return [...groups.NOW, ...groups.NEXT, ...groups.LATER, ...groups.SNOOZED, ...groups.DONE];
}
