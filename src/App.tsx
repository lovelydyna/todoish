import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Setup, SettingsTab } from "./views/Setup";
import { Main } from "./views/Main";
import { Calendar } from "./views/Calendar";
import { Notes } from "./views/Notes";
import { Config } from "./types";
import { useItems } from "./hooks/useItems";
import { applyAppearance, watchSystemScheme } from "./lib/theme";
import { initAudio } from "./lib/sounds";

type View = "loading" | "setup" | "main" | "settings" | "calendar" | "notes";

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
  // Whether the notes view, once it mounts, should start a fresh note
  // rather than reopening whichever one was last open.
  const [notesStartNew, setNotesStartNew] = useState(false);

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

  const goTo = (next: View) => setView(next);

  const openNotes = (startNew = false) => {
    setNotesStartNew(startNew);
    setView("notes");
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
          initialEnabledDataSources={currentConfig?.enabled_data_sources ?? []}
          initialSchemaOverrides={currentConfig?.schema_overrides ?? {}}
          initialTone={currentConfig?.completion_tone ?? "bell"}
          initialPosition={currentConfig?.startup_position ?? ""}
          initialGlobalShortcut={currentConfig?.global_shortcut ?? "CmdOrControl+Shift+T"}
          initialAppearance={appearanceOf(currentConfig)}
          initialTab={settingsTab}
          items={items}
          historyLoading={loading}
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
          onExit={() => goTo("main")}
          onSettings={openSettings}
          onNotes={openNotes}
        />
      );
    }
    if (view === "notes") {
      return <Notes startNew={notesStartNew} onTasks={() => goTo("main")}
        onCalendar={() => goTo("calendar")} onSettings={openSettings} />;
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
        onCalendar={() => goTo("calendar")}
        onNotes={openNotes}
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
      {renderView()}
    </div>
  );
}
