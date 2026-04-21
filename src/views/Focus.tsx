import { useCallback, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task } from "../types";
import { timeHint } from "../lib/timeHint";
import { useKeyboard } from "../hooks/useKeyboard";
import { playComplete } from "../lib/sounds";
import { WindowControls } from "../components/WindowControls";

interface FocusProps {
  task: Task;
  onDone: () => void;
  onExit: () => void;
  onUpdate?: (updated: Partial<Task>) => void;
}

function parseDue(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v) return null;
  if (v === "today" || v === "t") return new Date().toISOString().split("T")[0];
  if (v === "tomorrow" || v === "tmrw" || v === "tm") {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) return val.trim();
  return null;
}

const PRIORITIES = [null, "High", "Medium", "Low"];
const ENERGIES   = [null, "High", "Low", "Quick"];

export function Focus({ task: initialTask, onDone, onExit, onUpdate }: FocusProps) {
  const [task, setTask]           = useState(initialTask);
  const [notes, setNotes]         = useState(initialTask.notes ?? "");
  const [saving, setSaving]       = useState(false);
  const [notesSaved, setNotesSaved] = useState(true);
  const [editTitle, setEditTitle] = useState(false);
  const [editDue, setEditDue]     = useState(false);
  const [showHelp, setShowHelp]   = useState(false);
  const [titleVal, setTitleVal]   = useState(task.title);
  const [dueVal, setDueVal]       = useState(task.due ?? "");

  const titleRef   = useRef<HTMLInputElement>(null);
  const dueRef     = useRef<HTMLInputElement>(null);
  const notesRef   = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (editTitle) titleRef.current?.focus(); }, [editTitle]);
  useEffect(() => { if (editDue)   dueRef.current?.select(); }, [editDue]);

  const saveTask = useCallback(async (patch: Partial<Task>) => {
    const merged = { ...task, ...patch };
    setSaving(true);
    await invoke("update_task_cmd", {
      taskId: merged.id,
      title:    merged.title,
      due:      merged.due      ?? undefined,
      priority: merged.priority ?? undefined,
      energy:   merged.energy   ?? undefined,
      notes:    merged.notes    ?? undefined,
    });
    setTask(merged);
    onUpdate?.(patch);
    setSaving(false);
  }, [task, onUpdate]);

  // ── Title save ──────────────────────────────────────────────
  const commitTitle = () => {
    const v = titleVal.trim();
    if (v && v !== task.title) saveTask({ title: v });
    else setTitleVal(task.title);
    setEditTitle(false);
  };

  // ── Due save ────────────────────────────────────────────────
  const commitDue = () => {
    const parsed = parseDue(dueVal);
    if (parsed !== task.due) saveTask({ due: parsed });
    setDueVal(parsed ?? "");
    setEditDue(false);
  };

  // ── Priority cycle ──────────────────────────────────────────
  const cyclePriority = () => {
    const idx  = PRIORITIES.indexOf(task.priority);
    const next = PRIORITIES[(idx + 1) % PRIORITIES.length];
    saveTask({ priority: next });
  };

  // ── Energy cycle ────────────────────────────────────────────
  const cycleEnergy = () => {
    const idx  = ENERGIES.indexOf(task.energy);
    const next = ENERGIES[(idx + 1) % ENERGIES.length];
    saveTask({ energy: next });
  };

  // ── Notes debounced save ────────────────────────────────────
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    setNotesSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTask({ notes: val || null });
      setNotesSaved(true);
    }, 1200);
  };

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────
  const isEditingAny = editTitle || editDue;
  const handleKey = useCallback((key: string, e: KeyboardEvent) => {
    switch (key) {
      case " ":
        if (document.activeElement === notesRef.current) return;
        if (isEditingAny) return;
        e.preventDefault();
        playComplete();
        invoke("complete_task", { taskId: task.id }).then(onDone);
        break;
      case "Escape":
        if (document.activeElement === notesRef.current) {
          notesRef.current?.blur();
        } else if (showHelp) {
          setShowHelp(false);
        } else {
          onExit();
        }
        break;
      case "?":
      case "h":
        if (document.activeElement === notesRef.current) return;
        if (isEditingAny) return;
        setShowHelp(!showHelp);
        break;
    }
  }, [task.id, onDone, onExit, isEditingAny, showHelp]);

  useKeyboard(handleKey);

  const hint = timeHint(task.due, task.energy);

  return (
    <div className="focus">
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left"><WindowControls /></div>
        <div className="topbar-center" data-tauri-drag-region>
          <span className="brand" data-tauri-drag-region>focus</span>
        </div>
        <div className="topbar-right focus-topbar-keys">
          <button className="topbar-icon-btn" title="done [space]"
            onClick={() => { playComplete(); invoke("complete_task", { taskId: task.id }).then(onDone); }}>✓</button>
          <button className="topbar-icon-btn" title="back [esc]" onClick={onExit}>✕</button>
        </div>
      </div>
      {!notesSaved && <div className="focus-saving-bar"></div>}

      <div className="focus-body" onContextMenu={(e) => { e.preventDefault(); invoke("open_in_notion", { taskId: task.id }); }}>
        {/* Title */}
        {editTitle ? (
          <input
            ref={titleRef}
            className="focus-title-input"
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter")  { e.preventDefault(); commitTitle(); }
              if (e.key === "Escape") { setTitleVal(task.title); setEditTitle(false); }
            }}
            spellCheck={false}
          />
        ) : (
          <div
            className="focus-title focus-title--editable"
            onClick={() => { setTitleVal(task.title); setEditTitle(true); }}
            title="click to edit"
          >
            {task.title}
          </div>
        )}

        {hint && <div className="focus-hint">{hint}</div>}

        {/* Properties */}
        <div className="focus-props">

          {/* Due */}
          <div className="focus-prop-row">
            <span className="focus-prop-label">Due</span>
            {editDue ? (
              <input
                ref={dueRef}
                className="focus-prop-input"
                value={dueVal}
                onChange={(e) => setDueVal(e.target.value)}
                onBlur={commitDue}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  { e.preventDefault(); commitDue(); }
                  if (e.key === "Escape") { setDueVal(task.due ?? ""); setEditDue(false); }
                }}
                placeholder="today · tmrw · YYYY-MM-DD"
                spellCheck={false}
              />
            ) : (
              <span
                className={`focus-prop-value focus-prop-value--editable${!task.due ? " focus-prop-value--empty" : ""}`}
                onClick={() => { setDueVal(task.due ?? ""); setEditDue(true); }}
                title="click to edit"
              >
                {task.due ?? "—"}
              </span>
            )}
          </div>

          {/* Priority */}
          <div className="focus-prop-row">
            <span className="focus-prop-label">Priority</span>
            <span
              className={`focus-prop-value focus-prop-value--editable${!task.priority ? " focus-prop-value--empty" : ""}`}
              onClick={cyclePriority}
              title="click to cycle"
            >
              {task.priority ?? "—"}
            </span>
          </div>

          {/* Energy */}
          <div className="focus-prop-row">
            <span className="focus-prop-label">Energy</span>
            <span
              className={`focus-prop-value focus-prop-value--editable${!task.energy ? " focus-prop-value--empty" : ""}`}
              onClick={cycleEnergy}
              title="click to cycle"
            >
              {task.energy ?? "—"}
            </span>
          </div>

          {/* Notes */}
          <div className="focus-prop-row focus-prop-row--notes">
            <span className="focus-prop-label">Notes</span>
            <textarea
              ref={notesRef}
              className="focus-notes"
              value={notes}
              onChange={handleNotesChange}
              placeholder="add a note…"
              rows={3}
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="overlay" onClick={() => setShowHelp(false)}>
          <div className="help-menu" onClick={(e) => e.stopPropagation()}>
            <div className="help-menu-header">
              <span className="help-title">keybindings (focus mode)</span>
            </div>

            <div>
              <div className="help-section">Task Actions</div>
              <div className="help-row">
                <span className="help-key">Space</span>
                Mark task as complete
              </div>
            </div>

            <div>
              <div className="help-section">Navigation</div>
              <div className="help-row">
                <span className="help-key">Esc</span>
                Exit focus mode or close input
              </div>
              <div className="help-row">
                <span className="help-key">? / h</span>
                Toggle this help
              </div>
            </div>

            <div>
              <div className="help-section">Editing</div>
              <div className="help-row">
                <span className="help-key">Click</span>
                Edit title / due / priority / energy
              </div>
            </div>

            <div>
              <div className="help-section">Other</div>
              <div className="help-row">
                <span className="help-key">⌘W / ⌘H</span>
                Hide
              </div>
              <div className="help-row">
                <span className="help-key">⌘Q</span>
                Quit
              </div>
            </div>

            <div className="help-dismiss">press esc or click outside to close</div>
          </div>
        </div>
      )}
    </div>
  );
}
