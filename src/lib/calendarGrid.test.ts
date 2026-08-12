import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  dayKey,
  addDays,
  addMonths,
  countByDay,
  weekDays,
  weekRangeHeading,
  addWeeks,
  monthGrid,
  isSameDay,
  isSameMonth,
  dayHeading,
} from "./calendarGrid";
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

// A Monday, so weekday maths is easy to reason about.
const now = new Date("2026-04-20T12:00:00");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

describe("dayKey", () => {
  it("uses the local date, not UTC", () => {
    expect(dayKey(new Date("2026-04-20T23:30:00"))).toBe("2026-04-20");
  });
});

describe("weekDays", () => {
  it("returns seven days starting on Sunday", () => {
    const days = weekDays(now);
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(0);
    expect(dayKey(days[0])).toBe("2026-04-19");
    expect(dayKey(days[6])).toBe("2026-04-25");
  });

  it("contains today", () => {
    expect(weekDays(now).some((d) => isSameDay(d, now))).toBe(true);
  });
});

describe("monthGrid", () => {
  const april = new Date(2026, 3, 1);

  it("is always six rows of seven, so the grid never resizes", () => {
    const grid = monthGrid(april);
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it("starts on the Sunday on or before the first of the month", () => {
    expect(monthGrid(april)[0][0].getDay()).toBe(0);
    expect(monthGrid(april)[0].some((d) => d.getDate() === 1)).toBe(true);
  });

  it("pads with adjacent months, flagged by isSameMonth", () => {
    const first = monthGrid(april)[0][0];
    expect(isSameMonth(first, april)).toBe(false);
  });
});

describe("countByDay", () => {
  it("counts items on their anchor day", () => {
    const counts = countByDay([
      { ...base, id: "a", start: "2026-04-20T09:00:00" },
      { ...base, id: "b", start: "2026-04-20T15:00:00" },
      { ...base, id: "c", deadline: "2026-04-21" },
    ]);
    expect(counts["2026-04-20"]).toBe(2);
    expect(counts["2026-04-21"]).toBe(1);
  });

  it("ignores done and undated items", () => {
    const counts = countByDay([
      { ...base, id: "done", status: "Done", start: "2026-04-20T09:00:00" },
      { ...base, id: "undated" },
    ]);
    expect(counts).toEqual({});
  });
});

describe("date arithmetic", () => {
  it("addDays crosses month boundaries", () => {
    expect(dayKey(addDays(new Date("2026-04-30T12:00:00"), 1))).toBe("2026-05-01");
  });

  it("addMonths lands on the first of the target month", () => {
    const next = addMonths(new Date(2026, 11, 15), 1);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
    expect(next.getDate()).toBe(1);
  });
});

describe("weekRangeHeading", () => {
  it("collapses a week inside one month", () => {
    expect(weekRangeHeading(weekDays(now), now)).toBe("Apr 19 – 25");
  });

  it("names both months when the week straddles them", () => {
    const straddling = weekDays(new Date("2026-05-01T12:00:00"));
    expect(weekRangeHeading(straddling, now)).toBe("Apr 26 – May 2");
  });

  it("appends the year when it is not the current one", () => {
    const nextYear = weekDays(new Date("2027-03-10T12:00:00"));
    expect(weekRangeHeading(nextYear, now)).toMatch(/, 2027$/);
  });
});

describe("addWeeks", () => {
  it("moves by whole weeks", () => {
    expect(dayKey(addWeeks(now, 1))).toBe("2026-04-27");
    expect(dayKey(addWeeks(now, -2))).toBe("2026-04-06");
  });
});

describe("dayHeading", () => {
  it("is an upper-case weekday, month and day", () => {
    expect(dayHeading(new Date("2026-04-21T00:00:00"))).toMatch(/^TUE\b/);
  });
});
