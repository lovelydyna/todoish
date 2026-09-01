import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CalendarAccount, CalendarInfo } from "../types";
import { FieldLabel } from "./InfoTip";

interface CalendarSettingsProps {
  /** Called after a connect, disconnect, or calendar selection change — the
   *  item list otherwise only reflects it on the next periodic sync. */
  onChanged?: () => void;
}

/**
 * The Notion Calendar link — one or more Google accounts.
 *
 * Notion Calendar has no API of its own — it is a client over the Google
 * account(s) you connect to it. todoish talks to those accounts directly, so
 * events sync both ways. More than one account can be linked at once (e.g.
 * work and personal); each keeps its own OAuth client, grant, and calendar
 * selection.
 *
 * This tab saves through its own commands rather than the settings form: a
 * sign-in has to persist the moment it succeeds, or closing the window
 * mid-flow would mean redoing the whole browser round trip.
 */
export function CalendarSettings({ onChanged }: CalendarSettingsProps) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [calendarsByAccount, setCalendarsByAccount] = useState<Record<string, CalendarInfo[]>>({});
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const list = await invoke<CalendarAccount[]>("calendar_accounts");
    setAccounts(list);
    return list;
  }, []);

  const loadCalendarsFor = useCallback(async (accountId: string) => {
    try {
      const list = await invoke<CalendarInfo[]>("list_calendars", { accountId });
      setCalendarsByAccount((prev) => ({ ...prev, [accountId]: list }));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadAccounts()
      .then((list) => Promise.all(list.map((a) => loadCalendarsFor(a.id))))
      .catch((e) => setError(String(e)));
  }, [loadAccounts, loadCalendarsFor]);

  const connect = async () => {
    setError(null);
    setNote(null);
    setConnecting(true);
    try {
      const list = await invoke<CalendarAccount[]>("connect_calendar", {
        clientId: clientId.trim(),
        clientSecret,
      });
      setAccounts(list);
      const added = list[list.length - 1];
      if (added) await loadCalendarsFor(added.id);
      setAdding(false);
      setClientSecret("");
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async (accountId: string) => {
    setError(null);
    try {
      await invoke("disconnect_calendar", { accountId });
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      setCalendarsByAccount((prev) => {
        const { [accountId]: _removed, ...rest } = prev;
        return rest;
      });
      onChanged?.();
    } catch (e) {
      setError(String(e));
    }
  };

  const makeDefault = async (accountId: string) => {
    setError(null);
    setAccounts((prev) => prev.map((a) => ({ ...a, default: a.id === accountId })));
    try {
      await invoke("set_default_calendar_account", { accountId });
      onChanged?.();
    } catch (e) {
      setError(String(e));
    }
  };

  /** An empty selection means that account's own calendar. Names travel with
   *  ids from the fetched calendar list, so the item editor's destination
   *  picker can label itself without a network round trip of its own. */
  const toggleCalendar = async (account: CalendarAccount, calendar: CalendarInfo) => {
    const already = account.calendars.some((c) => c.id === calendar.id);
    const next = already
      ? account.calendars.filter((c) => c.id !== calendar.id)
      : [...account.calendars, { id: calendar.id, name: calendar.name }];

    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, calendars: next } : a))
    );
    try {
      await invoke("save_calendar_selection", { accountId: account.id, calendars: next });
      setNote("saved");
      onChanged?.();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <>
      <div className="field">
        <FieldLabel info="Notion Calendar has no API of its own — it is a client over the Google account(s) you connect to it. todoish talks to those accounts directly, so events sync both ways. Link more than one account (work, personal, …) at once.">
          notion calendar
        </FieldLabel>

        {accounts.length === 0 && !adding && (
          <div className="calendar-account">
            <span className="calendar-account-mail">not connected</span>
            <span className="calendar-account-state">sign in below</span>
          </div>
        )}

        {accounts.map((account) => (
          <div key={account.id} className="calendar-account-block">
            <div className="calendar-account">
              <span className="calendar-account-mail">
                {account.account || "connected"}
                {account.default && <span className="calendar-account-default">default</span>}
              </span>
              <span className="calendar-account-actions">
                {!account.default && accounts.length > 1 && (
                  <button
                    type="button"
                    className="toggle-btn"
                    onClick={() => makeDefault(account.id)}
                  >
                    make default
                  </button>
                )}
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => disconnect(account.id)}
                >
                  disconnect
                </button>
              </span>
            </div>
            <div className="calendar-list">
              {(calendarsByAccount[account.id] ?? []).length === 0 && (
                <span className="calendar-choice-note">no calendars found</span>
              )}
              {(calendarsByAccount[account.id] ?? []).map((calendar) => (
                <label
                  key={calendar.id}
                  className={`calendar-choice${
                    calendar.writable ? "" : " calendar-choice--readonly"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={account.calendars.some((c) => c.id === calendar.id)}
                    onChange={() => toggleCalendar(account, calendar)}
                  />
                  <span>{calendar.name}</span>
                  {calendar.primary && <span className="calendar-choice-note">primary</span>}
                  {!calendar.writable && (
                    <span className="calendar-choice-note">read-only</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}

        {!adding && (
          <button
            type="button"
            className="calendar-add-account-btn"
            onClick={() => setAdding(true)}
          >
            + {accounts.length === 0 ? "connect a calendar" : "connect another account"}
          </button>
        )}

        {adding && (
          <div className="calendar-account-block">
            <div className="field">
              <FieldLabel info="An OAuth client belongs to whoever runs the app, so todoish cannot ship one. In Google Cloud: create a project, enable the Google Calendar API, then create an OAuth client of type Desktop app and paste its id here. The same client works for signing in more than one Google account.">
                oauth client id
              </FieldLabel>
              <input
                className="field-input"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="....apps.googleusercontent.com"
                spellCheck={false}
                autoFocus
              />
            </div>

            <div className="field">
              <FieldLabel info="Google issues a secret for Desktop clients. It is stored in ~/.todoish/config.toml, which is owner-only. Leave blank if your client type does not have one.">
                oauth client secret
              </FieldLabel>
              <input
                className="field-input"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="optional"
              />
            </div>

            <div className="calendar-add-actions">
              <button
                type="button"
                className="setup-submit"
                onClick={connect}
                disabled={connecting || !clientId.trim()}
              >
                {connecting ? "waiting for the browser…" : "connect"}
              </button>
              <button
                type="button"
                className="toggle-btn"
                onClick={() => { setAdding(false); setClientId(""); setClientSecret(""); }}
                disabled={connecting}
              >
                cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {note && <div className="setup-saved">{note}</div>}
      {error && <div className="setup-error">{error}</div>}
    </>
  );
}
