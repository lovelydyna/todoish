import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Setup } from "./views/Setup";
import { Main } from "./views/Main";
import { Focus } from "./views/Focus";
import { Reminder } from "./components/Reminder";
import { Task, Config } from "./types";

type View = "loading" | "setup" | "main" | "focus" | "settings";

export default function App() {
  const [view, setView] = useState<View>("loading");
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Config | null>(null);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);

  useEffect(() => {
    invoke<Config | null>("get_config")
      .then((config) => {
        setCurrentConfig(config);
        setView(config ? "main" : "setup");
      })
      .catch(() => setView("setup"));

    const unlisten = listen<Task>("task-reminder", (event) => {
      setReminderTask(event.payload);
    });

    return () => { unlisten.then((f) => f()); };
  }, []);

  const openSettings = () => {
    invoke<Config | null>("get_config").then((config) => {
      setCurrentConfig(config);
      setView("settings");
    });
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
      return <Setup onComplete={() => setView("main")} />;
    }
    if (view === "settings") {
      return (
        <Setup
          onComplete={() => setView("main")}
          onCancel={() => setView("main")}
          initialApiKey={currentConfig?.notion_api_key ?? ""}
          initialDatabaseId={currentConfig?.database_id ?? ""}
          initialTone={currentConfig?.completion_tone ?? "bell"}
          initialPosition={currentConfig?.startup_position ?? ""}
          initialWindowMode={currentConfig?.window_mode ?? "float"}
        />
      );
    }
    if (view === "focus" && focusTask) {
      return (
        <Focus
          task={focusTask}
          onDone={() => setView("main")}
          onExit={() => setView("main")}
        />
      );
    }
    return (
      <Main
        onFocus={(task) => {
          setFocusTask(task);
          setView("focus");
        }}
        onSettings={openSettings}
      />
    );
  };

  const handleDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("button, input, a, select, textarea, .task-row, .task-check, .snooze-option, .snooze-cancel, .quickadd-terminal, .reminder")) {
      e.preventDefault();
      getCurrentWindow().startDragging();
    }
  };

  return (
    <div style={{ height: "100%" }} onMouseDown={handleDrag}>
      <div className="blur-layer" />
      {renderView()}
      {reminderTask && (
        <Reminder
          task={reminderTask}
          onDismiss={() => setReminderTask(null)}
        />
      )}
    </div>
  );
}
