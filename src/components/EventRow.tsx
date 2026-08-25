import { invoke } from "@tauri-apps/api/core";
import { CalendarAccount, Item } from "../types";
import { timeRangeLabel, deadlineLabel, isDeadlinePassed } from "../lib/groupEvents";
import { sourceTag } from "../lib/sourceTag";
import { StatusBox } from "./StatusBox";

interface EventRowProps {
  event: Item;
  calendarAccounts: CalendarAccount[];
  selected: boolean;
  expanded: boolean;
  onClick: () => void;
  onCycle: () => void;
}

export function EventRow({ event, calendarAccounts, selected, expanded, onClick, onCycle }: EventRowProps) {
  const time = timeRangeLabel(event);
  const deadline = deadlineLabel(event);
  const overdue = isDeadlinePassed(event);

  const fromCalendar = event.source === "google";
  const tag = sourceTag(event, calendarAccounts);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    invoke("open_in_notion", { itemId: event.id });
  };

  return (
    <div
      className={`event-row ${selected ? "event-row--selected" : ""}${
        fromCalendar ? " event-row--calendar" : ""
      }`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      <div className="event-row-main">
        <span className="task-cursor">{selected ? "▶" : " "}</span>
        <StatusBox status={event.status} onCycle={onCycle} />
        <span className="event-time">{time || "—"}</span>
        {/* Which database or calendar this row belongs to. */}
        <span className="row-source-dot" style={{ background: tag.color }} title={tag.label} />
        <span className="event-name">{event.name}</span>
        {event.description && !expanded && (
          <span className="task-has-note" title="has a description">·</span>
        )}
        {deadline && (
          <span className={`event-deadline ${overdue ? "event-deadline--passed" : ""}`}>
            {deadline}
          </span>
        )}
      </div>
      {expanded && event.description && (
        <div className="row-description">{event.description}</div>
      )}
    </div>
  );
}
