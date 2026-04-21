import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mirror the parsers from QuickAdd/FocusEdit (pure functions, copy-tested here)
function parseDue(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "skip" || v === "s") return null;
  if (v === "today" || v === "t") return new Date().toISOString().split("T")[0];
  if (v === "tomorrow" || v === "tmrw" || v === "tm") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) return v;
  return null;
}

function parsePriority(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "skip" || v === "s") return null;
  if (v === "h" || v === "high") return "High";
  if (v === "m" || v === "med" || v === "medium") return "Medium";
  if (v === "l" || v === "low") return "Low";
  return null;
}

function parseEnergy(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "skip" || v === "s") return null;
  if (v === "h" || v === "high") return "High";
  if (v === "l" || v === "low") return "Low";
  if (v === "q" || v === "quick") return "Quick";
  return null;
}

const fakeNow = new Date("2026-04-20T12:00:00");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(fakeNow); });
afterEach(() => { vi.useRealTimers(); });

// ─── parseDue ────────────────────────────────────────────────

describe("parseDue", () => {
  it("returns null for empty string", () => expect(parseDue("")).toBeNull());
  it("returns null for 'skip'", () => expect(parseDue("skip")).toBeNull());
  it("returns null for 's'", () => expect(parseDue("s")).toBeNull());
  it("returns today's date for 'today'", () => expect(parseDue("today")).toBe("2026-04-20"));
  it("returns today's date for 't'", () => expect(parseDue("t")).toBe("2026-04-20"));
  it("returns tomorrow for 'tomorrow'", () => expect(parseDue("tomorrow")).toBe("2026-04-21"));
  it("returns tomorrow for 'tmrw'", () => expect(parseDue("tmrw")).toBe("2026-04-21"));
  it("returns tomorrow for 'tm'", () => expect(parseDue("tm")).toBe("2026-04-21"));
  it("passes through a valid ISO date", () => expect(parseDue("2026-05-01")).toBe("2026-05-01"));
  it("returns null for garbage", () => expect(parseDue("asdfgh")).toBeNull());
});

// ─── parsePriority ───────────────────────────────────────────

describe("parsePriority", () => {
  it("returns null for empty", () => expect(parsePriority("")).toBeNull());
  it("returns null for skip", () => expect(parsePriority("skip")).toBeNull());
  it("maps h/high → High", () => {
    expect(parsePriority("h")).toBe("High");
    expect(parsePriority("high")).toBe("High");
    expect(parsePriority("HIGH")).toBe("High");
  });
  it("maps m/med/medium → Medium", () => {
    expect(parsePriority("m")).toBe("Medium");
    expect(parsePriority("med")).toBe("Medium");
    expect(parsePriority("medium")).toBe("Medium");
  });
  it("maps l/low → Low", () => {
    expect(parsePriority("l")).toBe("Low");
    expect(parsePriority("low")).toBe("Low");
  });
  it("returns null for unknown", () => expect(parsePriority("urgent")).toBeNull());
});

// ─── parseEnergy ─────────────────────────────────────────────

describe("parseEnergy", () => {
  it("returns null for empty", () => expect(parseEnergy("")).toBeNull());
  it("maps h/high → High", () => {
    expect(parseEnergy("h")).toBe("High");
    expect(parseEnergy("high")).toBe("High");
  });
  it("maps l/low → Low", () => {
    expect(parseEnergy("l")).toBe("Low");
    expect(parseEnergy("low")).toBe("Low");
  });
  it("maps q/quick → Quick", () => {
    expect(parseEnergy("q")).toBe("Quick");
    expect(parseEnergy("quick")).toBe("Quick");
  });
  it("returns null for unknown", () => expect(parseEnergy("medium")).toBeNull());
});
