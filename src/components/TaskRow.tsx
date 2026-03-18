import { Task } from "../types";
import { timeHint } from "../lib/timeHint";

interface TaskRowProps {
  task: Task;
  selected: boolean;
  onClick: () => void;
  onCycle: () => void;
}

function statusSymbol(status: string): string {
  switch (status) {
    case "In Progress": return "~";
    case "Done":        return "✓";
    default:            return " ";
  }
}

export function TaskRow({ task, selected, onClick, onCycle }: TaskRowProps) {
  const hint = timeHint(task.due, task.energy);
  const isOverdue = hint.includes("overdue");
  const isDone = task.status === "Done";

  return (
    <div
      className={`task-row ${selected ? "task-row--selected" : ""} ${isDone ? "task-row--done" : ""}`}
      onClick={onClick}
    >
      <span className="task-cursor">{selected ? "▶" : " "}</span>
      <span
        className={`task-check ${isDone ? "task-check--done" : task.status === "In Progress" ? "task-check--progress" : ""}`}
        title="cycle status"
        onClick={(e) => { e.stopPropagation(); onCycle(); }}
      >
        [{statusSymbol(task.status)}]
      </span>
      <span className="task-title">{task.title}</span>
      {hint && !isDone && (
        <span className={`task-hint ${isOverdue ? "task-hint--overdue" : ""}`}>
          {hint}
        </span>
      )}
      {task.priority === "High" && !isDone && (
        <span className="task-priority">!</span>
      )}
    </div>
  );
}
