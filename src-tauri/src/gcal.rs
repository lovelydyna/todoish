//! Google Calendar client — the backend behind "Notion Calendar" in settings.
//!
//! Notion Calendar (formerly Cron) has no public API of its own; it is a client
//! over the Google accounts you connect to it. So "linking your Notion
//! Calendar" means talking to Google Calendar directly, against the same
//! account. Events written here show up in Notion Calendar, and vice versa.
//!
//! ## Auth
//!
//! The OAuth "installed app" flow: todoish opens the system browser, Google
//! redirects back to a loopback listener on an ephemeral port, and the code is
//! exchanged for a refresh token using PKCE. The refresh token lives in
//! `~/.todoish/config.toml`, which is already 0600.
//!
//! There is no shipped client id — an OAuth client belongs to whoever runs the
//! app, so the user creates one in Google Cloud and pastes it into settings.
//!
//! ## Fields todoish has and Google does not
//!
//! An `Item` carries a status and a deadline; a Google event carries neither.
//! Both are kept in `extendedProperties.private`, which round-trips through the
//! API and is ignored by every other calendar client, so marking something done
//! in todoish never corrupts the event for anyone else.

use crate::config::GoogleAccount;
use base64::Engine;
use rand::Rng;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const API: &str = "https://www.googleapis.com/calendar/v3";
const USERINFO: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

/// Read/write on calendars, plus the address of the account, so settings can
/// show *which* account is linked rather than just "connected".
const SCOPES: &str =
    "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email";

/// How long the browser has to complete the consent screen.
const CONSENT_TIMEOUT: Duration = Duration::from_secs(180);

/// How far back and forward events are fetched. The month grid can page a
/// little either side of today, and pulling a year of history every 60s would
/// be rude to both Google and the sync loop.
const WINDOW_BACK_DAYS: i64 = 30;
const WINDOW_FORWARD_DAYS: i64 = 180;

/// Keys under `extendedProperties.private` that hold todoish's own fields.
const PROP_STATUS: &str = "todoish_status";
const PROP_DEADLINE: &str = "todoish_deadline";

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

/// A refreshed access token and when it stops being usable, keyed by
/// `GoogleAccount::id` — one account's cache must never answer for another's.
///
/// Google's access tokens last an hour and the sync loop runs every minute, so
/// caching one is the difference between 1 token request an hour and 60 —
/// times however many accounts are linked.
static ACCESS: OnceLock<Mutex<HashMap<String, (String, Instant)>>> = OnceLock::new();

fn access_cache() -> &'static Mutex<HashMap<String, (String, Instant)>> {
    ACCESS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Drops one account's cached access token. Called when that account is
/// disconnected, so a later reconnect under the same id re-authenticates
/// instead of reusing a token for a grant that no longer exists.
pub fn forget_access(account_id: &str) {
    access_cache()
        .lock()
        .expect("access cache poisoned")
        .remove(account_id);
}

/// A valid access token for one account, refreshing only when the cached one
/// is near expiry.
pub async fn access_token(account: &GoogleAccount) -> Result<String, String> {
    if let Some((token, expires)) = access_cache()
        .lock()
        .expect("access cache poisoned")
        .get(&account.id)
        .cloned()
    {
        // A minute of headroom: a token that expires mid-request is a 401 that
        // the caller would have to distinguish from a real auth failure.
        if expires > Instant::now() + Duration::from_secs(60) {
            return Ok(token);
        }
    }

    let mut form = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", account.refresh_token.as_str()),
        ("client_id", account.client_id.as_str()),
    ];
    if !account.client_secret.is_empty() {
        form.push(("client_secret", account.client_secret.as_str()));
    }

    let response = reqwest::Client::new()
        .post(TOKEN_ENDPOINT)
        .form(&form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        // invalid_grant means the user revoked access, or changed their
        // password — the stored refresh token is dead and reconnecting is the
        // only fix, so say that rather than echoing Google's wording.
        if body["error"].as_str() == Some("invalid_grant") {
            let who = if account.account.is_empty() {
                "one of your calendar accounts".to_string()
            } else {
                account.account.clone()
            };
            return Err(format!(
                "Google rejected the saved sign-in for {who}. Reconnect it in settings."
            ));
        }
        return Err(format!("Google token refresh failed: {}", body));
    }

    let token = body["access_token"]
        .as_str()
        .ok_or("Google returned no access token")?
        .to_string();
    let lifetime = body["expires_in"].as_u64().unwrap_or(3600);

    access_cache().lock().expect("access cache poisoned").insert(
        account.id.clone(),
        (token.clone(), Instant::now() + Duration::from_secs(lifetime)),
    );

    Ok(token)
}

