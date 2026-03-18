# todoish
<img width="458" height="614" alt="Screenshot 2026-03-18 at 03 38 21" src="https://github.com/user-attachments/assets/a29a82e9-f604-4f5e-8af4-625baacad97f" />
<img width="456" height="615" alt="Screenshot 2026-03-18 at 03 39 11" src="https://github.com/user-attachments/assets/621c4e41-d7d8-4b5d-9e46-160e1b6bed73" />


A lightweight Notion todoish. Tasks sync from your Notion database.

---

## install

Download from [Releases](https://github.com/lovelydyna/todoish/releases)

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
