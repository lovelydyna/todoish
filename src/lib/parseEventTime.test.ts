import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseEventTime,
  parseDeadline,
  parseDateWord,
  formatEventTime,
  toLocalISO,
} from "./parseEventTime";

const now = new Date("2026-04-20T12:00:00");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

/** Local wall-clock portion of an ISO string, ignoring the offset suffix. */
const wall = (iso: string | null) => iso?.slice(0, 16) ?? null;

describe("parseDateWord", () => {
  it("understands today and tomorrow", () => {
    expect(parseDateWord("today")?.getDate()).toBe(20);
    expect(parseDateWord("tmrw")?.getDate()).toBe(21);
  });

  it("parses ISO dates as local midnight", () => {
    const d = parseDateWord("2026-08-15");
    expect(d?.getMonth()).toBe(7);
    expect(d?.getHours()).toBe(0);
  });

  it("rejects anything else", () => {
    expect(parseDateWord("3pm")).toBeNull();
  });
});

describe("parseEventTime", () => {
  it("combines a date word with a 12h time", () => {
    expect(wall(parseEventTime("today 3pm").start)).toBe("2026-04-20T15:00");
  });

  it("defaults to today when only a time is given", () => {
    expect(wall(parseEventTime("9am").start)).toBe("2026-04-20T09:00");
  });

  it("parses a 24h range", () => {
    const { start, end } = parseEventTime("tmrw 9:00-10:30");
    expect(wall(start)).toBe("2026-04-21T09:00");
    expect(wall(end)).toBe("2026-04-21T10:30");
  });

  it("accepts an en dash and the word to as range separators", () => {
    expect(wall(parseEventTime("2026-08-15 9:00–10:00").end)).toBe("2026-08-15T10:00");
    expect(wall(parseEventTime("2026-08-15 9:00 to 10:00").end)).toBe("2026-08-15T10:00");
  });

  it("rolls an end time past midnight to the next day", () => {
    const { end } = parseEventTime("today 11pm-1am");
    expect(wall(end)).toBe("2026-04-21T01:00");
  });

  it("stores a date with no time as an all-day date string", () => {
    expect(parseEventTime("2026-08-15")).toEqual({ start: "2026-08-15", end: null });
  });

  it("treats blank and skip as no time", () => {
    expect(parseEventTime("")).toEqual({ start: null, end: null });
    expect(parseEventTime("skip")).toEqual({ start: null, end: null });
  });

  it("returns nothing for unparseable input", () => {
    expect(parseEventTime("sometime next week")).toEqual({ start: null, end: null });
  });

  it("emits an offset-qualified ISO string", () => {
    expect(parseEventTime("today 3pm").start).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});

describe("parseDeadline", () => {
  it("normalises words to a bare date", () => {
    expect(parseDeadline("tmrw")).toBe("2026-04-21");
    expect(parseDeadline("2026-09-01")).toBe("2026-09-01");
  });

  it("is null when skipped", () => {
    expect(parseDeadline("")).toBeNull();
    expect(parseDeadline("skip")).toBeNull();
  });
});

describe("formatEventTime", () => {
  it("round-trips through the parser", () => {
    const parsed = parseEventTime("2026-08-15 09:00-10:30");
    const text = formatEventTime(parsed.start, parsed.end);
    expect(text).toBe("2026-08-15 09:00-10:30");
    expect(parseEventTime(text)).toEqual(parsed);
  });

  it("keeps all-day events as a bare date", () => {
    expect(formatEventTime("2026-08-15", null)).toBe("2026-08-15");
  });

  it("is empty when there is no start", () => {
    expect(formatEventTime(null, null)).toBe("");
  });
});

describe("toLocalISO", () => {
  it("keeps the local wall clock rather than shifting to UTC", () => {
    expect(toLocalISO(new Date("2026-04-20T15:30:00"))).toMatch(/^2026-04-20T15:30:00/);
  });
});
