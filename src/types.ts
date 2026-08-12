/**
 * One row of the Notion database, serving both views.
 *
 * The task list groups by `deadline ?? start` — when you must act.
 * The calendar groups by `start ?? deadline` — when it happens.
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
}

export interface Config {
  notion_api_key: string;
  database_id: string;
  completion_tone: string;
  startup_position: string;
  always_on_top: boolean;
  global_shortcut: string;
  theme: string;
  color_mode: string;
  window_opacity: number;
}

export type TaskGroup = "NOW" | "THIS WEEK" | "NEXT WEEK" | "LATER" | "DONE";

export type EventGroup = "TODAY" | "TOMORROW" | "UPCOMING";
