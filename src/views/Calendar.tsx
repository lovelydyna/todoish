import { useState, useMemo, useCallback } from "react";
import { CalendarAccount, Item } from "../types";
import { ItemFields } from "../hooks/useItems";
import { useKeyboard } from "../hooks/useKeyboard";
import { useKeybindings } from "../hooks/useKeybindings";
import { groupEvents, upcomingByDay, daySections } from "../lib/groupEvents";
import { addMonths, addWeeks, dayHeading } from "../lib/calendarGrid";
import { EventGroup } from "../components/EventGroup";
import { ItemEdit } from "../components/ItemEdit";
import { WeekStrip } from "../components/WeekStrip";
import { MonthGrid } from "../components/MonthGrid";
import { WindowControls } from "../components/WindowControls";
import { ViewSwitch } from "../components/ViewSwitch";
import { IconTag } from "../components/IconTag";
import { SettingsTab } from "./Setup";

/** How far forward the list runs once you pick a day on a grid. */
const DAYS_FROM_SELECTED = 14;

interface CalendarProps {
  items: Item[];
  loading: boolean;
  error: string | null;
  /** A calendar sync that failed while the tasks loaded fine. */
  calendarWarning: string | null;
  calendarAccounts: CalendarAccount[];
  onCycle: (itemId: string) => void;
  onAdd: (fields: ItemFields) => Promise<void>;
  onUpdate: (itemId: string, fields: ItemFields) => Promise<void>;
  onDelete: (itemId: string) => void;
  onRefresh: () => void;
  onExit: () => void;
  onSettings: (tab?: SettingsTab) => void;
  onNotes: (startNew?: boolean) => void;
}

