# todoish
<img width="534" height="649" alt="Screenshot 2026-04-09 at 13 51 45" src="https://github.com/user-attachments/assets/b5a2b7ad-e840-4860-9e14-0c6f6669ff04" />
<img width="504" height="608" alt="Screenshot 2026-04-09 at 13 52 37" src="https://github.com/user-attachments/assets/7e29ef90-44d2-4379-b065-a16c4c6663ac" />
<img width="472" height="583" alt="Screenshot 2026-04-09 at 13 52 21" src="https://github.com/user-attachments/assets/90058ff2-179d-46cd-a487-5df419c5ef0e" />




A lightweight Notion todo app that lives on your desktop. Tasks sync from your Notion database and surface in a minimal terminal-style window grouped by urgency — NOW, THIS WEEK, NEXT WEEK, LATER — with a calendar view for what's scheduled.

---

## demo

<!--
  Record a walkthrough with QuickTime Player (File → New Screen Recording) or
  ⌘⇧5, upload it to this repo's GitHub issue/PR/release comments to get a
  CDN URL, then embed it here, e.g.:

    https://github.com/user-attachments/assets/<your-video-id>

  GitHub renders that URL as an inline player automatically — no extra markup
  needed, same as the screenshots above.
-->

---

## install

1. Download **Todoish.dmg** from [Releases](https://github.com/lovelydyna/todoish/releases)
2. Open the DMG and drag **Todoish.app** to your Applications folder
3. Open Terminal and run:
   ```bash
   xattr -cr /Applications/Todoish.app
   ```
4. Launch Todoish normally

> The `xattr` command removes the macOS quarantine flag. This is a one-time step required for apps not distributed through the Mac App Store or signed with a paid Apple Developer certificate.

On first launch you'll be prompted for a Notion connection token and database id — see [notion setup](#notion-setup) below.

---

## notion setup

**1. Create a connection**
Notion developer portal → New connection → **Configuration** tab → copy the
*internal connection token*. (Not the personal access token — that one is
user-scoped and meant for a different job.)

**2. Create one database** with exactly these five properties:

| Property | Type | Notes |
|---|---|---|
| Name | Title | what it is |
| Status | Status | `Todo` · `In Progress` · `Done` |
| Time | Date | when it happens — include time; ranges supported |
| Deadline | Date | when it must be finished by |
| Description | Text | free-form notes |

**3. Connect your integration** to the database (··· menu → Connections)

**4. Copy the ID.** Either the one in the database URL
(`notion.so/{workspace}/{id}?v=...`) or ··· → **Manage data sources** → **Copy
data source ID**. Todoish accepts either and resolves it — Notion's 2025-09-03
API addresses a *data source* rather than a database, and the app looks up the
data source for you when you paste a database id.

---

## two views, one database

The same rows are read two ways. Press `c` to switch.

**Task list** groups by *when you must act* — deadline first, falling back to
the scheduled time — into NOW, THIS WEEK, NEXT WEEK, LATER and DONE, split on
the real Sunday-start week boundary rather than a fixed day count. Rows show a
date (`today`, `Thu`, `Aug 20`), not a clock time — the calendar is where the
time of day matters.

**Calendar** groups by *when it happens* — scheduled time first, falling back to
the deadline:

- **TODAY** and **TOMORROW**, then one dated section per day for the next five days
- a **week strip** across the top; click any day to filter to it
- press `m` for an **Itsycal-style month grid** — today ringed, a dot on every
  day with something on it, `←`/`→` to page between months, click a day to filter
- `esc` peels back one layer at a time: day filter → month view → task list

Rows show `status · time · name · deadline`. `space` cycles status, `x` expands
the description inline (same behaviour in both views), `n` or the `+` button
adds, `e` edits, `d` deletes, right-click opens it in Notion.

Time input accepts `today 3pm`, `tmrw 9:00-10:30`, `2026-08-15 14:00`, or a bare
`2026-08-15` for an all-day item.

Design rationale: [docs/adr/0001](docs/adr/0001-one-notion-database.md).

---

## appearance

**settings → appearance** has a light / dark / **auto** switch — auto follows your
system setting and repaints when the OS flips. Each of the four themes
(midnight, ember, forest, mono) ships a light and a dark palette, and the
opacity slider controls how much desktop shows through the blur.

---

## keybindings

| key | action |
|---|---|
| `j / ↓` | move down |
| `k / ↑` | move up |
| `space` | cycle status |
| `n` | add item |
| `T` | jump to today |
| `c` | calendar (toggle) |
| `m` | month view (in calendar) |
| `x` | expand description |
| `h` | history |
| `←` `→` | previous / next week or month |
| `e` | edit |
| `d` | delete |
| `u` | undo delete |
| `D` | toggle done archive |
| `r` | refresh |
| `,` | settings |
| `?` | keybindings |

---

## build from source

```bash
git clone https://github.com/lovelydyna/todoish.git
cd todoish
npm install
npm run tauri build
```

Requires [Rust](https://rustup.rs) and [Node.js](https://nodejs.org) 18+.
