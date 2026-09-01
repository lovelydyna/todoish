//! The Notion client. Every database shared with the integration backs the
//! app — there's no id to configure. [`resolve_sources`] finds them via
//! `/v1/search`, the same visibility a manually-pasted id was always subject
//! to (a database only shows up once you add the integration under its own
//! "··· → Connections" menu in Notion).
//!
//! | Property      | Notion type             | Meaning                       |
//! |---------------|-------------------------|-------------------------------|
//! | `Name`        | title                   | what it is                    |
//! | `Status`      | status                  | Todo · In Progress · Done     |
//! | `Time`        | date (with time, range) | when it happens               |
//! | `Deadline`    | date                    | when it must be finished by   |
//! | `Description` | rich text               | free-form notes               |
//!
//! The task view groups by deadline, the calendar view by time. Both read the
//! same rows, merged across every shared database.
//!
//! Notion's 2025-09-03 API split "database" (a container, sharing and all)
//! from "data source" (the actual table — queried, written to, and searched
//! for directly; `/v1/search` has no "database" filter value at all, only
//! `"page"` and `"data_source"`).

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const NOTION_VERSION: &str = "2025-09-03";

/// A resolved data source plus the property names it actually uses.
#[derive(Clone, Debug)]
pub struct Source {
    pub data_source_id: String,
    /// The database's own title, for labeling multiple shared databases and
    /// for picking a deterministic default (alphabetically first) when more
    /// than one is shared and nothing else says which to use.
    pub title: String,
    pub schema: Schema,
}

/// Which property in *this* data source plays each role.
///
/// Notion lets people name and rename properties freely, so hardcoding "Time"
/// or "Name" makes the app fail on any database that spells things
/// differently. Reads tolerated that — a missing property just parses as
/// `None` — but writing to a property that does not exist is a hard 400.
/// The status property, resolved down to the option name for each stage.
///
/// Notion status properties carry both *options* ("Not started", "Done") and
/// *groups* ("To-do", "In progress", "Complete"). The group is what actually
/// means "finished" — option names are free text and get renamed — so the app
/// keys completion off the group and remembers which option to write for each.
#[derive(Clone, Debug)]
pub struct StatusProperty {
    pub name: String,
    pub todo: Option<String>,
    pub in_progress: Option<String>,
    pub done: Option<String>,
}

