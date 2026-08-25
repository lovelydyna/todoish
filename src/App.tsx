import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Setup, SettingsTab } from "./views/Setup";
import { Main } from "./views/Main";
import { Calendar } from "./views/Calendar";
import { Notes } from "./views/Notes";
import { Config, CalendarAccount } from "./types";
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
  // Every linked Google account. Whether the add form offers a destination —
  // and which ones it lists — comes straight from this; with none linked
  // there is no choice to make.
  const [calendarAccounts, setCalendarAccounts] = useState<CalendarAccount[]>([]);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  // Whether the notes view, once it mounts, should start a fresh note
  // rather than reopening whichever one was last open.
  const [notesStartNew, setNotesStartNew] = useState(false);

  // One database, one fetch — both the list and the calendar render this.
  const {
    items, loading, error, calendarWarning,
    cycleStatus, addItem, updateItem, deleteItem, refresh,
  } = useItems();

  const readCalendarAccounts = () =>
    invoke<CalendarAccount[]>("calendar_accounts")
      .then(setCalendarAccounts)
      .catch(() => setCalendarAccounts([]));

  useEffect(() => {
    invoke<Config | null>("get_config")
      .then((config) => {
        setCurrentConfig(config);
        applyAppearance(appearanceOf(config));
        setView(config ? "main" : "setup");
      })
      .catch(() => setView("setup"));

    readCalendarAccounts();

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
    readCalendarAccounts();
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
    // The calendar tab saves as you go, so its state can have changed even
    // when the rest of the form is being discarded.
    readCalendarAccounts();
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
          onCalendarChanged={refresh}
          initialApiKey={currentConfig?.notion_api_key ?? ""}
          initialDatabaseId={currentConfig?.database_id ?? ""}
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
          calendarWarning={calendarWarning}
          calendarAccounts={calendarAccounts}
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
      return <Notes startNew={notesStartNew} onTasks={() => goTo("main")} onSettings={openSettings} />;
    }
    return (
      <Main
        items={items}
        loading={loading}
        error={error}
        calendarWarning={calendarWarning}
        calendarAccounts={calendarAccounts}
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
