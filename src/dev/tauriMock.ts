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
  enabled_data_sources: [],
  schema_overrides: {},
  completion_tone: "bell",
  startup_position: "",
  global_shortcut: "CmdOrControl+Shift+T",
  theme: "midnight",
  color_mode: "dark",
  window_opacity: 0.82,
  always_on_top: false,
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
  data_source_id: "demo-data-source",
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
];

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
    filename: "research/grant-app-notes.md",
    content: "grant app notes\n\n- budget justification needs the equipment quote from last month\n- ask supervisor about the timeline section",
    modified: Date.now() - 26 * 60 * 60 * 1000,
  },
];

/** Folders, by path relative to the notes root. */
const noteDirs = new Set<string>(["research", "research/papers", "personal"]);

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Mirrors the backend's collision handling: a name already in use gets a
 *  numeric suffix rather than overwriting. */
function uniqueNoteFilename(name: string, dir: string): string {
  const base = name.trim().replace(/[/\\]/g, "-").slice(0, 120) || "untitled";
  let filename = join(dir, `${base}.md`);
  let attempt = 2;
  while (notes.some((n) => n.filename === filename)) {
    filename = join(dir, `${base}-${attempt}.md`);
    attempt += 1;
  }
  return filename;
}

type Args = Record<string, any>;

/** Two demo databases, so the settings picker/override UI has something
 *  real to show — one fully matched, one missing most roles. */
const demoDataSources = [
  {
    data_source_id: "ds-demo1",
    database_title: "Todoish",
    properties: [
      { name: "Name", kind: "title" },
      { name: "Status", kind: "status" },
      { name: "Date", kind: "date" },
      { name: "Deadline", kind: "date" },
      { name: "Description", kind: "rich_text" },
      { name: "Priority", kind: "select" },
    ],
    auto: { status: "Status", time: "Date", deadline: "Deadline", description: "Description" },
    statusOptions: ["Not started", "In progress", "Done"],
  },
  {
    data_source_id: "ds-demo2",
    database_title: "Reading list",
    properties: [
      { name: "Name", kind: "title" },
      { name: "Status", kind: "status" },
      { name: "Author", kind: "rich_text" },
    ],
    auto: { status: "Status", time: null, deadline: null, description: null },
    statusOptions: ["To read", "Reading", "Finished"],
  },
];

const handlers: Record<string, (args: Args) => unknown> = {
  get_config: () => config,
  describe_schemas: (args) => {
    const overrides = args.schemaOverrides ?? {};
    return demoDataSources.map((db) => {
      const over = overrides[db.data_source_id] ?? {};
      const effective = {
        status: over.status ?? db.auto.status,
        time: over.time ?? db.auto.time,
        deadline: over.deadline ?? db.auto.deadline,
        description: over.description ?? db.auto.description,
      };
      const missing = (["status", "time", "deadline", "description"] as const).filter(
        (role) => !effective[role]
      );
      return {
        data_source_id: db.data_source_id,
        database_title: db.database_title,
        title: "Name",
        status: effective.status,
        status_options: effective.status ? db.statusOptions : [],
        time: effective.time,
        deadline: effective.deadline,
        description: effective.description,
        missing,
        properties: db.properties,
      };
    });
  },
  // Kept in memory so settings round-trip in the browser — saving and
  // reopening settings shows what you chose, as it would in the app.
  save_config_cmd: (args) => {
    config = {
      ...config,
      notion_api_key: args.apiKey ?? config.notion_api_key,
      enabled_data_sources: args.enabledDataSources ?? config.enabled_data_sources,
      schema_overrides: args.schemaOverrides ?? config.schema_overrides,
      completion_tone: args.completionTone ?? config.completion_tone,
      startup_position: args.startupPosition ?? config.startup_position,
      global_shortcut: args.globalShortcut ?? config.global_shortcut,
      theme: args.theme ?? config.theme,
      color_mode: args.colorMode ?? config.color_mode,
      window_opacity: args.windowOpacity ?? config.window_opacity,
      always_on_top: args.alwaysOnTop ?? config.always_on_top,
    };
    return null;
  },

  trigger_sync: () => items,
  get_items: () => items,

  set_status: ({ itemId, status }) => {
    const found = items.find((i) => i.id === itemId);
    if (!found) throw "That item is no longer in the list — try refreshing.";
    found.status = status;
    found.last_edited_time = new Date().toISOString();
  },
  create_item: (args) => {
    const created = item(`i${Date.now()}`, args.name, {
      start: args.start ?? null,
      end: args.end ?? null,
      deadline: args.deadline ?? null,
      description: args.description ?? null,
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

  get_autostart: () => false,
  set_autostart: () => null,
  quit_app: () => null,

  save_note: ({ name, content, dir }) => {
    const filename = uniqueNoteFilename(name, dir ?? "");
    notes.push({ filename, content: content ?? "", modified: Date.now() });
    return filename;
  },
  make_note_dir: ({ path }) => {
    const parts = String(path).split("/").filter(Boolean);
    parts.forEach((_, i) => noteDirs.add(parts.slice(0, i + 1).join("/")));
    return parts.join("/");
  },
  list_notes: ({ dir = "" } = {}) => [
    ...[...noteDirs]
      .filter((d) => parentOf(d) === dir)
      .sort()
      .map((d) => ({
        filename: d, title: d.split("/").pop(), modified: 0, preview: "", is_dir: true,
      })),
    ...notes
      .filter((n) => parentOf(n.filename) === dir)
      .sort((a, b) => b.modified - a.modified)
      .map((n) => ({
        filename: n.filename,
        title: n.filename.split("/").pop()!.replace(/\.md$/, ""),
        modified: Math.floor(n.modified / 1000),
        preview: n.content.split("\n").find((l) => l.trim())?.trim().slice(0, 140) ?? "",
        is_dir: false,
      })),
  ],
  read_note: ({ filename }) => notes.find((n) => n.filename === filename)?.content ?? "",
  update_note: ({ filename, content }) => {
    const note = notes.find((n) => n.filename === filename);
    if (note) { note.content = content; note.modified = Date.now(); }
    return null;
  },
  delete_note: ({ filename }) => {
    if (noteDirs.has(filename)) {
      const busy = notes.some((n) => n.filename.startsWith(`${filename}/`))
        || [...noteDirs].some((d) => d.startsWith(`${filename}/`));
      if (busy) throw "That folder isn't empty — delete its notes first.";
      noteDirs.delete(filename);
      return null;
    }
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
      // A handler that throws becomes a rejected promise, like a backend Err.
      return new Promise((resolve) => resolve(handler(args)));
    },
  };

  // The event plugin reaches for this directly when a listener is torn down.
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => Promise.resolve() };

  console.info("[tauri-mock] running with demo data — no Notion connection");
}