impl StatusProperty {
    /// Canonical stage for an option name, as the frontend understands it.
    fn stage_of(&self, option: &str) -> &'static str {
        let matches = |candidate: &Option<String>| {
            candidate.as_deref().is_some_and(|c| c.eq_ignore_ascii_case(option))
        };
        if matches(&self.done) { return "Done"; }
        if matches(&self.in_progress) { return "In Progress"; }
        "Todo"
    }

    /// The option name to write for a canonical stage.
    fn option_for(&self, stage: &str) -> Option<&str> {
        match stage {
            "Done" => self.done.as_deref(),
            "In Progress" => self.in_progress.as_deref(),
            _ => self.todo.as_deref(),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct Schema {
    /// Every Notion database has exactly one title property, whatever it's called.
    pub title: String,
    pub status: Option<StatusProperty>,
    pub time: Option<String>,
    pub deadline: Option<String>,
    pub description: Option<String>,
}

impl Schema {
    /// The roles this data source cannot fill, for telling the user what to add.
    pub fn missing(&self) -> Vec<String> {
        let mut gaps = Vec::new();
        match &self.status {
            None => gaps.push("Status — a status property".into()),
            Some(status) => {
                if status.done.is_none() {
                    gaps.push(format!(
                        "{} — needs an option in the Complete group",
                        status.name
                    ));
                }
            }
        }
        if self.time.is_none() { gaps.push("Date or Time — a date property".into()); }
        if self.deadline.is_none() { gaps.push("Deadline — a date property".into()); }
        if self.description.is_none() { gaps.push("Description — a text property".into()); }
        gaps
    }
}

/// What the app matched in one shared database, for the settings readout.
#[derive(Debug, Clone, Serialize)]
pub struct SchemaReport {
    /// The database's own title, so a settings list of several reads as
    /// "School: ...", "Work: ..." rather than an unlabeled stack.
    pub database_title: String,
    pub title: String,
    pub status: Option<String>,
    /// The option written for each stage, e.g. ["Not started", "In progress", "Done"].
    pub status_options: Vec<String>,
    pub time: Option<String>,
    pub deadline: Option<String>,
    pub description: Option<String>,
    pub missing: Vec<String>,
}

impl From<&Source> for SchemaReport {
    fn from(source: &Source) -> Self {
        let schema = &source.schema;
        let status_options = schema
            .status
            .as_ref()
            .map(|st| {
                ["Todo", "In Progress", "Done"]
                    .iter()
                    .map(|stage| st.option_for(stage).unwrap_or("—").to_string())
                    .collect()
            })
            .unwrap_or_default();
        SchemaReport {
            database_title: source.title.clone(),
            missing: schema.missing(),
            title: schema.title.clone(),
            status: schema.status.as_ref().map(|st| st.name.clone()),
            status_options,
            time: schema.time.clone(),
            deadline: schema.deadline.clone(),
            description: schema.description.clone(),
        }
    }
}

/// Reads every database shared with the integration and reports which
/// property fills each role in each one. Bypasses the cache so it reflects
/// renames, or newly-shared databases, made since the app started.
pub async fn describe_schemas(api_key: &str) -> Result<Vec<SchemaReport>, String> {
    forget_sources();
    let sources = resolve_sources(api_key).await?;
    Ok(sources.iter().map(SchemaReport::from).collect())
}

/// Resolved sources, keyed by the connection token — a token only ever
/// points at one Notion workspace, so this also invalidates itself if the
/// user switches tokens without an explicit `forget_sources()`. Resolution
/// costs a search plus one round trip per database, and the sync loop runs
/// every 60s.
static SOURCES: OnceLock<Mutex<HashMap<String, Vec<Source>>>> = OnceLock::new();

fn source_cache() -> &'static Mutex<HashMap<String, Vec<Source>>> {
    SOURCES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Resolves a status property's groups down to one option name per stage.
///
/// Groups are matched by their default names first, then positionally, since
/// Notion orders them to-do → in progress → complete and people rename them.
fn detect_status(name: String, property: &Value) -> StatusProperty {
    let options = property["status"]["options"].as_array();
    let groups = property["status"]["groups"].as_array();

    // option id -> option name
    let option_name = |id: &str| -> Option<String> {
        options?
            .iter()
            .find(|o| o["id"].as_str() == Some(id))
            .and_then(|o| o["name"].as_str())
            .map(|s| s.to_string())
    };

    // The first option in a group is the one we write for that stage.
    let first_in = |group: &Value| -> Option<String> {
        group["option_ids"]
            .as_array()?
            .iter()
            .filter_map(|id| id.as_str())
            .find_map(option_name)
    };

    let pick = |names: &[&str], index: usize| -> Option<String> {
        let groups = groups?;
        groups
            .iter()
            .find(|g| {
                g["name"]
                    .as_str()
                    .is_some_and(|n| names.iter().any(|w| n.eq_ignore_ascii_case(w)))
            })
            .or_else(|| groups.get(index))
            .and_then(first_in)
    };

    StatusProperty {
        name,
        todo: pick(&["To-do", "Todo", "Not started"], 0),
        in_progress: pick(&["In progress", "Doing"], 1),
        done: pick(&["Complete", "Done", "Completed"], 2),
    }
}

/// Finds the property playing each role.
///
/// The title and status properties are matched by *type*, since those are
/// structural — there is exactly one title per database, and status is its own
/// Notion type. The three optional ones are matched by name, case-insensitively,
/// because nothing but the name distinguishes "Time" from "Deadline".
fn detect_schema(properties: &Value) -> Schema {
    let entries: Vec<(&String, &Value)> = properties
        .as_object()
        .map(|map| map.iter().collect())
        .unwrap_or_default();

    let type_of = |v: &Value| v["type"].as_str().unwrap_or("").to_string();

    let by_type = |wanted: &str| -> Option<String> {
        entries
            .iter()
            .find(|(_, v)| type_of(v) == wanted)
            .map(|(k, _)| (*k).clone())
    };

    // Tries each alias in order, skipping names already claimed by another role.
    let named = |aliases: &[&str], types: &[&str], taken: &[&str]| -> Option<String> {
        aliases.iter().find_map(|alias| {
            entries
                .iter()
                .find(|(k, v)| {
                    k.eq_ignore_ascii_case(alias)
                        && types.contains(&type_of(v).as_str())
                        && !taken.iter().any(|t| k.eq_ignore_ascii_case(t))
                })
                .map(|(k, _)| (*k).clone())
        })
    };

    // Deadline resolves first so a database with both "Date" and "Deadline"
    // can't have the deadline column swallowed by the scheduled-time role.
    let deadline = named(&["Deadline", "Due", "Due Date", "Due date"], &["date"], &[]);
    let claimed: Vec<&str> = deadline.iter().map(|s| s.as_str()).collect();
    let time = named(&["Time", "Date", "When", "Scheduled"], &["date"], &claimed);

    let status = by_type("status")
        .map(|name| {
            let property = &properties[&name];
            detect_status(name, property)
        })
        // A plain select called "Status" predates Notion's status type; it has
        // no groups, so fall back to matching option names by convention.
        .or_else(|| {
            named(&["Status"], &["select"], &[]).map(|name| StatusProperty {
                name,
                todo: Some("Todo".into()),
                in_progress: Some("In Progress".into()),
                done: Some("Done".into()),
            })
        });

    Schema {
        title: by_type("title").unwrap_or_else(|| "Name".to_string()),
        status,
        time,
        deadline,
        description: named(&["Description", "Notes", "Details"], &["rich_text"], &[]),
    }
}

/// Shared request headers. Every call needs all three.
fn authed(request: reqwest::RequestBuilder, api_key: &str) -> reqwest::RequestBuilder {
    request
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Notion-Version", NOTION_VERSION)
        .header("Content-Type", "application/json")
}

/// Every data source shared with the integration, schema and all — the
/// whole point being that nobody has to go find and paste an id. Per
/// Notion's own docs, `/v1/search` filtered to `data_source` returns exactly
/// what's been shared with the connection via "··· → Connections" on the
/// database that owns it — the same visibility rule a manually-pasted id was
/// always subject to anyway. (Searching by `"database"` is not — and was
/// never, under this API version — a valid filter value; only `"page"` and
/// `"data_source"` are. Using it is a 400, not an empty result.)
pub async fn resolve_sources(api_key: &str) -> Result<Vec<Source>, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("No Notion connection token configured".into());
    }

    if let Some(hit) = source_cache().lock().expect("source cache poisoned").get(api_key) {
        return Ok(hit.clone());
    }

    let found = search_data_sources(api_key).await?;
    if found.is_empty() {
        return Err(
            "No databases are shared with this integration yet. Open a database in Notion, \
             click \"···\" in the top right, choose Connections, and add your integration."
                .into(),
        );
    }

    let mut sources = Vec::new();
    for ds in found {
        let schema = fetch_schema(api_key, &ds.id).await?;
        sources.push(Source { data_source_id: ds.id, title: ds.title, schema });
    }
    // Deterministic order — alphabetical by title — so "the first one" (where
    // a freshly created item lands, absent any other choice) doesn't depend
    // on whatever order Notion's search happened to return.
    sources.sort_by(|a, b| a.title.cmp(&b.title));

    source_cache()
        .lock()
        .expect("source cache poisoned")
        .insert(api_key.to_string(), sources.clone());
    Ok(sources)
}

