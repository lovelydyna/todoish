import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task } from "../types";
import { timeHint } from "../lib/timeHint";
import { useKeyboard } from "../hooks/useKeyboard";
import { playComplete } from "../lib/sounds";

interface FocusProps {
  task: Task;
  onDone: () => void;
  onExit: () => void;
}

export function Focus({ task, onDone, onExit }: FocusProps) {
  const hint = timeHint(task.due, task.energy);

  const handleKey = useCallback(
    (key: string, _e: KeyboardEvent) => {
      switch (key) {
        case " ":
          playComplete();
          invoke("complete_task", { taskId: task.id }).then(onDone);
          break;
        case "s":
          invoke("snooze_task", {
            taskId: task.id,
            snoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          }).then(onDone);
          break;
        case "Escape":
          onExit();
          break;
      }
    },
    [task.id, onDone, onExit]
  );

  useKeyboard(handleKey);

  return (
    <div className="focus">
      <div className="focus-label">▶ focus</div>

      <div className="focus-task">
        <div className="focus-checkbox">[ ]</div>
        <div className="focus-title">{task.title}</div>
        {hint && <div className="focus-hint">· {hint}</div>}
        <div className="focus-meta-row">
          {task.priority && (
            <span className="focus-meta">{task.priority.toLowerCase()}</span>
          )}
          {task.energy && (
            <span className="focus-meta">{task.energy.toLowerCase()} energy</span>
          )}
        </div>
      </div>

      <div className="focus-keys">
        <span className="focus-key">[space]</span> done
        <span className="focus-sep">·</span>
        <span className="focus-key">[s]</span> snooze 1h
        <span className="focus-sep">·</span>
        <span className="focus-key">[esc]</span> back
      </div>
    </div>
  );
}
