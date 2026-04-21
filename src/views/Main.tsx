import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Task } from "../types";
import { useTasks } from "../hooks/useTasks";
import { useKeyboard } from "../hooks/useKeyboard";
import { useKeybindings } from "../hooks/useKeybindings";
import { groupTasks, flattenGroups } from "../lib/groupTasks";
import { ACTION_LABELS, ACTION_SECTIONS, Action, keyLabel, actionForKey, DEFAULTS } from "../lib/keybindings";
import { TaskGroup } from "../components/TaskGroup";
import { QuickAdd } from "../components/QuickAdd";
import { WindowControls } from "../components/WindowControls";

interface MainProps {
  onFocus: (task: Task) => void;
  onSettings: () => void;
}

interface PendingDelete {
  task: Task;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function Main({ onFocus, onSettings }: MainProps) {
  const { tasks, loading, error, cycleStatus, addTask, deleteTask, refresh } = useTasks();
  const { bindings, updateBinding, resetBindings } = useKeybindings();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [capturing, setCapturing] = useState<Action | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
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

  const groups = useMemo(() => groupTasks(visibleTasks, showAllDone), [visibleTasks, showAllDone]);
  const flat = useMemo(() => flattenGroups(groups), [groups]);

  const safeIndex = Math.min(selectedIndex, Math.max(0, flat.length - 1));
  const selected = flat[safeIndex] ?? null;

  const handleQuickAdd = useCallback(async (fields: { title: string; due: string | null; priority: string | null; energy: string | null }) => {
    setAdding(false);
    await addTask(fields.title, fields.due, fields.priority, fields.energy);
  }, [addTask]);

  // Capture mode: intercept next keypress and save as new binding
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturing(null); setCaptureError(null); return; }
      // Block modifier-only keys
      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
      // Block ⌘ combos — those are reserved
      if (e.metaKey) { setCaptureError("⌘ shortcuts are reserved"); return; }
      // Warn on duplicate
      const existing = actionForKey(bindings, e.key);
      if (existing && existing !== capturing) {
        setCaptureError(`already used by "${ACTION_LABELS[existing]}" — reassigning`);
      } else {
        setCaptureError(null);
      }
      updateBinding(capturing, e.key);
      setCapturing(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, bindings, updateBinding]);

  const handleKey = useCallback(
    (key: string, e: KeyboardEvent) => {
      if (adding || capturing) return;
      if (e.metaKey && key === "r") { e.preventDefault(); refresh(); return; }

      if (confirmDelete) {
        if (key === "Enter") { startPendingDelete(confirmDelete); setConfirmDelete(null); }
        else if (key === "Escape") setConfirmDelete(null);
        return;
      }

      if (showHelp) {
        if (key === "Escape") setShowHelp(false);
        return;
      }

      if (key === bindings["move-down"])    setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
      else if (key === "j")                 setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
      else if (key === bindings["move-up"]) setSelectedIndex((i) => Math.max(i - 1, 0));
      else if (key === "k")                 setSelectedIndex((i) => Math.max(i - 1, 0));
      else if (key === bindings["cycle-status"] && selected) cycleStatus(selected.id);
      else if (key === bindings["focus"] && selected && selected.status !== "Done") onFocus(selected);
      else if (key === bindings["refresh"]) refresh();
      else if (key === bindings["add"])     { e.preventDefault(); setAdding(true); }
      else if (key === bindings["help"])    setShowHelp((v) => !v);
      else if (key === bindings["delete"] && selected) setConfirmDelete(selected);
      else if (key === bindings["toggle-done"]) setShowAllDone((v) => !v);
      else if (key === bindings["undo"])    undoDelete();
      else if (key === bindings["settings"]) onSettings();
    },
    [showHelp, adding, capturing, confirmDelete, selected, flat, bindings,
     cycleStatus, startPendingDelete, undoDelete, onFocus, onSettings, refresh, showAllDone]
  );

  useKeyboard(handleKey);

  const activeTasks = groups.NOW.length + groups.NEXT.length + groups.LATER.length;

  return (
    <div className="main" tabIndex={-1}>
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left">
          <WindowControls />
        </div>
        <div className="topbar-center" data-tauri-drag-region>
          <span className="brand" data-tauri-drag-region>todoish</span>
        </div>
        <div className="topbar-right">
          {loading && <span className="syncing topbar-icon">⟳</span>}
          <button className="topbar-icon-btn" title="help" onClick={() => setShowHelp(true)}>?</button>
          <button className="topbar-icon-btn" title="settings" onClick={onSettings}>⚙</button>
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
        <TaskGroup label="NOW"  tasks={groups.NOW}  selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))} onCycle={(t) => cycleStatus(t.id)} />
        <TaskGroup label="NEXT" tasks={groups.NEXT} selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))} onCycle={(t) => cycleStatus(t.id)} />
        <TaskGroup label="LATER" tasks={groups.LATER} selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))} onCycle={(t) => cycleStatus(t.id)} />
        <TaskGroup label={showAllDone ? "DONE · all" : "DONE"} tasks={groups.DONE}
          selectedId={selected?.id ?? null}
          onSelect={(t) => setSelectedIndex(flat.indexOf(t))} onCycle={(t) => cycleStatus(t.id)} />
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
          <QuickAdd onSubmit={handleQuickAdd} onClose={() => setAdding(false)} />
        </div>
      )}

      {showHelp && (
        <div className="overlay" onClick={() => { if (!capturing) setShowHelp(false); }}>
          <div className="help-menu" onClick={(e) => e.stopPropagation()}>
            <div className="help-menu-header">
              <span className="help-title">keybindings</span>
              <button
                className="help-reset"
                title="reset all keybindings to defaults"
                onClick={() => { resetBindings(); setCaptureError(null); }}
              >
                ↺
              </button>
            </div>

            {captureError && <div className="help-capture-error">{captureError}</div>}

            {ACTION_SECTIONS.map((section) => (
              <div key={section.label}>
                <div className="help-section">{section.label}</div>
                {section.actions.map((action) => {
                  const isCapturing = capturing === action;
                  const isDefault = bindings[action] === DEFAULTS[action];
                  return (
                    <div
                      key={action}
                      className={`help-row help-row--bindable${isCapturing ? " help-row--capturing" : ""}`}
                      onClick={() => { setCapturing(action); setCaptureError(null); }}
                      title="click to rebind"
                    >
                      <span className={`help-key${!isDefault ? " help-key--custom" : ""}`}>
                        {isCapturing ? "press a key…" : keyLabel(bindings[action])}
                      </span>
                      {ACTION_LABELS[action]}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="help-section">app (fixed)</div>
            <div className="help-row"><span className="help-key">⌘W / ⌘H</span> hide</div>
            <div className="help-row"><span className="help-key">⌘Q</span> quit</div>
            <div className="help-row"><span className="help-key">⌘R</span> refresh</div>

            <div className="help-dismiss">click a key to rebind · esc to cancel capture</div>
          </div>
        </div>
      )}
    </div>
  );
}
