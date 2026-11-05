import { Item } from "../types";

/** Todo → In Progress → Done → Todo. */
export function nextStatus(status: string): string {
  return status === "Todo" ? "In Progress" : status === "In Progress" ? "Done" : "Todo";
}

/**
 * Lays statuses the user just set over a freshly fetched list, so a sync that
 * read Notion before the write landed can't flip them back on screen.
 */
export function withPending(items: Item[], pending: ReadonlyMap<string, string>): Item[] {
  if (pending.size === 0) return items;
  return items.map((i) => {
    const status = pending.get(i.id);
    return status && status !== i.status ? { ...i, status } : i;
  });
}
