import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Task, Config } from "../types";
import { playComplete } from "../lib/sounds";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tone, setToneState] = useState("bell");
  const toneRef = useRef("bell");

  useEffect(() => {
    invoke<Config>("get_config").then((c) => {
      if (c?.completion_tone) {
        setToneState(c.completion_tone);
        toneRef.current = c.completion_tone;
      }
    }).catch(() => {});
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Task[]>("trigger_sync");
      setTasks(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();

    const unlistenTasks = listen<Task[]>("tasks-updated", (event) => {
      setTasks(event.payload);
    });

    const unlistenError = listen<string>("sync-error", (event) => {
      setError(event.payload);
    });

    return () => {
      unlistenTasks.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [loadTasks]);

  // Keep tasksRef current so cycleStatus always sees latest tasks
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { toneRef.current = tone; }, [tone]);

  // Cycles Todo → In Progress → Done → Todo, keeping the task visible
  const cycleStatus = useCallback(async (taskId: string) => {
    const current = tasksRef.current.find((t) => t.id === taskId)?.status;
    if (current === "In Progress") playComplete(toneRef.current);

    // Optimistic update before Notion responds
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const next =
          t.status === "Todo"
            ? "In Progress"
            : t.status === "In Progress"
            ? "Done"
            : "Todo";
        return {
          ...t,
          status: next,
          last_edited_time: next === "Done" ? new Date().toISOString() : t.last_edited_time,
        };
      })
    );
    try {
      await invoke("cycle_status", { taskId });
    } catch (e) {
      setError(String(e));
      // Revert on failure
      await loadTasks();
    }
  }, [loadTasks]);

  const snoozeTask = useCallback(
    async (taskId: string, snoozeUntil: string) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "Snoozed", snooze_until: snoozeUntil } : t
        )
      );
      try {
        await invoke("snooze_task", { taskId, snoozeUntil });
      } catch (e) {
        setError(String(e));
        await loadTasks();
      }
    },
    [loadTasks]
  );

  const addTask = useCallback(async (
    title: string,
    due: string | null,
    priority: string | null,
    energy: string | null,
  ) => {
    try {
      const task = await invoke<Task>("create_task", { title, due, priority, energy });
      setTasks((prev) => [task, ...prev]);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await invoke("delete_task", { taskId });
    } catch (e) {
      setError(String(e));
      await loadTasks();
    }
  }, [loadTasks]);

  const refresh = useCallback(async () => {
    await loadTasks();
  }, [loadTasks]);

  return { tasks, loading, error, cycleStatus, snoozeTask, addTask, deleteTask, refresh };

}
