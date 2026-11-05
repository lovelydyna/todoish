import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { playComplete } from "../lib/sounds";
import { WindowControls } from "../components/WindowControls";
import { KeybindingsEditor } from "../components/KeybindingsEditor";
import { HistoryPanel } from "../components/HistoryPanel";
import { FieldLabel } from "../components/InfoTip";
import {
  AppearanceIcon,
  ClockIcon,
  DatabaseIcon,
  GearIcon,
  KeyboardIcon,
} from "../components/Icons";
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
  initialApiKey?: string;
  /** Which discovered Notion data sources feed task/calendar. Empty = every
   *  shared database. */
  initialEnabledDataSources?: string[];
  initialSchemaOverrides?: Record<string, SchemaOverride>;
  initialTone?: string;
  initialPosition?: string;
  initialGlobalShortcut?: string;
  initialAlwaysOnTop?: boolean;
  initialAppearance?: Partial<Appearance>;
  /** Which tab to open on. Lets `?` jump straight to the keybindings. */
  initialTab?: SettingsTab;
  /** For the history tab, which lives in settings rather than as its own view. */
  items?: Item[];
  historyLoading?: boolean;
}

const TONES = ["bell", "chime", "click", "none"] as const;
const POSITIONS = [
  { value: "", label: "Where it was last" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "center", label: "Center" },
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

const ROLE_LABELS: Record<keyof typeof ROLE_KINDS, string> = {
  status: "Status",
  time: "Date",
  deadline: "Deadline",
  description: "Description",
};

export type SettingsTab =
  | "calendar"
  | "appearance"
  | "history"
  | "keybindings"
  | "general";

// "calendar" is the Notion connection tab; the id predates the rename and is
// what `onSettings(tab)` callers pass.
const TABS: { id: SettingsTab; label: string; Icon: () => JSX.Element }[] = [
  { id: "general", label: "General", Icon: GearIcon },
  { id: "appearance", label: "Appearance", Icon: AppearanceIcon },
  { id: "calendar", label: "Notion", Icon: DatabaseIcon },
  { id: "history", label: "History", Icon: ClockIcon },
  { id: "keybindings", label: "Shortcuts", Icon: KeyboardIcon },
];

export function Setup({
  onComplete,
  onCancel,
  initialApiKey = "",
  initialEnabledDataSources = [],
  initialSchemaOverrides = {},
  initialTone = "bell",
  initialPosition = "",
  initialGlobalShortcut = "CmdOrControl+Shift+T",
  initialAlwaysOnTop = false,
  initialAppearance = {},
  initialTab = "general",
  items = [],
  historyLoading = false,
}: SetupProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [tone, setTone] = useState(initialTone);
  const [position, setPosition] = useState(initialPosition);
  const [globalShortcut, setGlobalShortcut] = useState(initialGlobalShortcut);
  const [schemaReports, setSchemaReports] = useState<SchemaReport[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [enabledDataSources, setEnabledDataSources] = useState<string[]>(initialEnabledDataSources);
  const [schemaOverrides, setSchemaOverrides] = useState<Record<string, SchemaOverride>>(initialSchemaOverrides);
  const [autostart, setAutostart] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(initialAlwaysOnTop);
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
        // Omitted on first run, where the switch isn't shown.
        alwaysOnTop: isSettings ? alwaysOnTop : undefined,
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

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  const form = (
    <form onSubmit={handleSubmit} className="setup-form">
      <div className="setup-scroll">
        {isSettings && <h1 className="settings-heading">{activeTab.label}</h1>}

        {showTab("calendar") && (
          <>
            <div className="setting">
              <FieldLabel info="Notion developer portal → your connection → Configuration → internal connection token. Not the personal access token. No database id needed: todoish reads every database you've shared with this connection (··· → Connections, in Notion).">
                Connection token
              </FieldLabel>
              <div className="token-row">
                <input
                  className="field-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="secret_…"
                  aria-label="connection token"
                  autoFocus={!isSettings}
                  required
                />
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={checkConnection}
                  disabled={checking || !apiKey.trim()}
                >
                  {checking ? "Checking…" : "Check"}
                </button>
              </div>
              {schemaReports && schemaReports.length > 0 && (
                <span className="setting-note">
                  {schemaReports.length} database{schemaReports.length === 1 ? "" : "s"} found.
                  Untick any you don't want in todoish.
                </span>
              )}
              {!schemaReports && (
                <span className="setting-note">Check to see which databases todoish can read.</span>
              )}
            </div>

            {schemaReports?.length === 0 && (
              <div className="callout callout--warn">
                No databases are shared yet. In Notion, open a database, click ··· in the
                top right, choose Connections and add your integration. Then check again.
              </div>
            )}

            {schemaReports?.map((report) => {
              const allIds = schemaReports.map((r) => r.data_source_id);
              const enabled = enabledDataSources.length === 0 || enabledDataSources.includes(report.data_source_id);
              return (
                <div key={report.data_source_id} className={`db-card${enabled ? "" : " db-card--off"}`}>
                  <label className="db-card-head">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={enabled}
                      onChange={() => toggleDataSource(report.data_source_id, allIds)}
                    />
                    <span className="db-card-title">{report.database_title}</span>
                    <span className={`badge${report.missing.length ? " badge--warn" : " badge--ok"}`}>
                      {report.missing.length === 0 ? "All matched" : `${report.missing.length} missing`}
                    </span>
                  </label>
                  {enabled && (
                    <div className="db-card-body">
                      <div className="db-row">
                        <span className="db-role">Name</span>
                        <span className="db-value">{report.title}</span>
                      </div>
                      {(["status", "time", "deadline", "description"] as const).map((role) => {
                        const matched = report[role];
                        const options = report.properties.filter((p) => ROLE_KINDS[role].includes(p.kind));
                        return (
                          <div key={role} className="db-row">
                            <span className="db-role">{ROLE_LABELS[role]}</span>
                            <select
                              className={`select${matched ? "" : " select--missing"}`}
                              aria-label={`${ROLE_LABELS[role]} property`}
                              value={matched ?? ""}
                              onChange={(e) => setOverride(report.data_source_id, role, e.target.value)}
                            >
                              <option value="">Not found</option>
                              {options.map((p) => (
                                <option key={p.name} value={p.name}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                      {report.status_options.length > 0 && (
                        <div className="db-row">
                          <span className="db-role">Stages</span>
                          <span className="db-value db-value--dim">
                            {report.status_options.join(" → ")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {isSettings && showTab("appearance") && (
          <>
            <div className="setting">
              <FieldLabel info="Auto follows your Mac's light/dark setting and switches when it does.">
                Mode
              </FieldLabel>
              <div className="segmented" role="radiogroup" aria-label="mode">
                {COLOR_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={appearance.mode === m.id}
                    className={`segmented-btn${appearance.mode === m.id ? " segmented-btn--active" : ""}`}
                    onClick={() => previewAppearance({ mode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting">
              <FieldLabel>Theme</FieldLabel>
              <div className="theme-grid" role="radiogroup" aria-label="theme">
                {THEMES.map((t) => {
                  // The preview shows the palette that is actually rendering,
                  // so picking a theme in light mode previews its light colours.
                  const palette = resolveScheme(appearance.mode) === "light" ? t.light : t.dark;
                  const active = appearance.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`theme-card${active ? " theme-card--active" : ""}`}
                      onClick={() => previewAppearance({ theme: t.id })}
                    >
                      <span className="theme-preview" style={{ background: `rgb(${palette.tint})` }}>
                        {(["--accent-now", "--accent-next", "--accent-blue"] as const).map((v, i) => (
                          <span key={v} className="theme-preview-row">
                            <span className="theme-preview-ring" style={{ borderColor: palette.vars[v] }} />
                            <span
                              className="theme-preview-line"
                              style={{ background: palette.vars["--text-faint"], width: `${70 - i * 16}%` }}
                            />
                          </span>
                        ))}
                      </span>
                      <span className="theme-name">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="setting">
              <FieldLabel
                info="Lower lets more of the desktop show through the blur."
                value={`${Math.round(appearance.opacity * 100)}%`}
              >
                Opacity
              </FieldLabel>
              <input
                className="field-slider"
                type="range"
                aria-label="opacity"
                min={OPACITY_RANGE.min}
                max={OPACITY_RANGE.max}
                step={0.02}
                value={appearance.opacity}
                onChange={(e) => previewAppearance({ opacity: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {isSettings && showTab("keybindings") && (
          <KeybindingsEditor
            globalShortcut={globalShortcut}
            onGlobalShortcutChange={setGlobalShortcut}
          />
        )}

        {isSettings && showTab("general") && (
          <>
            <div className="setting">
              <FieldLabel info="Plays when you tick a task off. Pick one to hear it.">
                Completion sound
              </FieldLabel>
              <div className="segmented" role="radiogroup" aria-label="completion sound">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tone === t}
                    className={`segmented-btn${tone === t ? " segmented-btn--active" : ""}`}
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

            <div className="setting setting--row">
              <FieldLabel info="Keeps todoish above other windows, including a full-screen browser, so you can take notes during a meeting. Applies when you save.">
                Stay on top
              </FieldLabel>
              <button
                type="button"
                role="switch"
                aria-checked={alwaysOnTop}
                aria-label="stay on top"
                className={`switch${alwaysOnTop ? " switch--on" : ""}`}
                onClick={() => setAlwaysOnTop((v) => !v)}
              >
                <span className="switch-knob" />
              </button>
            </div>

            <div className="setting setting--row">
              <FieldLabel info="Starts todoish when you log in to your Mac. This one applies right away.">
                Open at login
              </FieldLabel>
              <button
                type="button"
                role="switch"
                aria-checked={autostart}
                aria-label="open at login"
                className={`switch${autostart ? " switch--on" : ""}`}
                onClick={toggleAutostart}
              >
                <span className="switch-knob" />
              </button>
            </div>

            <div className="setting setting--row">
              <FieldLabel info="Where the window appears each time todoish starts.">
                Opens at
              </FieldLabel>
              <select
                className="select"
                aria-label="window position when todoish starts"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {isSettings && showTab("history") && (
          <HistoryPanel items={items} loading={historyLoading} />
        )}

        {error && <div className="callout callout--error" role="alert">{error}</div>}
      </div>

      {/* History is a read-only log — nothing on that tab to save. */}
      {!(isSettings && tab === "history") && (
        <div className="setup-footer">
          {saved && <span className="setup-saved" role="status">Saved</span>}
          {isSettings && (
            <button type="button" className="btn btn--secondary" title="[esc]" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? "Saving…" : isSettings ? "Save" : "Connect"}
          </button>
        </div>
      )}
    </form>
  );

  return (
    <div className={`setup${isSettings ? " setup--settings" : ""}`}>
      <div className="setup-titlebar" data-tauri-drag-region>
        <WindowControls />
        <span className="setup-title" data-tauri-drag-region>{isSettings ? "Settings" : ""}</span>
        <div />

      </div>

      {isSettings ? (
        <div className="setup-body">
          <nav className="settings-nav" role="tablist" aria-orientation="vertical">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`settings-nav-btn${tab === id ? " settings-nav-btn--active" : ""}`}
                onClick={() => setTab(id)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          {form}
        </div>
      ) : (
        <div className="welcome">
          <div className="welcome-mark" aria-hidden="true">
            <span className="welcome-ring welcome-ring--now" />
            <span className="welcome-ring welcome-ring--next" />
            <span className="welcome-ring welcome-ring--later" />
          </div>
          <h1 className="welcome-title">Connect Notion</h1>
          <p className="welcome-text">
            todoish shows tasks from the Notion databases you share with it, sorted by
            when you need to act. Paste your connection token to start.
          </p>
          {form}
        </div>
      )}
    </div>
  );
}
