import { invoke } from "@tauri-apps/api/core";
import { Item } from "../types";
import { timeHint, isOverdue } from "../lib/timeHint";
import { actionDate } from "../lib/groupTasks";
import { StatusBox } from "./StatusBox";

interface TaskRowProps {
  item: Item;
  selected: boolean;
  expanded: boolean;
  onClick: () => void;
  onCycle: () => void;
}

export function TaskRow({ item, selected, expanded, onClick, onCycle }: TaskRowProps) {
  const due = actionDate(item);
  const hint = timeHint(due);
  const overdue = isOverdue(due);
  const isDone = item.status === "Done";

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    invoke("open_in_notion", { itemId: item.id });
  };

  return (
    <div
      className={`task-row ${selected ? "task-row--selected" : ""} ${isDone ? "task-row--done" : ""}`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      <div className="task-row-main">
        <span className="task-cursor">{selected ? "▶" : " "}</span>
        <StatusBox status={item.status} onCycle={onCycle} />
        {/* Always rendered, so the titles stay in one column whether or not a
            row came from the calendar. */}
        <span
          className="row-source"
          title={item.source === "google" ? "from your notion calendar" : undefined}
        >
          {item.source === "google" ? "◇" : ""}
        </span>
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
