import { invoke } from "@tauri-apps/api/core";
import { CalendarAccount, Item, TaskGroup as TG } from "../types";
import { timeHint, isOverdue } from "../lib/timeHint";
import { actionDate, groupSlug } from "../lib/groupTasks";
import { sourceTag } from "../lib/sourceTag";
import { StatusBox } from "./StatusBox";

interface TaskRowProps {
  item: Item;
  /** Which group this row belongs to — NOW and THIS WEEK get a soft accent
   *  tint, so what needs attention soonest reads at a glance. */
  group?: TG;
  calendarAccounts: CalendarAccount[];
  selected: boolean;
  expanded: boolean;
  onClick: () => void;
  onCycle: () => void;
}

const HIGHLIGHTED_GROUPS: TG[] = ["NOW", "THIS WEEK"];

export function TaskRow({ item, group, calendarAccounts, selected, expanded, onClick, onCycle }: TaskRowProps) {
  const due = actionDate(item);
  const hint = timeHint(due);
  const overdue = isOverdue(due);
  const isDone = item.status === "Done";
  const highlight = group && HIGHLIGHTED_GROUPS.includes(group) ? `task-row--${groupSlug(group)}` : "";
  const tag = sourceTag(item, calendarAccounts);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    invoke("open_in_notion", { itemId: item.id });
  };

  return (
    <div
      className={`task-row ${highlight} ${selected ? "task-row--selected" : ""} ${isDone ? "task-row--done" : ""}`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      <div className="task-row-main">
        <span className="task-cursor">{selected ? "▶" : " "}</span>
        <StatusBox status={item.status} onCycle={onCycle} />
        {/* Which database or calendar this row belongs to — a dot rather
            than text so a merged list of many sources still scans fast. */}
        <span className="row-source-dot" style={{ background: tag.color }} title={tag.label} />
        <span className="task-title">{item.name}</span>
        {item.description && !expanded && (
          <span className="task-has-note" title="has a description">·</span>
        )}
        {hint && !isDone && (
          <span className={`task-hint ${overdue ? "task-hint--overdue" : ""}`}>
            {hint}
          </span>
        )}
      </div>
      {expanded && item.description && (
        <div className="row-description">{item.description}</div>
      )}
    </div>
  );
}
