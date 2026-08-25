use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// One calendar synced from a linked account. The name travels with the id
/// (captured once, in settings, when the user picks it from `list_calendars`)
/// so anything that needs to *show* a calendar — the item editor's
/// destination picker, in particular — never has to make its own network
/// round trip just to label a button.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncedCalendar {
    pub id: String,
    pub name: String,
}

/// One connected Google account behind Notion Calendar. See `gcal.rs` — Notion
/// Calendar has no API of its own, so each linked account is really a Google
/// account, each with its own OAuth client (a user can point different
/// accounts at different Google Cloud projects, or reuse one).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleAccount {
    /// Generated at connect time. Rows and settings reference this rather
    /// than the account email, which is one more round trip to learn and
    /// isn't guaranteed non-empty.
    pub id: String,
    pub client_id: String,
    #[serde(default)]
    pub client_secret: String,
    pub refresh_token: String,
    #[serde(default)]
    pub account: String,
    /// Calendars to sync. Empty = the account's own calendar.
    #[serde(default)]
    pub calendars: Vec<SyncedCalendar>,
    /// The account a new event defaults to when more than one is linked.
    /// Exactly one account should carry this at a time; `set_default_account`
    /// is what enforces that, not this field itself.
    #[serde(default)]
    pub default: bool,
}

