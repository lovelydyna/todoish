use crate::config::{load_config, save_config, Config};
use crate::notion::{self, Item};
use std::sync::Mutex;
use tauri::State;

pub struct ItemCache(pub Mutex<Vec<Item>>);

#[tauri::command]
pub async fn get_config() -> Option<Config> {
    load_config()
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_config_cmd(
    api_key: String,
    database_id: String,
    completion_tone: String,
    startup_position: String,
    always_on_top: bool,
    global_shortcut: String,
    theme: String,
    color_mode: String,
    window_opacity: f64,
) -> Result<(), String> {
    notion::forget_sources();
    save_config(&Config {
        notion_api_key: api_key,
        database_id,
        completion_tone,
        startup_position,
        always_on_top,
        global_shortcut,
        theme,
        color_mode,
        window_opacity,
    })
}

#[tauri::command]
pub async fn set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    }
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
pub async fn trigger_sync(cache: State<'_, ItemCache>) -> Result<Vec<Item>, String> {
    let config = load_config().ok_or("No config — please set up your Notion API key first")?;
    let items = notion::fetch_items(&config.notion_api_key, &config.database_id).await?;
    *cache.0.lock().expect("item cache poisoned") = items.clone();
    Ok(items)
}

/// Cycles an item forward: Todo → In Progress → Done → Todo.
/// Returns the new status so the frontend can update optimistically.
#[tauri::command]
pub async fn cycle_status(item_id: String, cache: State<'_, ItemCache>) -> Result<String, String> {
    let current = {
        let locked = cache.0.lock().expect("item cache poisoned");
        locked
            .iter()
            .find(|i| i.id == item_id)
            .map(|i| i.status.clone())
            .unwrap_or_else(|| "Todo".to_string())
    };

    let next = match current.as_str() {
        "Todo" => "In Progress",
        "In Progress" => "Done",
        _ => "Todo",
    };

    let config = load_config().ok_or("No config")?;
    notion::set_item_status(&config.notion_api_key, &config.database_id, &item_id, next).await?;

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
        &config.database_id,
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

#[tauri::command]
pub async fn delete_item(item_id: String, cache: State<'_, ItemCache>) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;
    notion::archive_item(&config.notion_api_key, &item_id).await?;
    cache
        .0
        .lock()
        .expect("item cache poisoned")
        .retain(|i| i.id != item_id);
    Ok(())
}

#[tauri::command]
pub async fn open_in_notion(item_id: String) -> Result<(), String> {
    // Notion page URLs use the ID without dashes
    let clean_id = item_id.replace('-', "");
    let url = format!("https://notion.so/{}", clean_id);
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
