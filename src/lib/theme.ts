/**
 * Appearance is applied by writing CSS custom properties onto the root
 * element. Every themed value in index.css reads from one of these, so a
 * theme switch is a single style write with no re-render.
 *
 * Each theme carries a dark and a light palette. `--overlay-rgb` is the trick
 * that keeps the rest of the stylesheet mode-agnostic: every hover fill and
 * raised surface is `rgba(var(--overlay-rgb), α)`, so flipping that one value
 * from white to black converts the whole UI.
 */

/** The ten colours a palette has to supply, plus its window tint. */
export interface Palette {
  /** Base window tint as "r, g, b" — combined with the opacity setting. */
  tint: string;
  vars: Record<string, string>;
}

export interface Theme {
  id: string;
  label: string;
  dark: Palette;
  light: Palette;
}

export type ColorScheme = "dark" | "light";
export type ColorMode = ColorScheme | "auto";

export const COLOR_MODES: { id: ColorMode; label: string }[] = [
  { id: "auto", label: "auto" },
  { id: "light", label: "light" },
  { id: "dark", label: "dark" },
];

export const THEMES: Theme[] = [
  {
    id: "midnight",
    label: "midnight",
    dark: {
      tint: "0, 0, 0",
      vars: {
        "--overlay-rgb": "255, 255, 255",
        "--sunken": "rgba(0, 0, 0, 0.3)",
        "--raised": "rgba(255, 255, 255, 0.1)",
        "--shadow-soft": "rgba(0, 0, 0, 0.35)",
        "--text": "rgba(240, 240, 245, 0.95)",
        "--text-dim": "rgba(180, 180, 195, 0.65)",
        "--text-faint": "rgba(140, 140, 160, 0.4)",
        "--border": "rgba(255, 255, 255, 0.1)",
        "--bg-raised": "rgba(255, 255, 255, 0.05)",
        "--selected-bg": "rgba(124, 156, 191, 0.12)",
        "--selected-border": "rgba(124, 156, 191, 0.3)",
        "--accent-now": "#d4956a",
        "--accent-next": "#7abf8e",
        "--accent-later": "#5a5a70",
        "--accent-blue": "#7c9cbf",
        "--accent-red": "#bf7c7c",
      },
    },
    light: {
      tint: "248, 248, 250",
      vars: {
        "--overlay-rgb": "0, 0, 0",
        "--sunken": "rgba(0, 0, 0, 0.07)",
        "--raised": "rgba(255, 255, 255, 0.98)",
        "--shadow-soft": "rgba(0, 0, 0, 0.16)",
        "--text": "#16161c",
        "--text-dim": "#4a4a58",
        "--text-faint": "#6e6e80",
        "--border": "rgba(0, 0, 0, 0.12)",
        "--bg-raised": "rgba(0, 0, 0, 0.04)",
        "--selected-bg": "rgba(58, 106, 158, 0.13)",
        "--selected-border": "rgba(58, 106, 158, 0.35)",
        "--accent-now": "#a85f28",
        "--accent-next": "#2f7d4f",
        "--accent-later": "#6b6b7c",
        "--accent-blue": "#3a6a9e",
        "--accent-red": "#a83c3c",
      },
    },
  },
  {
    id: "ember",
    label: "ember",
    dark: {
      tint: "22, 12, 10",
      vars: {
        "--overlay-rgb": "255, 235, 220",
        "--sunken": "rgba(0, 0, 0, 0.3)",
        "--raised": "rgba(255, 255, 255, 0.1)",
        "--shadow-soft": "rgba(0, 0, 0, 0.35)",
        "--text": "rgba(246, 236, 228, 0.95)",
        "--text-dim": "rgba(206, 180, 166, 0.68)",
        "--text-faint": "rgba(170, 136, 120, 0.45)",
        "--border": "rgba(255, 200, 170, 0.12)",
        "--bg-raised": "rgba(255, 190, 150, 0.06)",
        "--selected-bg": "rgba(224, 139, 90, 0.14)",
        "--selected-border": "rgba(224, 139, 90, 0.32)",
        "--accent-now": "#e08b5a",
        "--accent-next": "#c9a86a",
        "--accent-later": "#6e5548",
        "--accent-blue": "#c98f6a",
        "--accent-red": "#d1666a",
      },
    },
    light: {
      tint: "253, 246, 240",
      vars: {
        "--overlay-rgb": "60, 30, 15",
        "--sunken": "rgba(0, 0, 0, 0.07)",
        "--raised": "rgba(255, 255, 255, 0.98)",
        "--shadow-soft": "rgba(0, 0, 0, 0.16)",
        "--text": "#2a1810",
        "--text-dim": "#6b4630",
        "--text-faint": "#8d6650",
        "--border": "rgba(120, 70, 40, 0.16)",
        "--bg-raised": "rgba(120, 70, 40, 0.05)",
        "--selected-bg": "rgba(178, 92, 40, 0.14)",
        "--selected-border": "rgba(178, 92, 40, 0.36)",
        "--accent-now": "#b25c28",
        "--accent-next": "#8a6a24",
        "--accent-later": "#8a7060",
        "--accent-blue": "#a5643c",
        "--accent-red": "#a83c46",
      },
    },
  },
  {
    id: "forest",
    label: "forest",
    dark: {
      tint: "8, 18, 14",
      vars: {
        "--overlay-rgb": "220, 255, 235",
        "--sunken": "rgba(0, 0, 0, 0.3)",
        "--raised": "rgba(255, 255, 255, 0.1)",
        "--shadow-soft": "rgba(0, 0, 0, 0.35)",
        "--text": "rgba(232, 244, 236, 0.95)",
        "--text-dim": "rgba(168, 198, 178, 0.68)",
        "--text-faint": "rgba(128, 160, 140, 0.45)",
        "--border": "rgba(180, 255, 210, 0.1)",
        "--bg-raised": "rgba(150, 255, 200, 0.05)",
        "--selected-bg": "rgba(106, 174, 156, 0.14)",
        "--selected-border": "rgba(106, 174, 156, 0.32)",
        "--accent-now": "#c9b06a",
        "--accent-next": "#7abf8e",
        "--accent-later": "#4a6455",
        "--accent-blue": "#6aae9c",
        "--accent-red": "#c07a76",
      },
    },
    light: {
      tint: "244, 250, 246",
      vars: {
        "--overlay-rgb": "10, 40, 28",
        "--sunken": "rgba(0, 0, 0, 0.07)",
        "--raised": "rgba(255, 255, 255, 0.98)",
        "--shadow-soft": "rgba(0, 0, 0, 0.16)",
        "--text": "#12261c",
        "--text-dim": "#335844",
        "--text-faint": "#5a7d68",
        "--border": "rgba(20, 80, 55, 0.15)",
        "--bg-raised": "rgba(20, 80, 55, 0.05)",
        "--selected-bg": "rgba(40, 122, 100, 0.14)",
        "--selected-border": "rgba(40, 122, 100, 0.34)",
        "--accent-now": "#8a7020",
        "--accent-next": "#2c7d52",
        "--accent-later": "#5c7a68",
        "--accent-blue": "#2c7a68",
        "--accent-red": "#a44a44",
      },
    },
  },
  {
    id: "mono",
    label: "mono",
    dark: {
      tint: "10, 10, 12",
      vars: {
        "--overlay-rgb": "255, 255, 255",
        "--sunken": "rgba(0, 0, 0, 0.3)",
        "--raised": "rgba(255, 255, 255, 0.1)",
        "--shadow-soft": "rgba(0, 0, 0, 0.35)",
        "--text": "rgba(238, 238, 240, 0.95)",
        "--text-dim": "rgba(178, 178, 184, 0.65)",
        "--text-faint": "rgba(136, 136, 144, 0.42)",
        "--border": "rgba(255, 255, 255, 0.12)",
        "--bg-raised": "rgba(255, 255, 255, 0.06)",
        "--selected-bg": "rgba(255, 255, 255, 0.1)",
        "--selected-border": "rgba(255, 255, 255, 0.24)",
        "--accent-now": "#e2e2e6",
        "--accent-next": "#b6b6bc",
        "--accent-later": "#61616a",
        "--accent-blue": "#9a9aa4",
        "--accent-red": "#b98b8b",
      },
    },
    light: {
      tint: "250, 250, 252",
      vars: {
        "--overlay-rgb": "0, 0, 0",
        "--sunken": "rgba(0, 0, 0, 0.07)",
        "--raised": "rgba(255, 255, 255, 0.98)",
        "--shadow-soft": "rgba(0, 0, 0, 0.16)",
        "--text": "#18181c",
        "--text-dim": "#4e4e58",
        "--text-faint": "#70707c",
        "--border": "rgba(0, 0, 0, 0.14)",
        "--bg-raised": "rgba(0, 0, 0, 0.05)",
        "--selected-bg": "rgba(0, 0, 0, 0.08)",
        "--selected-border": "rgba(0, 0, 0, 0.22)",
        "--accent-now": "#2c2c32",
        "--accent-next": "#55555e",
        "--accent-later": "#8c8c96",
        "--accent-blue": "#4a4a54",
        "--accent-red": "#9a4a4a",
      },
    },
  },
];

