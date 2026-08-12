import { useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Item } from "../types";
import { useKeyboard } from "../hooks/useKeyboard";
import { useKeybindings } from "../hooks/useKeybindings";
import {
  activityByDay,
  activityDayHeading,
  activityTime,
  ACTIVITY_VERBS,
  ActivityEntry,
} from "../lib/activity";
import { WindowControls } from "../components/WindowControls";

interface HistoryProps {
  items: Item[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onExit: () => void;
  onSettings: () => void;
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
 */
export function History({ items, loading, error, onRefresh, onExit, onSettings }: HistoryProps) {
  const { bindings } = useKeybindings();
  const days = useMemo(() => activityByDay(items), [items]);

  const handleKey = useCallback(
    (key: string, e: KeyboardEvent) => {
      if (e.metaKey && key === "r") { e.preventDefault(); onRefresh(); return; }
      if (key === "Escape" || key === bindings["history"]) { onExit(); return; }
      if (key === bindings["refresh"]) onRefresh();
      else if (key === bindings["settings"]) onSettings();
    },
    [bindings, onRefresh, onExit, onSettings]
  );

  useKeyboard(handleKey);

  return (
    <div className="main" tabIndex={-1}>
      <div className="topbar" data-tauri-drag-region>
        <div className="topbar-left">
          <WindowControls />
        </div>
        <div className="topbar-center" data-tauri-drag-region>
          <span className="brand" data-tauri-drag-region>history</span>
        </div>
        <div className="topbar-right">
          {loading && <span className="syncing topbar-icon">⟳</span>}
          <button className="topbar-icon-btn" title="back" onClick={onExit}>←</button>
          <button className="topbar-icon-btn" title="settings" onClick={() => onSettings()}>⚙</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="task-list">
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

        {!loading && days.length === 0 && !error && (
          <div className="empty">
            <div className="empty-icon">◴</div>
            <div>nothing here yet</div>
            <div className="empty-hint">[esc] back</div>
          </div>
        )}
      </div>
    </div>
  );
}
