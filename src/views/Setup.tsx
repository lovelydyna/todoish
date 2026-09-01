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
import { Item, SchemaOverride } from "../types";
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
  /** Which discovered Notion data sources feed task/calendar. Empty = every
   *  shared database. */
  initialEnabledDataSources?: string[];
  initialSchemaOverrides?: Record<string, SchemaOverride>;
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

const TONES = ["bell", "chime", "click", "none"] as const;
const POSITIONS = [
  { value: "", label: "last position" },
  { value: "top-left", label: "top left" },
  { value: "top-right", label: "top right" },
  { value: "bottom-left", label: "bottom left" },
  { value: "bottom-right", label: "bottom right" },
  { value: "center", label: "center" },
] as const;

/** Mirrors notion::PropertySummary. */
interface PropertySummary {
  name: string;
  kind: string;
}

/** Mirrors notion::SchemaReport — which property the app matched to each role,
 *  for one database shared with the integration. */
interface SchemaReport {
  data_source_id: string;
  database_title: string;
  title: string;
  status: string | null;
  /** The option written for each stage: [todo, in progress, done]. */
  status_options: string[];
  time: string | null;
  deadline: string | null;
  description: string | null;
  missing: string[];
  properties: PropertySummary[];
}

/** Which property kinds a role's dropdown should offer. A plain `select`
 *  works for status too — that's the pre-Notion-status-type convention the
 *  backend already falls back to when it auto-detects. */
const ROLE_KINDS: Record<"status" | "time" | "deadline" | "description", string[]> = {
  status: ["status", "select"],
  time: ["date"],
  deadline: ["date"],
  description: ["rich_text"],
};

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
  initialEnabledDataSources = [],
  initialSchemaOverrides = {},
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
  const [tone, setTone] = useState(initialTone);
  const [position, setPosition] = useState(initialPosition);
  const [globalShortcut, setGlobalShortcut] = useState(initialGlobalShortcut);
  const [schemaReports, setSchemaReports] = useState<SchemaReport[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [enabledDataSources, setEnabledDataSources] = useState<string[]>(initialEnabledDataSources);
  const [schemaOverrides, setSchemaOverrides] = useState<Record<string, SchemaOverride>>(initialSchemaOverrides);
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
        enabledDataSources,
        schemaOverrides,
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

  /** Asks Notion which databases are shared with the integration and which
   *  property fills each role in each one — no id to paste, just the
   *  connection token; a rename or a newly-shared database shows up here
   *  rather than surfacing later as a write failure. */
  const checkConnection = async () => {
    setChecking(true);
    setError(null);
    setSchemaReports(null);
    try {
      setSchemaReports(
        await invoke<SchemaReport[]>("describe_schemas", {
          apiKey: apiKey.trim(),
          schemaOverrides,
        })
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  };

  /** Empty selection means "every shared database" — the first time a
   *  database is unchecked, that has to seed the list with everything else
   *  that's currently showing, or unchecking one would silently drop every
   *  other database too. */
  const toggleDataSource = (id: string, allIds: string[]) => {
    setEnabledDataSources((prev) => {
      const active = prev.length === 0 ? allIds : prev;
      const next = active.includes(id) ? active.filter((x) => x !== id) : [...active, id];
      return next.length === allIds.length ? [] : next;
    });
  };

  const setOverride = (dataSourceId: string, role: keyof SchemaOverride, value: string) => {
    setSchemaOverrides((prev) => ({
      ...prev,
      [dataSourceId]: { ...prev[dataSourceId], [role]: value || null },
    }));
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
              <FieldLabel info="Notion developer portal → your connection → configuration → internal connection token. Not the personal access token — that one is user-scoped. No database id needed: todoish reads every database you've shared with this integration (··· → Connections, in Notion), and you can share more than one.">
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

            <div className="schema-bar">
              <button
                type="button"
                className="schema-check-btn"
                onClick={checkConnection}
                disabled={checking || !apiKey.trim()}
              >
                {checking ? "checking…" : "check"}
              </button>
              {schemaReports && (
                <span className="schema-summary">
                  {schemaReports.length === 0
                    ? "no databases shared"
                    : `${schemaReports.length} database${schemaReports.length === 1 ? "" : "s"} found`}
                </span>
              )}
            </div>

            {schemaReports?.length === 0 && (
              <div className="schema-list">
                <div className="schema-line">
                  <span className="schema-match schema-match--missing">
                    Open a database in Notion, click "···" in the top right, choose Connections,
                    and add your integration — it'll show up here.
                  </span>
                </div>
              </div>
            )}

            {schemaReports?.map((report) => {
              const allIds = schemaReports.map((r) => r.data_source_id);
              const enabled = enabledDataSources.length === 0 || enabledDataSources.includes(report.data_source_id);
              return (
                <div key={report.data_source_id} className="schema-list">
                  <div className="schema-line">
                    <label className="schema-role schema-checkbox-label">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleDataSource(report.data_source_id, allIds)}
                      />
                      {" "}{report.database_title}
                    </label>
                    <span className="schema-match">
                      {report.missing.length === 0 ? "all properties matched" : `${report.missing.length} missing`}
                    </span>
                  </div>
                  {enabled && (
                    <>
                      <div className="schema-line">
                        <span className="schema-role">name</span>
                        <span className="schema-match">{report.title}</span>
                      </div>
                      {(["status", "time", "deadline", "description"] as const).map((role) => {
                        const matched = report[role];
                        const options = report.properties.filter((p) => ROLE_KINDS[role].includes(p.kind));
                        return (
                          <div key={role} className="schema-line">
                            <span className="schema-role">{role === "time" ? "date" : role}</span>
                            <select
                              className="schema-match-select"
                              value={matched ?? ""}
                              onChange={(e) => setOverride(report.data_source_id, role, e.target.value)}
                            >
                              <option value="">not found</option>
                              {options.map((p) => (
                                <option key={p.name} value={p.name}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                      {report.status_options.length > 0 && (
                        <div className="schema-line">
                          <span className="schema-role">stages</span>
                          <span className="schema-match">
                            {report.status_options.join(" → ")}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
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
