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
  time:        "clear for none",
  deadline:    "clear for none",
  description: "↵ skip",
};

/** Today's date as an `<input type=date>` value. */
function todayISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Splits the "time" step's stored value — the same "YYYY-MM-DD HH:MM-HH:MM"
 * string `parseEventTime` already accepts — into the three native inputs
 * that edit it. Keeping the stored value in that format means submission
 * still goes through the existing parser unchanged.
 */
function splitTimeValue(raw: string): { date: string; start: string; end: string } {
  const [datePart, rangePart] = raw.trim().split(/\s+/);
  const date = datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
  const [start, end] = (rangePart ?? "").split("-");
  return { date, start: start ?? "", end: end ?? "" };
}

/** The inverse of `splitTimeValue`. */
function composeTimeValue(date: string, start: string, end: string): string {
  if (!date) return "";
  if (!start) return date;
  return end ? `${date} ${start}-${end}` : `${date} ${start}`;
}

function displayValue(step: Step, raw: string): string {
  if (!raw.trim()) return "—";
  if (step === "time") {
    const { start, end } = parseEventTime(raw);
    return start ? formatEventTime(start, end) : raw;
  }
  if (step === "deadline") return parseDeadline(raw) ?? raw;
  return raw;
}

function initialValues(item: Item | undefined): Record<Step, string> {
  // New items' date fields default to today rather than an empty
  // "yyyy-mm-dd" — the year and month are almost always right already, so
  // there's normally just a day to adjust; the "clear" button next to each
  // field empties it back out for something with no real date. Editing an
  // existing item always shows its actual stored value instead.
  const time = formatEventTime(item?.start ?? null, item?.end ?? null);
  const deadline = item?.deadline ?? "";
  return {
    name: item?.name ?? "",
    time: item ? time : time || todayISODate(),
    deadline: item ? deadline : deadline || todayISODate(),
    description: item?.description ?? "",
  };
}

export function ItemEdit({ item, onSubmit, onClose }: ItemEditProps) {
  const seed = initialValues(item);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<{ step: Step; raw: string }[]>([]);
  const [current, setCurrent] = useState(seed[STEPS[0]]);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentStep = STEPS[stepIndex];

  // Focuses the field for a newly-entered step. Keyed on stepIndex alone —
  // keying this on `current` as well reruns it on every keystroke, which
  // reselects the whole input and makes each new character overwrite the
  // last instead of appending.
  useEffect(() => {
    inputRef.current?.focus();
    // date/time inputs throw on select() — it only applies to text-like ones.
    if (inputRef.current?.type === "text") inputRef.current.select();
  }, [stepIndex]);

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

  /** Enter/Escape for the native date/time inputs — no back-gesture here,
   *  since ArrowUp/Backspace drive the native picker instead. */
  const dateTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleEnter(); }
    else if (e.key === "Escape") onClose();
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
        {currentStep === "time" && (() => {
          const { date, start, end } = splitTimeValue(current);
          return (
            <span className="quickadd-datetime">
              <input
                ref={inputRef}
                type="date"
                className="quickadd-native"
                value={date}
                onChange={(e) => setCurrent(composeTimeValue(e.target.value, start, end))}
                onKeyDown={dateTimeKeyDown}
              />
              <input
                type="time"
                className="quickadd-native"
                value={start}
                onChange={(e) =>
                  setCurrent(composeTimeValue(date || todayISODate(), e.target.value, end))
                }
                onKeyDown={dateTimeKeyDown}
              />
              <span className="quickadd-native-sep">–</span>
              <input
                type="time"
                className="quickadd-native"
                value={end}
                onChange={(e) =>
                  setCurrent(composeTimeValue(date || todayISODate(), start, e.target.value))
                }
                onKeyDown={dateTimeKeyDown}
              />
              {current && (
                <button type="button" className="quickadd-clear" onClick={() => setCurrent("")}>
                  clear
                </button>
              )}
            </span>
          );
        })()}
        {currentStep === "deadline" && (
          <span className="quickadd-datetime">
            <input
              ref={inputRef}
              type="date"
              className="quickadd-native"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              onKeyDown={dateTimeKeyDown}
            />
            {current && (
              <button type="button" className="quickadd-clear" onClick={() => setCurrent("")}>
                clear
              </button>
            )}
          </span>
        )}
        {(currentStep === "name" || currentStep === "description") && (
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
        )}
      </div>

      <div className="quickadd-hint">
        {HINTS[currentStep] && <span>{HINTS[currentStep]}</span>}
        {/* Arrow/Backspace-to-go-back is only wired on the text steps — on a
            date/time step those keys drive the native picker instead, so the
            hint would be lying. A plain click still works everywhere. */}
        {stepIndex > 0 && (currentStep === "name" || currentStep === "description") && (
          <span> · ↑/⌫ back</span>
        )}
        {stepIndex > 0 && (currentStep === "time" || currentStep === "deadline") && (
          <span> · <button type="button" className="quickadd-back-link" onClick={handleBack}>back</button></span>
        )}
      </div>
    </div>
  );
}
