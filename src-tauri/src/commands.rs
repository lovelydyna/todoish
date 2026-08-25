use crate::config::{load_config, new_account_id, save_config, Config, GoogleAccount, SyncedCalendar};
use crate::gcal;
use crate::merge::{self, SyncResult};
use crate::notion::{self, Item, SOURCE_GOOGLE};
use std::sync::Mutex;
use tauri::State;

/// The row behind an id, or a clear error if the cache has moved on.
///
/// Every write routes on the cached row's `source`, so the frontend never has
/// to tell the backend which service an item belongs to — it cannot get that
/// wrong, and a stale id fails here rather than as a 404 from the wrong API.
fn cached(cache: &State<'_, ItemCache>, item_id: &str) -> Result<Item, String> {
    cache
        .0
        .lock()
        .expect("item cache poisoned")
        .iter()
        .find(|i| i.id == item_id)
        .cloned()
        .ok_or_else(|| "That item is no longer in the list — try refreshing.".to_string())
}

pub struct ItemCache(pub Mutex<Vec<Item>>);

/// The frontend reads calendar state through `calendar_accounts`, which masks
/// secrets — never through here, so `google_accounts` (client secrets and
/// refresh tokens included) is stripped before this crosses into the WebView.
#[tauri::command]
pub async fn get_config() -> Option<Config> {
    load_config().map(|mut c| {
        c.google_accounts.clear();
        c
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_config_cmd(
    api_key: String,
    database_id: String,
    completion_tone: String,
    startup_position: String,
    global_shortcut: String,
    theme: String,
    color_mode: String,
    window_opacity: f64,
) -> Result<(), String> {
    notion::forget_sources();
    // The calendar link is not on this form. Reading the stored config back
    // and carrying those fields over keeps saving an unrelated setting from
    // signing the user out of Google.
    let google_accounts = load_config().map(|c| c.google_accounts).unwrap_or_default();
    save_config(&Config {
        notion_api_key: api_key,
        database_id,
        completion_tone,
        startup_position,
        global_shortcut,
        theme,
        color_mode,
        window_opacity,
        google_accounts,
        ..Default::default()
    })
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }
}

/// Checks a database and reports which property the app matched to each role.
#[tauri::command]
pub async fn describe_schema(
    api_key: String,
    database_id: String,
) -> Result<notion::SchemaReport, String> {
    notion::describe_schema(&api_key, &database_id).await
}

#[tauri::command]
pub async fn get_items(cache: State<'_, ItemCache>) -> Result<Vec<Item>, String> {
    Ok(cache.0.lock().expect("item cache poisoned").clone())
}

#[tauri::command]
pub async fn trigger_sync(cache: State<'_, ItemCache>) -> Result<SyncResult, String> {
    let config = load_config().ok_or("No config — please set up your Notion API key first")?;
    let result = merge::fetch_all(&config).await?;
    *cache.0.lock().expect("item cache poisoned") = result.items.clone();
    Ok(result)
}

/// Cycles an item forward: Todo → In Progress → Done → Todo.
/// Returns the new status so the frontend can update optimistically.
#[tauri::command]
pub async fn cycle_status(item_id: String, cache: State<'_, ItemCache>) -> Result<String, String> {
    let item = cached(&cache, &item_id)?;

    let next = match item.status.as_str() {
        "Todo" => "In Progress",
        "In Progress" => "Done",
        _ => "Todo",
    };

    let config = load_config().ok_or("No config")?;
    if item.source == SOURCE_GOOGLE {
        let (account_id, calendar_id, event_id) = merge::google_ids(&item)?;
        let account = merge::find_account(&config, &account_id)?;
        gcal::set_event_status(account, &calendar_id, &event_id, next).await?;
    } else {
        notion::set_item_status(&config.notion_api_key, &config.database_id, &item_id, next)
            .await?;
    }

    let now = chrono::Utc::now().to_rfc3339();
    let mut locked = cache.0.lock().expect("item cache poisoned");
    if let Some(item) = locked.iter_mut().find(|i| i.id == item_id) {
        item.status = next.to_string();
        item.last_edited_time = Some(now);
    }

    Ok(next.to_string())
}

/// Creates an item in whichever service the caller asked for.
///
/// `source` is explicit rather than inferred: an item with a time could
/// plausibly belong to either side, and silently guessing would mean the user
/// cannot tell where a thing will land until after it has landed. When
/// `source` is Google, `account_id` says which linked account — required once
/// more than one is connected, since there is no longer a single "the"
/// account to default to.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn create_item(
    name: String,
    start: Option<String>,
    end: Option<String>,
    deadline: Option<String>,
    description: Option<String>,
    source: Option<String>,
    account_id: Option<String>,
    calendar_id: Option<String>,
    cache: State<'_, ItemCache>,
) -> Result<Item, String> {
    let config = load_config().ok_or("No config")?;

    let item = if source.as_deref() == Some(SOURCE_GOOGLE) {
        let account = match &account_id {
            Some(id) => merge::find_account(&config, id)?,
            None => config
                .default_google_account()
                .ok_or("No calendar is connected — link one in settings.")?,
        };
        // Falls back to the first calendar this account syncs, then to the
        // account's own, matching what a fetch with no configured calendars reads.
        let calendar_id = calendar_id
            .or_else(|| account.calendars.first().map(|c| c.id.clone()))
            .unwrap_or_else(|| "primary".to_string());

        let event = gcal::create_event(
            account,
            &calendar_id,
            &name,
            start.as_deref(),
            end.as_deref(),
            deadline.as_deref(),
            description.as_deref(),
        )
        .await?;
        merge::to_item(event, &account.id)
    } else {
        notion::create_item(
            &config.notion_api_key,
            &config.database_id,
            &name,
            start.as_deref(),
            end.as_deref(),
            deadline.as_deref(),
            description.as_deref(),
        )
        .await?
    };

    cache
        .0
        .lock()
        .expect("item cache poisoned")
        .push(item.clone());
    Ok(item)
}

#[tauri::command]
pub async fn update_item_cmd(
    item_id: String,
    name: String,
    start: Option<String>,
    end: Option<String>,
    deadline: Option<String>,
    description: Option<String>,
    cache: State<'_, ItemCache>,
) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;
    let item = cached(&cache, &item_id)?;

    if item.source == SOURCE_GOOGLE {
        let (account_id, calendar_id, event_id) = merge::google_ids(&item)?;
        let account = merge::find_account(&config, &account_id)?;
        gcal::update_event(
            account,
            &calendar_id,
            &event_id,
            &name,
            start.as_deref(),
            end.as_deref(),
            deadline.as_deref(),
            description.as_deref(),
            &item.status,
        )
        .await?;
    } else {
        notion::update_item(
            &config.notion_api_key,
            &config.database_id,
            &item_id,
            &name,
            start.as_deref(),
            end.as_deref(),
            deadline.as_deref(),
            description.as_deref(),
        )
        .await?;
    }

    let mut locked = cache.0.lock().expect("item cache poisoned");
    if let Some(item) = locked.iter_mut().find(|i| i.id == item_id) {
        item.name = name;
        item.start = start.filter(|s| !s.is_empty());
        item.end = end.filter(|s| !s.is_empty());
        item.deadline = deadline.filter(|s| !s.is_empty());
        item.description = description.filter(|s| !s.is_empty());
    }
    Ok(())
}

