import { invoke } from "@tauri-apps/api/core";
import { Item } from "../types";
import { timeRangeLabel, deadlineLabel, isDeadlinePassed } from "../lib/groupEvents";
import { StatusBox } from "./StatusBox";

interface EventRowProps {
  event: Item;
  selected: boolean;
  expanded: boolean;
  onClick: () => void;
  onCycle: () => void;
}

export function EventRow({ event, selected, expanded, onClick, onCycle }: EventRowProps) {
  const time = timeRangeLabel(event);
  const deadline = deadlineLabel(event);
  const overdue = isDeadlinePassed(event);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    invoke("open_in_notion", { itemId: event.id });
  };

  return (
    <div
      className={`event-row ${selected ? "event-row--selected" : ""}`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      <div className="event-row-main">
        <span className="task-cursor">{selected ? "▶" : " "}</span>
        <StatusBox status={event.status} onCycle={onCycle} />
        <span className="event-time">{time || "—"}</span>
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
