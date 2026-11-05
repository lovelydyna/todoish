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
  // "today" only repeats the Now heading above it, so it's left off.
  const hint = timeHint(due) === "today" ? "" : timeHint(due);
  const isDone = item.status === "Done";

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    invoke("open_in_notion", { itemId: item.id });
  };

  return (
    <div
      className={`task-row${selected ? " task-row--selected" : ""}${isDone ? " task-row--done" : ""}`}
      aria-selected={selected}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      <div className="task-row-main">
        <StatusBox status={item.status} onCycle={onCycle} />
        <span className="task-title">{item.name}</span>
        {hint && !isDone && (
          <span className={`due${isOverdue(due) ? " due--overdue" : ""}`}>{hint}</span>
        )}
      </div>
      {expanded && item.description && (
        <div className="row-description">{item.description}</div>
      )}
    </div>
  );
}
