import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Setup, SettingsTab } from "./views/Setup";
import { Main } from "./views/Main";
import { History } from "./views/History";
import { Calendar } from "./views/Calendar";
import { Config } from "./types";
import { useItems } from "./hooks/useItems";
import { applyAppearance, watchSystemScheme } from "./lib/theme";
import { initAudio } from "./lib/sounds";

type View = "loading" | "setup" | "main" | "settings" | "calendar" | "history";

/** Pulls the appearance fields out of a stored config. */
function appearanceOf(config: Config | null) {
  return {
    theme: config?.theme,
    opacity: config?.window_opacity,
    mode: config?.color_mode as "dark" | "light" | "auto" | undefined,
  };
}

export default function App() {
  const [view, setView] = useState<View>("loading");
  const [currentConfig, setCurrentConfig] = useState<Config | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  // Which way the next view should slide in. Tasks sits left of calendar.
  const [slide, setSlide] = useState<"left" | "right" | null>(null);

  // One database, one fetch — both the list and the calendar render this.
  const {
    items, loading, error,
    cycleStatus, addItem, updateItem, deleteItem, refresh,
  } = useItems();

  useEffect(() => {
    invoke<Config | null>("get_config")
      .then((config) => {
        setCurrentConfig(config);
        applyAppearance(appearanceOf(config));
        setView(config ? "main" : "setup");
      })
      .catch(() => setView("setup"));

    const win = getCurrentWindow();

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "w" || e.key === "h") { e.preventDefault(); win.hide(); }
      if (e.key === "q") { e.preventDefault(); invoke("quit_app"); }
    };
    window.addEventListener("keydown", onKeyDown);
    // Hiding to the tray suspends the audio context; this wakes it on return.
    const stopAudioWatch = initAudio();

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      stopAudioWatch();
    };
  }, []);

  // In auto mode the OS can change scheme under us — repaint when it does.
  useEffect(() => {
    if (currentConfig?.color_mode !== "auto") return;
    return watchSystemScheme(() => applyAppearance(appearanceOf(currentConfig)));
  }, [currentConfig]);

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    invoke<Config | null>("get_config").then((config) => {
      setCurrentConfig(config);
      setView("settings");
    });
  };

  // Re-read config on save so the calendar appears without a restart.
  const closeSettings = () => {
    invoke<Config | null>("get_config")
      .then((config) => {
        setCurrentConfig(config);
        applyAppearance(appearanceOf(config));
      })
      .catch(() => {})
      .finally(() => setView("main"));
  };

  // Settings previews appearance live, so cancelling has to put it back.
  const cancelSettings = () => {
    applyAppearance(appearanceOf(currentConfig));
    setView("main");
  };

  /** Switches view and remembers the direction, so the entry animation matches. */
  const goTo = (next: View, direction: "left" | "right" | null = null) => {
    setSlide(direction);
    setView(next);
  };

  const renderView = () => {
    if (view === "loading") {
      return (
        <div className="splash">
          <span className="brand">todoish</span>
        </div>
      );
    }
    if (view === "setup") {
      return <Setup onComplete={closeSettings} />;
    }
    if (view === "settings") {
      return (
        <Setup
          onComplete={closeSettings}
          onCancel={cancelSettings}
          initialApiKey={currentConfig?.notion_api_key ?? ""}
          initialDatabaseId={currentConfig?.database_id ?? ""}
          initialTone={currentConfig?.completion_tone ?? "bell"}
          initialPosition={currentConfig?.startup_position ?? ""}
          initialAlwaysOnTop={currentConfig?.always_on_top ?? false}
          initialGlobalShortcut={currentConfig?.global_shortcut ?? "CmdOrControl+Shift+T"}
          initialAppearance={appearanceOf(currentConfig)}
          initialTab={settingsTab}
        />
      );
    }
    if (view === "calendar") {
      return (
        <Calendar
          items={items}
          loading={loading}
          error={error}
          onCycle={cycleStatus}
          onAdd={addItem}
          onUpdate={updateItem}
          onDelete={deleteItem}
          onRefresh={refresh}
          onExit={() => goTo("main", "right")}
          onSettings={openSettings}
        />
      );
    }
    if (view === "history") {
      return (
        <History
          items={items}
          loading={loading}
          error={error}
          onRefresh={refresh}
          onExit={() => goTo("main")}
          onSettings={openSettings}
        />
      );
    }
    return (
      <Main
        items={items}
        loading={loading}
        error={error}
        onCycle={cycleStatus}
        onAdd={addItem}
        onUpdate={updateItem}
        onDelete={deleteItem}
        onRefresh={refresh}
        onSettings={openSettings}
        onCalendar={() => goTo("calendar", "left")}
        onHistory={() => goTo("history")}
      />
    );
  };

  const handleDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("button, input, a, select, textarea, .task-row, .task-check, .event-row, .quickadd")) {
      e.preventDefault();
      getCurrentWindow().startDragging();
    }
  };

  return (
    <div style={{ height: "100%" }} onMouseDown={handleDrag}>
      <div className="blur-layer" />
      {/* Keyed on the view so React remounts it and the CSS animation replays. */}
      <div key={view} className={`view-slide${slide ? ` view-slide--${slide}` : ""}`}>
        {renderView()}
      </div>
    </div>
  );
}
