import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Item } from "../types";
import { ItemFields } from "../hooks/useItems";
import { useKeyboard } from "../hooks/useKeyboard";
import { useKeybindings } from "../hooks/useKeybindings";
import { groupTasks, flattenGroups, TASK_GROUP_ORDER } from "../lib/groupTasks";
import { TaskGroup } from "../components/TaskGroup";
import { ItemEdit } from "../components/ItemEdit";
import { WindowControls } from "../components/WindowControls";
import { ViewSwitch } from "../components/ViewSwitch";
import { SettingsTab } from "./Setup";

interface MainProps {
  items: Item[];
  loading: boolean;
  error: string | null;
  onCycle: (itemId: string) => void;
  onAdd: (fields: ItemFields) => Promise<void>;
  onUpdate: (itemId: string, fields: ItemFields) => Promise<void>;
  onDelete: (itemId: string) => void;
  onRefresh: () => void;
  onSettings: (tab?: SettingsTab) => void;
  onCalendar: () => void;
  onHistory: () => void;
}

interface PendingDelete {
  item: Item;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function Main({
  items, loading, error,
  onCycle, onAdd, onUpdate, onDelete, onRefresh,
  onSettings, onCalendar, onHistory,
}: MainProps) {
  const { bindings } = useKeybindings();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAllDone, setShowAllDone] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);

  useEffect(() => { pendingDeleteRef.current = pendingDelete; }, [pendingDelete]);

  const commitDelete = useCallback((item: Item) => {
    onDelete(item.id);
    setPendingDelete(null);
  }, [onDelete]);

  const startPendingDelete = useCallback((item: Item) => {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timeoutId);
      commitDelete(pendingDeleteRef.current.item);
    }
    const timeoutId = setTimeout(() => commitDelete(item), 5 * 60 * 1000);
    setPendingDelete({ item, timeoutId });
  }, [commitDelete]);

  const undoDelete = useCallback(() => {
    const pd = pendingDeleteRef.current;
    if (!pd) return;
    clearTimeout(pd.timeoutId);
    setPendingDelete(null);
  }, []);

  const visibleItems = useMemo(
    () => pendingDelete ? items.filter((i) => i.id !== pendingDelete.item.id) : items,
    [items, pendingDelete]
  );

  const groups = useMemo(() => groupTasks(visibleItems, showAllDone), [visibleItems, showAllDone]);
  const flat = useMemo(() => flattenGroups(groups), [groups]);

  const safeIndex = Math.min(selectedIndex, Math.max(0, flat.length - 1));
  const selected = flat[safeIndex] ?? null;

  // Clicking a row selects it and toggles its description, as in the calendar.
  const selectRow = useCallback((item: Item) => {
    setSelectedIndex(flat.indexOf(item));
    setExpandedId((id) => (id === item.id ? null : item.id));
  }, [flat]);

  const closeEditor = useCallback(() => {
    setAdding(false);
    setEditing(null);
  }, []);

  const handleSubmit = useCallback(async (fields: ItemFields) => {
    if (editing) {
      const id = editing.id;
      setEditing(null);
      await onUpdate(id, fields);
      return;
    }
    setAdding(false);
    await onAdd(fields);
  }, [editing, onAdd, onUpdate]);

  const editorOpen = adding || !!editing;

  const handleKey = useCallback(
    (key: string, e: KeyboardEvent) => {
      if (editorOpen) return;
      if (e.metaKey && key === "r") { e.preventDefault(); onRefresh(); return; }

      if (confirmDelete) {
        if (key === "Enter") { startPendingDelete(confirmDelete); setConfirmDelete(null); }
        else if (key === "Escape") setConfirmDelete(null);
        return;
      }

      if (key === bindings["move-down"] || key === "j")
        setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
      else if (key === bindings["move-up"] || key === "k")
        setSelectedIndex((i) => Math.max(i - 1, 0));
      else if (key === bindings["cycle-status"] && selected) { e.preventDefault(); onCycle(selected.id); }
      else if (key === bindings["refresh"]) onRefresh();
      else if (key === bindings["add"])     { e.preventDefault(); setAdding(true); }
      else if (key === bindings["edit"] && selected) { e.preventDefault(); setEditing(selected); }
      else if (key === bindings["help"])    onSettings("keybindings");
      else if (key === bindings["delete"] && selected) setConfirmDelete(selected);
      else if (key === bindings["toggle-done"]) setShowAllDone((v) => !v);
      else if (key === bindings["undo"])    undoDelete();
      else if (key === bindings["expand"] && selected)
        setExpandedId((id) => (id === selected.id ? null : selected.id));
      else if (key === bindings["calendar"]) onCalendar();
      else if (key === bindings["history"]) onHistory();
      else if (key === bindings["today"]) {
        // "Today" in a list is the top of NOW — what is due now or overdue.
        setSelectedIndex(0);
        setExpandedId(null);
      }
      else if (key === bindings["settings"]) onSettings();
    },
    [editorOpen, confirmDelete, selected, flat, bindings,
     onCycle, startPendingDelete, undoDelete, onSettings, onCalendar, onHistory,
     onRefresh, showAllDone]
  );

  useKeyboard(handleKey);

  const activeItems = TASK_GROUP_ORDER
    .filter((g) => g !== "DONE")
    .reduce((n, g) => n + groups[g].length, 0);

  return (
    <div className="main" tabIndex={-1}>
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left">
          <WindowControls />
        </div>
        <div className="topbar-center">
          <ViewSwitch
            active="tasks"
            toggleKey={bindings["calendar"]}
            onSelect={(v) => { if (v === "calendar") onCalendar(); }}
          />
        </div>
        <div className="topbar-right">
          {loading && <span className="syncing topbar-icon">⟳</span>}
          <button
            className="topbar-icon-btn"
            title={`new item [${bindings["add"]}]`}
            onClick={() => setAdding(true)}
          >+</button>
          <button
            className="topbar-icon-btn"
            title={`history [${bindings["history"]}]`}
            onClick={onHistory}
          >◴</button>
          <button className="topbar-icon-btn" title="settings" onClick={() => onSettings()}>⚙</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!loading && activeItems === 0 && groups.DONE.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon">✓</div>
          <div>all clear</div>
          <div className="empty-hint">[{bindings["add"]}] new · [{bindings["refresh"]}] refresh</div>
        </div>
      )}

      <div className="task-list">
        {TASK_GROUP_ORDER.map((group) => (
          <TaskGroup
            key={group}
            group={group}
            label={group === "DONE" && showAllDone ? "DONE · all" : group}
            items={groups[group]}
            selectedId={selected?.id ?? null}
            expandedId={expandedId}
            onSelect={selectRow}
            onCycle={(t) => onCycle(t.id)}
          />
        ))}
      </div>

      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-delete" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">delete?</div>
            <div className="confirm-task">"{confirmDelete.name}"</div>
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

      {editorOpen && (
        <div className="overlay" onClick={closeEditor}>
          <ItemEdit
            item={editing ?? undefined}
            onSubmit={handleSubmit}
            onClose={closeEditor}
          />
        </div>
      )}

    </div>
  );
}
