import { CalendarAccount, IcsCalendarStatus, Item } from "../types";

export interface SourceTag {
  label: string;
  color: string;
}

/** Deterministic hue from a string, so the same calendar always gets the
 *  same dot color across renders and sessions without persisting anything. */
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Which database or calendar a row belongs to, for the small dot next to
 *  its title — Notion tasks all share one neutral tone; each Google
 *  calendar (or imported .ics calendar) gets its own hue so rows from
 *  different calendars stay visually distinct in a merged list. */
export function sourceTag(
  item: Item,
  accounts: CalendarAccount[],
  icsCalendars: IcsCalendarStatus[] = []
): SourceTag {
  if (item.source === "notion") {
    return { label: "Notion", color: "var(--text-faint)" };
  }
  if (item.source === "ics") {
    const calendar = icsCalendars.find((c) => c.id === item.calendar_id);
    const label = calendar?.name || "calendar";
    const hue = hashHue(`ics:${item.calendar_id ?? ""}`);
    return { label, color: `hsl(${hue}, 55%, 62%)` };
  }
  const account = accounts.find((a) => a.id === item.account_id);
  const calendar = account?.calendars.find((c) => c.id === item.calendar_id);
  const label = calendar?.name || account?.account || "calendar";
  const hue = hashHue(`${item.account_id ?? ""}:${item.calendar_id ?? ""}`);
  return { label, color: `hsl(${hue}, 55%, 62%)` };
}
