import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { playComplete } from "../lib/sounds";

interface SetupProps {
  onComplete: () => void;
  onCancel?: () => void;
  initialApiKey?: string;
  initialDatabaseId?: string;
  initialTone?: string;
  initialPosition?: string;
  initialWindowMode?: string;
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

export function Setup({
  onComplete,
  onCancel,
  initialApiKey = "",
  initialDatabaseId = "",
  initialTone = "bell",
  initialPosition = "",
  initialWindowMode = "float",
}: SetupProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [databaseId, setDatabaseId] = useState(initialDatabaseId);
  const [tone, setTone] = useState(initialTone);
  const [position, setPosition] = useState(initialPosition);
  const [windowMode, setWindowMode] = useState(initialWindowMode);
  const [autostart, setAutostart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const isSettings = !!onCancel;

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
        windowMode,
      });
      const win = getCurrentWindow();
      await win.setAlwaysOnTop(windowMode === "float");
      if (windowMode !== "float") await win.setAlwaysOnTop(false);
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

  const toggleAutostart = async () => {
    const next = !autostart;
    setAutostart(next);
    await (next ? enable() : disable()).catch(() => setAutostart(!next));
  };

  return (
    <div className="setup">
      <div className="setup-header">
        <div className="setup-header-row">
          <span className="brand">todoish</span>
          {isSettings && (
            <button className="setup-back" onClick={onCancel}>
              [esc] back
            </button>
          )}
        </div>
        <span className="setup-subtitle">
          {isSettings ? "settings" : "connect to notion"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="setup-form">
        <div className="field">
          <label className="field-label">notion api key</label>
          <input
            className="field-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="secret_..."
            autoFocus
            required
          />
          <div className="field-hint">
            notion.so → settings → connections → develop or manage integrations
          </div>
        </div>

        <div className="field">
          <label className="field-label">database id</label>
          <input
            className="field-input"
            type="text"
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
            placeholder="32-char hex id from your notion database url"
            required
          />
          <div className="field-hint">
            open your tasks database → copy link → extract the id before the ?
          </div>
        </div>

        {isSettings && (
          <>
            <div className="settings-divider">preferences</div>

            <div className="field">
              <label className="field-label">window mode</label>
              <div className="tone-options">
                {(["float", "tile"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`tone-btn${windowMode === m ? " tone-btn--active" : ""}`}
                    onClick={() => setWindowMode(m)}
                  >
                    {m === "float" ? "float — always on top" : "tile — normal window"}
                  </button>
                ))}
              </div>
              <div className="field-hint">
                float keeps the window above all others · tile lets it behave like a normal window
              </div>
            </div>

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

        {error && <div className="setup-error">{error}</div>}
        {saved && <div className="setup-saved">saved</div>}

        <button className="setup-submit" type="submit" disabled={loading}>
          {loading ? "saving..." : isSettings ? "[enter] save" : "[enter] connect"}
        </button>
      </form>

      {!isSettings && (
        <div className="setup-notion-schema">
          <div className="schema-header">notion database properties needed</div>
          <div className="schema-row">
            <span className="schema-name">Name</span>
            <span className="schema-type">title</span>
          </div>
          <div className="schema-row">
            <span className="schema-name">Status</span>
            <span className="schema-type">
              select → Todo · In Progress · Done · Snoozed
            </span>
          </div>
          <div className="schema-row">
            <span className="schema-name">Due</span>
            <span className="schema-type">date (with time)</span>
          </div>
          <div className="schema-row">
            <span className="schema-name">Priority</span>
            <span className="schema-type">select → High · Medium · Low</span>
          </div>
          <div className="schema-row">
            <span className="schema-name">Energy</span>
            <span className="schema-type">select → High · Low · Quick</span>
          </div>
          <div className="schema-row">
            <span className="schema-name">Snooze Until</span>
            <span className="schema-type">date (with time)</span>
          </div>
        </div>
      )}
    </div>
  );
}
