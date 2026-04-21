mod commands;
mod config;
mod notion;
mod sync;

use commands::TaskCache;
use std::sync::Mutex;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::create_task,
            commands::get_autostart,
            commands::set_autostart,
            commands::delete_task,
            commands::open_in_notion,
            commands::update_task_cmd,
            commands::set_always_on_top,
            commands::quit_app,
        ])
        .setup(|app| {
            let handle1 = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                sync::start_sync_loop(handle1).await;
            });

            // Apply native macOS blur — follows window focus so it dims when inactive
            if let Some(window) = app.get_webview_window("main") {
                let _ = apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::FollowsWindowActiveState),
                    Some(10.0),
                );
            }

            // Visible on all workspaces — follows the user across every Space.
            // Using direct ObjC call (same thread as setup = main thread, safe).
            // NSWindowCollectionBehaviorCanJoinAllSpaces = 1 << 0
            if let Some(window) = app.get_webview_window("main") {
                let always_on_top = config::load_config()
                    .map(|c| c.always_on_top)
                    .unwrap_or(false);
                let _ = window.set_always_on_top(always_on_top);

                #[cfg(target_os = "macos")]
                {
                    use objc2::msg_send;
                    use objc2::runtime::AnyObject;
                    if let Ok(ptr) = window.ns_window() {
                        unsafe {
                            let ns_win = ptr as *mut AnyObject;
                            let _: () = msg_send![&*ns_win, setCollectionBehavior: 1usize];
                        }
                    }
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

            // System tray
            let show_item = MenuItem::with_id(app, "show", "Show Todoish", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Todoish", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Todoish");
}
