import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { groupTasks, parseDueDate } from "./groupTasks";
import { Task } from "../types";

const base: Task = {
  id: "1",
  title: "Test",
  status: "Todo",
  due: null,
  priority: null,
  energy: null,
  snooze_until: null,
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
    // If parsed as UTC, getHours() would be offset-dependent — this confirms local
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(20);
  });

  it("parses ISO datetime strings normally", () => {
    const d = parseDueDate("2026-04-20T15:30:00");
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(30);
  });
});

// ─── groupTasks ──────────────────────────────────────────────

describe("groupTasks", () => {
  it("puts no-due tasks in LATER", () => {
    const g = groupTasks([{ ...base, due: null }]);
    expect(g.LATER).toHaveLength(1);
  });

  it("puts due today in NOW", () => {
    const g = groupTasks([{ ...base, due: "2026-04-20" }]);
    expect(g.NOW).toHaveLength(1);
  });

  it("puts due tomorrow in NEXT", () => {
    const g = groupTasks([{ ...base, due: "2026-04-21" }]);
    expect(g.NEXT).toHaveLength(1);
  });

  it("puts due > 3 days in LATER", () => {
    const g = groupTasks([{ ...base, due: "2026-04-25" }]);
    expect(g.LATER).toHaveLength(1);
  });

  it("puts done tasks in DONE", () => {
    const g = groupTasks([{ ...base, status: "Done", last_edited_time: now.toISOString() }]);
    expect(g.DONE).toHaveLength(1);
  });

  it("hides done tasks older than 24h by default", () => {
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const g = groupTasks([{ ...base, status: "Done", last_edited_time: old }]);
    expect(g.DONE).toHaveLength(0);
  });

  it("shows old done tasks when showAllDone = true", () => {
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const g = groupTasks([{ ...base, status: "Done", last_edited_time: old }], true);
    expect(g.DONE).toHaveLength(1);
  });

  it("treats date-only due as local time (timezone fix)", () => {
    // "2026-04-20" should be today, not shifted by UTC offset
    const g = groupTasks([{ ...base, due: "2026-04-20" }]);
    expect(g.NOW).toHaveLength(1);
    expect(g.NEXT).toHaveLength(0);
  });

  it("overdue tasks (past due) go in NOW", () => {
    const g = groupTasks([{ ...base, due: "2026-04-19" }]);
    expect(g.NOW).toHaveLength(1);
  });
});
