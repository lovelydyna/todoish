import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { playComplete } from "../lib/sounds";
import { WindowControls } from "../components/WindowControls";
import { KeybindingsEditor } from "../components/KeybindingsEditor";
import { useKeybindings } from "../hooks/useKeybindings";
import { CalendarSettings } from "../components/CalendarSettings";
import { HistoryPanel } from "../components/HistoryPanel";
import { FieldLabel } from "../components/InfoTip";
import { Item } from "../types";
import {
  Appearance,
  THEMES,
  COLOR_MODES,
  OPACITY_RANGE,
  resolveScheme,
  applyAppearance,
  normalizeAppearance,
} from "../lib/theme";

interface SetupProps {
  onComplete: () => void;
  onCancel?: () => void;
  /** Called after the calendar link changes, so the item list stops showing
   *  stale rows until the next 60s sync tick. */
  onCalendarChanged?: () => void;
  initialApiKey?: string;
  initialDatabaseId?: string;
  initialTone?: string;
  initialPosition?: string;
  initialGlobalShortcut?: string;
  initialAppearance?: Partial<Appearance>;
  /** Which tab to open on. Lets `?` jump straight to the keybindings. */
  initialTab?: SettingsTab;
  /** For the history tab, which lives in settings rather than as its own view. */
  items?: Item[];
  historyLoading?: boolean;
}

/** Eye toggle for the database id field. */
function RevealButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="field-reveal"
      onClick={onToggle}
      title={shown ? "hide" : "show"}
    >
      {shown ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )}
    </button>
  );
}

const TONES = ["bell", "chime", "click", "none"] as const;
const POSITIONS = [
  { value: "", label: "last position" },
  { value: "top-left", label: "top left" },
  { value: "top-right", label: "top right" },
  { value: "bottom-left", label: "bottom left" },
  { value: "bottom-right", label: "bottom right" },
  { value: "center", label: "center" },
] as const;

/** Mirrors notion::SchemaReport — which property the app matched to each role. */
interface SchemaReport {
  title: string;
  status: string | null;
  /** The option written for each stage: [todo, in progress, done]. */
  status_options: string[];
  time: string | null;
  deadline: string | null;
  description: string | null;
  missing: string[];
}

export type SettingsTab =
  | "calendar"
  | "appearance"
  | "history"
  | "keybindings"
  | "general";
const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "general", label: "general", icon: "⚙" },
  { id: "appearance", label: "appearance", icon: "◐" },
  { id: "calendar", label: "calendar", icon: "▦" },
  { id: "history", label: "history", icon: "◴" },
  { id: "keybindings", label: "keys", icon: "⌨" },
];

