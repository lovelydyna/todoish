/**
 * Browser-only stand-in for the Tauri runtime, so `npm run dev` can render the
 * UI without a Rust build or a Notion key. Installed by main.tsx in dev builds
 * only, and only when the real runtime is absent — inside the Tauri window this
 * file does nothing.
 *
 * Mutations are held in memory: they show up in the UI and vanish on reload.
 */

import { Item, Config } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");

const day = (offset: number, time?: string): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (!time) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
};

let config: Config = {
  notion_api_key: "secret_demo",
  database_id: "demo-database",
  completion_tone: "bell",
  startup_position: "",
  global_shortcut: "CmdOrControl+Shift+T",
  theme: "midnight",
  color_mode: "dark",
  window_opacity: 0.82,
};

/** Hours ago, as an ISO instant — for seeding plausible history timestamps. */
const ago = (hours: number): string =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const item = (id: string, name: string, fields: Partial<Item> = {}): Item => ({
  id,
  name,
  status: "Todo",
  start: null,
  end: null,
  deadline: null,
  description: null,
  source: "notion",
  calendar_id: null,
  account_id: null,
  url: null,
  created_time: null,
  last_edited_time: null,
  ...fields,
});

let items: Item[] = [
  item("i1", "lab meeting", {
    created_time: ago(50), last_edited_time: ago(50),
    start: day(0, "10:00"), end: day(0, "11:00"),
    description: "present the pilot data — 10 min slot",
  }),
  item("i2", "reply to supervisor email", {
    created_time: ago(27), last_edited_time: ago(2),
    deadline: day(0), status: "In Progress",
    description: "about the conference abstract",
  }),
  item("i3", "coffee with Priya", { created_time: ago(5), start: day(0, "15:30") }),
  item("i4", "finish methods section", {
    created_time: ago(96), last_edited_time: ago(1),
    deadline: day(0), description: "three paragraphs left",
  }),
  item("i5", "stats seminar", {
    created_time: ago(72), start: day(1, "09:00"), end: day(1, "10:30"),
    description: "guest speaker on hierarchical models",
  }),
  item("i6", "book flights for conference", { created_time: ago(30), deadline: day(2) }),
  item("i7", "office hours", { start: day(3, "13:00"), end: day(3, "15:00") }),
  item("i8", "grant application", {
    created_time: ago(200), last_edited_time: ago(26),
    deadline: day(4), description: "two pages, plus budget justification",
  }),
  item("i9", "department retreat", { start: day(6), description: "all day, off campus" }),
  item("i10", "renew library books", { deadline: day(9) }),
  item("i11", "abstract submission", {
    start: day(12, "23:59"), deadline: day(-1),
    description: "deadline already passed — shows in red",
  }),
  item("i12", "read Kandel chapter 4", { created_time: ago(8) }),
  item("i13", "submit expense report", {
    status: "Done", deadline: day(-1),
    created_time: ago(120), last_edited_time: ago(3),
  }),

  // Rows that came from linked Notion Calendar accounts rather than the
  // database — two accounts, to exercise the multi-account picker.
  item("g:acct-work:primary:c1", "supervisor 1:1", {
    source: "google", calendar_id: "primary", account_id: "acct-work",
    url: "https://calendar.google.com/event?eid=demo1",
    start: day(0, "14:00"), end: day(0, "14:30"),
  }),
  item("g:acct-work:primary:c2", "MRI scan slot", {
    source: "google", calendar_id: "primary", account_id: "acct-work",
    url: "https://calendar.google.com/event?eid=demo2",
    start: day(1, "11:00"), end: day(1, "13:00"),
    description: "bring the participant consent forms",
  }),
  item("g:acct-work:primary:c3", "journal club", {
    source: "google", calendar_id: "primary", account_id: "acct-work",
    url: "https://calendar.google.com/event?eid=demo3",
    start: day(2, "16:00"), end: day(2, "17:00"),
  }),
  item("g:acct-personal:primary:c4", "dentist", {
    source: "google", calendar_id: "primary", account_id: "acct-personal",
    url: "https://calendar.google.com/event?eid=demo4",
    start: day(3, "09:30"), end: day(3, "10:15"),
  }),
];

