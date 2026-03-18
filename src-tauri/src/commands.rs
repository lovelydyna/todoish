use crate::config::{load_config, save_config, Config};
use crate::notion::{self, Task};
use chrono::{DateTime, Utc};
use std::sync::Mutex;
use tauri::{Emitter, State};


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
    window_mode: String,
) -> Result<(), String> {
    save_config(&Config {
        notion_api_key: api_key,
        database_id,
        completion_tone,
        startup_position,
        window_mode,
    })
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

    let now = Utc::now().to_rfc3339();
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
pub async fn snooze_task(
    task_id: String,
    snooze_until: String,
    cache: State<'_, TaskCache>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let config = load_config().ok_or("No config")?;

    let title = {
        let locked = cache.0.lock().unwrap();
        locked
            .iter()
            .find(|t| t.id == task_id)
            .map(|t| t.title.clone())
            .unwrap_or_default()
    };

    notion::snooze_task(&config.notion_api_key, &task_id, &snooze_until).await?;
    let mut locked = cache.0.lock().unwrap();
    if let Some(task) = locked.iter_mut().find(|t| t.id == task_id) {
        task.status = "Snoozed".to_string();
        task.snooze_until = Some(snooze_until.clone());
    }

    // Emit in-app reminder when snooze expires
    if let Ok(until) = DateTime::parse_from_rfc3339(&snooze_until) {
        let until_utc = until.with_timezone(&Utc);
        let now = Utc::now();
        if until_utc > now {
            if let Ok(duration) = (until_utc - now).to_std() {
                let task_id_clone = task_id.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(duration).await;
                    let _ = app.emit("task-reminder", Task {
                        id: task_id_clone,
                        title,
                        status: "Todo".to_string(),
                        due: None,
                        priority: None,
                        energy: None,
                        snooze_until: None,
                        last_edited_time: None,
                    });
                });
            }
        }
    }

    Ok(())
}
