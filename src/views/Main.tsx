import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Task } from "../types";
import { useTasks } from "../hooks/useTasks";
import { useKeyboard } from "../hooks/useKeyboard";
import { groupTasks, flattenGroups } from "../lib/groupTasks";
import { TaskGroup } from "../components/TaskGroup";
import { SnoozeMenu } from "../components/SnoozeMenu";
import { QuickAdd } from "../components/QuickAdd";

interface MainProps {
  onFocus: (task: Task) => void;
  onSettings: () => void;
}

interface PendingDelete {
  task: Task;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function Main({ onFocus, onSettings }: MainProps) {
  const { tasks, loading, error, cycleStatus, snoozeTask, addTask, deleteTask, refresh } =
    useTasks();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snoozing, setSnoozing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);

  useEffect(() => { pendingDeleteRef.current = pendingDelete; }, [pendingDelete]);

  const commitDelete = useCallback((task: Task) => {
    deleteTask(task.id);
    setPendingDelete(null);
  }, [deleteTask]);

  const startPendingDelete = useCallback((task: Task) => {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timeoutId);
      commitDelete(pendingDeleteRef.current.task);
    }
    const timeoutId = setTimeout(() => commitDelete(task), 5 * 60 * 1000);
    setPendingDelete({ task, timeoutId });
  }, [commitDelete]);

  const undoDelete = useCallback(() => {
    const pd = pendingDeleteRef.current;
    if (!pd) return;
    clearTimeout(pd.timeoutId);
    setPendingDelete(null);
  }, []);

  const visibleTasks = useMemo(
    () => pendingDelete ? tasks.filter((t) => t.id !== pendingDelete.task.id) : tasks,
    [tasks, pendingDelete]
  );

  const groups = useMemo(() => groupTasks(visibleTasks), [visibleTasks]);
  const flat = useMemo(() => flattenGroups(groups), [groups]);

  const safeIndex = Math.min(selectedIndex, Math.max(0, flat.length - 1));
  const selected = flat[safeIndex] ?? null;

  const handleQuickAdd = useCallback(async (fields: { title: string; due: string | null; priority: string | null; energy: string | null }) => {
    setAdding(false);
    await addTask(fields.title, fields.due, fields.priority, fields.energy);
  }, [addTask]);

  const handleKey = useCallback(
    (key: string, e: KeyboardEvent) => {
      if (adding) return;

      if (confirmDelete) {
        if (key === "Enter") {
          startPendingDelete(confirmDelete);
          setConfirmDelete(null);
        } else if (key === "Escape") {
          setConfirmDelete(null);
        }
        return;
      }

      if (showHelp) {
        setShowHelp(false);
        return;
      }

      if (snoozing) {
        if (key === "Escape") {
          setSnoozing(false);
          return;
        }
        const num = parseInt(key);
        if (num >= 1 && num <= 4 && selected) {
          const opts: string[] = [
            new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            (() => {
              const t = new Date();
              t.setDate(t.getDate() + 1);
              t.setHours(9, 0, 0, 0);
              return t.toISOString();
            })(),
          ];
          snoozeTask(selected.id, opts[num - 1]);
          setSnoozing(false);
        }
        return;
      }

      switch (key) {
        case "j":
        case "ArrowDown":
          setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
          break;
        case "k":
        case "ArrowUp":
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case " ":
          if (selected) cycleStatus(selected.id);
          break;
        case "s":
          if (selected && flat.length > 0) setSnoozing(true);
          break;
        case "f":
          if (selected && selected.status !== "Done") onFocus(selected);
          break;
        case "r":
          refresh();
          break;
        case "n":
          e.preventDefault();
          setAdding(true);
          break;
        case "?":
          setShowHelp((v) => !v);
          break;
        case "d":
          if (selected) setConfirmDelete(selected);
          break;
        case "u":
          undoDelete();
          break;
        case ",":
          onSettings();
          break;
      }
    },
    [snoozing, showHelp, adding, confirmDelete, selected, flat, cycleStatus, snoozeTask, startPendingDelete, undoDelete, onFocus, onSettings, refresh]
  );

  useKeyboard(handleKey);

  const activeTasks = groups.NOW.length + groups.NEXT.length + groups.LATER.length + groups.SNOOZED.length;

  return (
    <div
      className="main"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "n" && !adding && !snoozing && !showHelp) {
          setAdding(true);
        }
      }}
    >
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left" data-tauri-drag-region>
          <span className="brand" data-tauri-drag-region>todoish</span>
        </div>
        <div className="topbar-right">
          {loading && <span className="syncing">syncing…</span>}
          <button className="topbar-settings" onClick={() => setShowHelp(true)}>[?] help</button>
          <button className="topbar-settings" onClick={onSettings}>[,] settings</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!loading && activeTasks === 0 && groups.DONE.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon">✓</div>
          <div>all clear</div>
          <div className="empty-hint">[r] refresh</div>
        </div>
      )}

      <div className="task-list">
        <TaskGroup
          label="NOW"
          tasks={groups.NOW}
          selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))}
          onCycle={(t) => cycleStatus(t.id)}
        />
        <TaskGroup
          label="NEXT"
          tasks={groups.NEXT}
          selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))}
          onCycle={(t) => cycleStatus(t.id)}
        />
        <TaskGroup
          label="LATER"
          tasks={groups.LATER}
          selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))}
          onCycle={(t) => cycleStatus(t.id)}
        />
        <TaskGroup
          label="SNOOZED"
          tasks={groups.SNOOZED}
          selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))}
          onCycle={(t) => cycleStatus(t.id)}
        />
        <TaskGroup
          label="DONE"
          tasks={groups.DONE}
          selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))}
          onCycle={(t) => cycleStatus(t.id)}
        />
      </div>

      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-delete" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">delete task?</div>
            <div className="confirm-task">"{confirmDelete.title}"</div>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={() => { startPendingDelete(confirmDelete); setConfirmDelete(null); }}>
                [enter] delete
              </button>
              <button className="confirm-no" onClick={() => setConfirmDelete(null)}>
                [esc] cancel
              </button>
            </div>
          </div>
        </div>
      )}