struct FoundDataSource {
    id: String,
    title: String,
}

/// Pages through `/v1/search` filtered to `data_source` objects.
async fn search_data_sources(api_key: &str) -> Result<Vec<FoundDataSource>, String> {
    let client = Client::new();
    let mut found = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut body = json!({
            "filter": { "value": "data_source", "property": "object" },
            "page_size": 100,
        });
        if let Some(c) = &cursor {
            body["start_cursor"] = json!(c);
        }

        let response = authed(client.post("https://api.notion.com/v1/search"), api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| crate::http::describe_send_error("Notion", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(describe_api_error(status, &text));
        }

        let data: NotionSearchResponse = response.json().await.map_err(|e| e.to_string())?;
        found.extend(data.results.into_iter().map(|ds| FoundDataSource {
            id: ds.id,
            title: extract_db_title(&ds.title),
        }));

        match (data.has_more, data.next_cursor) {
            (true, Some(next)) => cursor = Some(next),
            _ => break,
        }
    }

    Ok(found)
}

/// A data source's title, straight off its top-level `title` field (not
/// nested under `properties`, unlike a page's). Notion leaves this empty for
/// a genuinely untitled one, which would otherwise sort to the top of the
/// alphabetical default-source ordering and silently become where new items
/// land — "Untitled" avoids that.
fn extract_db_title(title: &[Value]) -> String {
    let joined: String = title.iter().filter_map(|v| v["plain_text"].as_str()).collect();
    if joined.is_empty() { "Untitled".to_string() } else { joined }
}