/// A short random id, distinct from the account email so it stays stable even
/// before the userinfo lookup resolves (or if it ever comes back empty).
pub fn new_account_id() -> String {
    let mut rng = rand::thread_rng();
    (0..12).map(|_| format!("{:x}", rng.gen_range(0..16u8))).collect()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Config {
    pub notion_api_key: String,
    /// The one Notion database: Name · Status · Time · Deadline · Description.
    pub database_id: String,
    #[serde(default = "default_tone")]
    pub completion_tone: String,
    #[serde(default)]
    pub startup_position: String,
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

    /// Every Google account linked through Notion Calendar. Empty = no
    /// calendar linked.
    #[serde(default)]
    pub google_accounts: Vec<GoogleAccount>,

    // Pre-multi-account fields, read on load so an already-connected account
    // survives the upgrade rather than silently vanishing. Never written —
    // load_config() folds a populated one into google_accounts and the next
    // save drops these keys from the file for good.
    #[serde(default, rename = "google_client_id", skip_serializing)]
    pub(crate) legacy_client_id: String,
    #[serde(default, rename = "google_client_secret", skip_serializing)]
    pub(crate) legacy_client_secret: String,
    #[serde(default, rename = "google_refresh_token", skip_serializing)]
    pub(crate) legacy_refresh_token: String,
    #[serde(default, rename = "google_account", skip_serializing)]
    pub(crate) legacy_account: String,
    #[serde(default, rename = "google_calendar_ids", skip_serializing)]
    pub(crate) legacy_calendar_ids: Vec<String>,
}

impl Config {
    /// Moves a pre-multi-account connection into `google_accounts`, once.
    fn migrate_legacy_google_account(&mut self) {
        if !self.google_accounts.is_empty() || self.legacy_refresh_token.trim().is_empty() {
            return;
        }
        // The legacy field only ever stored ids, never names — the calendar
        // picker will read back "(untitled)"-style names for these until the
        // user reopens settings, which re-fetches the real ones.
        let calendars = std::mem::take(&mut self.legacy_calendar_ids)
            .into_iter()
            .map(|id| SyncedCalendar { name: id.clone(), id })
            .collect();
        self.google_accounts.push(GoogleAccount {
            id: new_account_id(),
            client_id: std::mem::take(&mut self.legacy_client_id),
            client_secret: std::mem::take(&mut self.legacy_client_secret),
            refresh_token: std::mem::take(&mut self.legacy_refresh_token),
            account: std::mem::take(&mut self.legacy_account),
            calendars,
            default: true,
        });
    }

    /// The account a new event defaults to: whichever is flagged, falling
    /// back to the first linked account so there is always a sensible choice
    /// even before the user has ever touched the default setting.
    pub fn default_google_account(&self) -> Option<&GoogleAccount> {
        self.google_accounts
            .iter()
            .find(|a| a.default)
            .or_else(|| self.google_accounts.first())
    }

    /// Flags exactly one account as default, clearing it on every other one.
    pub fn set_default_google_account(&mut self, account_id: &str) -> Result<(), String> {
        if !self.google_accounts.iter().any(|a| a.id == account_id) {
            return Err("That calendar account is no longer connected — try refreshing.".into());
        }
        for account in &mut self.google_accounts {
            account.default = account.id == account_id;
        }
        Ok(())
    }
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
    let mut config: Config = toml::from_str(&content).ok()?;
    config.migrate_legacy_google_account();
    Some(config)
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A config.toml written by the single-account version of todoish.
    const LEGACY_TOML: &str = r#"
        notion_api_key = "secret_x"
        database_id = "db1"
        google_client_id = "client.apps.googleusercontent.com"
        google_client_secret = "shh"
        google_refresh_token = "refresh_token_x"
        google_account = "old@example.com"
        google_calendar_ids = ["primary", "work@group.calendar.google.com"]
    "#;

    #[test]
    fn a_pre_multi_account_connection_becomes_one_google_account() {
        let mut config: Config = toml::from_str(LEGACY_TOML).unwrap();
        config.migrate_legacy_google_account();

        assert_eq!(config.google_accounts.len(), 1);
        let account = &config.google_accounts[0];
        assert_eq!(account.client_id, "client.apps.googleusercontent.com");
        assert_eq!(account.client_secret, "shh");
        assert_eq!(account.refresh_token, "refresh_token_x");
        assert_eq!(account.account, "old@example.com");
        assert_eq!(
            account.calendars.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["primary", "work@group.calendar.google.com"]
        );
        assert!(account.default, "the sole migrated account should become the default");
        assert!(!account.id.is_empty(), "a migrated account still needs an id to route writes on");
    }

    #[test]
    fn migration_only_runs_once() {
        let mut config: Config = toml::from_str(LEGACY_TOML).unwrap();
        config.migrate_legacy_google_account();
        config.migrate_legacy_google_account();
        assert_eq!(config.google_accounts.len(), 1, "a second call must not duplicate the account");
    }

    #[test]
    fn a_config_with_no_legacy_connection_migrates_to_nothing() {
        let mut config: Config = toml::from_str(
            "notion_api_key = \"x\"\ndatabase_id = \"y\"\n",
        )
        .unwrap();
        config.migrate_legacy_google_account();
        assert!(config.google_accounts.is_empty());
    }

    #[test]
    fn migrated_fields_do_not_serialize_back_out() {
        // Otherwise the legacy keys would linger in config.toml forever,
        // resurrecting a stale account on some future load.
        let mut config: Config = toml::from_str(LEGACY_TOML).unwrap();
        config.migrate_legacy_google_account();
        let written = toml::to_string(&config).unwrap();
        assert!(!written.contains("google_client_id"));
        assert!(!written.contains("google_refresh_token"));
        assert!(written.contains("google_accounts"));
    }

    fn account(id: &str, default: bool) -> GoogleAccount {
        GoogleAccount {
            id: id.into(),
            client_id: "client".into(),
            client_secret: String::new(),
            refresh_token: "refresh".into(),
            account: format!("{id}@example.com"),
            calendars: vec![],
            default,
        }
    }

    #[test]
    fn default_google_account_prefers_the_flagged_one() {
        let config = Config {
            google_accounts: vec![account("a1", false), account("a2", true)],
            ..Default::default()
        };
        assert_eq!(config.default_google_account().unwrap().id, "a2");
    }

    #[test]
    fn default_google_account_falls_back_to_the_first_when_none_is_flagged() {
        let config = Config {
            google_accounts: vec![account("a1", false), account("a2", false)],
            ..Default::default()
        };
        assert_eq!(config.default_google_account().unwrap().id, "a1");
    }

    #[test]
    fn set_default_google_account_clears_every_other_one() {
        let mut config = Config {
            google_accounts: vec![account("a1", true), account("a2", false)],
            ..Default::default()
        };
        config.set_default_google_account("a2").unwrap();
        assert!(!config.google_accounts[0].default);
        assert!(config.google_accounts[1].default);
    }

    #[test]
    fn set_default_google_account_rejects_an_unknown_id() {
        let mut config = Config { google_accounts: vec![account("a1", true)], ..Default::default() };
        assert!(config.set_default_google_account("ghost").is_err());
    }
}
