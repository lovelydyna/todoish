/**
 * Terminal-style date/time parsing for calendar events.
 *
 * Accepted forms (date and time are both optional, in either combination):
 *   "today 3pm"            → today, 15:00
 *   "tmrw 9:00-10:30"      → tomorrow, 09:00 to 10:30
 *   "2026-08-15 14:00"     → that date, 14:00
 *   "2026-08-15"           → that date, all day
 *   "3pm"                  → today, 15:00
 */

export interface ParsedTime {
  start: string | null;
  end: string | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i;

/** ISO 8601 with the local UTC offset, which is what Notion stores. */
export function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Resolves a bare date word or ISO date to a local Date at midnight. */
export function parseDateWord(token: string, now = new Date()): Date | null {
  const v = token.trim().toLowerCase();
  const midnight = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  if (v === "today" || v === "t") return midnight(now);
  if (v === "tomorrow" || v === "tmrw" || v === "tm") {
    const d = midnight(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (DATE_ONLY.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Minutes past midnight for a time token, or null if it isn't one. */
function parseClock(token: string): number | null {
  const m = TIME.exec(token.trim());
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();

  if (hour > 23 || minute > 59) return null;
  if (meridiem?.startsWith("p") && hour < 12) hour += 12;
  if (meridiem?.startsWith("a") && hour === 12) hour = 0;
  // A bare 1-2 digit number with no meridiem is only a time when it could be
  // one on a 24h clock — "9" means 09:00, not "the 9th".
  if (!meridiem && !m[2] && hour > 23) return null;

  return hour * 60 + minute;
}

function withClock(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** Date-only input for the Deadline property, which never carries a time. */
export function parseDeadline(raw: string, now = new Date()): string | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === "skip" || v === "s" || v === "none") return null;
  const day = parseDateWord(v, now);
  if (!day) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export function parseEventTime(raw: string, now = new Date()): ParsedTime {
  const v = raw.trim().toLowerCase();
  if (!v || v === "skip" || v === "s" || v === "none") return { start: null, end: null };

  // Split the range first so "9:00-10:30" survives whitespace splitting.
  const normalized = v.replace(/–/g, "-").replace(/\s+to\s+/g, "-");
  const tokens = normalized.split(/\s+/).filter(Boolean);

  let day: Date | null = null;
  let range: string | null = null;

  for (const token of tokens) {
    const asDate = parseDateWord(token, now);
    if (asDate && !day) {
      day = asDate;
      continue;
    }
    if (!range) range = token;
  }

  // No time part: an all-day event, stored as a bare date like Notion does.
  if (!range) {
    if (!day) return { start: null, end: null };
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      start: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
      end: null,
    };
  }

  const [startTok, endTok] = range.split("-");
  const startMin = parseClock(startTok ?? "");
  if (startMin === null) return { start: null, end: null };

  const base = day ?? parseDateWord("today", now)!;
  const start = withClock(base, startMin);

  let end: Date | null = null;
  if (endTok) {
    const endMin = parseClock(endTok);
    if (endMin !== null) {
      end = withClock(base, endMin);
      // An end before the start means it ran past midnight.
      if (end <= start) end.setDate(end.getDate() + 1);
    }
  }

  return { start: toLocalISO(start), end: end ? toLocalISO(end) : null };
}

/** Turns a stored event back into text the parser accepts, for editing. */
export function formatEventTime(start: string | null, end: string | null): string {
  if (!start) return "";
  if (DATE_ONLY.test(start)) return start;

  const pad = (n: number) => String(n).padStart(2, "0");
  const s = new Date(start);
  const datePart = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
  const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (!end) return `${datePart} ${clock(s)}`;
  return `${datePart} ${clock(s)}-${clock(new Date(end))}`;
}
