use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub notion_api_key: String,
    pub database_id: String,
    #[serde(default = "default_tone")]
    pub completion_tone: String,
    #[serde(default)]
    pub startup_position: String,
    #[serde(default = "default_window_mode")]
    pub window_mode: String,
}

fn default_tone() -> String {
    "bell".to_string()
}

fn default_window_mode() -> String {
    "float".to_string()
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
    fs::write(path, content).map_err(|e| e.to_string())
}
