import { ReactNode } from "react";
import { Item, TaskGroup as TG } from "../types";
import { groupSlug, TASK_GROUP_LABELS } from "../lib/groupTasks";
import { TaskRow } from "./TaskRow";
import { ChevronRightIcon } from "./Icons";

interface TaskGroupProps {
  group: TG;
  items: Item[];
  selectedId: string | null;
  expandedId: string | null;
  onSelect: (item: Item) => void;
  onCycle: (item: Item) => void;
  /** Quiet text at the right of the heading, e.g. today's date beside Now. */
  aside?: ReactNode;
  /** When set, the heading becomes a click target that hides the rows
   *  beneath it, leaving just the count — used for Later, the one group
   *  worth tucking away rather than scrolling past. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/**
 * One section of the task list: a sticky heading with its count, then rows.
 * The group's slug on the wrapper sets the checkbox ring colour for every
 * row inside, so urgency reads from the circles without tinting whole rows.
 */
export function TaskGroup({
  group,
  items,
  selectedId,
  expandedId,
  onSelect,
  onCycle,
  aside,
  collapsed,
  onToggleCollapsed,
}: TaskGroupProps) {
  if (items.length === 0) return null;

  const title = (
    <>
      {onToggleCollapsed && (
        <span className={`group-caret${collapsed ? "" : " group-caret--open"}`}>
          <ChevronRightIcon />
        </span>
      )}
      <span className="group-name">{TASK_GROUP_LABELS[group]}</span>
      <span className="group-count">{items.length}</span>
    </>
  );

  return (
    <section className={`task-group task-group--${groupSlug(group)}`}>
      <div className="group-head">
        {onToggleCollapsed ? (
          <button
            type="button"
            className="group-title group-title--button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
          >
            {title}
          </button>
        ) : (
          <h2 className="group-title">{title}</h2>
        )}
        {aside && <span className="group-aside">{aside}</span>}
      </div>
      {!collapsed && items.map((item) => (
        <TaskRow
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          expanded={item.id === expandedId}
          onClick={() => onSelect(item)}
          onCycle={() => onCycle(item)}
        />
      ))}
    </section>
  );
}
