import { Item, TaskGroup as TG } from "../types";
import { groupSlug } from "../lib/groupTasks";
import { TaskRow } from "./TaskRow";

interface TaskGroupProps {
  group: TG;
  /** Overrides the heading text; the colour still follows `group`. */
  label?: string;
  items: Item[];
  selectedId: string | null;
  expandedId: string | null;
  onSelect: (item: Item) => void;
  onCycle: (item: Item) => void;
}

export function TaskGroup({
  group,
  label,
  items,
  selectedId,
  expandedId,
  onSelect,
  onCycle,
}: TaskGroupProps) {
  if (items.length === 0) return null;

  return (
    <div className="task-group">
      <div className={`group-label group-label--${groupSlug(group)}`}>
        {label ?? group}
      </div>
      {items.map((item) => (
        <TaskRow
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          expanded={item.id === expandedId}
          onClick={() => onSelect(item)}
          onCycle={() => onCycle(item)}
        />
      ))}
    </div>
  );
}
