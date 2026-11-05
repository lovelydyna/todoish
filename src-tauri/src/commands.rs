use crate::config::{load_config, save_config, Config};
use crate::notion::{self, Item, SchemaOverride};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

/// The row behind an id, or a clear error if the cache has moved on. A stale
/// id fails here rather than as a 404 from the Notion API.
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

#[tauri::command]
pub async fn get_config() -> Option<Config> {
    load_config()
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_config_cmd(
    app: tauri::AppHandle,
    api_key: String,
    enabled_data_sources: Vec<String>,
    schema_overrides: HashMap<String, SchemaOverride>,
    completion_tone: String,
    startup_position: String,
    global_shortcut: String,
    theme: String,
    color_mode: String,
    window_opacity: f64,
) -> Result<(), String> {
    notion::forget_sources();
    save_config(&Config {
        notion_api_key: api_key,
        enabled_data_sources,
        schema_overrides,
        completion_tone,
        startup_position,
        global_shortcut,
        theme,
        color_mode,
        window_opacity,
    })?;
    crate::register_global_shortcut(&app);
    Ok(())
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

/// Checks every database shared with the integration and reports which
/// property each one matched to each role. `schema_overrides` is passed
/// fresh from the form rather than read off disk, the same way `api_key`
/// is — so a still-unsaved edit shows its effect immediately.
#[tauri::command]
pub async fn describe_schemas(
    api_key: String,
    schema_overrides: HashMap<String, SchemaOverride>,
) -> Result<Vec<notion::SchemaReport>, String> {
    notion::describe_schemas(&api_key, &schema_overrides).await
}

#[tauri::command]
pub async fn get_items(cache: State<'_, ItemCache>) -> Result<Vec<Item>, String> {
    Ok(cache.0.lock().expect("item cache poisoned").clone())
}

#[tauri::command]
pub async fn trigger_sync(cache: State<'_, ItemCache>) -> Result<Vec<Item>, String> {
    let config = load_config().ok_or("No config — please set up your Notion API key first")?;
    let items = notion::fetch_items(&config.notion_api_key, &config.schema_overrides, &config.enabled_data_sources).await?;
    *cache.0.lock().expect("item cache poisoned") = items.clone();
    Ok(items)
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
    let data_source_id = item
        .data_source_id
        .as_deref()
        .ok_or("This item has no database — try refreshing.")?;
    notion::set_item_status(
        &config.notion_api_key,
        &config.schema_overrides,
        data_source_id,
        &item_id,
        next,
    )
    .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut locked = cache.0.lock().expect("item cache poisoned");
    if let Some(item) = locked.iter_mut().find(|i| i.id == item_id) {
        item.status = next.to_string();
        item.last_edited_time = Some(now);
    }

    Ok(next.to_string())
}

#[tauri::command]
pub async fn create_item(
    name: String,
    start: Option<String>,
    end: Option<String>,
    deadline: Option<String>,
    description: Option<String>,
    cache: State<'_, ItemCache>,
) -> Result<Item, String> {
    let config = load_config().ok_or("No config")?;

    let item = notion::create_item(
        &config.notion_api_key,
        &config.schema_overrides,
        &config.enabled_data_sources,
        &name,
        start.as_deref(),
        end.as_deref(),
        deadline.as_deref(),
        description.as_deref(),
    )
    .await?;

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

    let data_source_id = item
        .data_source_id
        .as_deref()
        .ok_or("This item has no database — try refreshing.")?;
    notion::update_item(
        &config.notion_api_key,
        &config.schema_overrides,
        data_source_id,
        &item_id,
        &name,
        start.as_deref(),
        end.as_deref(),
        deadline.as_deref(),
        description.as_deref(),
    )
    .await?;

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

/// Removes an item. Notion pages are archived, which is undoable from
/// Notion's trash.
#[tauri::command]
pub async fn delete_item(item_id: String, cache: State<'_, ItemCache>) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;
    cached(&cache, &item_id)?;

    notion::archive_item(&config.notion_api_key, &item_id).await?;
    cache
        .0
        .lock()
        .expect("item cache poisoned")
        .retain(|i| i.id != item_id);
    Ok(())
}

/// Opens an item's Notion page. Notion page URLs use the id without dashes.
#[tauri::command]
pub async fn open_in_notion(item_id: String, cache: State<'_, ItemCache>) -> Result<(), String> {
    cached(&cache, &item_id)?;

    let url = format!("https://notion.so/{}", item_id.replace('-', ""));

    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/// Saves a new quick note to `~/.todoish/notes/`. Returns the filename it
/// landed under, in case a name collision changed it.
#[tauri::command]
pub async fn save_note(name: String, content: String, dir: Option<String>) -> Result<String, String> {
    crate::notes::save_note(&name, &content, dir.as_deref())
}

/// One notes folder's contents (the root when `dir` is omitted).
#[tauri::command]
pub async fn list_notes(dir: Option<String>) -> Result<Vec<crate::notes::NoteSummary>, String> {
    crate::notes::list_notes(dir.as_deref())
}

/// Creates a folder under the notes root; returns its relative path.
#[tauri::command]
pub async fn make_note_dir(path: String) -> Result<String, String> {
    crate::notes::make_dir(&path)
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
