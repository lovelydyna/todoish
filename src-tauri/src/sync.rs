use crate::commands::TaskCache;
use crate::config::load_config;
use crate::notion;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub async fn start_sync_loop(app: AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;

        if let Some(config) = load_config() {
            match notion::fetch_tasks(&config.notion_api_key, &config.database_id).await {
                Ok(tasks) => {
                    let cache = app.state::<TaskCache>();
                    *cache.0.lock().unwrap() = tasks.clone();
                    let _ = app.emit("tasks-updated", tasks);
                }
                Err(e) => {
                    let _ = app.emit("sync-error", e);
                }
            }
        }
    }
}
