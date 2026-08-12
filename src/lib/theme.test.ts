import { describe, it, expect } from "vitest";
import {
  normalizeAppearance,
  themeById,
  THEMES,
  DEFAULT_THEME,
  DEFAULT_OPACITY,
  DEFAULT_MODE,
  OPACITY_RANGE,
  resolveScheme,
} from "./theme";

describe("themeById", () => {
  it("finds a known theme", () => {
    expect(themeById("ember").label).toBe("ember");
  });

  it("falls back to the first theme for an unknown id", () => {
    expect(themeById("does-not-exist").id).toBe(DEFAULT_THEME);
  });
});

describe("normalizeAppearance", () => {
  it("fills in defaults for an empty config", () => {
    expect(normalizeAppearance({})).toEqual({
      theme: DEFAULT_THEME,
      opacity: DEFAULT_OPACITY,
      mode: DEFAULT_MODE,
    });
  });

  it("treats a zero opacity from an unset config field as unset", () => {
    // Rust serde fills a missing f64 with 0.0 — an invisible window is never
    // what the user meant.
    expect(normalizeAppearance({ opacity: 0 }).opacity).toBe(DEFAULT_OPACITY);
  });

  it("clamps opacity into range", () => {
    expect(normalizeAppearance({ opacity: 5 }).opacity).toBe(OPACITY_RANGE.max);
    expect(normalizeAppearance({ opacity: 0.05 }).opacity).toBe(OPACITY_RANGE.min);
  });

  it("keeps a valid opacity untouched", () => {
    expect(normalizeAppearance({ opacity: 0.6 }).opacity).toBe(0.6);
  });

  it("replaces an unknown theme with the default", () => {
    expect(normalizeAppearance({ theme: "neon" }).theme).toBe(DEFAULT_THEME);
  });

  it("falls back to the default mode for a missing or bogus value", () => {
    expect(normalizeAppearance({}).mode).toBe(DEFAULT_MODE);
    expect(normalizeAppearance({ mode: "sepia" as never }).mode).toBe(DEFAULT_MODE);
  });

  it("keeps each valid mode", () => {
    for (const mode of ["dark", "light", "auto"] as const) {
      expect(normalizeAppearance({ mode }).mode).toBe(mode);
    }
  });
});

describe("resolveScheme", () => {
  it("passes an explicit mode straight through, ignoring the system", () => {
    expect(resolveScheme("dark", "light")).toBe("dark");
    expect(resolveScheme("light", "dark")).toBe("light");
  });

  it("follows the system only in auto", () => {
    expect(resolveScheme("auto", "light")).toBe("light");
    expect(resolveScheme("auto", "dark")).toBe("dark");
  });
});

describe("THEMES", () => {
  const palettes = THEMES.flatMap((t) => [
    { id: `${t.id}/dark`, palette: t.dark },
    { id: `${t.id}/light`, palette: t.light },
  ]);

  it("every palette defines the same variable set", () => {
    // A missing var in one palette would leave the previous theme's value
    // behind on switch, since applying only ever overwrites.
    const keys = Object.keys(THEMES[0].dark.vars).sort();
    for (const { id, palette } of palettes) {
      expect(Object.keys(palette.vars).sort(), id).toEqual(keys);
    }
  });

  it("every palette has a tint usable inside rgba()", () => {
    for (const { id, palette } of palettes) {
      expect(palette.tint, id).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
    }
  });

  it("light palettes are lighter than their dark counterparts", () => {
    const luminance = (tint: string) =>
      tint.split(",").reduce((sum, n) => sum + Number(n), 0) / 3;
    for (const theme of THEMES) {
      expect(luminance(theme.light.tint), theme.id)
        .toBeGreaterThan(luminance(theme.dark.tint));
    }
  });

  it("has unique ids", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
