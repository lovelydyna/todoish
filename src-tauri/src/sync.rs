use crate::commands::ItemCache;
use crate::config::load_config;
use crate::notion;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub async fn start_sync_loop(app: AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;

        let Some(config) = load_config() else { continue };

        match notion::fetch_items(&config.notion_api_key, &config.database_id).await {
            Ok(items) => {
                let cache = app.state::<ItemCache>();
                *cache.0.lock().expect("item cache poisoned") = items.clone();
                let _ = app.emit("items-updated", items);
            }
            Err(e) => {
                let _ = app.emit("sync-error", e);
            }
        }
    }
}
