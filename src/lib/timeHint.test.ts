import { describe, it, expect } from "vitest";
import { timeHint, isOverdue } from "./timeHint";

// A Monday, so weekday output is easy to reason about.
const now = new Date("2026-04-20T12:00:00");

describe("timeHint", () => {
  it("names today, tomorrow and yesterday", () => {
    expect(timeHint("2026-04-20", now)).toBe("today");
    expect(timeHint("2026-04-21", now)).toBe("tomorrow");
    expect(timeHint("2026-04-19", now)).toBe("yesterday");
  });

  it("counts days for anything further overdue", () => {
    expect(timeHint("2026-04-17", now)).toBe("3d overdue");
  });

  it("uses a weekday inside the coming week", () => {
    expect(timeHint("2026-04-23", now)).toMatch(/^Thu/);
  });

  it("falls back to a date beyond a week out", () => {
    expect(timeHint("2026-05-14", now)).toMatch(/May\s*14|14\s*May/);
  });

  it("includes the year only when it differs", () => {
    expect(timeHint("2026-11-02", now)).not.toMatch(/2026/);
    expect(timeHint("2027-01-05", now)).toMatch(/2027/);
  });

  it("is a date, never a clock time", () => {
    // The whole point of the change: rows show days, not minutes.
    expect(timeHint("2026-05-14T09:30:00", now)).not.toMatch(/\d:\d\d/);
  });

  it("ignores a day boundary crossed by only a few hours", () => {
    // 11pm today and 1am tomorrow are two hours apart but different days.
    expect(timeHint("2026-04-20T23:00:00", now)).toBe("today");
    expect(timeHint("2026-04-21T01:00:00", now)).toBe("tomorrow");
  });

  it("is empty for no date and for junk", () => {
    expect(timeHint(null, now)).toBe("");
    expect(timeHint("not a date", now)).toBe("");
  });
});

describe("isOverdue", () => {
  it("is true for yesterday and older", () => {
    expect(isOverdue("2026-04-19", now)).toBe(true);
    expect(isOverdue("2026-04-10", now)).toBe(true);
  });

  it("is false for today and later", () => {
    expect(isOverdue("2026-04-20", now)).toBe(false);
    expect(isOverdue("2026-04-25", now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
});
