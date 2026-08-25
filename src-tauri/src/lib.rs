mod commands;
mod config;
mod gcal;
mod merge;
mod notes;
mod notion;
mod sync;

use commands::ItemCache;
use std::sync::Mutex;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

/// Window corner radius. Kept in sync with `--window-radius` in index.css.
const WINDOW_RADIUS: f64 = 14.0;

/// Brings the window to the front, or hides it if it is already frontmost.
fn toggle_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };

    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        let _ = window.hide();
        return;
    }

    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();

    // Without this the window can rise behind the app you pressed the key in.
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy;
        let _ = app.set_activation_policy(ActivationPolicy::Regular);
    }
}

/// Binds the configured system-wide hotkey. A blank setting disables it, and a
/// shortcut the OS refuses (already taken by another app) is skipped rather
/// than failing startup — the tray icon still opens the window.
fn register_global_shortcut(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let accelerator = config::load_config()
        .map(|c| c.global_shortcut)
        .unwrap_or_else(default_shortcut);
    let accelerator = accelerator.trim().to_string();
    if accelerator.is_empty() {
        return;
    }

    let result = app.global_shortcut().on_shortcut(
        accelerator.as_str(),
        move |app, _shortcut, event| {
            // Fires on press and release; acting on both would toggle twice.
            if event.state() == ShortcutState::Pressed {
                toggle_window(app);
            }
        },
    );

    if let Err(e) = result {
        eprintln!("could not register global shortcut `{accelerator}`: {e}");
    }
}

fn default_shortcut() -> String {
    "CmdOrControl+Shift+T".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(ItemCache(Mutex::new(vec![])))
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config_cmd,
            commands::describe_schema,
            commands::get_items,
            commands::trigger_sync,
            commands::cycle_status,
            commands::create_item,
            commands::update_item_cmd,
            commands::delete_item,
            commands::get_autostart,
            commands::set_autostart,
            commands::open_in_notion,
            commands::calendar_accounts,
            commands::connect_calendar,
            commands::disconnect_calendar,
            commands::set_default_calendar_account,
            commands::list_calendars,
            commands::save_calendar_selection,
            commands::save_note,
            commands::list_notes,
            commands::read_note,
            commands::update_note,
            commands::delete_note,
            commands::quit_app,
        ])
        .setup(|app| {
            register_global_shortcut(app.handle());

            let handle1 = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                sync::start_sync_loop(handle1).await;
            });

            // Apply native macOS blur — follows window focus so it dims when inactive.
            // The radius must match --window-radius in index.css, or the square
            // corners of the native blur view show past the rounded web layer.
            if let Some(window) = app.get_webview_window("main") {
                let _ = apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::FollowsWindowActiveState),
                    Some(WINDOW_RADIUS),
                );
            }

            // Visible on all workspaces — follows the user across every Space.
            // Using direct ObjC call (same thread as setup = main thread, safe).
            // NSWindowCollectionBehaviorCanJoinAllSpaces = 1 << 0
            if let Some(window) = app.get_webview_window("main") {
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