#[derive(Deserialize)]
struct NotionSearchResponse {
    results: Vec<NotionSearchResult>,
    #[serde(default)]
    has_more: bool,
    #[serde(default)]
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
struct NotionSearchResult {
    id: String,
    #[serde(default)]
    title: Vec<Value>,
}

/// Reads the data source's properties so the app can match its own field
/// names to whatever this particular database calls them.
async fn fetch_schema(api_key: &str, data_source_id: &str) -> Result<Schema, String> {
    let client = Client::new();
    let response = authed(
        client.get(format!(
            "https://api.notion.com/v1/data_sources/{}",
            data_source_id
        )),
        api_key,
    )
    .send()
    .await
    .map_err(|e| crate::http::describe_send_error("Notion", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(describe_api_error(status, &text));
    }

    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(detect_schema(&body["properties"]))
}

/// Clears the cache so the next call re-reads which databases are shared and
/// their schema. Called after the user saves settings, since they may have
/// changed the connection token, shared a new database, or renamed a property.
pub fn forget_sources() {
    source_cache()
        .lock()
        .expect("source cache poisoned")
        .clear();
}

/// Retry an async Notion API call up to 3 times with exponential backoff (1s, 2s, 4s).
/// Only retries on network errors or 5xx responses.
async fn with_retry<F, Fut, T>(mut f: F) -> Result<T, String>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let delays = [1u64, 2, 4];
    let mut last_err = String::new();
    for (attempt, &delay) in delays.iter().enumerate() {
        match f().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                last_err = e;
                if attempt < delays.len() - 1 {
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                }
            }
        }
    }
    Err(last_err)
}

/// A 401 here almost always means the connection token itself is the
/// problem — revoked, retyped wrong, or the integration was removed from
/// the workspace — so it gets a pointed hint rather than just Notion's raw
/// error body, which otherwise reads as a one-off glitch rather than
/// something with an actual fix.
fn describe_api_error(status: reqwest::StatusCode, text: &str) -> String {
    if status == reqwest::StatusCode::UNAUTHORIZED {
        format!(
            "Notion API error: {text} — check the connection token in Settings; it's revoked if \
             the integration was removed from the workspace or deleted in Notion's own integration \
             settings."
        )
    } else {
        format!("Notion API error: {text}")
    }
}

/// Where a row came from, and therefore where writes to it go back to.
pub const SOURCE_NOTION: &str = "notion";
pub const SOURCE_GOOGLE: &str = "google";

