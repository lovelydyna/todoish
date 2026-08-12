import { describe, it, expect } from "vitest";
import {
  eventToAccelerator,
  acceleratorLabel,
  normalizeKey,
  isModifierOnly,
} from "./accelerator";

const press = (key: string, mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {}) => ({
  key,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe("eventToAccelerator", () => {
  it("builds a cmd+shift combo", () => {
    expect(eventToAccelerator(press("t", { meta: true, shift: true })).accelerator)
      .toBe("CmdOrControl+Shift+T");
  });

  it("emits modifiers in Tauri's order regardless of press order", () => {
    expect(eventToAccelerator(press("k", { shift: true, alt: true, meta: true })).accelerator)
      .toBe("CmdOrControl+Alt+Shift+K");
  });

  it("waits while only modifiers are held", () => {
    const r = eventToAccelerator(press("Meta", { meta: true }));
    expect(r.accelerator).toBeNull();
    expect(r.error).toBeNull();
  });

  it("rejects a bare key, which would be swallowed system-wide", () => {
    const r = eventToAccelerator(press("t"));
    expect(r.accelerator).toBeNull();
    expect(r.error).toMatch(/modifier/);
  });

  it("rejects keys it cannot express", () => {
    const r = eventToAccelerator(press("Dead", { meta: true }));
    expect(r.accelerator).toBeNull();
    expect(r.error).toMatch(/can't be used/);
  });

  it("names the space bar and arrows", () => {
    expect(eventToAccelerator(press(" ", { alt: true })).accelerator).toBe("Alt+Space");
    expect(eventToAccelerator(press("ArrowUp", { ctrl: true })).accelerator).toBe("Control+Up");
  });

  it("keeps function keys as-is", () => {
    expect(eventToAccelerator(press("F5", { meta: true })).accelerator).toBe("CmdOrControl+F5");
  });

  it("maps punctuation to Tauri's names", () => {
    expect(eventToAccelerator(press(",", { meta: true })).accelerator).toBe("CmdOrControl+Comma");
  });
});

describe("normalizeKey", () => {
  it("upper-cases letters and passes digits through", () => {
    expect(normalizeKey("t")).toBe("T");
    expect(normalizeKey("7")).toBe("7");
  });

  it("is null for anything unbindable", () => {
    expect(normalizeKey("F13")).toBeNull();
    expect(normalizeKey("Unidentified")).toBeNull();
  });
});

describe("isModifierOnly", () => {
  it("recognises the four modifiers", () => {
    for (const k of ["Meta", "Control", "Alt", "Shift"]) {
      expect(isModifierOnly(k), k).toBe(true);
    }
    expect(isModifierOnly("T")).toBe(false);
  });
});

describe("acceleratorLabel", () => {
  it("renders mac symbols", () => {
    expect(acceleratorLabel("CmdOrControl+Shift+T")).toBe("⌘⇧T");
    expect(acceleratorLabel("Alt+Space")).toBe("⌥Space");
    expect(acceleratorLabel("CmdOrControl+Alt+Shift+K")).toBe("⌘⌥⇧K");
  });

  it("says off when the shortcut is disabled", () => {
    expect(acceleratorLabel("")).toBe("off");
    expect(acceleratorLabel("   ")).toBe("off");
  });

  it("round-trips what the capture produces", () => {
    const acc = eventToAccelerator(press("t", { meta: true, shift: true })).accelerator!;
    expect(acceleratorLabel(acc)).toBe("⌘⇧T");
  });
});
