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
      className={`event-row${selected ? " event-row--selected" : ""}`}
      aria-selected={selected}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      {/* Read top to bottom down one edge: circle, name, then the details
          under the name, so nothing sits in a column of its own. */}
      <div className="event-row-main">
        <StatusBox status={event.status} onCycle={onCycle} />
        <div className="event-text">
          <span className="event-name">{event.name}</span>
          {(time || deadline) && (
            <span className="event-meta">
              {time}
              {time && deadline && " · "}
              {deadline && <span className={overdue ? "due--overdue" : undefined}>{deadline}</span>}
            </span>
          )}
        </div>
      </div>
      {expanded && event.description && (
        <div className="row-description">{event.description}</div>
      )}
    </div>
  );
}
