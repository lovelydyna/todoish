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

/** Today's date as an `<input type=date>` value. */
function todayISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Splits the stored "when" value — the same "YYYY-MM-DD HH:MM-HH:MM" string
 * `parseEventTime` already accepts — into the three native inputs that edit
 * it. Keeping the stored value in that format means submission still goes
 * through the existing parser unchanged.
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
 * Quick add / edit, as one card: name first and focused, description under
 * it, the two dates as a row of fields, and Save at the bottom. Enter from
 * any field saves, so the fast path is type a name and press Enter.
 */
export function ItemEdit({ item, onSubmit, onClose }: ItemEditProps) {
  // New items' date fields default to today: the year and month are almost
  // always right already, so there's normally just a day to adjust. "Clear"
  // empties a field for something with no real date. Editing shows the
  // stored values as they are.
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [when, setWhen] = useState(() => {
    const t = formatEventTime(item?.start ?? null, item?.end ?? null);
    return item ? t : t || todayISODate();
  });
  const [deadline, setDeadline] = useState(() => (item ? item.deadline ?? "" : todayISODate()));
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const submit = () => {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    const { start, end } = parseEventTime(when);
    onSubmit({
      name: name.trim(),
      start,
      end,
      deadline: parseDeadline(deadline),
      description: description.trim() || null,
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    // A focused button handles its own Enter (Cancel shouldn't save).
    else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      submit();
    }
  };

  const { date, start, end } = splitTimeValue(when);
  const day = date || todayISODate();

  return (
    <form
      className="quickadd"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={onKeyDown}
    >
      <input
        ref={nameRef}
        className="quickadd-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={item ? "Name" : "What needs doing?"}
        aria-label="name"
        spellCheck={false}
        autoComplete="off"
      />
      <input
        className="quickadd-desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        aria-label="description"
        autoComplete="off"
      />

      <div className="quickadd-fields">
        <div className="qa-field">
          <span className="qa-label">When</span>
          <input
            type="date"
            className="qa-input"
            aria-label="date"
            value={date}
            onChange={(e) => setWhen(composeTimeValue(e.target.value, start, end))}
          />
          <input
            type="time"
            className="qa-input"
            aria-label="start time"
            value={start}
            onChange={(e) => setWhen(composeTimeValue(day, e.target.value, end))}
          />
          <span className="qa-sep">–</span>
          <input
            type="time"
            className="qa-input"
            aria-label="end time"
            value={end}
            onChange={(e) => setWhen(composeTimeValue(day, start, e.target.value))}
          />
          {when && (
            <button type="button" className="qa-clear" onClick={() => setWhen("")}>Clear</button>
          )}
        </div>
        <div className="qa-field">
          <span className="qa-label">Deadline</span>
          <input
            type="date"
            className="qa-input"
            aria-label="deadline"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          {deadline && (
            <button type="button" className="qa-clear" onClick={() => setDeadline("")}>Clear</button>
          )}
        </div>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
          {item ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
