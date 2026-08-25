import { useState, useRef, useEffect } from "react";
import { CalendarAccount, Item } from "../types";
import { ItemFields } from "../hooks/useItems";
import { parseEventTime, parseDeadline, formatEventTime } from "../lib/parseEventTime";

interface ItemEditProps {
  /** Omit to create a new item. */
  item?: Item;
  /** Every linked Google account, for the destination step's choices. */
  calendarAccounts: CalendarAccount[];
  /**
   * Default the destination step to the first calendar account rather than
   * Notion. The calendar view's "new event" sets this; the tasks view's
   * "new item" leaves it Notion.
   */
  preferCalendar?: boolean;
  onSubmit: (fields: ItemFields) => void;
  onClose: () => void;
}

type Step = "where" | "name" | "time" | "deadline" | "description";
const STEPS: Step[] = ["name", "time", "deadline", "description"];

const PROMPTS: Record<Step, string> = {
  where:       "where   ",
  name:        "name    ",
  time:        "time    ",
  deadline:    "deadline",
  description: "desc    ",
};

const HINTS: Record<Step, string> = {
  where:       "←/→ switch · ↵ next",
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

/**
 * One choice in the destination step: Notion, or one specific calendar
 * within one linked account. `accountId`/`calendarId` are carried directly
 * rather than encoded into `value` — an opaque unique key is all `value`
 * needs to be, so nothing has to parse it back apart later.
 */
interface Destination {
  value: string;
  label: string;
  accountId: string | null;
  calendarId: string | null;
}

const NOTION_DESTINATION: Destination = {
  value: "notion",
  label: "notion",
  accountId: null,
  calendarId: null,
};

/**
 * Flattens every linked account's synced calendars into one destination
 * per calendar — an account syncing both "primary" and "lab bookings" gets
 * two entries, not one, so which calendar a new event lands on is a choice
 * up front rather than always whatever happened to sync first. An account
 * with nothing configured to sync (or exactly one) gets a single entry
 * labelled by the account alone, since there's nothing to disambiguate.
 */
function destinationsFor(accounts: CalendarAccount[]): Destination[] {
  const entries: Destination[] = [NOTION_DESTINATION];
  for (const account of accounts) {
    if (account.calendars.length <= 1) {
      entries.push({
        value: `acct:${account.id}`,
        // The calendar's own name ("Personal", "Work") reads far better here
        // than the linked account's email — fall back to the email only if
        // nothing's synced yet and there's no name to show.
        label: account.calendars[0]?.name || account.account || "calendar",
        accountId: account.id,
        calendarId: account.calendars[0]?.id ?? null,
      });
    } else {
      for (const cal of account.calendars) {
        entries.push({
          value: `acct:${account.id}:${cal.id}`,
          label: cal.name,
          accountId: account.id,
          calendarId: cal.id,
        });
      }
    }
  }
  return entries;
}

/** The destination for a fresh "new item" — the flagged default account (or
 *  the first linked one, matching the backend's own fallback) and, within
 *  it, whichever calendar entry represents its default. Notion if nothing
 *  is linked at all. */
function defaultDestinationValue(accounts: CalendarAccount[], destinations: Destination[]): string {
  const account = accounts.find((a) => a.default) ?? accounts[0];
  if (!account) return "notion";
  return destinations.find((d) => d.accountId === account.id)?.value ?? "notion";
}

function displayValue(step: Step, raw: string, destinations: Destination[]): string {
  if (step === "where") return destinations.find((d) => d.value === raw)?.label ?? raw;
  if (!raw.trim()) return "—";
  if (step === "time") {
    const { start, end } = parseEventTime(raw);
    return start ? formatEventTime(start, end) : raw;
  }
  if (step === "deadline") return parseDeadline(raw) ?? raw;
  return raw;
}

function initialValues(
  item: Item | undefined,
  defaultDestination: string
): Record<Step, string> {
  // Only meaningful for a *new* item — the where step never renders when
  // editing (an item can't change which service it belongs to), so this
  // value is computed but unused in that case.
  const where = item ? "notion" : defaultDestination;
  // New items' date fields default to today rather than an empty
  // "yyyy-mm-dd" — the year and month are almost always right already, so
  // there's normally just a day to adjust; the "clear" button next to each
  // field empties it back out for something with no real date. Editing an
  // existing item always shows its actual stored value instead.
  const time = formatEventTime(item?.start ?? null, item?.end ?? null);
  const deadline = item?.deadline ?? "";
  return {
    where,
    name: item?.name ?? "",
    time: item ? time : time || todayISODate(),
    deadline: item ? deadline : deadline || todayISODate(),
    description: item?.description ?? "",
  };
}

export function ItemEdit({
  item,
  calendarAccounts,
  preferCalendar = false,
  onSubmit,
  onClose,
}: ItemEditProps) {
  const destinations = destinationsFor(calendarAccounts);
  const defaultDestination = preferCalendar
    ? defaultDestinationValue(calendarAccounts, destinations)
    : "notion";
  const seed = initialValues(item, defaultDestination);
  // A choice only exists once a calendar is linked — with nothing to pick
  // between, the step would just be an extra keystroke for no reason.
  const offerWhere = destinations.length > 1 && !item;
  const steps: Step[] = offerWhere ? ["where", ...STEPS] : STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<{ step: Step; raw: string }[]>([]);
  const [current, setCurrent] = useState(seed[steps[0]]);
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const choiceRef = useRef<HTMLButtonElement>(null);

  const currentStep = steps[stepIndex];

  // Focuses the field for a newly-entered step. Keyed on stepIndex alone —
  // keying this on `current` as well reruns it on every keystroke, which
  // reselects the whole input and makes each new character overwrite the
  // last instead of appending.
  useEffect(() => {
    if (currentStep === "where") {
      choiceRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
    // date/time inputs throw on select() — it only applies to text-like ones.
    if (inputRef.current?.type === "text") inputRef.current.select();
  }, [stepIndex]);

  // The destination step is a row of buttons, not a text field: switching
  // which one is selected (by click or arrow key) has to move real DOM focus
  // along with it, or keyboard navigation and screen readers lose track of
  // the control. This only ever touches the button, never the text input.
  useEffect(() => {
    if (currentStep === "where") {
      choiceRef.current?.focus();
    }
  }, [current, currentStep]);

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

    if (stepIndex < steps.length - 1) {
      const next = steps[stepIndex + 1];
      setCompleted(newCompleted);
      setCurrent(seed[next]);
      setStepIndex(stepIndex + 1);
      return;
    }

    const vals = Object.fromEntries(
      newCompleted.map(({ step, raw }) => [step, raw])
    ) as Record<Step, string>;
    const { start, end } = parseEventTime(vals.time ?? "");
    const destination = destinations.find((d) => d.value === vals.where) ?? NOTION_DESTINATION;
    const source = destination.accountId ? "google" : "notion";

    // Google has nowhere to put an item with no time. Catching it here beats
    // letting the request fail, because the typed values are still on screen.
    if (source === "google" && !start) {
      setProblem("a calendar event needs a time — go back and add one");
      return;
    }

    onSubmit({
      name: vals.name.trim(),
      start,
      end,
      deadline: parseDeadline(vals.deadline ?? ""),
      description: vals.description.trim() || null,
      source,
      account_id: destination.accountId ?? undefined,
      calendar_id: destination.calendarId,
    });
  };

  /** Enter/Escape for the native date/time inputs — no back-gesture here,
   *  since ArrowUp/Backspace drive the native picker instead. */
  const dateTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleEnter(); }
    else if (e.key === "Escape") onClose();
  };

  /** Steps the destination step to the next/previous choice. */
  const switchDestination = (delta: number) => {
    setProblem(null);
    setCurrent((v) => {
      const i = destinations.findIndex((d) => d.value === v);
      const next = destinations[(i + delta + destinations.length) % destinations.length];
      return next.value;
    });
  };

  /**
   * Keys for the destination step. Enter is stopped from reaching the button
   * it is aimed at, which would otherwise fire that button's click as well as
   * advancing the step.
   */
  const handleChoiceKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleEnter(); }
    else if (e.key === "Escape") onClose();
    else if (e.key === "ArrowLeft") { e.preventDefault(); switchDestination(-1); }
    else if (e.key === "ArrowRight" || e.key === "Tab") { e.preventDefault(); switchDestination(1); }
  };

  return (
    <div className="quickadd" onClick={(e) => e.stopPropagation()}>
      <div className="quickadd-title">{item ? "edit" : "new"}</div>

      {completed.map(({ step, raw }) => (
        <div key={step} className="quickadd-row quickadd-row--done">
          <span className="quickadd-key">{PROMPTS[step]}</span>
          <span className="quickadd-val">{displayValue(step, raw, destinations)}</span>
        </div>
      ))}

      <div className="quickadd-row quickadd-row--active">
        <span className="quickadd-key">{PROMPTS[currentStep]}</span>
        {currentStep === "where" && (
          <span className="quickadd-choice" onKeyDown={handleChoiceKey}>
            {destinations.map((option) => (
              <button
                key={option.value}
                ref={current === option.value ? choiceRef : undefined}
                type="button"
                aria-pressed={current === option.value}
                className={`quickadd-option${
                  current === option.value ? " quickadd-option--on" : ""
                }`}
                onClick={() => { setProblem(null); setCurrent(option.value); }}
              >
                {option.label}
              </button>
            ))}
          </span>
        )}
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

      {problem && <div className="quickadd-problem">{problem}</div>}

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