export function Calendar({
  items, loading, error, calendarWarning, calendarAccounts,
  onCycle, onAdd, onUpdate, onDelete, onRefresh,
  onExit, onSettings, onNotes,
}: CalendarProps) {
  const { bindings } = useKeybindings();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showMonth, setShowMonth] = useState(false);
  const [week, setWeek] = useState(() => new Date());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);

  const groups = useMemo(() => groupEvents(items), [items]);
  const upcomingDays = useMemo(() => upcomingByDay(items), [items]);

  // Picking a day starts the list there and keeps going — the days that follow
  // stay visible underneath rather than the view collapsing to a single day.
  const fromSelected = useMemo(
    () => (selectedDay ? daySections(items, selectedDay, DAYS_FROM_SELECTED) : []),
    [items, selectedDay]
  );

  const sections = selectedDay ? fromSelected : upcomingDays;

  const flat = useMemo(
    () =>
      selectedDay
        ? fromSelected.flatMap((d) => d.items)
        : [
            ...groups.TODAY,
            ...groups.TOMORROW,
            ...upcomingDays.flatMap((d) => d.items),
          ],
    [selectedDay, fromSelected, groups, upcomingDays]
  );

  const safeIndex = Math.min(selectedIndex, Math.max(0, flat.length - 1));
  const selected = flat[safeIndex] ?? null;

  const editingOverlay = adding || !!editing;

  const handleSubmit = useCallback(
    async (fields: ItemFields) => {
      if (editing) {
        const id = editing.id;
        setEditing(null);
        await onUpdate(id, fields);
      } else {
        setAdding(false);
        await onAdd(fields);
      }
    },
    [editing, onAdd, onUpdate]
  );

  const pickDay = useCallback((date: Date | null) => {
    setSelectedDay(date);
    setSelectedIndex(0);
    if (date) {
      setWeek(date);
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, []);

  /** Delta 0 jumps back to the week containing today. */
  const changeWeek = useCallback((delta: number) => {
    setWeek((w) => (delta === 0 ? new Date() : addWeeks(w, delta)));
  }, []);

  /** Clears every kind of date navigation at once. */
  const goToToday = useCallback(() => {
    const now = new Date();
    setWeek(now);
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(null);
    setSelectedIndex(0);
  }, []);

  const handleKey = useCallback(
    (key: string, e: KeyboardEvent) => {
      if (editingOverlay) return;
      if (e.metaKey && key === "r") { e.preventDefault(); onRefresh(); return; }

      if (confirmDelete) {
        if (key === "Enter") { onDelete(confirmDelete.id); setConfirmDelete(null); }
        else if (key === "Escape") setConfirmDelete(null);
        return;
      }

      // Escape peels back one layer at a time: day filter, then month, then out.
      if (key === "Escape") {
        if (selectedDay) pickDay(null);
        else if (showMonth) setShowMonth(false);
        else onExit();
        return;
      }
      if (key === bindings["calendar"]) { onExit(); return; }
      if (key === bindings["month"]) { setShowMonth((v) => !v); return; }
      if (key === bindings["today"]) { goToToday(); return; }

      // ←/→ page whichever grid is on screen.
      if (key === "ArrowLeft")  {
        showMonth ? setMonth((m) => addMonths(m, -1)) : changeWeek(-1);
        return;
      }
      if (key === "ArrowRight") {
        showMonth ? setMonth((m) => addMonths(m, 1)) : changeWeek(1);
        return;
      }

      if (key === bindings["move-down"] || key === "j")
        setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
      else if (key === bindings["move-up"] || key === "k")
        setSelectedIndex((i) => Math.max(i - 1, 0));
      else if (key === bindings["cycle-status"] && selected) {
        e.preventDefault();
        onCycle(selected.id);
      }
      else if (key === bindings["expand"] && selected) {
        setExpandedId((id) => (id === selected.id ? null : selected.id));
      }
      else if (key === bindings["add"]) { e.preventDefault(); setAdding(true); }
      else if (key === bindings["edit"] && selected) setEditing(selected);
      else if (key === bindings["delete"] && selected) setConfirmDelete(selected);
      else if (key === bindings["refresh"]) onRefresh();
      else if (key === bindings["settings"]) onSettings();
      else if (key === bindings["notes"]) { e.preventDefault(); onNotes(true); }
    },
    [editingOverlay, confirmDelete, selected, flat, bindings, selectedDay, showMonth,
     onCycle, onDelete, onRefresh, onExit, onSettings, onNotes, pickDay, changeWeek, goToToday]
  );

  useKeyboard(handleKey);

  const onSelect = useCallback((item: Item) => {
    setSelectedIndex(flat.indexOf(item));
    setExpandedId((id) => (id === item.id ? null : item.id));
  }, [flat]);

  const rowProps = {
    selectedId: selected?.id ?? null,
    expandedId,
    onSelect,
    onCycle: (i: Item) => onCycle(i.id),
    calendarAccounts,
  };

  const empty = flat.length === 0;

  return (
    <div className="main" tabIndex={-1}>
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left">
          <WindowControls />
        </div>
        <div className="topbar-center">
          <ViewSwitch
            active="calendar"
            toggleKey={bindings["calendar"]}
            onSelect={(v) => { if (v === "tasks") onExit(); }}
          />
        </div>
        <div className="topbar-right">
          {loading && <span className="syncing topbar-icon">⟳</span>}
          <IconTag label="new event" keyHint={bindings["add"]}>
            <button className="topbar-icon-btn" onClick={() => setAdding(true)}>+</button>
          </IconTag>
          <IconTag label="settings" keyHint={bindings["settings"]}>
            <button className="topbar-icon-btn" onClick={() => onSettings()}>⚙</button>
          </IconTag>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {calendarWarning && <div className="calendar-warning">{calendarWarning}</div>}

      {showMonth ? (
        <MonthGrid
          items={items}
          month={month}
          selectedDay={selectedDay}
          onSelectDay={pickDay}
          onChangeMonth={(delta) => setMonth((m) => addMonths(m, delta))}
          onToggleMonth={() => setShowMonth((v) => !v)}
        />
      ) : (
        <WeekStrip
          items={items}
          week={week}
          selectedDay={selectedDay}
          onSelectDay={pickDay}
          onChangeWeek={changeWeek}
          onToggleMonth={() => setShowMonth((v) => !v)}
        />
      )}

      <div className="task-list">
        {!selectedDay && (
          <>
            <EventGroup label="TODAY" variant="today" events={groups.TODAY} {...rowProps} />
            <EventGroup label="TOMORROW" variant="tomorrow" events={groups.TOMORROW} {...rowProps} />
          </>
        )}
        {sections.map(({ date, items: dayEvents }) => (
          <EventGroup
            key={date.toISOString()}
            label={dayHeading(date)}
            events={dayEvents}
            {...rowProps}
          />
        ))}

        {!loading && empty && !error && (
          <div className="empty">
            <div className="empty-icon">◷</div>
            <div>{selectedDay ? "nothing from this day on" : "nothing scheduled"}</div>
            <div className="empty-hint">
              [{bindings["add"]}] new · [{bindings["month"]}] month · [esc]{" "}
              {selectedDay || showMonth ? "back" : "tasks"}
            </div>
          </div>
        )}
      </div>

      {selectedDay && (
        <div className="day-filter-bar">
          from {dayHeading(selectedDay)} onward · [esc] clear
        </div>
      )}

      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-delete" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">delete?</div>
            <div className="confirm-task">"{confirmDelete.name}"</div>
            <div className="confirm-actions">
              <button className="confirm-yes"
                onClick={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}>
                [enter] delete
              </button>
              <button className="confirm-no" onClick={() => setConfirmDelete(null)}>
                [esc] cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingOverlay && (
        <div className="overlay" onClick={() => { setAdding(false); setEditing(null); }}>
          <ItemEdit
            item={editing ?? undefined}
            calendarAccounts={calendarAccounts}
            /* Something added from the calendar is, by default, a calendar
               event — that is what this view is for. */
            preferCalendar
            onSubmit={handleSubmit}
            onClose={() => { setAdding(false); setEditing(null); }}
          />
        </div>
      )}

    </div>
  );
}