fn source_notion() -> String {
    SOURCE_NOTION.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: String,
    pub name: String,
    pub status: String,
    /// Start of the `Time` property. `None` for items that are only a deadline.
    pub start: Option<String>,
    /// End of the `Time` property when it is a range.
    pub end: Option<String>,
    pub deadline: Option<String>,
    pub description: Option<String>,
    /// Page-level Notion timestamps, used by the activity view.
    pub created_time: Option<String>,
    pub last_edited_time: Option<String>,

    /// `"notion"` or `"google"`. Everything that writes routes on this, so a
    /// row always goes back to the service it came from.
    #[serde(default = "source_notion")]
    pub source: String,
    /// Which Notion database (data source) this row lives in. `None` for
    /// Google rows. More than one database can be shared with the
    /// integration, each with its own property names and status options, so
    /// a write has to know which one a row's schema comes from.
    #[serde(default)]
    pub data_source_id: Option<String>,
    /// Which Google calendar holds this event. `None` for Notion rows.
    #[serde(default)]
    pub calendar_id: Option<String>,
    /// Which linked Google account this event belongs to. `None` for Notion
    /// rows. Two accounts can each have a calendar literally called
    /// "primary" with independently-numbered events, so writes must route on
    /// the account, not just the calendar id.
    #[serde(default)]
    pub account_id: Option<String>,
    /// Where "open in…" should go. `None` for Notion rows, whose URL is
    /// derived from the page id.
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Deserialize)]
struct NotionQueryResponse {
    results: Vec<NotionPage>,
    #[serde(default)]
    has_more: bool,
    #[serde(default)]
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
struct NotionPage {
    id: String,
    created_time: Option<String>,
    last_edited_time: Option<String>,
    properties: Value,
}

fn extract_title(props: &Value, key: &str) -> String {
    props[key]["title"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v["plain_text"].as_str())
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn extract_status(props: &Value, key: &str) -> Option<String> {
    props[key]["status"]["name"].as_str().map(|s| s.to_string())
}

/// Joins every rich-text run. Notion splits a value into one run per formatting
/// change, so reading only the first run truncates at the first bold word.
fn extract_rich_text(props: &Value, key: &str) -> Option<String> {
    let text = props[key]["rich_text"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v["plain_text"].as_str())
                .collect::<String>()
        })
        .unwrap_or_default();
    if text.is_empty() { None } else { Some(text) }
}

fn extract_date(props: &Value, key: &str) -> Option<String> {
    props[key]["date"]["start"].as_str().map(|s| s.to_string())
}

/// End of a Notion date range — `None` for single-point dates.
fn extract_date_end(props: &Value, key: &str) -> Option<String> {
    props[key]["date"]["end"].as_str().map(|s| s.to_string())
}

fn page_to_item(page: NotionPage, source: &Source) -> Option<Item> {
    let schema = &source.schema;
    let props = &page.properties;
    let name = extract_title(props, &schema.title);
    if name.is_empty() {
        return None;
    }
    let by_name = |field: &Option<String>, f: fn(&Value, &str) -> Option<String>| {
        field.as_deref().and_then(|key| f(props, key))
    };
    Some(Item {
        id: page.id,
        name,
        // The frontend only knows three stages; the option name is translated
        // here so a database using "Not started" behaves like any other.
        status: schema
            .status
            .as_ref()
            .and_then(|st| extract_status(props, &st.name).map(|opt| st.stage_of(&opt).to_string()))
            .unwrap_or_else(|| "Todo".to_string()),
        start: by_name(&schema.time, extract_date),
        end: by_name(&schema.time, extract_date_end),
        deadline: by_name(&schema.deadline, extract_date),
        description: by_name(&schema.description, extract_rich_text),
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
        source: source_notion(),
        data_source_id: Some(source.data_source_id.clone()),
        calendar_id: None,
        account_id: None,
        url: None,
    })
}

/// Builds the `properties` payload shared by create and update.
/// An empty string clears the property; `None` clears it too, so callers that
/// mean "leave alone" must not route through here.
fn item_properties(
    schema: &Schema,
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
) -> serde_json::Map<String, Value> {
    let mut props = serde_json::Map::new();
    props.insert(
        schema.title.clone(),
        json!({ "title": [{ "text": { "content": name } }] }),
    );

    // A property this database doesn't have is skipped rather than written:
    // Notion rejects the whole request if any key is unknown.
    if let Some(key) = &schema.time {
        let value = match start {
            Some(s) if !s.is_empty() => {
                let mut date = json!({ "start": s });
                if let Some(e) = end.filter(|e| !e.is_empty()) {
                    date["end"] = json!(e);
                }
                json!({ "date": date })
            }
            _ => json!({ "date": null }),
        };
        props.insert(key.clone(), value);
    }

    if let Some(key) = &schema.deadline {
        let value = match deadline {
            Some(d) if !d.is_empty() => json!({ "date": { "start": d } }),
            _ => json!({ "date": null }),
        };
        props.insert(key.clone(), value);
    }

    if let Some(key) = &schema.description {
        let value = match description {
            Some(d) if !d.is_empty() => {
                json!({ "rich_text": [{ "text": { "content": d } }] })
            }
            _ => json!({ "rich_text": [] }),
        };
        props.insert(key.clone(), value);
    }

    props
}

