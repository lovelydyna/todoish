import { useState, useRef, useEffect } from "react";
import { Item } from "../types";
import { ItemFields } from "../hooks/useItems";
import { parseEventTime, parseDeadline, formatEventTime } from "../lib/parseEventTime";

interface ItemEditProps {
  /** Omit to create a new item. */
  item?: Item;
  onSubmit: (fields: ItemFields) => void;
  onClose: () => void;
}

type Step = "name" | "time" | "deadline" | "description";
const STEPS: Step[] = ["name", "time", "deadline", "description"];

const PROMPTS: Record<Step, string> = {
  name:        "name    ",
  time:        "time    ",
  deadline:    "deadline",
  description: "desc    ",
};

const HINTS: Record<Step, string> = {
  name:        "",
  time:        "today 3pm · tmrw 9:00-10:30 · YYYY-MM-DD · ↵ skip",
  deadline:    "today · tmrw · YYYY-MM-DD · ↵ skip",
  description: "↵ skip",
};

function displayValue(step: Step, raw: string): string {
  if (!raw.trim()) return "—";
  if (step === "time") {
    const { start, end } = parseEventTime(raw);
    return start ? formatEventTime(start, end) : raw;
  }
  if (step === "deadline") return parseDeadline(raw) ?? raw;
  return raw;
}

function initialValues(item?: Item): Record<Step, string> {
  return {
    name: item?.name ?? "",
    time: formatEventTime(item?.start ?? null, item?.end ?? null),
    deadline: item?.deadline ?? "",
    description: item?.description ?? "",
  };
}

export function ItemEdit({ item, onSubmit, onClose }: ItemEditProps) {
  const seed = initialValues(item);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<{ step: Step; raw: string }[]>([]);
  const [current, setCurrent] = useState(seed.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [stepIndex]);

  const currentStep = STEPS[stepIndex];

  const handleBack = () => {
    if (stepIndex === 0) return;
    const prev = completed[completed.length - 1];
    setCompleted(completed.slice(0, -1));
    setCurrent(prev.raw);
    setStepIndex(stepIndex - 1);
  };

  const handleEnter = () => {
    if (currentStep === "name" && !current.trim()) return;

    const newCompleted = [...completed, { step: currentStep, raw: current }];

    if (stepIndex < STEPS.length - 1) {
      const next = STEPS[stepIndex + 1];
      setCompleted(newCompleted);
      setCurrent(seed[next]);
      setStepIndex(stepIndex + 1);
      return;
    }

    const vals = Object.fromEntries(
      newCompleted.map(({ step, raw }) => [step, raw])
    ) as Record<Step, string>;
    const { start, end } = parseEventTime(vals.time ?? "");
    onSubmit({
      name: vals.name.trim(),
      start,
      end,
      deadline: parseDeadline(vals.deadline ?? ""),
      description: vals.description.trim() || null,
    });
  };

  return (
    <div className="quickadd" onClick={(e) => e.stopPropagation()}>
      <div className="quickadd-title">{item ? "edit" : "new"}</div>

      {completed.map(({ step, raw }) => (
        <div key={step} className="quickadd-row quickadd-row--done">
          <span className="quickadd-key">{PROMPTS[step]}</span>
          <span className="quickadd-val">{displayValue(step, raw)}</span>
        </div>
      ))}

      <div className="quickadd-row quickadd-row--active">
        <span className="quickadd-key">{PROMPTS[currentStep]}</span>
        <input
          ref={inputRef}
          className="quickadd-input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleEnter(); }
            if (e.key === "Escape") { onClose(); }
            if (e.key === "ArrowUp" || (e.key === "Backspace" && current === "")) {
              e.preventDefault();
              handleBack();
            }
          }}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className="quickadd-hint">
        {HINTS[currentStep] && <span>{HINTS[currentStep]}</span>}
        {stepIndex > 0 && <span> · ↑/⌫ back</span>}
      </div>
    </div>
  );
}
