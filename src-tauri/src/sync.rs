use crate::commands::ItemCache;
use crate::config::load_config;
use crate::merge;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub async fn start_sync_loop(app: AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;

        let Some(config) = load_config() else { continue };

        match merge::fetch_all(&config).await {
            Ok(result) => {
                let cache = app.state::<ItemCache>();
                *cache.0.lock().expect("item cache poisoned") = result.items.clone();
                let _ = app.emit("items-updated", result.items);
                // A calendar that failed while Notion succeeded is worth
                // saying, but it must not read as the whole sync being down.
                let _ = app.emit("calendar-warning", result.warning);
            }
            Err(e) => {
                let _ = app.emit("sync-error", e);
            }
        }
    }
}
