import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Item, Config, Source, SyncResult } from "../types";
import { playComplete } from "../lib/sounds";
import { checkDeadlineAlerts } from "../lib/deadlineAlerts";

/** The editable fields of an item — everything except id and status. */
export interface ItemFields {
  name: string;
  start: string | null;
  end: string | null;
  deadline: string | null;
  description: string | null;
  /**
   * Which service a *new* item is created in. Ignored when editing: an item
   * cannot change sides, since its id belongs to the service holding it.
   */
  source?: Source;
  /** Which linked Google account a new calendar event goes to. */
  account_id?: string;
  /** Which calendar a new event goes on. Omitted = the account's first synced one. */
  calendar_id?: string | null;
}

/**
 * The merged list — the Notion database plus, when linked, Notion Calendar.
 * Both views render the same array; only the grouping differs.
 */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** A calendar that failed while the tasks loaded fine. Shown, not fatal. */
  const [calendarWarning, setCalendarWarning] = useState<string | null>(null);
  const toneRef = useRef("bell");

  useEffect(() => {
    invoke<Config>("get_config")
      .then((c) => { if (c?.completion_tone) toneRef.current = c.completion_tone; })
      .catch(() => {});
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SyncResult>("trigger_sync");
      setItems(result.items);
      setCalendarWarning(result.warning);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();

    const unlistenItems = listen<Item[]>("items-updated", (e) => setItems(e.payload));
    const unlistenError = listen<string>("sync-error", (e) => setError(e.payload));
    const unlistenCalendar = listen<string | null>("calendar-warning", (e) =>
      setCalendarWarning(e.payload)
    );

    return () => {
      unlistenItems.then((f) => f());
      unlistenError.then((f) => f());
      unlistenCalendar.then((f) => f());
    };
  }, [loadItems]);

  // Keep a ref current so cycleStatus always sees the latest items
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Runs on every list change — initial load, the 60s sync tick, and any
  // optimistic update — but each item only ever alerts once per calendar
  // day, so this is a no-op lookup on repeat calls, not a repeat notification.
  useEffect(() => { checkDeadlineAlerts(items); }, [items]);

  // Cycles Todo → In Progress → Done → Todo, keeping the item visible
  const cycleStatus = useCallback(async (itemId: string) => {
    const current = itemsRef.current.find((i) => i.id === itemId)?.status;
    if (current === "In Progress") playComplete(toneRef.current);

    // Optimistic update before Notion responds
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const next =
          i.status === "Todo" ? "In Progress" : i.status === "In Progress" ? "Done" : "Todo";
        return {
          ...i,
          status: next,
          last_edited_time: next === "Done" ? new Date().toISOString() : i.last_edited_time,
        };
      })
    );
    try {
      await invoke("cycle_status", { itemId });
    } catch (e) {
      setError(String(e));
      await loadItems(); // revert
    }
  }, [loadItems]);

  const addItem = useCallback(async (fields: ItemFields) => {
    try {
      // Tauri's InvokeArgs wants an index signature; ItemFields stays strict.
      const item = await invoke<Item>("create_item", {
        ...fields,
        source: fields.source ?? "notion",
        accountId: fields.account_id ?? null,
        calendarId: fields.calendar_id ?? null,
      });
      setItems((prev) => [item, ...prev]);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, fields: ItemFields) => {
    // `source`, `account_id` and `calendar_id` are creation-time choices, and
    // splatting them over an existing row would blank the very fields the
    // write routes on.
    const { source: _source, account_id: _account, calendar_id: _calendar, ...edits } = fields;

    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...edits } : i)));
    try {
      await invoke("update_item_cmd", { itemId, ...edits });
    } catch (e) {
      setError(String(e));
      await loadItems();
    }
  }, [loadItems]);

  const deleteItem = useCallback(async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await invoke("delete_item", { itemId });
    } catch (e) {
      setError(String(e));
      await loadItems();
    }
  }, [loadItems]);

  return {
    items, loading, error, calendarWarning,
    cycleStatus, addItem, updateItem, deleteItem,
    refresh: loadItems,
  };
}