{adding && (
        <div className="overlay" onClick={() => setAdding(false)}>
          <QuickAdd
            onSubmit={handleQuickAdd}
            onClose={() => setAdding(false)}
          />
        </div>
      )}

      {snoozing && selected && (
        <div className="overlay">
          <SnoozeMenu
            onSnooze={(iso) => {
              snoozeTask(selected.id, iso);
              setSnoozing(false);
            }}
            onClose={() => setSnoozing(false)}
          />
        </div>
      )}

      {showHelp && (
        <div className="overlay" onClick={() => setShowHelp(false)}>
          <div className="help-menu">
            <div className="help-title">keybindings</div>
            <div className="help-row">
              <span className="help-key">n</span> add task
            </div>
            <div className="help-row">
              <span className="help-key">j / ↓</span> move down
            </div>
            <div className="help-row">
              <span className="help-key">k / ↑</span> move up
            </div>
            <div className="help-row">
              <span className="help-key">space</span> cycle status
            </div>
            <div className="help-row">
              <span className="help-key">s</span> snooze
            </div>
            <div className="help-row">
              <span className="help-key">f</span> focus mode
            </div>
            <div className="help-row">
              <span className="help-key">d</span> delete task
            </div>
            <div className="help-row">
              <span className="help-key">u</span> undo delete
            </div>
            <div className="help-row">
              <span className="help-key">r</span> refresh
            </div>
            <div className="help-row">
              <span className="help-key">,</span> settings
            </div>
            <div className="help-dismiss">press any key to close</div>
          </div>
        </div>
      )}
    </div>
  );
}