/// Every item across every database shared with the integration.
pub async fn fetch_items(api_key: &str) -> Result<Vec<Item>, String> {
    let sources = resolve_sources(api_key).await?;
    let mut items = Vec::new();
    for source in &sources {
        items.extend(with_retry(|| fetch_items_once(api_key, source)).await?);
    }
    Ok(items)
}

async fn fetch_items_once(api_key: &str, source: &Source) -> Result<Vec<Item>, String> {
    let client = Client::new();
    let url = format!(
        "https://api.notion.com/v1/data_sources/{}/query",
        source.data_source_id
    );

    let mut items = Vec::new();
    let mut cursor: Option<String> = None;

    // This is now the only database, so paginate rather than silently dropping
    // everything past the first 100 rows.
    loop {
        let mut body = json!({ "page_size": 100 });
        if let Some(c) = &cursor {
            body["start_cursor"] = json!(c);
        }

        let response = authed(client.post(&url), api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| crate::http::describe_send_error("Notion", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(describe_api_error(status, &text));
        }

        let data: NotionQueryResponse = response.json().await.map_err(|e| e.to_string())?;
        items.extend(
            data.results
                .into_iter()
                .filter_map(|page| page_to_item(page, source)),
        );

        match (data.has_more, data.next_cursor) {
            (true, Some(next)) => cursor = Some(next),
            _ => break,
        }
    }

    Ok(items)
}

/// The source a stored `data_source_id` refers to, or a clear error if it
/// was unshared from the integration since the row was fetched.
fn find_source<'a>(sources: &'a [Source], data_source_id: &str) -> Result<&'a Source, String> {
    sources
        .iter()
        .find(|s| s.data_source_id == data_source_id)
        .ok_or_else(|| {
            "This item's database is no longer shared with the integration — try refreshing."
                .to_string()
        })
}