// ---------------------------------------------------------------------------
// The consent flow
// ---------------------------------------------------------------------------

/// What a completed sign-in yields.
#[derive(Debug, Clone, Serialize)]
pub struct Connection {
    pub refresh_token: String,
    /// The address of the account that signed in, for the settings readout.
    pub account: String,
}

/// A PKCE verifier and its S256 challenge.
fn pkce_pair() -> (String, String) {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    let verifier: String = (0..64)
        .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
        .collect();
    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest);
    (verifier, challenge)
}

/// Pulls one query parameter out of a `GET /?a=b&c=d HTTP/1.1` request line.
fn query_param(request_line: &str, key: &str) -> Option<String> {
    let target = request_line.split_whitespace().nth(1)?;
    let query = target.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| urlencoding::decode(v).ok().map(|s| s.into_owned()))?
    })
}

/// The page Google's redirect lands on. The user reads this, not a JSON blob.
fn done_page(message: &str) -> String {
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>todoish</title>\
         <body style=\"font-family:ui-monospace,SFMono-Regular,Menlo,monospace;\
         background:#14151a;color:#e8e8ea;display:flex;align-items:center;\
         justify-content:center;height:100vh;margin:0\">\
         <div style=\"text-align:center\"><div style=\"font-size:13px;opacity:.5;\
         letter-spacing:.1em\">todoish</div><p style=\"font-size:15px\">{message}</p>\
         <p style=\"font-size:13px;opacity:.5\">you can close this tab</p></div>"
    );
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    )
}

/// Blocks on the loopback listener until Google redirects to it.
///
/// Runs on a blocking thread: this waits on a human, not on IO, and parking a
/// tokio worker for up to three minutes would starve the sync loop.
fn await_code(listener: TcpListener) -> Result<String, String> {
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("could not listen for Google's redirect: {e}"))?;

    let deadline = Instant::now() + CONSENT_TIMEOUT;

    for incoming in listener.incoming() {
        if Instant::now() > deadline {
            return Err("Timed out waiting for Google sign-in.".into());
        }
        let Ok(mut stream) = incoming else { continue };

        let mut line = String::new();
        if BufReader::new(&stream).read_line(&mut line).is_err() {
            continue;
        }

        // Browsers ask for /favicon.ico off their own bat; that is not the
        // redirect, and answering it as one would abandon the real request.
        if line.contains("/favicon.ico") {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
            continue;
        }

        if let Some(code) = query_param(&line, "code") {
            let _ = stream.write_all(done_page("calendar connected").as_bytes());
            let _ = stream.flush();
            return Ok(code);
        }

        if let Some(error) = query_param(&line, "error") {
            let _ = stream.write_all(done_page(&format!("sign-in failed: {error}")).as_bytes());
            let _ = stream.flush();
            return Err(format!("Google sign-in was refused: {error}"));
        }
    }

    Err("Google sign-in did not complete.".into())
}

/// Opens the browser at Google's consent screen and waits for the redirect.
///
/// The listener is bound *before* the browser opens so the redirect URI is
/// known and cannot race — a browser that is already running can hit the port
/// before this function would otherwise have got round to listening.
pub async fn connect(client_id: &str, client_secret: &str) -> Result<Connection, String> {
    let client_id = client_id.trim();
    if client_id.is_empty() {
        return Err("Add a Google OAuth client id in settings first.".into());
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("could not open a local port for Google's redirect: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let (verifier, challenge) = pkce_pair();

    let url = format!(
        "{AUTH_ENDPOINT}?client_id={}&redirect_uri={}&response_type=code&scope={}\
         &code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPES),
        urlencoding::encode(&challenge),
    );

    open_browser(&url)?;

    let code = tokio::task::spawn_blocking(move || await_code(listener))
        .await
        .map_err(|e| format!("sign-in listener stopped: {e}"))??;

    let mut form = vec![
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri.as_str()),
        ("code_verifier", verifier.as_str()),
    ];
    let client_secret = client_secret.trim();
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret));
    }

    let response = reqwest::Client::new()
        .post(TOKEN_ENDPOINT)
        .form(&form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Google refused the sign-in: {}", body));
    }

    // Only the first consent for a client returns a refresh token, which is why
    // the auth URL forces `prompt=consent` — without it, reconnecting an
    // already-approved account yields an access token and nothing durable.
    let refresh_token = body["refresh_token"]
        .as_str()
        .ok_or(
            "Google did not return a refresh token. Remove todoish at \
             myaccount.google.com/permissions and connect again.",
        )?
        .to_string();

    let access = body["access_token"].as_str().unwrap_or_default();
    let account = fetch_account(access).await.unwrap_or_default();

    Ok(Connection { refresh_token, account })
}

