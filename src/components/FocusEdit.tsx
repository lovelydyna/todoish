import { useState, useRef, useEffect } from "react";
import { Task } from "../types";

interface FocusEditProps {
  task: Task;
  onSave: (fields: { title: string; due: string | null; priority: string | null; energy: string | null }) => void;
  onCancel: () => void;
}

type Field = "title" | "due" | "priority" | "energy";
const FIELDS: Field[] = ["title", "due", "priority", "energy"];

const LABELS: Record<Field, string> = {
  title:    "title   ",
  due:      "due     ",
  priority: "priority",
  energy:   "energy  ",
};

const HINTS: Record<Field, string> = {
  title:    "",
  due:      "today · tmrw · YYYY-MM-DD · ↵ skip",
  priority: "high · med · low · ↵ skip",
  energy:   "high · low · quick · ↵ skip",
};

function parseDue(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "skip" || v === "s") return null;
  if (v === "today" || v === "t") return new Date().toISOString().split("T")[0];
  if (v === "tomorrow" || v === "tmrw" || v === "tm") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) return v;
  return null;
}

function parsePriority(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "skip" || v === "s") return null;
  if (v === "h" || v === "high") return "High";
  if (v === "m" || v === "med" || v === "medium") return "Medium";
  if (v === "l" || v === "low") return "Low";
  return null;
}

function parseEnergy(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "skip" || v === "s") return null;
  if (v === "h" || v === "high") return "High";
  if (v === "l" || v === "low") return "Low";
  if (v === "q" || v === "quick") return "Quick";
  return null;
}

function fieldToDisplay(field: Field, val: string): string {
  if (!val.trim()) return "—";
  if (field === "due") return parseDue(val) ?? val;
  if (field === "priority") return parsePriority(val) ?? val;
  if (field === "energy") return parseEnergy(val) ?? val;
  return val;
}

export function FocusEdit({ task, onSave, onCancel }: FocusEditProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({
    title: task.title,
    due: task.due ?? "",
    priority: task.priority ?? "",
    energy: task.energy ?? "",
  });
  const [completed, setCompleted] = useState<Field[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [stepIndex]);

  const currentField = FIELDS[stepIndex];

  const handleBack = () => {
    if (stepIndex === 0) return;
    const prev = completed[completed.length - 1];
    setCompleted(completed.slice(0, -1));
    setStepIndex(stepIndex - 1);
    // restore cursor to that field (value already preserved in `values`)
    void prev;
  };

  const handleEnter = () => {
    if (currentField === "title" && !values.title.trim()) return;

    if (stepIndex < FIELDS.length - 1) {
      setCompleted([...completed, currentField]);
      setStepIndex(stepIndex + 1);
    } else {
      onSave({
        title: values.title.trim(),
        due: parseDue(values.due),
        priority: parsePriority(values.priority),
        energy: parseEnergy(values.energy),
      });
    }
  };

  return (
    <div className="quickadd" onClick={(e) => e.stopPropagation()}>
      <div className="quickadd-header">edit task</div>

      {completed.map((f) => (
        <div key={f} className="quickadd-row quickadd-row--done">
          <span className="quickadd-key">{LABELS[f]}</span>
          <span className="quickadd-val">{fieldToDisplay(f, values[f])}</span>
        </div>
      ))}

      <div className="quickadd-row quickadd-row--active">
        <span className="quickadd-key">{LABELS[currentField]}</span>
        <input
          ref={inputRef}
          className="quickadd-input"
          value={values[currentField]}
          onChange={(e) =>
            setValues({ ...values, [currentField]: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleEnter(); }
            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
            if (e.key === "ArrowUp" || (e.key === "Backspace" && values[currentField] === "")) {
              e.preventDefault();
              handleBack();
            }
          }}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className="quickadd-hint">
        {HINTS[currentField] && <span>{HINTS[currentField]} · </span>}
        {stepIndex > 0 && <span>↑/⌫ back · </span>}
        esc cancel
      </div>
    </div>
  );
}
