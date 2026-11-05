import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Item, Config } from "../types";
import { playComplete } from "../lib/sounds";
import { checkDeadlineAlerts } from "../lib/deadlineAlerts";
import { nextStatus, withPending } from "../lib/statusSync";

/** The editable fields of an item — everything except id and status. */
export interface ItemFields {
  name: string;
  start: string | null;
  end: string | null;
  deadline: string | null;
  description: string | null;
}

/**
 * The merged list of every task and event, pulled from the Notion database.
 * Both views render the same array; only the grouping differs.
 */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toneRef = useRef("bell");
  // Statuses set here but not yet confirmed by a sync, and the queue that
  // sends them to Notion one at a time, in click order.
  const pendingRef = useRef(new Map<string, string>());
  const writesRef = useRef(Promise.resolve());

  const receive = useCallback(
    (fresh: Item[]) => setItems(withPending(fresh, pendingRef.current)),
    []
  );

  useEffect(() => {
    invoke<Config>("get_config")
      .then((c) => { if (c?.completion_tone) toneRef.current = c.completion_tone; })
      .catch(() => {});
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      receive(await invoke<Item[]>("trigger_sync"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [receive]);

  useEffect(() => {
    loadItems();

    const unlistenItems = listen<Item[]>("items-updated", (e) => receive(e.payload));
    const unlistenError = listen<string>("sync-error", (e) => setError(e.payload));

    return () => {
      unlistenItems.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [loadItems, receive]);

  // Keep a ref current so cycleStatus always sees the latest items
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Runs on every list change — initial load, the 60s sync tick, and any
  // optimistic update — but each item only ever alerts once per calendar
  // day, so this is a no-op lookup on repeat calls, not a repeat notification.
  useEffect(() => { checkDeadlineAlerts(items); }, [items]);

  // Cycles Todo → In Progress → Done → Todo, keeping the item visible. The
  // status shown is the one sent, so fast clicks can't leave Notion behind.
  const cycleStatus = useCallback((itemId: string) => {
    const item = itemsRef.current.find((i) => i.id === itemId);
    if (!item) return;
    const next = nextStatus(pendingRef.current.get(itemId) ?? item.status);
    if (next === "Done") playComplete(toneRef.current);

    pendingRef.current.set(itemId, next);
    setItems((prev) =>
      prev.map((i) =>
        i.id !== itemId ? i : {
          ...i,
          status: next,
          last_edited_time: next === "Done" ? new Date().toISOString() : i.last_edited_time,
        }
      )
    );

    const settle = () => {
      if (pendingRef.current.get(itemId) === next) pendingRef.current.delete(itemId);
    };
    writesRef.current = writesRef.current.then(async () => {
      try {
        await invoke("set_status", { itemId, status: next });
        // shortcut: a fixed 5s guard against a query that still returns the
        // pre-write value; tie it to the next sync if 5s ever proves too short.
        setTimeout(settle, 5000);
      } catch (e) {
        settle();
        setError(String(e));
        await loadItems(); // revert
      }
    });
  }, [loadItems]);

  const addItem = useCallback(async (fields: ItemFields) => {
    try {
      // Tauri's InvokeArgs wants an index signature; ItemFields stays strict.
      const item = await invoke<Item>("create_item", { ...fields });
      setItems((prev) => [item, ...prev]);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, fields: ItemFields) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...fields } : i)));
    try {
      await invoke("update_item_cmd", { itemId, ...fields });
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
    items, loading, error,
    cycleStatus, addItem, updateItem, deleteItem,
    refresh: loadItems,
  };
}