/** The demo runs with two calendar accounts linked, so the merged list —
 *  and the multi-account settings and picker — are what you see. */
let accounts = [
  {
    id: "acct-work",
    client_id: "demo.apps.googleusercontent.com",
    has_client_secret: true,
    account: "demo.work@ualberta.ca",
    calendars: [{ id: "primary", name: "School" }],
    default: true,
  },
  {
    id: "acct-personal",
    client_id: "demo.apps.googleusercontent.com",
    has_client_secret: true,
    account: "demo.personal@gmail.com",
    calendars: [{ id: "primary", name: "Personal" }],
    default: false,
  },
];

interface DemoCalendar {
  id: string;
  name: string;
  primary: boolean;
  writable: boolean;
}

const demoCalendarsByAccount: Record<string, DemoCalendar[]> = {
  "acct-work": [
    { id: "primary", name: "School", primary: true, writable: true },
    { id: "lab@group.calendar.google.com", name: "lab bookings", primary: false, writable: true },
    { id: "dept@group.calendar.google.com", name: "department seminars", primary: false, writable: false },
  ],
  "acct-personal": [
    { id: "primary", name: "Personal", primary: true, writable: true },
  ],
};

interface DemoNote {
  filename: string;
  content: string;
  /** Epoch ms — matches Date.now(), converted to seconds for list_notes to
   *  mirror the backend's Unix-seconds NoteSummary.modified. */
  modified: number;
}

let notes: DemoNote[] = [
  {
    filename: "idea-widget-for-weekly-review.md",
    content: "idea: widget for weekly review\n\nsurface last week's Done items grouped by day, maybe with a streak count.",
    modified: Date.now() - 2 * 60 * 60 * 1000,
  },
  {
    filename: "grant-app-notes.md",
    content: "grant app notes\n\n- budget justification needs the equipment quote from last month\n- ask supervisor about the timeline section",
    modified: Date.now() - 26 * 60 * 60 * 1000,
  },
];

/** Mirrors the backend's collision handling: a name already in use gets a
 *  numeric suffix rather than overwriting. */
function uniqueNoteFilename(name: string): string {
  const base = name.trim().replace(/[/\\]/g, "-").slice(0, 120) || "untitled";
  let filename = `${base}.md`;
  let attempt = 2;
  while (notes.some((n) => n.filename === filename)) {
    filename = `${base}-${attempt}.md`;
    attempt += 1;
  }
  return filename;
}

type Args = Record<string, any>;

