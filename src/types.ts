export interface Task {
  id: string;
  title: string;
  status: string;
  due: string | null;
  priority: string | null;
  energy: string | null;
  snooze_until: string | null;
  last_edited_time: string | null;
}

export interface Config {
  notion_api_key: string;
  database_id: string;
  completion_tone: string;
  startup_position: string;
}

export type TaskGroup = "NOW" | "NEXT" | "LATER" | "SNOOZED" | "DONE";
