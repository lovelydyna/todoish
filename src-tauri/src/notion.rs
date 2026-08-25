//! The Notion client. One Notion **data source** backs the whole app:
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
//! same rows.
//!
//! Notion's 2025-09-03 API split "database" (a container) from "data source"
//! (the table inside it), and queries now address a data source. The id in a
//! database URL is still a *database* id, so [`resolve_source`] accepts
//! either and looks up the data source when it needs to — the user should not
//! have to know which kind of id they pasted.

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

/// What the app matched in a user's database, for the settings readout.
#[derive(Debug, Clone, Serialize)]
pub struct SchemaReport {
    pub title: String,
    pub status: Option<String>,
    /// The option written for each stage, e.g. ["Not started", "In progress", "Done"].
    pub status_options: Vec<String>,
    pub time: Option<String>,
    pub deadline: Option<String>,
    pub description: Option<String>,
    pub missing: Vec<String>,
}

/// Reads the database and reports which property fills each role. Bypasses the
/// cache so it reflects renames made since the app started.
pub async fn describe_schema(api_key: &str, database_id: &str) -> Result<SchemaReport, String> {
    forget_sources();
    let source = resolve_source(api_key, database_id).await?;
    let schema = source.schema;
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

    Ok(SchemaReport {
        missing: schema.missing(),
        title: schema.title.clone(),
        status: schema.status.as_ref().map(|st| st.name.clone()),
        status_options,
        time: schema.time,
        deadline: schema.deadline,
        description: schema.description,
    })
}

/// Resolved sources, keyed by whatever id the user configured. Resolution
/// costs two round trips, and the sync loop runs every 60s.
static SOURCES: OnceLock<Mutex<HashMap<String, Source>>> = OnceLock::new();

fn source_cache() -> &'static Mutex<HashMap<String, Source>> {
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

/// Turns a configured id — database *or* data source — into a data source id.
///
/// Tries the database endpoint first, since the id people copy out of a Notion
/// URL is a database id. A database with several data sources resolves to the
/// first one; picking between them would need UI this app does not have.
pub async fn resolve_source(api_key: &str, configured_id: &str) -> Result<Source, String> {
    let configured_id = configured_id.trim();
    if configured_id.is_empty() {
        return Err("No database configured".into());
    }

    if let Some(hit) = source_cache()
        .lock()
        .expect("source cache poisoned")
        .get(configured_id)
    {
        return Ok(hit.clone());
    }

    let data_source_id = lookup_data_source(api_key, configured_id).await?;
    let schema = fetch_schema(api_key, &data_source_id).await?;
    let source = Source { data_source_id, schema };

    source_cache()
        .lock()
        .expect("source cache poisoned")
        .insert(configured_id.to_string(), source.clone());
    Ok(source)
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
    .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Notion API error reading schema: {}", text));
    }

    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(detect_schema(&body["properties"]))
}

/// Clears the cache so the next call re-reads ids and schema. Called after the
/// user saves settings, since they may have pointed at a different database or
/// renamed a property.
pub fn forget_sources() {
    source_cache()
        .lock()
        .expect("source cache poisoned")
        .clear();
}

async fn lookup_data_source(api_key: &str, id: &str) -> Result<String, String> {
    let client = Client::new();

    let response = authed(
        client.get(format!("https://api.notion.com/v1/databases/{}", id)),
        api_key,
    )
    .send()
    .await
    .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        let first = body["data_sources"]
            .as_array()
            .and_then(|sources| sources.first())
            .and_then(|source| source["id"].as_str());
        return match first {
            Some(ds) => Ok(ds.to_string()),
            None => Err(format!(
                "Notion database {id} has no data sources — open it in Notion and check                  ··· → Manage data sources"
            )),
        };
    }

    // Not a database id. The other possibility is that it already *is* a data
    // source id, which is what the "Copy data source ID" button hands you.
    let probe = authed(
        client.get(format!("https://api.notion.com/v1/data_sources/{}", id)),
        api_key,
    )
    .send()
    .await
    .map_err(|e| e.to_string())?;

    if probe.status().is_success() {
        return Ok(id.to_string());
    }

    let detail = probe.text().await.unwrap_or_default();
    Err(format!(
        "Notion could not find a database or data source with id `{id}`. Check the id, and          that the database is shared with your connection (··· → Connections). {detail}"
    ))
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

fn page_to_item(page: NotionPage, schema: &Schema) -> Option<Item> {
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

pub async fn fetch_items(api_key: &str, database_id: &str) -> Result<Vec<Item>, String> {
    let source = resolve_source(api_key, database_id).await?;
    with_retry(|| fetch_items_once(api_key, &source)).await
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
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Notion API error: {}", text));
        }

        let data: NotionQueryResponse = response.json().await.map_err(|e| e.to_string())?;
        items.extend(
            data.results
                .into_iter()
                .filter_map(|page| page_to_item(page, &source.schema)),
        );

        match (data.has_more, data.next_cursor) {
            (true, Some(next)) => cursor = Some(next),
            _ => break,
        }
    }

    Ok(items)
}

pub async fn create_item(
    api_key: &str,
    database_id: &str,
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
) -> Result<Item, String> {
    let source = resolve_source(api_key, database_id).await?;

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
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Notion API error: {}", text));
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
        calendar_id: None,
        account_id: None,
        url: None,
    })
}

pub async fn update_item(
    api_key: &str,
    database_id: &str,
    item_id: &str,
    name: &str,
    start: Option<&str>,
    end: Option<&str>,
    deadline: Option<&str>,
    description: Option<&str>,
) -> Result<(), String> {
    let source = resolve_source(api_key, database_id).await?;
    let props = item_properties(&source.schema, name, start, end, deadline, description);
    patch_page(api_key, item_id, json!({ "properties": props })).await
}

pub async fn set_item_status(
    api_key: &str,
    database_id: &str,
    item_id: &str,
    status: &str,
) -> Result<(), String> {
    let source = resolve_source(api_key, database_id).await?;
    let Some(property) = source.schema.status else {
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
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Notion API error: {}", text));
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
        assert!(page_to_item(page, &full_schema()).is_none());
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
        let item = page_to_item(page, &full_schema()).expect("item should parse");
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
        assert_eq!(page_to_item(page, &full_schema()).unwrap().status, "Todo");
    }
}