export function Setup({
  onComplete,
  onCancel,
  onCalendarChanged,
  initialApiKey = "",
  initialDatabaseId = "",
  initialTone = "bell",
  initialPosition = "",
  initialGlobalShortcut = "CmdOrControl+Shift+T",
  initialAppearance = {},
  initialTab = "general",
  items = [],
  historyLoading = false,
}: SetupProps) {
  const { bindings } = useKeybindings();
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [databaseId, setDatabaseId] = useState(initialDatabaseId);
  const [showDbId, setShowDbId] = useState(false);
  const [tone, setTone] = useState(initialTone);
  const [position, setPosition] = useState(initialPosition);
  const [globalShortcut, setGlobalShortcut] = useState(initialGlobalShortcut);
  const [schemaReport, setSchemaReport] = useState<SchemaReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [appearance, setAppearance] = useState(() => normalizeAppearance(initialAppearance));
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const isSettings = !!onCancel;
  // First run is a single linear flow — there is nothing to configure until
  // the connection works, so tabs only appear once you are set up.
  const showTab = (id: SettingsTab) => !isSettings || tab === id;

  useEffect(() => {
    if (!isSettings) return;
    isEnabled().then(setAutostart).catch(() => {});
  }, [isSettings]);

  useEffect(() => {
    if (!isSettings) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSettings, onCancel]);

  // Preview as the user drags — the whole point of an opacity slider is
  // watching the window change while you move it.
  const previewAppearance = (patch: Partial<Appearance>) => {
    setAppearance(applyAppearance({ ...appearance, ...patch }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await invoke("save_config_cmd", {
        apiKey: apiKey.trim(),
        databaseId: databaseId.trim(),
        completionTone: tone,
        startupPosition: position,
        globalShortcut: globalShortcut.trim(),
        theme: appearance.theme,
        colorMode: appearance.mode,
        windowOpacity: appearance.opacity,
      });
      if (isSettings) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
      onComplete();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  /** Asks Notion which property fills each role, so a rename is visible here
   *  rather than surfacing later as a write failure. */
  const checkSchema = async () => {
    setChecking(true);
    setError(null);
    setSchemaReport(null);
    try {
      setSchemaReport(
        await invoke<SchemaReport>("describe_schema", {
          apiKey: apiKey.trim(),
          databaseId: databaseId.trim(),
        })
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  };

  const toggleAutostart = async () => {
    const next = !autostart;
    setAutostart(next);
    await (next ? enable() : disable()).catch(() => setAutostart(!next));
  };

  // The Thunderbird source-list look: in settings, the icon rail runs the
  // full height of the panel, including alongside the titlebar row — it is
  // not a row *below* the titlebar the way it is in the first-run flow,
  // which has no rail to make room for.
  const titlebar = (
    <div className="setup-titlebar">
      <WindowControls />
      <span className="brand setup-brand">todoish</span>
      <div className="topbar-right" />
    </div>
  );

  return (
    <div className={`setup${isSettings ? " setup--settings" : ""}`}>
      {!isSettings && (
        <>
          {titlebar}
          <div className="setup-header">
            <span className="setup-subtitle">connect to notion</span>
          </div>
        </>
      )}

      <div className={isSettings ? "setup-body" : undefined}>
        {isSettings && (
          <div className="settings-sidebar" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                title={t.id === "keybindings" ? `${t.label} [${bindings["help"]}]` : t.label}
                aria-label={t.label}
                className={`settings-sidebar-btn${tab === t.id ? " settings-sidebar-btn--active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <span className="settings-sidebar-icon" aria-hidden="true">{t.icon}</span>
              </button>
            ))}
          </div>
        )}

      <div className={isSettings ? "setup-content" : undefined}>
      {isSettings && titlebar}
      <form onSubmit={handleSubmit} className="setup-form">
        {showTab("calendar") && (
          <>
            <div className="field">
              <FieldLabel info="Notion developer portal → your connection → configuration → internal connection token. Not the personal access token — that one is user-scoped.">
                connection token
              </FieldLabel>
              <input
                className="field-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="secret_..."
                autoFocus={!isSettings}
                required
              />
            </div>

            <div className="field">
              <FieldLabel info="The id from your database url, or ··· → manage data sources → copy data source id. Either works — todoish resolves one to the other.">
                notion database
              </FieldLabel>
              <div className="field-input-row">
                <input
                  className="field-input field-input--flex"
                  type={showDbId ? "text" : "password"}
                  value={databaseId}
                  onChange={(e) => setDatabaseId(e.target.value)}
                  placeholder="32-char hex id from your notion database url"
                  required
                />
                <RevealButton shown={showDbId} onToggle={() => setShowDbId((v) => !v)} />
              </div>
            </div>

            <div className="schema-bar">
              <button
                type="button"
                className="schema-check-btn"
                onClick={checkSchema}
                disabled={checking || !apiKey.trim() || !databaseId.trim()}
              >
                {checking ? "checking…" : "check"}
              </button>
              {schemaReport && (
                <span className="schema-summary">
                  {schemaReport.missing.length === 0
                    ? "all properties matched"
                    : `${schemaReport.missing.length} missing`}
                </span>
              )}
            </div>

            {schemaReport && (
              <div className="schema-list">
                {([
                  ["name", schemaReport.title],
                  ["status", schemaReport.status],
                  ["date", schemaReport.time],
                  ["deadline", schemaReport.deadline],
                  ["description", schemaReport.description],
                ] as const).map(([role, matched]) => (
                  <div key={role} className="schema-line">
                    <span className="schema-role">{role}</span>
                    <span className={`schema-match${matched ? "" : " schema-match--missing"}`}>
                      {matched ?? "not found"}
                    </span>
                  </div>
                ))}
                {schemaReport.status_options.length > 0 && (
                  <div className="schema-line">
                    <span className="schema-role">stages</span>
                    <span className="schema-match">
                      {schemaReport.status_options.join(" → ")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Only in settings: first run is about getting Notion working, and
            the calendar is an addition to a working setup, not part of one. */}
        {isSettings && showTab("calendar") && (
          <CalendarSettings onChanged={onCalendarChanged} />
        )}

        {isSettings && showTab("appearance") && (
          <>
            <div className="field">
              <FieldLabel info="Auto follows your system light/dark setting and repaints when the OS switches.">
                appearance
              </FieldLabel>
              <div className="mode-options mode-options--full">
                {COLOR_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mode-btn${appearance.mode === m.id ? " mode-btn--active" : ""}`}
                    onClick={() => previewAppearance({ mode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field-label">theme</label>
              <div className="theme-options">
                {THEMES.map((t) => {
                  // Swatch shows the palette that is actually rendering, so
                  // picking a theme in light mode previews its light colours.
                  const palette = resolveScheme(appearance.mode) === "light" ? t.light : t.dark;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`theme-btn${appearance.theme === t.id ? " theme-btn--active" : ""}`}
                      onClick={() => previewAppearance({ theme: t.id })}
                    >
                      <span
                        className="theme-swatch"
                        style={{
                          background: `rgb(${palette.tint})`,
                          borderColor: palette.vars["--accent-next"],
                        }}
                      >
                        <span
                          className="theme-swatch-dot"
                          style={{ background: palette.vars["--accent-now"] }}
                        />
                      </span>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <FieldLabel
                info="Lower lets the desktop show through the window blur."
                value={`${Math.round(appearance.opacity * 100)}%`}
              >
                opacity
              </FieldLabel>
              <input
                className="field-slider"
                type="range"
                min={OPACITY_RANGE.min}
                max={OPACITY_RANGE.max}
                step={0.02}
                value={appearance.opacity}
                onChange={(e) => previewAppearance({ opacity: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {isSettings && showTab("keybindings") && <KeybindingsEditor
            globalShortcut={globalShortcut}
            onGlobalShortcutChange={setGlobalShortcut}
          />}

        {isSettings && showTab("general") && (
          <>
            <div className="field">
              <label className="field-label">completion tone</label>
              <div className="tone-options">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`tone-btn${tone === t ? " tone-btn--active" : ""}`}
                    onClick={() => {
                      setTone(t);
                      playComplete(t);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field-label">open at startup</label>
              <button
                type="button"
                className={`toggle-btn${autostart ? " toggle-btn--on" : ""}`}
                onClick={toggleAutostart}
              >
                {autostart ? "on" : "off"}
              </button>
            </div>

            {autostart && (
              <div className="field">
                <label className="field-label">startup position</label>
                <div className="position-options">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={`position-btn${position === p.value ? " position-btn--active" : ""}`}
                      onClick={() => setPosition(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {isSettings && showTab("history") && (
          <HistoryPanel items={items} loading={historyLoading} />
        )}

        {error && <div className="setup-error">{error}</div>}
        {saved && <div className="setup-saved">saved</div>}

        {/* History is a read-only log — nothing on that tab to save. The
            calendar tab's Google account section persists through its own
            commands as you go, but the Notion fields alongside it still need
            the save button. */}
        {!(isSettings && tab === "history") && (
          <button className="setup-submit" type="submit" disabled={loading}>
            {loading ? "saving…" : isSettings ? "save" : "connect"}
          </button>
        )}
      </form>
      </div>
      </div>
    </div>
  );
}
