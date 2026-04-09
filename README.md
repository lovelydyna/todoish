# todoish
<img width="534" height="649" alt="Screenshot 2026-04-09 at 13 51 45" src="https://github.com/user-attachments/assets/b5a2b7ad-e840-4860-9e14-0c6f6669ff04" />
<img width="504" height="608" alt="Screenshot 2026-04-09 at 13 52 37" src="https://github.com/user-attachments/assets/7e29ef90-44d2-4379-b065-a16c4c6663ac" />
<img width="472" height="583" alt="Screenshot 2026-04-09 at 13 52 21" src="https://github.com/user-attachments/assets/90058ff2-179d-46cd-a487-5df419c5ef0e" />




A lightweight Notion todo app that lives on your desktop. Tasks sync from your Notion database and surface in a minimal terminal-style window grouped by urgency — NOW, NEXT, LATER.

---

## install

1. Download **Todoish-macOS-arm64.zip** from [Releases](https://github.com/lovelydyna/todoish/releases)
2. Unzip and drag **Todoish.app** to your Applications folder
3. Open Terminal and run:
   ```bash
   xattr -cr /Applications/Todoish.app
   ```
4. Launch Todoish normally

> The `xattr` command removes the macOS quarantine flag. This is a one-time step required for apps not distributed through the Mac App Store.

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
