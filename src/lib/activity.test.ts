import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  activityFeed,
  activityByDay,
  activityDayHeading,
  activityTime,
} from "./activity";
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

describe("activityFeed", () => {
  it("emits a created entry from created_time", () => {
    const feed = activityFeed([
      { ...base, id: "a", created_time: "2026-04-20T09:00:00" },
    ]);
    expect(feed.map((e) => e.kind)).toEqual(["created"]);
    expect(feed[0].item.id).toBe("a");
  });

  it("emits both created and edited when they are far apart", () => {
    const feed = activityFeed([
      {
        ...base, id: "a",
        created_time: "2026-04-18T09:00:00",
        last_edited_time: "2026-04-20T09:00:00",
      },
    ]);
    expect(feed.map((e) => e.kind)).toEqual(["edited", "created"]);
  });

  it("suppresses the edit echo when it lands within a minute of creation", () => {
    // Notion stamps last_edited_time at creation, so an untouched item would
    // otherwise report itself twice.
    const feed = activityFeed([
      {
        ...base, id: "a",
        created_time: "2026-04-20T09:00:00",
        last_edited_time: "2026-04-20T09:00:30",
      },
    ]);
    expect(feed.map((e) => e.kind)).toEqual(["created"]);
  });

  it("reports a done item's last edit as a completion", () => {
    const feed = activityFeed([
      {
        ...base, id: "a", status: "Done",
        created_time: "2026-04-18T09:00:00",
        last_edited_time: "2026-04-20T09:00:00",
      },
    ]);
    expect(feed[0].kind).toBe("completed");
  });

  it("handles an item with only an edit timestamp", () => {
    const feed = activityFeed([
      { ...base, id: "a", last_edited_time: "2026-04-20T09:00:00" },
    ]);
    expect(feed.map((e) => e.kind)).toEqual(["edited"]);
  });

  it("skips items with no timestamps at all", () => {
    expect(activityFeed([base])).toEqual([]);
  });

  it("ignores unparseable timestamps", () => {
    expect(activityFeed([{ ...base, created_time: "not a date" }])).toEqual([]);
  });

  it("sorts newest first across items", () => {
    const feed = activityFeed([
      { ...base, id: "old", created_time: "2026-04-18T09:00:00" },
      { ...base, id: "new", created_time: "2026-04-20T11:00:00" },
      { ...base, id: "mid", created_time: "2026-04-19T09:00:00" },
    ]);
    expect(feed.map((e) => e.item.id)).toEqual(["new", "mid", "old"]);
  });

  it("gives each entry a distinct key so both can render", () => {
    const feed = activityFeed([
      {
        ...base, id: "a",
        created_time: "2026-04-18T09:00:00",
        last_edited_time: "2026-04-20T09:00:00",
      },
    ]);
    expect(new Set(feed.map((e) => e.key)).size).toBe(feed.length);
  });
});

describe("activityByDay", () => {
  it("groups entries by calendar day, newest day first", () => {
    const days = activityByDay([
      { ...base, id: "a", created_time: "2026-04-20T09:00:00" },
      { ...base, id: "b", created_time: "2026-04-18T09:00:00" },
      { ...base, id: "c", created_time: "2026-04-20T11:00:00" },
    ]);
    expect(days.map((d) => d.date.getDate())).toEqual([20, 18]);
    expect(days[0].entries).toHaveLength(2);
  });

  it("is empty when nothing has timestamps", () => {
    expect(activityByDay([base])).toEqual([]);
  });
});

describe("activityDayHeading", () => {
  it("names today and yesterday", () => {
    expect(activityDayHeading(new Date("2026-04-20T00:00:00"))).toBe("TODAY");
    expect(activityDayHeading(new Date("2026-04-19T00:00:00"))).toBe("YESTERDAY");
  });

  it("falls back to a dated heading further back", () => {
    expect(activityDayHeading(new Date("2026-04-17T00:00:00"))).toMatch(/^FRI\b/);
  });
});

describe("activityTime", () => {
  it("renders a compact clock time", () => {
    expect(activityTime(new Date("2026-04-20T09:04:00"))).toBe("9:04a");
    expect(activityTime(new Date("2026-04-20T14:30:00"))).toBe("2:30p");
  });
});
