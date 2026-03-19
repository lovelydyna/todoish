import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task } from "../types";
import { timeHint } from "../lib/timeHint";
import { useKeyboard } from "../hooks/useKeyboard";
import { playComplete } from "../lib/sounds";
import { FocusEdit } from "../components/FocusEdit";

interface FocusProps {
  task: Task;
  onDone: () => void;
  onExit: () => void;
  onUpdate?: (updated: Partial<Task>) => void;
}

export function Focus({ task: initialTask, onDone, onExit, onUpdate }: FocusProps) {
  const [task, setTask] = useState(initialTask);
  const [editing, setEditing] = useState(false);
  const hint = timeHint(task.due, task.energy);

  const handleKey = useCallback(
    (key: string, _e: KeyboardEvent) => {
      if (editing) return;
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
        case "e":
          setEditing(true);
          break;
        case "Escape":
          onExit();
          break;
      }
    },
    [task.id, onDone, onExit, editing]
  );

  useKeyboard(handleKey);

  const handleSave = async (fields: {
    title: string;
    due: string | null;
    priority: string | null;
    energy: string | null;
  }) => {
    await invoke("update_task_cmd", {
      taskId: task.id,
      title: fields.title,
      due: fields.due ?? undefined,
      priority: fields.priority ?? undefined,
      energy: fields.energy ?? undefined,
    });
    const updated = { ...task, ...fields };
    setTask(updated);
    onUpdate?.(fields);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="focus">
        <div className="focus-label">▶ focus · edit</div>
        <FocusEdit task={task} onSave={handleSave} onCancel={() => setEditing(false)} />
      </div>
    );
  }

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
        <span className="focus-key">[e]</span> edit
        <span className="focus-sep">·</span>
        <span className="focus-key">[esc]</span> back
      </div>
    </div>
  );
}
