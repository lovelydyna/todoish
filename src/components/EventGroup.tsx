import { Item } from "../types";
import { EventRow } from "./EventRow";

interface EventGroupProps {
  /** Heading text — a bucket name like TODAY, or a date like "TUE AUG 11". */
  label: string;
  /** Drives the heading colour; omit for the neutral date-section look. */
  variant?: "today" | "tomorrow" | "upcoming";
  events: Item[];
  selectedId: string | null;
  expandedId: string | null;
  onSelect: (event: Item) => void;
  onCycle: (event: Item) => void;
}

export function EventGroup({
  label,
  variant,
  events,
  selectedId,
  expandedId,
  onSelect,
  onCycle,
}: EventGroupProps) {
  if (events.length === 0) return null;

  return (
    <div className="task-group">
      <div className={`group-label${variant ? ` group-label--${variant}` : " group-label--date"}`}>
        {label}
      </div>
      {events.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          selected={event.id === selectedId}
          expanded={event.id === expandedId}
          onClick={() => onSelect(event)}
          onCycle={() => onCycle(event)}
        />
      ))}
    </div>
  );
}