const handlers: Record<string, (args: Args) => unknown> = {
  get_config: () => config,
  // Kept in memory so settings round-trip in the browser — saving and
  // reopening settings shows what you chose, as it would in the app.
  save_config_cmd: (args) => {
    config = {
      ...config,
      notion_api_key: args.apiKey ?? config.notion_api_key,
      database_id: args.databaseId ?? config.database_id,
      completion_tone: args.completionTone ?? config.completion_tone,
      startup_position: args.startupPosition ?? config.startup_position,
      global_shortcut: args.globalShortcut ?? config.global_shortcut,
      theme: args.theme ?? config.theme,
      color_mode: args.colorMode ?? config.color_mode,
      window_opacity: args.windowOpacity ?? config.window_opacity,
    };
    return null;
  },

  trigger_sync: () => ({ items, warning: null }),
  get_items: () => items,

  cycle_status: ({ itemId }) => {
    const found = items.find((i) => i.id === itemId);
    if (!found) return "Todo";
    found.status =
      found.status === "Todo" ? "In Progress" : found.status === "In Progress" ? "Done" : "Todo";
    found.last_edited_time = new Date().toISOString();
    return found.status;
  },
  create_item: (args) => {
    const toCalendar = args.source === "google";
    const accountId = args.accountId ?? accounts[0]?.id ?? "acct-work";
    const calendarId = args.calendarId ?? "primary";
    const id = toCalendar
      ? `g:${accountId}:${calendarId}:c${Date.now()}`
      : `i${Date.now()}`;
    const created = item(id, args.name, {
      start: args.start ?? null,
      end: args.end ?? null,
      deadline: args.deadline ?? null,
      description: args.description ?? null,
      source: toCalendar ? "google" : "notion",
      calendar_id: toCalendar ? calendarId : null,
      account_id: toCalendar ? accountId : null,
      created_time: new Date().toISOString(),
    });
    items = [created, ...items];
    return created;
  },
  update_item_cmd: ({ itemId, ...fields }) => {
    items = items.map((i) =>
      i.id === itemId ? { ...i, ...fields, last_edited_time: new Date().toISOString() } : i
    );
    return null;
  },
  delete_item: ({ itemId }) => {
    items = items.filter((i) => i.id !== itemId);
    return null;
  },

  open_in_notion: () => null,

  calendar_accounts: () => accounts,
  list_calendars: ({ accountId }) => demoCalendarsByAccount[accountId] ?? [],
  connect_calendar: ({ clientId }) => {
    const id = `acct-demo${Date.now()}`;
    accounts = [
      ...accounts,
      {
        id,
        client_id: clientId,
        has_client_secret: true,
        account: `demo${accounts.length + 1}@example.com`,
        calendars: [],
        default: accounts.length === 0,
      },
    ];
    demoCalendarsByAccount[id] = [
      { id: "primary", name: `demo${accounts.length}@example.com`, primary: true, writable: true },
    ];
    return accounts;
  },
  disconnect_calendar: ({ accountId }) => {
    const wasDefault = accounts.find((a) => a.id === accountId)?.default ?? false;
    accounts = accounts.filter((a) => a.id !== accountId);
    if (wasDefault && accounts[0]) accounts[0].default = true;
    delete demoCalendarsByAccount[accountId];
    items = items.filter((i) => i.account_id !== accountId);
    return null;
  },
  set_default_calendar_account: ({ accountId }) => {
    accounts = accounts.map((a) => ({ ...a, default: a.id === accountId }));
    return null;
  },
  save_calendar_selection: ({ accountId, calendars }) => {
    accounts = accounts.map((a) => (a.id === accountId ? { ...a, calendars } : a));
    return null;
  },
  get_autostart: () => false,
  set_autostart: () => null,
  quit_app: () => null,

  save_note: ({ name, content }) => {
    const filename = uniqueNoteFilename(name);
    notes.push({ filename, content: content ?? "", modified: Date.now() });
    return filename;
  },
  list_notes: () =>
    [...notes]
      .sort((a, b) => b.modified - a.modified)
      .map((n) => ({
        filename: n.filename,
        title: n.filename.replace(/\.md$/, ""),
        modified: Math.floor(n.modified / 1000),
        preview: n.content.split("\n").find((l) => l.trim())?.trim().slice(0, 140) ?? "",
      })),
  read_note: ({ filename }) => notes.find((n) => n.filename === filename)?.content ?? "",
  update_note: ({ filename, content }) => {
    const note = notes.find((n) => n.filename === filename);
    if (note) { note.content = content; note.modified = Date.now(); }
    return null;
  },
  delete_note: ({ filename }) => {
    notes = notes.filter((n) => n.filename !== filename);
    return null;
  },
};

export function installTauriMock(): void {
  const w = window as any;
  if (w.__TAURI_INTERNALS__) return;

  w.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: (cb: Function) => {
      const id = Math.floor(Math.random() * 1e9);
      w[`_${id}`] = cb;
      return id;
    },
    invoke: (cmd: string, args: Args = {}) => {
      // Window and plugin calls are no-ops in the browser.
      if (cmd.startsWith("plugin:")) {
        return Promise.resolve(cmd.endsWith("|listen") ? 0 : null);
      }
      const handler = handlers[cmd];
      if (!handler) {
        console.warn(`[tauri-mock] unhandled command: ${cmd}`);
        return Promise.resolve(null);
      }
      return Promise.resolve(handler(args));
    },
  };

  // The event plugin reaches for this directly when a listener is torn down.
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => Promise.resolve() };

  console.info("[tauri-mock] running with demo data — no Notion connection");
}
