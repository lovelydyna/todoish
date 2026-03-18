import { useState, useRef, useEffect } from "react";

interface QuickAddFields {
  title: string;
  due: string | null;
  priority: string | null;
  energy: string | null;
}

interface QuickAddProps {
  onSubmit: (fields: QuickAddFields) => void;
  onClose: () => void;
}

type Step = "name" | "due" | "priority" | "energy";
const STEPS: Step[] = ["name", "due", "priority", "energy"];

const PROMPTS: Record<Step, string> = {
  name:     "name    ",
  due:      "due     ",
  priority: "priority",
  energy:   "energy  ",
};

const HINTS: Record<Step, string> = {
  name:     "",
  due:      "today · tmrw · YYYY-MM-DD · ↵ skip",
  priority: "high · med · low · ↵ skip",
  energy:   "high · low · quick · ↵ skip",
};

function parseDue(val: string): string | null {
  const v = val.trim().toLowerCase();
  if (!v || v === "skip" || v === "s") return null;
  if (v === "today" || v === "t") {
    return new Date().toISOString().split("T")[0];
  }
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

function displayValue(step: Step, raw: string): string {
  if (!raw.trim()) return "—";
  if (step === "due") return parseDue(raw) ?? raw;
  if (step === "priority") return parsePriority(raw) ?? raw;
  if (step === "energy") return parseEnergy(raw) ?? raw;
  return raw;
}

export function QuickAdd({ onSubmit, onClose }: QuickAddProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<{ step: Step; raw: string }[]>([]);
  const [current, setCurrent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
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

    const entry = { step: currentStep, raw: current };
    const newCompleted = [...completed, entry];

    if (stepIndex < STEPS.length - 1) {
      setCompleted(newCompleted);
      setCurrent("");
      setStepIndex(stepIndex + 1);
    } else {
      const vals = Object.fromEntries(
        newCompleted.map(({ step, raw }) => [step, raw])
      ) as Record<Step, string>;
      onSubmit({
        title: vals.name.trim(),
        due: parseDue(vals.due ?? ""),
        priority: parsePriority(vals.priority ?? ""),
        energy: parseEnergy(vals.energy ?? ""),
      });
    }
  };

  return (
    <div className="quickadd" onClick={(e) => e.stopPropagation()}>
      <div className="quickadd-header">new task</div>

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
            if (e.key === "Escape") onClose();
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
        {HINTS[currentStep] && <span>{HINTS[currentStep]} · </span>}
        {stepIndex > 0 && <span>↑/⌫ back · </span>}
        esc cancel
      </div>
    </div>
  );
}