/// Creates a page in whichever database is alphabetically first among those
/// shared with the integration — the same "default" role a flagged Google
/// account plays, absent any UI for choosing among several Notion databases.
pub async fn create_item(
    api_key: &str,
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
) -> Result<Item, String> {
    let sources = resolve_sources(api_key).await?;
    let source = sources.first().ok_or("No databases are shared with this integration.")?;

    let mut props = item_properties(&source.schema, name, start, end, deadline, description);
    if let Some(status) = &source.schema.status {
        if let Some(option) = status.option_for("Todo") {
            props.insert(status.name.clone(), json!({ "status": { "name": option } }));
        }
    }

    let body = json!({
        "parent": {
            "type": "data_source_id",
            "data_source_id": source.data_source_id,
        },
        "properties": props,
    });

    let client = Client::new();
    let response = authed(client.post("https://api.notion.com/v1/pages"), api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| crate::http::describe_send_error("Notion", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(describe_api_error(status, &text));
    }

    let page: NotionPage = response.json().await.map_err(|e| e.to_string())?;

    Ok(Item {
        id: page.id,
        name: name.to_string(),
        status: "Todo".to_string(), // canonical stage, whatever Notion calls it
        start: start.filter(|s| !s.is_empty()).map(str::to_string),
        end: end.filter(|s| !s.is_empty()).map(str::to_string),
        deadline: deadline.filter(|s| !s.is_empty()).map(str::to_string),
        description: description.filter(|s| !s.is_empty()).map(str::to_string),
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
        source: source_notion(),
        data_source_id: Some(source.data_source_id.clone()),
        calendar_id: None,
        account_id: None,
        url: None,
    })
}

pub async fn update_item(
    api_key: &str,
    data_source_id: &str,
    item_id: &str,
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
) -> Result<(), String> {
    let sources = resolve_sources(api_key).await?;
    let source = find_source(&sources, data_source_id)?;
    let props = item_properties(&source.schema, name, start, end, deadline, description);
    patch_page(api_key, item_id, json!({ "properties": props })).await
}

pub async fn set_item_status(
    api_key: &str,
    data_source_id: &str,
    item_id: &str,
    status: &str,
) -> Result<(), String> {
    let sources = resolve_sources(api_key).await?;
    let source = find_source(&sources, data_source_id)?;
    let Some(property) = &source.schema.status else {
        return Err(
            "This database has no Status property, so items can't be marked done. \
             Add one (type: status) in Notion."
                .into(),
        );
    };
    let Some(option) = property.option_for(status) else {
        return Err(format!(
            "The \"{}\" property has no option in the {} group — add one in Notion.",
            property.name,
            match status {
                "Done" => "Complete",
                "In Progress" => "In progress",
                _ => "To-do",
            }
        ));
    };
    patch_page(
        api_key,
        item_id,
        json!({ "properties": { property.name.clone(): { "status": { "name": option } } } }),
    )
    .await
}

pub async fn archive_item(api_key: &str, item_id: &str) -> Result<(), String> {
    patch_page(api_key, item_id, json!({ "archived": true })).await
}

async fn patch_page(api_key: &str, page_id: &str, body: Value) -> Result<(), String> {
    let client = Client::new();
    let url = format!("https://api.notion.com/v1/pages/{}", page_id);

    let response = authed(client.patch(&url), api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| crate::http::describe_send_error("Notion", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(describe_api_error(status, &text));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The property names this app was originally written against.
    fn full_schema() -> Schema {
        Schema {
            title: "Name".into(),
            status: Some(detect_status("Status".into(), &default_status_property())),
            time: Some("Time".into()),
            deadline: Some("Deadline".into()),
            description: Some("Description".into()),
        }
    }

    fn full_source() -> Source {
        Source { data_source_id: "ds1".into(), title: "Test".into(), schema: full_schema() }
    }

    /// A status property shaped the way Notion returns one by default.
    fn default_status_property() -> Value {
        json!({
            "type": "status",
            "status": {
                "options": [
                    { "id": "o1", "name": "Not started" },
                    { "id": "o2", "name": "In progress" },
                    { "id": "o3", "name": "Done" }
                ],
                "groups": [
                    { "name": "To-do", "option_ids": ["o1"] },
                    { "name": "In progress", "option_ids": ["o2"] },
                    { "name": "Complete", "option_ids": ["o3"] }
                ]
            }
        })
    }

    #[test]
    fn status_groups_map_to_stages() {
        let st = detect_status("Status".into(), &default_status_property());
        assert_eq!(st.todo.as_deref(), Some("Not started"));
        assert_eq!(st.in_progress.as_deref(), Some("In progress"));
        assert_eq!(st.done.as_deref(), Some("Done"));
    }

    #[test]
    fn completion_follows_the_group_not_the_option_name() {
        let st = detect_status("Status".into(), &default_status_property());
        // "Not started" is nothing like "Todo", but it lives in the To-do group.
        assert_eq!(st.stage_of("Not started"), "Todo");
        assert_eq!(st.stage_of("Done"), "Done");
        assert_eq!(st.option_for("Todo"), Some("Not started"));

    }

    #[test]
    fn renamed_groups_fall_back_to_position() {
        let property = json!({
            "type": "status",
            "status": {
                "options": [
                    { "id": "a", "name": "Someday" },
                    { "id": "b", "name": "Cooking" },
                    { "id": "c", "name": "Shipped" }
                ],
                "groups": [
                    { "name": "Backlog", "option_ids": ["a"] },
                    { "name": "Active", "option_ids": ["b"] },
                    { "name": "Finished", "option_ids": ["c"] }
                ]
            }
        });
        let st = detect_status("Stage".into(), &property);
        assert_eq!(st.done.as_deref(), Some("Shipped"));
        assert_eq!(st.stage_of("Shipped"), "Done");
    }

    #[test]
    fn detects_a_date_property_named_date() {
        // The schema this app was first written against called it "Time".
        let props = json!({
            "Name": { "type": "title" },
            "Date": { "type": "date" },
            "Deadline": { "type": "date" },
            "Description": { "type": "rich_text" },
            "Status": default_status_property(),
        });
        let schema = detect_schema(&props);
        assert_eq!(schema.title, "Name");
        assert_eq!(schema.time.as_deref(), Some("Date"));
        assert_eq!(schema.deadline.as_deref(), Some("Deadline"));
        assert_eq!(schema.description.as_deref(), Some("Description"));
        assert!(schema.missing().is_empty());
    }

    #[test]
    fn deadline_is_not_swallowed_by_the_time_role() {
        let props = json!({
            "Name": { "type": "title" },
            "Deadline": { "type": "date" },
        });
        let schema = detect_schema(&props);
        assert_eq!(schema.deadline.as_deref(), Some("Deadline"));
        assert_eq!(schema.time, None, "Deadline must not double as the scheduled time");
    }

    #[test]
    fn a_missing_property_is_never_written() {
        // Writing an unknown key makes Notion reject the entire request.
        let schema = Schema { title: "Name".into(), ..Schema::default() };
        let props = item_properties(
            &schema,
            "call doctor",
            Some("2026-08-10"),
            None,
            Some("2026-08-14"),
            Some("x"),
        );
        assert_eq!(props.len(), 1, "only the title exists in this schema");
        assert!(props.contains_key("Name"));
    }

    #[test]
    fn time_range_carries_both_ends() {
        let props = item_properties(
            &full_schema(),
            "standup",
            Some("2026-08-10T09:00:00-06:00"),
            Some("2026-08-10T09:15:00-06:00"),
            None,
            None,
        );
        assert_eq!(props["Time"]["date"]["start"], "2026-08-10T09:00:00-06:00");
        assert_eq!(props["Time"]["date"]["end"], "2026-08-10T09:15:00-06:00");
    }

    #[test]
    fn empty_values_clear_their_properties() {
        let props = item_properties(&full_schema(), "thesis", Some(""), None, Some(""), Some(""));
        assert!(props["Time"]["date"].is_null());
        assert!(props["Deadline"]["date"].is_null());
        assert_eq!(props["Description"]["rich_text"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn untitled_pages_are_dropped() {
        let page = NotionPage {
            id: "abc".into(),
            created_time: None,
            last_edited_time: None,
            properties: json!({ "Name": { "title": [] } }),
        };
        assert!(page_to_item(page, &full_source()).is_none());
    }

    #[test]
    fn deadline_only_item_parses() {
        let page = NotionPage {
            id: "abc".into(),
            created_time: None,
            last_edited_time: None,
            properties: json!({
                "Name": { "title": [{ "plain_text": "grant application" }] },
                "Status": { "status": { "name": "In Progress" } },
                "Time": { "date": null },
                "Deadline": { "date": { "start": "2026-09-01" } },
                "Description": { "rich_text": [
                    { "plain_text": "two " }, { "plain_text": "pages" }
                ]}
            }),
        };
        let item = page_to_item(page, &full_source()).expect("item should parse");
        assert_eq!(item.name, "grant application");
        assert_eq!(item.status, "In Progress");
        assert_eq!(item.start, None);
        assert_eq!(item.deadline.as_deref(), Some("2026-09-01"));
        assert_eq!(item.description.as_deref(), Some("two pages"));
    }

    #[test]
    fn missing_status_defaults_to_todo() {
        let page = NotionPage {
            id: "abc".into(),
            created_time: None,
            last_edited_time: None,
            properties: json!({ "Name": { "title": [{ "plain_text": "x" }] } }),
        };
        assert_eq!(page_to_item(page, &full_source()).unwrap().status, "Todo");
    }

    #[test]
    fn a_multi_run_title_is_joined() {
        let title = vec![json!({ "plain_text": "School " }), json!({ "plain_text": "Tasks" })];
        assert_eq!(extract_db_title(&title), "School Tasks");
    }

    #[test]
    fn an_untitled_database_falls_back_rather_than_sorting_first() {
        // An empty title would otherwise be the alphabetically-first string,
        // silently becoming where a fresh item lands.
        assert_eq!(extract_db_title(&[]), "Untitled");
    }

    #[test]
    fn a_row_carries_the_data_source_it_came_from() {
        let page = NotionPage {
            id: "abc".into(),
            created_time: None,
            last_edited_time: None,
            properties: json!({ "Name": { "title": [{ "plain_text": "x" }] } }),
        };
        let item = page_to_item(page, &full_source()).unwrap();
        assert_eq!(item.data_source_id.as_deref(), Some("ds1"));
    }

    #[test]
    fn find_source_locates_the_matching_data_source() {
        let sources = vec![full_source()];
        assert_eq!(find_source(&sources, "ds1").unwrap().data_source_id, "ds1");
        assert!(find_source(&sources, "gone").is_err());
    }
}
