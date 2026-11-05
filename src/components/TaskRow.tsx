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

/** Colour key for the due label: overdue, today and tomorrow each get one,
 *  anything further out stays neutral so the near dates stand out. */
export function dueTone(hint: string, overdue: boolean): string {
  if (overdue) return "due--overdue";
  if (hint === "today") return "due--today";
  if (hint === "tomorrow") return "due--tomorrow";
  return "";
}

export function TaskRow({ item, selected, expanded, onClick, onCycle }: TaskRowProps) {
  const due = actionDate(item);
  const hint = timeHint(due);
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
          <span className={`due ${dueTone(hint, isOverdue(due))}`}>{hint}</span>
        )}
      </div>
      {expanded && item.description && (
        <div className="row-description">{item.description}</div>
      )}
    </div>
  );
}
