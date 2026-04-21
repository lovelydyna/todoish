import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Setup } from "./views/Setup";
import { Main } from "./views/Main";
import { Focus } from "./views/Focus";
import { Task, Config } from "./types";

type View = "loading" | "setup" | "main" | "focus" | "settings";

export default function App() {
  const [view, setView] = useState<View>("loading");
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Config | null>(null);

  useEffect(() => {
    invoke<Config | null>("get_config")
      .then((config) => {
        setCurrentConfig(config);
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

    return () => { window.removeEventListener("keydown", onKeyDown); };
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
          initialAlwaysOnTop={currentConfig?.always_on_top ?? false}
        />
      );
    }
    if (view === "focus" && focusTask) {
      return (
        <Focus
          task={focusTask}
          onDone={() => setView("main")}
          onExit={() => setView("main")}
          onUpdate={(fields) => setFocusTask((t) => t ? { ...t, ...fields } : t)}
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
    if (!target.closest("button, input, a, select, textarea, .task-row, .task-check, .snooze-option, .snooze-cancel, .quickadd-terminal")) {
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
