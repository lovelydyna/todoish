# todoish

A lightweight Notion todo app that lives on your desktop. Tasks sync from your Notion database and surface in a minimal terminal-style window grouped by urgency — NOW, NEXT, LATER.

---

## install

Download the latest `.dmg` from [Releases](https://github.com/lovelydyna/todoish/releases), open it, and drag Todoish to Applications.

> **macOS note:** The app is ad-hoc signed but not notarized. On first launch, right-click → Open to bypass Gatekeeper. Or run:
> ```
> xattr -cr /Applications/Todoish.app
> ```

On first launch you'll be prompted for a Notion API key and database ID.

---

## notion setup

**1. Create an integration**
notion.so → Settings → Connections → Develop or manage integrations → New integration → copy the secret key

**2. Create a database** with these properties:

| Property | Type | Options |
|---|---|---|
| Name | Title | |
| Status | Select | `Todo` · `In Progress` · `Done` · `Snoozed` |
| Due | Date | include time |
| Priority | Select | `High` · `Medium` · `Low` |
| Energy | Select | `High` · `Low` · `Quick` |
| Snooze Until | Date | include time |

**3. Connect your integration** to the database (··· menu → Connections)

**4. Copy the database ID** from the URL: `notion.so/{workspace}/{database_id}?v=...`

---

## keybindings

| key | action |
|---|---|
| `j / ↓` | move down |
| `k / ↑` | move up |
| `space` | cycle status |
| `n` | add task |
| `s` | snooze |
| `f` | focus mode |
| `e` | edit task (in focus mode) |
| `d` | delete task |
| `u` | undo delete |
| `r` | refresh |
| `,` | settings |
| `?` | help |

---

## build from source

```bash
git clone https://github.com/lovelydyna/todoish.git
cd todoish
npm install
npm run tauri build
```

Requires [Rust](https://rustup.rs) and [Node.js](https://nodejs.org) 18+.
