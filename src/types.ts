/** Which service a row came from, and where writes to it go back to. */
export type Source = "notion" | "google";

/**
 * One row of the merged list, serving both views.
 *
 * The task list groups by `deadline ?? start` — when you must act.
 * The calendar groups by `start ?? deadline` — when it happens.
 *
 * Rows come from the Notion database and, once the calendar is linked, from
 * Notion Calendar's Google account. Both render identically apart from a
 * source marker; only `source` decides where an edit is written.
 */
export interface Item {
  id: string;
  name: string;
  status: string;
  /** Start of the Time property. Null for items that are only a deadline. */
  start: string | null;
  /** End of the Time property when it is a range. */
  end: string | null;
  deadline: string | null;
  description: string | null;
  /** Page-level Notion timestamps, used by the history view. */
  created_time: string | null;
  last_edited_time: string | null;
  source: Source;
  /** Which Google calendar holds this event. Null for Notion rows. */
  calendar_id: string | null;
  /** Which linked Google account this event belongs to. Null for Notion rows. */
  account_id: string | null;
  /** Where "open in…" goes. Null for Notion rows, whose URL is derived. */
  url: string | null;
}

/**
 * One sync. Google is reported separately from the items because a calendar
 * that fails must not read as the whole list being down — the tasks are still
 * there and still correct.
 */
export interface SyncResult {
  items: Item[];
  warning: string | null;
}

/** One calendar an account syncs. The name travels with the id — captured
 *  once in settings — so nothing needs a network round trip just to label a
 *  button. Mirrors config::SyncedCalendar. */
export interface SyncedCalendar {
  id: string;
  name: string;
}

/**
 * One linked Google account, as settings sees it.
 * Mirrors commands::CalendarAccountStatus.
 */
export interface CalendarAccount {
  id: string;
  client_id: string;
  has_client_secret: boolean;
  account: string;
  calendars: SyncedCalendar[];
  /** Whether a new event defaults here when more than one account is linked. */
  default: boolean;
}

/** One calendar on the linked account, as the picker in settings sees it —
 *  distinct from SyncedCalendar, which is the subset actually chosen to
 *  sync. Mirrors gcal::CalendarInfo. */
export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
  writable: boolean;
}

/** One saved note, for the notes tab in settings. Mirrors notes::NoteSummary. */
export interface NoteSummary {
  filename: string;
  title: string;
  /** Unix seconds. */
  modified: number;
  preview: string;
}

export interface Config {
  notion_api_key: string;
  database_id: string;
  completion_tone: string;
  startup_position: string;
  global_shortcut: string;
  theme: string;
  color_mode: string;
  window_opacity: number;
}

export type TaskGroup = "NOW" | "THIS WEEK" | "NEXT WEEK" | "LATER" | "DONE";

export type EventGroup = "TODAY" | "TOMORROW" | "UPCOMING";
