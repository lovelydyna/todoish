import { invoke } from "@tauri-apps/api/core";
import { Item, TaskGroup as TG } from "../types";
import { timeHint, isOverdue } from "../lib/timeHint";
import { actionDate, groupSlug } from "../lib/groupTasks";
import { StatusBox } from "./StatusBox";

interface TaskRowProps {
  item: Item;
  /** Which group this row belongs to — NOW and THIS WEEK get a soft accent
   *  tint, so what needs attention soonest reads at a glance. */
  group?: TG;
  selected: boolean;
  expanded: boolean;
  onClick: () => void;
  onCycle: () => void;
}

const HIGHLIGHTED_GROUPS: TG[] = ["NOW", "THIS WEEK"];

export function TaskRow({ item, group, selected, expanded, onClick, onCycle }: TaskRowProps) {
  const due = actionDate(item);
  const hint = timeHint(due);
  const overdue = isOverdue(due);
  const isDone = item.status === "Done";
  const highlight = group && HIGHLIGHTED_GROUPS.includes(group) ? `task-row--${groupSlug(group)}` : "";

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
