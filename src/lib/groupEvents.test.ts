import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  groupEvents,
  upcomingByDay,
  daySections,
  eventAnchor,
  dayOffset,
  isDeadlinePassed,
  timeRangeLabel,
  deadlineLabel,
} from "./groupEvents";
import { Item } from "../types";

const base: Item = {
  id: "1",
  name: "Test event",
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

// ─── anchoring ───────────────────────────────────────────────

describe("eventAnchor", () => {
  it("prefers start over deadline", () => {
    const e = { ...base, start: "2026-04-21T09:00:00", deadline: "2026-05-01" };
    expect(eventAnchor(e)?.getDate()).toBe(21);
  });

  it("falls back to deadline when there is no start", () => {
    const e = { ...base, deadline: "2026-05-01" };
    expect(eventAnchor(e)?.getMonth()).toBe(4); // May
  });

  it("is null when the event has neither", () => {
    expect(eventAnchor(base)).toBeNull();
  });
});

describe("dayOffset", () => {
  it("counts calendar days, not 24h spans", () => {
    // 11pm tonight → 1am tomorrow is 2 hours but one calendar day
    expect(dayOffset(new Date("2026-04-20T23:00:00"))).toBe(0);
    expect(dayOffset(new Date("2026-04-21T01:00:00"))).toBe(1);
  });

  it("is negative for past days", () => {
    expect(dayOffset(new Date("2026-04-18T12:00:00"))).toBe(-2);
  });
});

// ─── grouping ────────────────────────────────────────────────

describe("groupEvents", () => {
  it("buckets by today, tomorrow and the days after", () => {
    const events = [
      { ...base, id: "today", start: "2026-04-20T15:00:00" },
      { ...base, id: "tomorrow", start: "2026-04-21T09:00:00" },
      { ...base, id: "soon", start: "2026-04-23T09:00:00" },
    ];
    const g = groupEvents(events);
    expect(g.TODAY.map((e) => e.id)).toEqual(["today"]);
    expect(g.TOMORROW.map((e) => e.id)).toEqual(["tomorrow"]);
    expect(g.UPCOMING.map((e) => e.id)).toEqual(["soon"]);
  });

  it("limits UPCOMING to the five days after tomorrow", () => {
    const events = [
      { ...base, id: "day2", start: "2026-04-22T09:00:00" },
      { ...base, id: "day6", start: "2026-04-26T09:00:00" }, // last day in range
      { ...base, id: "day7", start: "2026-04-27T09:00:00" }, // past the horizon
    ];
    expect(groupEvents(events).UPCOMING.map((e) => e.id)).toEqual(["day2", "day6"]);
  });

  it("drops done items — the calendar shows what is coming", () => {
    const g = groupEvents([{ ...base, id: "done", status: "Done", start: "2026-04-20T15:00:00" }]);
    expect(g.TODAY).toEqual([]);
  });

  it("keeps an event that already started today in TODAY", () => {
    const g = groupEvents([{ ...base, id: "started", start: "2026-04-20T09:00:00" }]);
    expect(g.TODAY.map((e) => e.id)).toEqual(["started"]);
  });

  it("groups a deadline-only event by its deadline", () => {
    const g = groupEvents([{ ...base, id: "grant", deadline: "2026-04-21" }]);
    expect(g.TOMORROW.map((e) => e.id)).toEqual(["grant"]);
  });

  it("drops events with no date at all", () => {
    const g = groupEvents([base]);
    expect([...g.TODAY, ...g.TOMORROW, ...g.UPCOMING]).toEqual([]);
  });

  it("sorts each bucket chronologically", () => {
    const events = [
      { ...base, id: "late", start: "2026-04-20T17:00:00" },
      { ...base, id: "early", start: "2026-04-20T08:00:00" },
      { ...base, id: "mid", start: "2026-04-20T12:30:00" },
    ];
    expect(groupEvents(events).TODAY.map((e) => e.id)).toEqual(["early", "mid", "late"]);
  });
});

describe("daySections", () => {
  it("runs from the given day forward, one section per day", () => {
    const events = [
      { ...base, id: "b", start: "2026-04-24T09:00:00" },
      { ...base, id: "a", start: "2026-04-22T09:00:00" },
    ];
    const sections = daySections(events, new Date("2026-04-22T00:00:00"), 7);
    expect(sections.map((s) => s.date.getDate())).toEqual([22, 24]);
  });

  it("excludes days before the start", () => {
    const events = [{ ...base, id: "before", start: "2026-04-21T09:00:00" }];
    expect(daySections(events, new Date("2026-04-22T00:00:00"), 7)).toEqual([]);
  });

  it("stops at the horizon", () => {
    const events = [
      { ...base, id: "in", start: "2026-04-24T09:00:00" },
      { ...base, id: "out", start: "2026-04-30T09:00:00" },
    ];
    const sections = daySections(events, new Date("2026-04-22T00:00:00"), 5);
    expect(sections.flatMap((s) => s.items.map((i) => i.id))).toEqual(["in"]);
  });

  it("skips done items", () => {
    const events = [{ ...base, id: "done", status: "Done", start: "2026-04-22T09:00:00" }];
    expect(daySections(events, new Date("2026-04-22T00:00:00"), 7)).toEqual([]);
  });
});

describe("upcomingByDay", () => {
  it("splits UPCOMING into one dated section per day", () => {
    const events = [
      { ...base, id: "b", start: "2026-04-23T09:00:00" },
      { ...base, id: "a", start: "2026-04-22T09:00:00" },
      { ...base, id: "c", start: "2026-04-23T14:00:00" },
    ];
    const sections = upcomingByDay(events);
    expect(sections.map((s) => s.date.getDate())).toEqual([22, 23]);
    expect(sections[1].items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("omits days with nothing on them", () => {
    const sections = upcomingByDay([{ ...base, id: "a", start: "2026-04-24T09:00:00" }]);
    expect(sections).toHaveLength(1);
    expect(sections[0].date.getDate()).toBe(24);
  });

  it("is empty when nothing falls in the horizon", () => {
    expect(upcomingByDay([{ ...base, start: "2026-04-20T09:00:00" }])).toEqual([]);
  });
});

// ─── labels ──────────────────────────────────────────────────

describe("timeRangeLabel", () => {
  it("shows a range when the event has an end", () => {
    const label = timeRangeLabel({
      ...base,
      start: "2026-04-20T09:00:00",
      end: "2026-04-20T10:30:00",
    });
    expect(label).toBe("9:00a–10:30a");
  });

  it("shows a single time when there is no end", () => {
    expect(timeRangeLabel({ ...base, start: "2026-04-20T14:00:00" })).toBe("2:00p");
  });

  it("calls a date-only event all day", () => {
    expect(timeRangeLabel({ ...base, start: "2026-04-20" })).toBe("all day");
  });

  it("is empty for deadline-only events", () => {
    expect(timeRangeLabel({ ...base, deadline: "2026-05-01" })).toBe("");
  });
});

describe("deadlineLabel", () => {
  it("names today and tomorrow", () => {
    expect(deadlineLabel({ ...base, deadline: "2026-04-20" })).toBe("due today");
    expect(deadlineLabel({ ...base, deadline: "2026-04-21" })).toBe("due tmrw");
  });

  it("counts days forward and back", () => {
    expect(deadlineLabel({ ...base, deadline: "2026-04-23" })).toBe("due in 3d");
    expect(deadlineLabel({ ...base, deadline: "2026-04-18" })).toBe("due 2d ago");
  });

  it("is empty without a deadline", () => {
    expect(deadlineLabel(base)).toBe("");
  });
});

describe("isDeadlinePassed", () => {
  it("is true only once the deadline is behind us", () => {
    expect(isDeadlinePassed({ ...base, deadline: "2026-04-19" })).toBe(true);
    expect(isDeadlinePassed({ ...base, deadline: "2026-04-21" })).toBe(false);
    expect(isDeadlinePassed(base)).toBe(false);
  });
});
