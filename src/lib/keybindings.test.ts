import { describe, it, expect, vi, afterEach } from "vitest";
import { loadBindings, DEFAULTS, ACTION_LABELS, ACTION_SECTIONS } from "./keybindings";

const stubStorage = (saved: unknown) =>
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(saved), setItem: () => {} });

afterEach(() => vi.unstubAllGlobals());

describe("loadBindings", () => {
  it("keeps a user's rebinding", () => {
    stubStorage({ add: "a" });
    expect(loadBindings().add).toBe("a");
  });

  it("drops saved keys for actions that no longer exist", () => {
    stubStorage({ "browse-notes": "b", "notes-preview": "p" });
    expect(Object.keys(loadBindings()).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });
});

describe("shortcut list", () => {
  it("shows every action exactly once, with a label", () => {
    const listed = ACTION_SECTIONS.flatMap((s) => s.actions);
    expect(listed.sort()).toEqual(Object.keys(DEFAULTS).sort());
    for (const a of listed) expect(ACTION_LABELS[a]).toBeTruthy();
  });
});
