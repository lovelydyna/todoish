import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Item } from "../types";
import {
  activityByDay,
  activityDayHeading,
  activityTime,
  ACTIVITY_VERBS,
  ActivityEntry,
} from "../lib/activity";

interface HistoryPanelProps {
  items: Item[];
  loading: boolean;
}

const KIND_SYMBOL: Record<ActivityEntry["kind"], string> = {
  created: "+",
  edited: "~",
  completed: "✓",
};

/**
 * A Todoist-style history log built from the two timestamps Notion exposes
 * per page. See lib/activity.ts for why this is coarse rather than a full
 * audit trail.
 *
 * Lives inside settings rather than as its own view — a log you check
 * occasionally doesn't need a dedicated topbar and keybinding of its own.
 */
export function HistoryPanel({ items, loading }: HistoryPanelProps) {
  const days = useMemo(() => activityByDay(items), [items]);

  return (
    <div className="history-panel">
      {days.map(({ date, entries }) => (
        <div key={date.toISOString()} className="task-group">
          <div className="group-label group-label--date">
            {activityDayHeading(date)}
          </div>
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="activity-row"
              onClick={() => invoke("open_in_notion", { itemId: entry.item.id })}
              title="open in notion"
            >
              <span className={`activity-mark activity-mark--${entry.kind}`}>
                {KIND_SYMBOL[entry.kind]}
              </span>
              <span className="activity-time">{activityTime(entry.at)}</span>
              <span className="activity-verb">{ACTIVITY_VERBS[entry.kind]}</span>
              <span className="activity-name">{entry.item.name}</span>
            </div>
          ))}
        </div>
      ))}

      {!loading && days.length === 0 && (
        <div className="empty">
          <div className="empty-icon">◴</div>
          <div>nothing here yet</div>
        </div>
      )}
    </div>
  );
}
