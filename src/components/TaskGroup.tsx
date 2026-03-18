import { Task, TaskGroup as TG } from "../types";
import { TaskRow } from "./TaskRow";

interface TaskGroupProps {
  label: TG;
  tasks: Task[];
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onCycle: (task: Task) => void;
}

export function TaskGroup({
  label,
  tasks,
  selectedId,
  onSelect,
  onCycle,
}: TaskGroupProps) {
  if (tasks.length === 0) return null;

  return (
    <div className="task-group">
      <div className={`group-label group-label--${label.toLowerCase()}`}>
        {label}
      </div>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          selected={task.id === selectedId}
          onClick={() => onSelect(task)}
          onCycle={() => onCycle(task)}
        />
      ))}
    </div>
  );
}