async fn fetch_account(access_token: &str) -> Result<String, String> {
    let body: Value = reqwest::Client::new()
        .get(USERINFO)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(body["email"].as_str().unwrap_or_default().to_string())
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    };

    command
        .arg(url)
        .spawn()
        .map_err(|e| format!("could not open the browser for Google sign-in: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

/// One entry of the account's calendar list, for the settings picker.
#[derive(Debug, Clone, Serialize)]
pub struct CalendarInfo {
    pub id: String,
    pub name: String,
    /// The account's own default calendar.
    pub primary: bool,
    /// False for calendars shared read-only, which cannot be written back to.
    pub writable: bool,
}

pub async fn list_calendars(account: &GoogleAccount) -> Result<Vec<CalendarInfo>, String> {
    let token = access_token(account).await?;
    let body: Value = get(&format!("{API}/users/me/calendarList"), &token).await?;

    Ok(body["items"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|c| {
                    let role = c["accessRole"].as_str().unwrap_or("reader");
                    // The primary calendar's `summary` defaults to the
                    // account's email — `summaryOverride` is what shows up
                    // when the user has actually renamed it (e.g. to
                    // "Personal" or "Work") in Google Calendar's own
                    // settings, so it takes priority when present.
                    let name = c["summaryOverride"]
                        .as_str()
                        .or_else(|| c["summary"].as_str())
                        .unwrap_or("(untitled)")
                        .to_string();
                    CalendarInfo {
                        id: c["id"].as_str().unwrap_or_default().to_string(),
                        name,
                        primary: c["primary"].as_bool().unwrap_or(false),
                        writable: matches!(role, "owner" | "writer"),
                    }
                })
                .filter(|c| !c.id.is_empty())
                .collect()
        })
        .unwrap_or_default())
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// A Google event flattened into the shape the rest of the app speaks.
#[derive(Debug, Clone)]
pub struct Event {
    pub id: String,
    pub calendar_id: String,
    pub name: String,
    pub status: String,
    pub start: Option<String>,
    pub end: Option<String>,
    pub deadline: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    pub created_time: Option<String>,
    pub last_edited_time: Option<String>,
}

/// Reads `start`/`end`, which is either a timed `dateTime` or an all-day `date`.
fn read_endpoint(value: &Value) -> Option<String> {
    value["dateTime"]
        .as_str()
        .or_else(|| value["date"].as_str())
        .map(|s| s.to_string())
}

fn is_all_day(value: &Value) -> bool {
    value["date"].is_string()
}

/// Shifts an all-day `YYYY-MM-DD` by whole days.
fn shift_date(date: &str, days: i64) -> Option<String> {
    let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    Some(
        parsed
            .checked_add_signed(chrono::Duration::days(days))?
            .format("%Y-%m-%d")
            .to_string(),
    )
}

fn private_prop(event: &Value, key: &str) -> Option<String> {
    event["extendedProperties"]["private"][key]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn to_event(raw: &Value, calendar_id: &str) -> Option<Event> {
    let id = raw["id"].as_str()?.to_string();
    // A cancelled instance of a recurring event still comes back in the list;
    // it is a tombstone, not something to put on screen.
    if raw["status"].as_str() == Some("cancelled") {
        return None;
    }

    let name = raw["summary"].as_str().unwrap_or("(no title)").to_string();
    let start = read_endpoint(&raw["start"]);

    // Google's all-day `end.date` is exclusive — a one-day event ends the
    // following morning. Pulling it back a day makes it mean what it reads as,
    // and collapses single-day events to no end at all.
    let end = match (&start, is_all_day(&raw["end"])) {
        (Some(from), true) => read_endpoint(&raw["end"])
            .and_then(|to| shift_date(&to, -1))
            .filter(|to| to != from),
        _ => read_endpoint(&raw["end"]),
    };

    Some(Event {
        id,
        calendar_id: calendar_id.to_string(),
        // Google has no notion of a task status, so an event todoish has never
        // touched simply reads as Todo.
        status: private_prop(raw, PROP_STATUS).unwrap_or_else(|| "Todo".to_string()),
        deadline: private_prop(raw, PROP_DEADLINE),
        name,
        start,
        end,
        description: raw["description"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        url: raw["htmlLink"].as_str().map(|s| s.to_string()),
        created_time: raw["created"].as_str().map(|s| s.to_string()),
        last_edited_time: raw["updated"].as_str().map(|s| s.to_string()),
    })
}

/// Every event in the sync window, across each of the account's configured
/// calendars.
///
/// An empty `calendars` means the account's own calendar, which is what
/// `primary` resolves to — that is the sensible default before the user has
/// picked anything in settings.
pub async fn fetch_events(account: &GoogleAccount) -> Result<Vec<Event>, String> {
    let token = access_token(account).await?;

    let now = chrono::Utc::now();
    let min = (now - chrono::Duration::days(WINDOW_BACK_DAYS)).to_rfc3339();
    let max = (now + chrono::Duration::days(WINDOW_FORWARD_DAYS)).to_rfc3339();

    let default = vec!["primary".to_string()];
    let calendar_ids: Vec<String>;
    let calendars = if account.calendars.is_empty() {
        &default
    } else {
        calendar_ids = account.calendars.iter().map(|c| c.id.clone()).collect();
        &calendar_ids
    };

    let mut events = Vec::new();
    for calendar_id in calendars {
        events.extend(fetch_calendar(&token, calendar_id, &min, &max).await?);
    }
    Ok(events)
}

async fn fetch_calendar(
    token: &str,
    calendar_id: &str,
    min: &str,
    max: &str,
) -> Result<Vec<Event>, String> {
    let mut events = Vec::new();
    let mut page: Option<String> = None;

    loop {
        // singleEvents expands a recurring event into its occurrences, which is
        // what a calendar shows; without it a weekly standup is one row with an
        // RRULE the frontend would have to interpret itself.
        let mut url = format!(
            "{API}/calendars/{}/events?singleEvents=true&orderBy=startTime\
             &maxResults=250&timeMin={}&timeMax={}",
            urlencoding::encode(calendar_id),
            urlencoding::encode(min),
            urlencoding::encode(max),
        );
        if let Some(cursor) = &page {
            url.push_str(&format!("&pageToken={}", urlencoding::encode(cursor)));
        }

        let body: Value = get(&url, token).await.map_err(|e| {
            format!("Google Calendar error reading \"{calendar_id}\": {e}")
        })?;

        if let Some(items) = body["items"].as_array() {
            events.extend(items.iter().filter_map(|raw| to_event(raw, calendar_id)));
        }

        match body["nextPageToken"].as_str() {
            Some(next) => page = Some(next.to_string()),
            None => break,
        }
    }

    Ok(events)
}

/// Builds the request body shared by create and update.
///
/// Google requires an `end` on every event, so one is derived when todoish only
/// knows a start: an hour for a timed event, the same day for an all-day one.
fn event_body(
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
    status: Option<&str>,
) -> Result<Value, String> {
    let start = start.filter(|s| !s.is_empty()).ok_or(
        "A calendar event needs a time. Add one, or keep this item in Notion.",
    )?;
    let all_day = !start.contains('T');
    let end = end.filter(|e| !e.is_empty());

    let (start_value, end_value) = if all_day {
        // Written back exclusive, the way Google stores it.
        let last_day = end.unwrap_or(start);
        let exclusive = shift_date(last_day, 1)
            .ok_or_else(|| format!("could not read the date \"{last_day}\""))?;
        (json!({ "date": start }), json!({ "date": exclusive }))
    } else {
        let finish = match end {
            Some(e) => e.to_string(),
            None => chrono::DateTime::parse_from_rfc3339(start)
                .map_err(|e| format!("could not read the time \"{start}\": {e}"))
                .map(|t| (t + chrono::Duration::hours(1)).to_rfc3339())?,
        };
        (json!({ "dateTime": start }), json!({ "dateTime": finish }))
    };

    // Both keys are always sent: omitting one leaves the old value in place on
    // a PATCH, so clearing a deadline in todoish would silently not stick.
    let mut private = serde_json::Map::new();
    private.insert(PROP_STATUS.into(), json!(status.unwrap_or("Todo")));
    private.insert(
        PROP_DEADLINE.into(),
        json!(deadline.filter(|d| !d.is_empty()).unwrap_or("")),
    );

    Ok(json!({
        "summary": name,
        "description": description.unwrap_or(""),
        "start": start_value,
        "end": end_value,
        "extendedProperties": { "private": private },
    }))
}

pub async fn create_event(
    account: &GoogleAccount,
    calendar_id: &str,
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
) -> Result<Event, String> {
    let token = access_token(account).await?;
    let body = event_body(name, start, end, deadline, description, Some("Todo"))?;

    let url = format!("{API}/calendars/{}/events", urlencoding::encode(calendar_id));
    let raw = send(reqwest::Client::new().post(&url), &token, body).await?;

    to_event(&raw, calendar_id).ok_or_else(|| "Google returned an unreadable event".into())
}

#[allow(clippy::too_many_arguments)]
pub async fn update_event(
    account: &GoogleAccount,
    calendar_id: &str,
    event_id: &str,
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
    status: &str,
) -> Result<(), String> {
    let token = access_token(account).await?;
    let body = event_body(name, start, end, deadline, description, Some(status))?;
    patch(&token, calendar_id, event_id, body).await
}

/// Writes just the status, leaving the rest of the event untouched.
pub async fn set_event_status(
    account: &GoogleAccount,
    calendar_id: &str,
    event_id: &str,
    status: &str,
) -> Result<(), String> {
    let token = access_token(account).await?;
    let mut private = serde_json::Map::new();
    private.insert(PROP_STATUS.into(), json!(status));
    let body = json!({ "extendedProperties": { "private": private } });
    patch(&token, calendar_id, event_id, body).await
}

pub async fn delete_event(
    account: &GoogleAccount,
    calendar_id: &str,
    event_id: &str,
) -> Result<(), String> {
    let token = access_token(account).await?;
    let url = format!(
        "{API}/calendars/{}/events/{}",
        urlencoding::encode(calendar_id),
        urlencoding::encode(event_id),
    );

    let response = reqwest::Client::new()
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // 410 Gone means someone else already deleted it — the caller wanted it
    // gone and it is gone, so that is not a failure to report.
    if response.status().is_success() || response.status().as_u16() == 410 {
        return Ok(());
    }
    Err(format!(
        "Google Calendar error: {}",
        response.text().await.unwrap_or_default()
    ))
}

async fn patch(
    token: &str,
    calendar_id: &str,
    event_id: &str,
    body: Value,
) -> Result<(), String> {
    let url = format!(
        "{API}/calendars/{}/events/{}",
        urlencoding::encode(calendar_id),
        urlencoding::encode(event_id),
    );
    send(reqwest::Client::new().patch(&url), token, body).await?;
    Ok(())
}

async fn get(url: &str, token: &str) -> Result<Value, String> {
    let response = reqwest::Client::new()
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(describe_error(&body));
    }
    Ok(body)
}

async fn send(
    request: reqwest::RequestBuilder,
    token: &str,
    body: Value,
) -> Result<Value, String> {
    let response = request
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(describe_error(&body));
    }
    Ok(body)
}

/// Google nests the useful part of an error two levels down.
fn describe_error(body: &Value) -> String {
    let message = body["error"]["message"]
        .as_str()
        .or_else(|| body["error_description"].as_str())
        .unwrap_or("unknown error");
    format!("Google Calendar error: {message}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_the_url_safe_sha256_of_the_verifier() {
        let (verifier, challenge) = pkce_pair();
        assert_eq!(verifier.len(), 64);
        let expected = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(Sha256::digest(verifier.as_bytes()));
        assert_eq!(challenge, expected);
        assert!(!challenge.contains('='), "the challenge must not be padded");
    }

    #[test]
    fn pkce_verifiers_differ_between_sign_ins() {
        assert_ne!(pkce_pair().0, pkce_pair().0);
    }

    #[test]
    fn the_redirect_code_is_read_off_the_request_line() {
        let line = "GET /?code=4%2F0Ab_ce&scope=https%3A%2F%2Fx HTTP/1.1";
        assert_eq!(query_param(line, "code").as_deref(), Some("4/0Ab_ce"));
        assert_eq!(query_param(line, "error"), None);
    }

    #[test]
    fn a_refused_sign_in_is_read_as_an_error() {
        let line = "GET /?error=access_denied HTTP/1.1";
        assert_eq!(query_param(line, "error").as_deref(), Some("access_denied"));
        assert_eq!(query_param(line, "code"), None);
    }

    #[test]
    fn a_request_with_no_query_yields_nothing() {
        assert_eq!(query_param("GET / HTTP/1.1", "code"), None);
    }

    #[test]
    fn an_all_day_events_exclusive_end_is_pulled_back_a_day() {
        // Google stores 20 Aug as starting the 20th and ending the 21st.
        let raw = json!({
            "id": "e1",
            "summary": "conference",
            "start": { "date": "2026-08-20" },
            "end": { "date": "2026-08-21" },
        });
        let event = to_event(&raw, "primary").expect("event should parse");
        assert_eq!(event.start.as_deref(), Some("2026-08-20"));
        assert_eq!(event.end, None, "a single all-day event has no separate end");
    }

    #[test]
    fn a_multi_day_all_day_event_keeps_its_last_day() {
        let raw = json!({
            "id": "e1",
            "summary": "retreat",
            "start": { "date": "2026-08-20" },
            "end": { "date": "2026-08-23" },
        });
        let event = to_event(&raw, "primary").unwrap();
        assert_eq!(event.end.as_deref(), Some("2026-08-22"));
    }

    #[test]
    fn a_timed_events_end_is_taken_as_written() {
        let raw = json!({
            "id": "e1",
            "summary": "standup",
            "start": { "dateTime": "2026-08-20T09:00:00-06:00" },
            "end": { "dateTime": "2026-08-20T09:15:00-06:00" },
        });
        let event = to_event(&raw, "primary").unwrap();
        assert_eq!(event.end.as_deref(), Some("2026-08-20T09:15:00-06:00"));
    }

    #[test]
    fn todoish_fields_round_trip_through_private_properties() {
        let raw = json!({
            "id": "e1",
            "summary": "grant",
            "start": { "dateTime": "2026-08-20T09:00:00-06:00" },
            "end": { "dateTime": "2026-08-20T10:00:00-06:00" },
            "extendedProperties": { "private": {
                "todoish_status": "In Progress",
                "todoish_deadline": "2026-09-01",
            }},
        });
        let event = to_event(&raw, "primary").unwrap();
        assert_eq!(event.status, "In Progress");
        assert_eq!(event.deadline.as_deref(), Some("2026-09-01"));
    }

    #[test]
    fn an_event_google_has_never_seen_todoish_touch_reads_as_todo() {
        let raw = json!({
            "id": "e1",
            "summary": "dentist",
            "start": { "dateTime": "2026-08-20T09:00:00-06:00" },
        });
        assert_eq!(to_event(&raw, "primary").unwrap().status, "Todo");
    }

    #[test]
    fn cancelled_occurrences_are_dropped() {
        let raw = json!({ "id": "e1", "status": "cancelled" });
        assert!(to_event(&raw, "primary").is_none());
    }

    #[test]
    fn a_timed_event_with_no_end_gets_an_hour() {
        let body = event_body(
            "standup",
            Some("2026-08-20T09:00:00-06:00"),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        assert_eq!(body["end"]["dateTime"], "2026-08-20T10:00:00-06:00");
    }

    #[test]
    fn an_all_day_event_is_written_back_with_an_exclusive_end() {
        let body = event_body("conference", Some("2026-08-20"), None, None, None, None).unwrap();
        assert_eq!(body["start"]["date"], "2026-08-20");
        assert_eq!(body["end"]["date"], "2026-08-21");
    }

    #[test]
    fn a_cleared_deadline_is_written_as_empty_rather_than_omitted() {
        // A PATCH that omits the key would leave the old deadline in place.
        let body = event_body("x", Some("2026-08-20"), None, None, None, Some("Done")).unwrap();
        let private = &body["extendedProperties"]["private"];
        assert_eq!(private[PROP_DEADLINE], "");
        assert_eq!(private[PROP_STATUS], "Done");
    }

    #[test]
    fn an_event_without_a_time_is_refused() {
        // Google has nowhere to put an item that only has a deadline.
        assert!(event_body("someday", None, None, Some("2026-09-01"), None, None).is_err());
    }

    #[test]
    fn googles_nested_error_message_is_surfaced() {
        let body = json!({ "error": { "code": 404, "message": "Not Found" } });
        assert_eq!(describe_error(&body), "Google Calendar error: Not Found");
    }
}