export const DEFAULT_THEME = "midnight";
export const DEFAULT_OPACITY = 0.82;
export const DEFAULT_MODE: ColorMode = "dark";

export const OPACITY_RANGE = { min: 0.3, max: 1 } as const;

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export interface Appearance {
  theme: string;
  opacity: number;
  mode: ColorMode;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isMode(v: unknown): v is ColorMode {
  return v === "dark" || v === "light" || v === "auto";
}

/** What the OS is currently asking for. Defaults to dark off-platform. */
export function systemScheme(): ColorScheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Turns the stored mode into the scheme actually being rendered. */
export function resolveScheme(mode: ColorMode, system: ColorScheme = systemScheme()): ColorScheme {
  return mode === "auto" ? system : mode;
}

/**
 * Calls back whenever the OS scheme changes. Only worth subscribing while the
 * mode is "auto"; returns an unsubscribe function.
 */
export function watchSystemScheme(onChange: (scheme: ColorScheme) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-color-scheme: light)");
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? "light" : "dark");
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

/** Fills in defaults for anything missing or out of range in a stored config. */
export function normalizeAppearance(partial: Partial<Appearance>): Appearance {
  const opacity = Number(partial.opacity);
  return {
    theme: themeById(partial.theme ?? DEFAULT_THEME).id,
    opacity: Number.isFinite(opacity) && opacity > 0
      ? clamp(opacity, OPACITY_RANGE.min, OPACITY_RANGE.max)
      : DEFAULT_OPACITY,
    mode: isMode(partial.mode) ? partial.mode : DEFAULT_MODE,
  };
}

export function applyAppearance(partial: Partial<Appearance>): Appearance {
  const appearance = normalizeAppearance(partial);
  const theme = themeById(appearance.theme);
  const scheme = resolveScheme(appearance.mode);
  const palette = scheme === "light" ? theme.light : theme.dark;
  const root = document.documentElement;

  for (const [name, value] of Object.entries(palette.vars)) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty("--tint-rgb", palette.tint);
  root.style.setProperty("--window-opacity", String(appearance.opacity));
  // Menus and popovers sit above the window wash, so they track it but stay
  // a little denser — otherwise text behind them shows through.
  root.style.setProperty(
    "--bg-overlay",
    `rgba(${palette.tint}, ${clamp(appearance.opacity + 0.1, 0, 0.95)})`
  );
  // Lets the native scrollbars and form controls match.
  root.style.setProperty("color-scheme", scheme);
  // Antialiasing that is right on a dark ground thins text on a light one.
  root.style.setProperty("--font-smoothing", scheme === "light" ? "auto" : "antialiased");
  root.style.setProperty("--label-weight", scheme === "light" ? "600" : "500");
  root.dataset.scheme = scheme;

  return appearance;
}
