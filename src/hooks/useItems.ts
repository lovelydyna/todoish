import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Item, Config } from "../types";
import { playComplete } from "../lib/sounds";

/** The editable fields of an item — everything except id and status. */
export interface ItemFields {
  name: string;
  start: string | null;
  end: string | null;
  deadline: string | null;
  description: string | null;
}

/**
 * The single Notion database, shared by the task list and the calendar.
 * Both views render the same array; only the grouping differs.
 */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setItems(await invoke<Item[]>("trigger_sync"));
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

    return () => {
      unlistenItems.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [loadItems]);

  // Keep a ref current so cycleStatus always sees the latest items
  useEffect(() => { itemsRef.current = items; }, [items]);

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