/// Removes an item. Notion pages are archived, which is undoable from Notion's
/// trash; Google events are deleted, which is what its API offers.
#[tauri::command]
pub async fn delete_item(item_id: String, cache: State<'_, ItemCache>) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;
    let item = cached(&cache, &item_id)?;

    if item.source == SOURCE_GOOGLE {
        let (account_id, calendar_id, event_id) = merge::google_ids(&item)?;
        let account = merge::find_account(&config, &account_id)?;
        gcal::delete_event(account, &calendar_id, &event_id).await?;
    } else {
        notion::archive_item(&config.notion_api_key, &item_id).await?;
    }
    cache
        .0
        .lock()
        .expect("item cache poisoned")
        .retain(|i| i.id != item_id);
    Ok(())
}

/// Opens an item where it actually lives — its Notion page, or its event in
/// Google Calendar, which is the same event Notion Calendar shows.
#[tauri::command]
pub async fn open_in_notion(item_id: String, cache: State<'_, ItemCache>) -> Result<(), String> {
    let item = cached(&cache, &item_id)?;

    let url = match item.url {
        Some(link) => link,
        // Notion page URLs use the id without dashes.
        None => format!("https://notion.so/{}", item_id.replace('-', "")),
    };

    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Notion Calendar (via Google) — one or more linked accounts
// ---------------------------------------------------------------------------

/// What settings shows for one linked account. The client secret is never
/// sent back to the frontend — it only ever travels inward.
#[derive(serde::Serialize)]
pub struct CalendarAccountStatus {
    pub id: String,
    pub client_id: String,
    /// Whether a secret is stored, so the field can show as filled without
    /// handing the value back out.
    pub has_client_secret: bool,
    pub account: String,
    pub calendars: Vec<SyncedCalendar>,
    pub default: bool,
}

impl From<&GoogleAccount> for CalendarAccountStatus {
    fn from(a: &GoogleAccount) -> Self {
        CalendarAccountStatus {
            id: a.id.clone(),
            client_id: a.client_id.clone(),
            has_client_secret: !a.client_secret.trim().is_empty(),
            account: a.account.clone(),
            calendars: a.calendars.clone(),
            default: a.default,
        }
    }
}

/// Every linked Google account, for the settings list.
#[tauri::command]
pub async fn calendar_accounts() -> Vec<CalendarAccountStatus> {
    load_config()
        .map(|c| c.google_accounts.iter().map(CalendarAccountStatus::from).collect())
        .unwrap_or_default()
}

/// Runs the Google consent flow for a *new* account and adds it to the linked
/// list. Each account keeps its own client id/secret — most people reuse one
/// Google Cloud OAuth client across accounts, but nothing requires it. The
/// very first account linked becomes the default automatically, since
/// otherwise there would be nothing to default to.
#[tauri::command]
pub async fn connect_calendar(
    client_id: String,
    client_secret: String,
) -> Result<Vec<CalendarAccountStatus>, String> {
    let mut config = load_config().ok_or("Connect to Notion first.")?;
    let client_id = client_id.trim().to_string();
    let client_secret = client_secret.trim().to_string();
    let is_first = config.google_accounts.is_empty();

    let connection = gcal::connect(&client_id, &client_secret).await?;

    config.google_accounts.push(GoogleAccount {
        id: new_account_id(),
        client_id,
        client_secret,
        refresh_token: connection.refresh_token,
        account: connection.account,
        calendars: Vec::new(),
        default: is_first,
    });
    save_config(&config)?;

    Ok(config.google_accounts.iter().map(CalendarAccountStatus::from).collect())
}

/// Forgets one account's grant. Its events disappear from the list on the
/// next sync; nothing in Google Calendar itself is touched. If the
/// disconnected account was the default, the next-oldest linked account
/// (config order) quietly takes over rather than leaving nothing flagged.
#[tauri::command]
pub async fn disconnect_calendar(
    account_id: String,
    cache: State<'_, ItemCache>,
) -> Result<(), String> {
    let mut config = load_config().ok_or("No config")?;
    let was_default = config
        .google_accounts
        .iter()
        .any(|a| a.id == account_id && a.default);
    config.google_accounts.retain(|a| a.id != account_id);
    if was_default {
        if let Some(next) = config.google_accounts.first_mut() {
            next.default = true;
        }
    }
    save_config(&config)?;
    gcal::forget_access(&account_id);

    cache
        .0
        .lock()
        .expect("item cache poisoned")
        .retain(|i| i.account_id.as_deref() != Some(account_id.as_str()));
    Ok(())
}

/// Makes one linked account the default new events go to when the "where"
/// step in the item editor isn't otherwise told which one to use.
#[tauri::command]
pub async fn set_default_calendar_account(account_id: String) -> Result<(), String> {
    let mut config = load_config().ok_or("No config")?;
    config.set_default_google_account(&account_id)?;
    save_config(&config)
}

#[tauri::command]
pub async fn list_calendars(account_id: String) -> Result<Vec<gcal::CalendarInfo>, String> {
    let config = load_config().ok_or("No config")?;
    let account = merge::find_account(&config, &account_id)?;
    gcal::list_calendars(account).await
}

/// Chooses which calendars one account syncs. An empty list means that
/// account's own calendar. Names travel with ids so the item editor can
/// label its destination picker without a network round trip of its own.
#[tauri::command]
pub async fn save_calendar_selection(
    account_id: String,
    calendars: Vec<SyncedCalendar>,
) -> Result<(), String> {
    let mut config = load_config().ok_or("No config")?;
    let account = config
        .google_accounts
        .iter_mut()
        .find(|a| a.id == account_id)
        .ok_or("That calendar account is no longer connected — try refreshing.")?;
    account.calendars = calendars;
    save_config(&config)
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/// Saves a new quick note to `~/.todoish/notes/`. Returns the filename it
/// landed under, in case a name collision changed it.
#[tauri::command]
pub async fn save_note(name: String, content: String) -> Result<String, String> {
    crate::notes::save_note(&name, &content)
}

/// Every saved note, for the notes tab in settings.
#[tauri::command]
pub async fn list_notes() -> Result<Vec<crate::notes::NoteSummary>, String> {
    crate::notes::list_notes()
}

#[tauri::command]
pub async fn read_note(filename: String) -> Result<String, String> {
    crate::notes::read_note(&filename)
}

/// Overwrites a note that's already open in the editor — as opposed to
/// `save_note`, which is for a brand new one and refuses to collide.
#[tauri::command]
pub async fn update_note(filename: String, content: String) -> Result<(), String> {
    crate::notes::update_note(&filename, &content)
}

#[tauri::command]
pub async fn delete_note(filename: String) -> Result<(), String> {
    crate::notes::delete_note(&filename)
}
