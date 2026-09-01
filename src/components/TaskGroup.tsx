import { CalendarAccount, Item, TaskGroup as TG } from "../types";
import { groupSlug } from "../lib/groupTasks";
import { TaskRow } from "./TaskRow";

interface TaskGroupProps {
  group: TG;
  /** Overrides the heading text; the colour still follows `group`. */
  label?: string;
  items: Item[];
  calendarAccounts: CalendarAccount[];
  selectedId: string | null;
  expandedId: string | null;
  onSelect: (item: Item) => void;
  onCycle: (item: Item) => void;
  /** When set, the heading becomes a click target that hides the rows
   *  beneath it, showing just the count — used for LATER, which is the one
   *  group worth tucking away rather than scrolling past. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** A plain clickable label with no caret or count — used for DONE, where
   *  the click widens what's shown (recent → all) rather than hiding it. */
  onLabelClick?: () => void;
  labelTitle?: string;
}

export function TaskGroup({
  group,
  label,
  items,
  calendarAccounts,
  selectedId,
  expandedId,
  onSelect,
  onCycle,
  collapsed,
  onToggleCollapsed,
  onLabelClick,
  labelTitle,
}: TaskGroupProps) {
  if (items.length === 0) return null;

  const heading = (
    <>
      {label ?? group}
      {onToggleCollapsed && <span className="group-label-count">{items.length}</span>}
    </>
  );

  return (
    <div className="task-group">
      {onToggleCollapsed ? (
        <button
          type="button"
          className={`group-label group-label--${groupSlug(group)} group-label--collapsible`}
          onClick={onToggleCollapsed}
          title={collapsed ? "show later" : "hide later"}
        >
          <span className={`group-label-caret${collapsed ? "" : " group-label-caret--open"}`}>›</span>
          {heading}
        </button>
      ) : onLabelClick ? (
        <button
          type="button"
          className={`group-label group-label--${groupSlug(group)} group-label--collapsible`}
          onClick={onLabelClick}
          title={labelTitle}
        >
          {heading}
        </button>
      ) : (
        <div className={`group-label group-label--${groupSlug(group)}`}>{heading}</div>
      )}
      {!collapsed && items.map((item) => (
        <TaskRow
          key={item.id}
          item={item}
          group={group}
          calendarAccounts={calendarAccounts}
          selected={item.id === selectedId}
          expanded={item.id === expandedId}
          onClick={() => onSelect(item)}
          onCycle={() => onCycle(item)}
        />
      ))}
    </div>
  );
}
