/**
 * Native OS notifications for deadlines. A Notion deadline has no time of
 * day — it's just a date — so "the alert fires" really means "today is the
 * day", checked whenever the item list refreshes rather than at some precise
 * instant.
 *
 * Each item is only ever notified once per day it's due: a note in
 * localStorage remembers the last date a given item alerted, and the key is
 * the date itself, so a new day naturally allows a new notification without
 * any cleanup step.
 */

import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { Item } from "../types";

const STORAGE_KEY = "todoish:notified-deadlines";

function todayISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function loadNotified(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveNotified(map: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

let permissionAsked = false;

/** Asks once per session, not once per check — the OS prompt is disruptive
 *  enough without repeating it on every sync tick while it's pending. */
async function ensurePermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  if (permissionAsked) return false;
  permissionAsked = true;
  return (await requestPermission()) === "granted";
}

/**
 * Fires a notification for every item whose deadline is today and hasn't
 * already alerted today. Safe to call on every sync — already-notified items
 * are a no-op lookup, not a re-send.
 */
export async function checkDeadlineAlerts(items: Item[]): Promise<void> {
  const today = todayISODate();
  const due = items.filter((i) => i.status !== "Done" && i.deadline === today);
  if (due.length === 0) return;

  const notified = loadNotified();
  const unnotified = due.filter((i) => notified[i.id] !== today);
  if (unnotified.length === 0) return;

  if (!(await ensurePermission())) return;

  for (const item of unnotified) {
    sendNotification({ title: "due today", body: item.name });
    notified[item.id] = today;
  }
  saveNotified(notified);
}
