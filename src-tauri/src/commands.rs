use crate::config::{load_config, save_config, Config};
use crate::notion::{self, Task};
use std::sync::Mutex;
use tauri::State;

pub struct TaskCache(pub Mutex<Vec<Task>>);

#[tauri::command]
pub async fn get_config() -> Option<Config> {
    load_config()
}

#[tauri::command]
pub async fn save_config_cmd(
    api_key: String,
    database_id: String,
    completion_tone: String,
    startup_position: String,
    always_on_top: bool,
) -> Result<(), String> {
    save_config(&Config {
        notion_api_key: api_key,
        database_id,
        completion_tone,
        startup_position,
        always_on_top,
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

#[tauri::command]
pub async fn get_tasks(cache: State<'_, TaskCache>) -> Result<Vec<Task>, String> {
    Ok(cache.0.lock().unwrap().clone())
}

#[tauri::command]
pub async fn trigger_sync(cache: State<'_, TaskCache>) -> Result<Vec<Task>, String> {
    let config = load_config().ok_or("No config — please set up your Notion API key first")?;
    let tasks = notion::fetch_tasks(&config.notion_api_key, &config.database_id).await?;
    *cache.0.lock().unwrap() = tasks.clone();
    Ok(tasks)
}

/// Marks a task directly as Done (used by Focus mode).
#[tauri::command]
pub async fn complete_task(
    task_id: String,
    cache: State<'_, TaskCache>,
) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;
    notion::set_task_status(&config.notion_api_key, &task_id, "Done").await?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut locked = cache.0.lock().unwrap();
    if let Some(task) = locked.iter_mut().find(|t| t.id == task_id) {
        task.status = "Done".to_string();
        task.last_edited_time = Some(now);
    }
    Ok(())
}

/// Cycles a task forward: Todo → In Progress → Done → Todo.
/// Returns the new status string so the frontend can update optimistically.
#[tauri::command]
pub async fn cycle_status(
    task_id: String,
    cache: State<'_, TaskCache>,
) -> Result<String, String> {
    let current = {
        let locked = cache.0.lock().unwrap();
        locked
            .iter()
            .find(|t| t.id == task_id)
            .map(|t| t.status.clone())
            .unwrap_or_else(|| "Todo".to_string())
    };

    let next = match current.as_str() {
        "Todo" => "In Progress",
        "In Progress" => "Done",
        _ => "Todo",
    };

    let config = load_config().ok_or("No config")?;
    notion::set_task_status(&config.notion_api_key, &task_id, next).await?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut locked = cache.0.lock().unwrap();
    if let Some(task) = locked.iter_mut().find(|t| t.id == task_id) {
        task.status = next.to_string();
        task.last_edited_time = Some(now);
    }

    Ok(next.to_string())
}

#[tauri::command]
pub async fn create_task(
    title: String,
    due: Option<String>,
    priority: Option<String>,
    energy: Option<String>,
    cache: State<'_, TaskCache>,
) -> Result<Task, String> {
    let config = load_config().ok_or("No config")?;
    let task = notion::create_task(
        &config.notion_api_key,
        &config.database_id,
        &title,
        due.as_deref(),
        priority.as_deref(),
        energy.as_deref(),
    )
    .await?;
    cache.0.lock().unwrap().push(task.clone());
    Ok(task)
}

#[tauri::command]
pub async fn update_task_cmd(
    task_id: String,
    title: String,
    due: Option<String>,
    priority: Option<String>,
    energy: Option<String>,
    notes: Option<String>,
    cache: State<'_, TaskCache>,
) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;
    notion::update_task(
        &config.notion_api_key,
        &task_id,
        &title,
        due.as_deref(),
        priority.as_deref(),
        energy.as_deref(),
        notes.as_deref(),
    )
    .await?;
    let mut locked = cache.0.lock().unwrap();
    if let Some(task) = locked.iter_mut().find(|t| t.id == task_id) {
        task.title = title;
        task.due = due;
        task.priority = priority;
        task.energy = energy;
        task.notes = notes;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_task(
    task_id: String,
    cache: State<'_, TaskCache>,
) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;
    notion::archive_task(&config.notion_api_key, &task_id).await?;
    cache.0.lock().unwrap().retain(|t| t.id != task_id);
    Ok(())
}

#[tauri::command]
pub async fn open_in_notion(task_id: String) -> Result<(), String> {
    // Notion page URLs use the ID without dashes
    let clean_id = task_id.replace('-', "");
    let url = format!("https://notion.so/{}", clean_id);
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

