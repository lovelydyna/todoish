import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task } from "../types";
import { playComplete } from "../lib/sounds";

interface ReminderProps {
  task: Task;
  onDismiss: () => void;
}

export function Reminder({ task, onDismiss }: ReminderProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
      if (e.key === " ") { e.preventDefault(); handleComplete(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleComplete = async () => {
    playComplete();
    await invoke("complete_task", { taskId: task.id }).catch(() => {});
    onDismiss();
  };

  const snooze = async (minutes: number) => {
    await invoke("snooze_task", {
      taskId: task.id,
      snoozeUntil: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    }).catch(() => {});
    onDismiss();
  };

  return (
    <div className="reminder-overlay">
      <div className="reminder">
        <div className="reminder-label">▶ reminder</div>
        <div className="reminder-title">{task.title}</div>
        <div className="reminder-subtitle">might be a good time to start this</div>

        {(task.priority || task.energy) && (
          <div className="reminder-meta">
            {task.priority && <span>{task.priority.toLowerCase()}</span>}
            {task.energy && <span>{task.energy.toLowerCase()} energy</span>}
          </div>
        )}

        <div className="reminder-actions">
          <button className="reminder-complete" onClick={handleComplete}>
            [space] mark done
          </button>
          <div className="reminder-snooze-group">
            <span className="reminder-snooze-label">snooze</span>
            <button className="reminder-snooze-btn" onClick={() => snooze(15)}>15 min</button>
            <button className="reminder-snooze-btn" onClick={() => snooze(60)}>1 hour</button>
            <button className="reminder-snooze-btn" onClick={() => {
              const t = new Date();
              t.setDate(t.getDate() + 1);
              t.setHours(9, 0, 0, 0);
              invoke("snooze_task", { taskId: task.id, snoozeUntil: t.toISOString() }).catch(() => {});
              onDismiss();
            }}>tomorrow 9am</button>
          </div>
        </div>

        <button className="reminder-dismiss" onClick={onDismiss}>[esc] dismiss</button>
      </div>
    </div>
  );
}
