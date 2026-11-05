import { Item } from "../types";
import { EventRow } from "./EventRow";

interface EventGroupProps {
  /** Heading text — "Today", "Tomorrow", or a date like "Tue, Aug 11". */
  label: string;
  /** Quiet date beside a relative heading, e.g. "Wed, Nov 4" beside Today. */
  aside?: string;
  /** Drives the checkbox ring colour; omit for the neutral date-section look. */
  variant?: "today" | "tomorrow";
  events: Item[];
  selectedId: string | null;
  expandedId: string | null;
  onSelect: (event: Item) => void;
  onCycle: (event: Item) => void;
}

export function EventGroup({
  label,
  aside,
  variant,
  events,
  selectedId,
  expandedId,
  onSelect,
  onCycle,
}: EventGroupProps) {
  if (events.length === 0) return null;

  return (
    <section className={`task-group task-group--${variant ?? "date"}`}>
      <div className="group-head">
        <h2 className="group-title">
          <span className="group-name">{label}</span>
          <span className="group-count">{events.length}</span>
        </h2>
        {aside && <span className="group-aside">{aside}</span>}
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
    </section>
  );
}
