mod commands;
mod config;
mod notion;
mod notifications;
mod sync;

use commands::TaskCache;
use std::sync::Mutex;
use tauri::Manager;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(TaskCache(Mutex::new(vec![])))
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config_cmd,
            commands::get_tasks,
            commands::trigger_sync,
            commands::complete_task,
            commands::cycle_status,
            commands::snooze_task,
            commands::create_task,
            commands::get_autostart,
            commands::set_autostart,
            commands::delete_task,
        ])
        .setup(|app| {
            let handle1 = app.handle().clone();
            let handle2 = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                sync::start_sync_loop(handle1).await;
            });

            tauri::async_runtime::spawn(async move {
                notifications::start_notification_loop(handle2).await;
            });

            // Apply native macOS blur (NSVisualEffectView — never flickers)
            if let Some(window) = app.get_webview_window("main") {
                let _ = apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::Active),
                    Some(10.0),
                );
            }

            // Apply window mode (float = always on top, tile = normal)
            if let Some(config) = config::load_config() {
                if let Some(window) = app.get_webview_window("main") {
                    let float = config.window_mode != "tile";
                    let _ = window.set_always_on_top(float);
                }
            }

            // Apply startup position if configured
            if let Some(config) = config::load_config() {
                if !config.startup_position.is_empty() {
                    if let Some(window) = app.get_webview_window("main") {
                        if let Ok(Some(monitor)) = window.current_monitor() {
                            let screen = monitor.size();
                            if let Ok(win) = window.inner_size() {
                                let pos: Option<tauri::PhysicalPosition<i32>> =
                                    match config.startup_position.as_str() {
                                        "top-left" => Some(tauri::PhysicalPosition::new(20, 40)),
                                        "top-right" => Some(tauri::PhysicalPosition::new(
                                            screen.width as i32 - win.width as i32 - 20,
                                            40,
                                        )),
                                        "bottom-left" => Some(tauri::PhysicalPosition::new(
                                            20,
                                            screen.height as i32 - win.height as i32 - 80,
                                        )),
                                        "bottom-right" => Some(tauri::PhysicalPosition::new(
                                            screen.width as i32 - win.width as i32 - 20,
                                            screen.height as i32 - win.height as i32 - 80,
                                        )),
                                        "center" => Some(tauri::PhysicalPosition::new(
                                            (screen.width as i32 - win.width as i32) / 2,
                                            (screen.height as i32 - win.height as i32) / 2,
                                        )),
                                        _ => None,
                                    };
                                if let Some(p) = pos {
                                    let _ = window.set_position(p);
                                }
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Todoish");
}
