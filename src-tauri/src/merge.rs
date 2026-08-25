//! Where every source becomes one list.
//!
//! The app has always rendered a single `Vec<Item>` — the task view groups it
//! by deadline, the calendar by time. Adding Google Calendar does not change
//! that: each linked account's events are flattened into the same shape and
//! concatenated, and every row carries the `source` (and, for Google rows,
//! the `account_id`) that says where writes to it go back to.

use crate::config::{Config, GoogleAccount};
use crate::gcal;
use crate::notion::{self, Item, SOURCE_GOOGLE};

/// What one sync produced.
///
/// Google is reported separately because it must not be able to empty the task
/// list: a revoked grant or a dropped connection should cost you your events,
/// not your todos. So a Google failure is a warning carried alongside a good
/// Notion result, and only a Notion failure is an error. With several accounts
/// linked, one failing does not hide events from the others — it just adds
/// its own line to the warning.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncResult {
    pub items: Vec<Item>,
    pub warning: Option<String>,
}

/// Row id for a Google event.
///
/// The raw event id is unique within one account's calendar but not beyond
/// it — two different linked accounts can each have a calendar literally
/// named "primary", with entirely independent event ids — and React keys,
/// cache lookups and selection all assume ids are unique across the list.
pub fn google_row_id(account_id: &str, calendar_id: &str, event_id: &str) -> String {
    format!("g:{account_id}:{calendar_id}:{event_id}")
}

pub fn to_item(event: gcal::Event, account_id: &str) -> Item {
    Item {
        id: google_row_id(account_id, &event.calendar_id, &event.id),
        name: event.name,
        status: event.status,
        start: event.start,
        end: event.end,
        deadline: event.deadline,
        description: event.description,
        created_time: event.created_time,
        last_edited_time: event.last_edited_time,
        source: SOURCE_GOOGLE.to_string(),
        calendar_id: Some(event.calendar_id),
        account_id: Some(account_id.to_string()),
        url: event.url,
    }
}

/// The real Google ids behind a row, for the calls that write back: which
/// account owns it, which calendar it's on, and its event id.
pub fn google_ids(item: &Item) -> Result<(String, String, String), String> {
    let account_id = item
        .account_id
        .clone()
        .ok_or("This calendar event has no account — try refreshing.")?;
    let calendar_id = item
        .calendar_id
        .clone()
        .ok_or("This calendar event has no calendar — try refreshing.")?;
    let event_id = item
        .id
        .strip_prefix(&format!("g:{account_id}:{calendar_id}:"))
        .ok_or("This calendar event has an unreadable id — try refreshing.")?
        .to_string();
    Ok((account_id, calendar_id, event_id))
}

/// The linked account behind an id, or a clear error if it was disconnected
/// since the row was fetched.
pub fn find_account<'a>(config: &'a Config, account_id: &str) -> Result<&'a GoogleAccount, String> {
    config
        .google_accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| {
            "That calendar account is no longer connected — try refreshing.".to_string()
        })
}

/// Notion first, then every linked Google account. Notion is required; each
/// Google account is best-effort and reported independently.
pub async fn fetch_all(config: &Config) -> Result<SyncResult, String> {
    let items = notion::fetch_items(&config.notion_api_key, &config.database_id).await?;

    if config.google_accounts.is_empty() {
        return Ok(SyncResult { items, warning: None });
    }

    let mut items = items;
    let mut warnings = Vec::new();

    for account in &config.google_accounts {
        match gcal::fetch_events(account).await {
            Ok(events) => items.extend(events.into_iter().map(|e| to_item(e, &account.id))),
            Err(e) => {
                let who = if account.account.is_empty() {
                    "a calendar account".to_string()
                } else {
                    account.account.clone()
                };
                warnings.push(format!("{who}: {e}"));
            }
        }
    }

    Ok(SyncResult {
        items,
        warning: (!warnings.is_empty()).then(|| warnings.join("; ")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(calendar: &str, id: &str) -> gcal::Event {
        gcal::Event {
            id: id.into(),
            calendar_id: calendar.into(),
            name: "standup".into(),
            status: "Todo".into(),
            start: Some("2026-08-20T09:00:00-06:00".into()),
            end: None,
            deadline: None,
            description: None,
            url: None,
            created_time: None,
            last_edited_time: None,
        }
    }

    #[test]
    fn the_same_event_id_on_two_accounts_gets_two_row_ids() {
        // Both accounts happen to call their own calendar "primary" and Google
        // assigned the same opaque event id in each — a real possibility since
        // ids are only unique within one account's calendar.
        let a = to_item(event("primary", "abc"), "acct1");
        let b = to_item(event("primary", "abc"), "acct2");
        assert_ne!(a.id, b.id, "rows from different accounts must stay distinguishable");
    }

    #[test]
    fn the_same_event_on_two_calendars_in_one_account_gets_two_ids() {
        let a = to_item(event("work@x.com", "abc"), "acct1");
        let b = to_item(event("personal@x.com", "abc"), "acct1");
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn a_row_id_reads_back_as_the_ids_it_was_built_from() {
        let item = to_item(event("work@x.com", "abc_20260820T150000Z"), "acct1");
        let (account, calendar, id) = google_ids(&item).expect("ids should parse");
        assert_eq!(account, "acct1");
        assert_eq!(calendar, "work@x.com");
        assert_eq!(id, "abc_20260820T150000Z");
    }

    #[test]
    fn google_rows_are_marked_as_such() {
        let item = to_item(event("primary", "abc"), "acct1");
        assert_eq!(item.source, SOURCE_GOOGLE);
        assert_eq!(item.calendar_id.as_deref(), Some("primary"));
        assert_eq!(item.account_id.as_deref(), Some("acct1"));
    }

    fn account(id: &str) -> GoogleAccount {
        GoogleAccount {
            id: id.into(),
            client_id: "client".into(),
            client_secret: String::new(),
            refresh_token: "refresh".into(),
            account: String::new(),
            calendars: vec![],
            default: false,
        }
    }

    #[test]
    fn find_account_locates_the_matching_id() {
        let config = Config {
            google_accounts: vec![account("a1"), account("a2")],
            ..test_config()
        };
        assert_eq!(find_account(&config, "a2").unwrap().id, "a2");
        assert!(find_account(&config, "gone").is_err());
    }

    fn test_config() -> Config {
        toml::from_str("notion_api_key = \"\"\ndatabase_id = \"\"\n").unwrap()
    }
}
