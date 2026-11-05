/**
 * One row of the merged list, serving both views.
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
  /** Which Notion database (data source) this row lives in. More than one
   *  database can be shared with the integration. */
  data_source_id: string | null;
}

/** One entry in a notes folder. Mirrors notes::NoteSummary. */
export interface NoteSummary {
  /** Path relative to the notes root, e.g. "work/idea.md" or "work". */
  filename: string;
  title: string;
  /** Unix seconds. */
  modified: number;
  preview: string;
  is_dir: boolean;
}

/** A user's manual property-role choices for one Notion data source, layered
 *  on top of auto-detection. Mirrors notion::SchemaOverride. */
export interface SchemaOverride {
  status?: string | null;
  time?: string | null;
  deadline?: string | null;
  description?: string | null;
}

export interface Config {
  notion_api_key: string;
  /** Which discovered Notion data sources feed task/calendar. Empty = every
   *  database shared with the integration. */
  enabled_data_sources: string[];
  /** Manual property choices, keyed by data source id. */
  schema_overrides: Record<string, SchemaOverride>;
  completion_tone: string;
  startup_position: string;
  global_shortcut: string;
  theme: string;
  color_mode: string;
  window_opacity: number;
}

export type TaskGroup = "NOW" | "THIS WEEK" | "NEXT WEEK" | "LATER" | "DONE";

export type EventGroup = "TODAY" | "TOMORROW" | "UPCOMING";
