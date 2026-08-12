use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub notion_api_key: String,
    /// The one Notion database: Name · Status · Time · Deadline · Description.
    pub database_id: String,
    #[serde(default = "default_tone")]
    pub completion_tone: String,
    #[serde(default)]
    pub startup_position: String,
    #[serde(default)]
    pub always_on_top: bool,
    /// System-wide hotkey that summons the window from any app. Empty = off.
    #[serde(default = "default_global_shortcut")]
    pub global_shortcut: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    /// "dark", "light" or "auto" (follow the OS).
    #[serde(default = "default_color_mode")]
    pub color_mode: String,
    /// Opacity of the window wash, 0.3–1.0.
    #[serde(default = "default_opacity")]
    pub window_opacity: f64,
}

fn default_global_shortcut() -> String {
    "CmdOrControl+Shift+T".to_string()
}

fn default_tone() -> String {
    "bell".to_string()
}

fn default_color_mode() -> String {
    "dark".to_string()
}

fn default_theme() -> String {
    "midnight".to_string()
}

fn default_opacity() -> f64 {
    0.82
}

fn config_path() -> PathBuf {
    let home = dirs::home_dir().expect("could not find home directory");
    home.join(".todoish").join("config.toml")
}

pub fn load_config() -> Option<Config> {
    let content = fs::read_to_string(config_path()).ok()?;
    toml::from_str(&content).ok()
}

pub fn save_config(config: &Config) -> Result<(), String> {
    let path = config_path();
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let content = toml::to_string(config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    // Restrict config file to owner read/write only (0600) to protect the API key
    #[cfg(unix)]
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    Ok(())
}
