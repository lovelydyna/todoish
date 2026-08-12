import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { groupTasks, flattenGroups, parseDueDate, actionDate } from "./groupTasks";
import { Item } from "../types";

const base: Item = {
  id: "1",
  name: "Test",
  status: "Todo",
  start: null,
  end: null,
  deadline: null,
  description: null,
  created_time: null,
  last_edited_time: null,
};

const now = new Date("2026-04-20T12:00:00");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

// ─── parseDueDate ────────────────────────────────────────────

describe("parseDueDate", () => {
  it("parses date-only strings as local midnight, not UTC", () => {
    const d = parseDueDate("2026-04-20");
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(20);
  });

  it("parses full timestamps as given", () => {
    const d = parseDueDate("2026-04-20T15:30:00");
    expect(d.getHours()).toBe(15);
  });
});

// ─── actionDate ──────────────────────────────────────────────

describe("actionDate", () => {
  it("prefers the deadline over the scheduled time", () => {
    const item = { ...base, start: "2026-04-24T09:00:00", deadline: "2026-04-21" };
    expect(actionDate(item)).toBe("2026-04-21");
  });

  it("falls back to the start time when there is no deadline", () => {
    expect(actionDate({ ...base, start: "2026-04-24T09:00:00" })).toBe("2026-04-24T09:00:00");
  });

  it("is null when the item has neither", () => {
    expect(actionDate(base)).toBeNull();
  });
});

// ─── groupTasks ──────────────────────────────────────────────

describe("groupTasks", () => {
  it("puts anything due by end of today in NOW", () => {
    const g = groupTasks([{ ...base, id: "a", deadline: "2026-04-20" }]);
    expect(g.NOW.map((i) => i.id)).toEqual(["a"]);
  });

  it("puts the rest of this week in THIS WEEK", () => {
    // 2026-04-20 is a Monday, so Wednesday is still this week.
    const g = groupTasks([{ ...base, id: "a", deadline: "2026-04-22" }], false, now);
    expect(g["THIS WEEK"].map((i) => i.id)).toEqual(["a"]);
  });

  it("puts the following week in NEXT WEEK", () => {
    // Sunday 26th starts the next week; Tuesday 28th is inside it.
    const g = groupTasks([{ ...base, id: "a", deadline: "2026-04-28" }], false, now);
    expect(g["NEXT WEEK"].map((i) => i.id)).toEqual(["a"]);
  });

  it("splits at the week boundary, not at a fixed day count", () => {
    const g = groupTasks(
      [
        { ...base, id: "sat", deadline: "2026-04-25" }, // last day of this week
        { ...base, id: "sun", deadline: "2026-04-26" }, // first of next
      ],
      false,
      now
    );
    expect(g["THIS WEEK"].map((i) => i.id)).toEqual(["sat"]);
    expect(g["NEXT WEEK"].map((i) => i.id)).toEqual(["sun"]);
  });

  it("puts anything further out in LATER", () => {
    const g = groupTasks([{ ...base, id: "a", deadline: "2026-05-30" }], false, now);
    expect(g.LATER.map((i) => i.id)).toEqual(["a"]);
  });

  it("puts undated items in LATER", () => {
    const g = groupTasks([{ ...base, id: "a" }]);
    expect(g.LATER.map((i) => i.id)).toEqual(["a"]);
  });

  it("groups a timed-only item by its start", () => {
    const g = groupTasks([{ ...base, id: "a", start: "2026-04-20T15:00:00" }]);
    expect(g.NOW.map((i) => i.id)).toEqual(["a"]);
  });

  it("keeps overdue items in NOW rather than hiding them", () => {
    const g = groupTasks([{ ...base, id: "a", deadline: "2026-04-01" }]);
    expect(g.NOW.map((i) => i.id)).toEqual(["a"]);
  });

  it("hides done items older than 24h unless the archive is on", () => {
    const stale = {
      ...base, id: "old", status: "Done",
      last_edited_time: "2026-04-18T12:00:00",
    };
    expect(groupTasks([stale]).DONE).toEqual([]);
    expect(groupTasks([stale], true).DONE.map((i) => i.id)).toEqual(["old"]);
  });

  it("keeps recently done items visible", () => {
    const fresh = {
      ...base, id: "fresh", status: "Done",
      last_edited_time: "2026-04-20T11:00:00",
    };
    expect(groupTasks([fresh]).DONE.map((i) => i.id)).toEqual(["fresh"]);
  });
});

describe("flattenGroups", () => {
  it("orders NOW, NEXT, LATER, then DONE", () => {
    const items = [
      { ...base, id: "later", deadline: "2026-05-30" },
      { ...base, id: "now", deadline: "2026-04-20" },
      { ...base, id: "this-week", deadline: "2026-04-22" },
      { ...base, id: "next-week", deadline: "2026-04-28" },
    ];
    expect(flattenGroups(groupTasks(items, false, now)).map((i) => i.id))
      .toEqual(["now", "this-week", "next-week", "later"]);
  });
});
