use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub due: Option<String>,
    pub priority: Option<String>,
    pub energy: Option<String>,
    pub snooze_until: Option<String>,
    pub last_edited_time: Option<String>,
}

#[derive(Deserialize)]
struct NotionQueryResponse {
    results: Vec<NotionPage>,
}

#[derive(Deserialize)]
struct NotionPage {
    id: String,
    last_edited_time: Option<String>,
    properties: Value,
}

fn extract_title(props: &Value, key: &str) -> String {
    props[key]["title"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|v| v["plain_text"].as_str())
        .unwrap_or("")
        .to_string()
}

fn extract_select(props: &Value, key: &str) -> Option<String> {
    props[key]["select"]["name"]
        .as_str()
        .map(|s| s.to_string())
}

fn extract_date(props: &Value, key: &str) -> Option<String> {
    props[key]["date"]["start"]
        .as_str()
        .map(|s| s.to_string())
}

pub async fn fetch_tasks(api_key: &str, database_id: &str) -> Result<Vec<Task>, String> {
    let client = Client::new();
    let url = format!(
        "https://api.notion.com/v1/databases/{}/query",
        database_id
    );

    let body = json!({
        "filter": {
            "or": [
                {"property": "Status", "select": {"equals": "Todo"}},
                {"property": "Status", "select": {"equals": "In Progress"}},
                {"property": "Status", "select": {"equals": "Snoozed"}},
                {"property": "Status", "select": {"equals": "Done"}}
            ]
        },
        "sorts": [
            {"property": "Due", "direction": "ascending"}
        ]
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Notion-Version", "2022-06-28")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Notion API error: {}", text));
    }

    let data: NotionQueryResponse = response.json().await.map_err(|e| e.to_string())?;

    let tasks = data
        .results
        .into_iter()
        .filter_map(|page| {
            let props = &page.properties;
            let title = extract_title(props, "Name");
            if title.is_empty() {
                return None;
            }

            let status =
                extract_select(props, "Status").unwrap_or_else(|| "Todo".to_string());
            let snooze_until = extract_date(props, "Snooze Until");


            Some(Task {
                id: page.id,
                title,
                status,
                due: extract_date(props, "Due"),
                priority: extract_select(props, "Priority"),
                energy: extract_select(props, "Energy"),
                snooze_until,
                last_edited_time: page.last_edited_time,
            })
        })
        .collect();

    Ok(tasks)
}

pub async fn create_task(
    api_key: &str,
    database_id: &str,
    title: &str,
    due: Option<&str>,
    priority: Option<&str>,
    energy: Option<&str>,
) -> Result<Task, String> {
    let client = Client::new();

    let mut props = serde_json::Map::new();
    props.insert("Name".into(), json!({ "title": [{ "text": { "content": title } }] }));
    props.insert("Status".into(), json!({ "select": { "name": "Todo" } }));
    if let Some(d) = due {
        props.insert("Due".into(), json!({ "date": { "start": d } }));
    }
    if let Some(p) = priority {
        props.insert("Priority".into(), json!({ "select": { "name": p } }));
    }
    if let Some(e) = energy {
        props.insert("Energy".into(), json!({ "select": { "name": e } }));
    }

    let body = json!({
        "parent": { "database_id": database_id },
        "properties": props,
    });

    let response = client
        .post("https://api.notion.com/v1/pages")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Notion-Version", "2022-06-28")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Notion API error: {}", text));
    }

    let page: NotionPage = response.json().await.map_err(|e| e.to_string())?;

    Ok(Task {
        id: page.id,
        title: title.to_string(),
        status: "Todo".to_string(),
        due: due.map(|s| s.to_string()),
        priority: priority.map(|s| s.to_string()),
        energy: energy.map(|s| s.to_string()),
        snooze_until: None,
        last_edited_time: page.last_edited_time,
    })
}

pub async fn archive_task(api_key: &str, task_id: &str) -> Result<(), String> {
    patch_task(
        api_key,
        task_id,
        json!({ "archived": true }),
    )
    .await
}

pub async fn set_task_status(api_key: &str, task_id: &str, status: &str) -> Result<(), String> {
    patch_task(
        api_key,
        task_id,
        json!({
            "properties": {
                "Status": { "select": { "name": status } }
            }
        }),
    )
    .await
}

pub async fn snooze_task(
    api_key: &str,
    task_id: &str,
    snooze_until: &str,
) -> Result<(), String> {
    patch_task(
        api_key,
        task_id,
        json!({
            "properties": {
                "Status": { "select": { "name": "Snoozed" } },
                "Snooze Until": { "date": { "start": snooze_until } }
            }
        }),
    )
    .await
}

async fn patch_task(api_key: &str, task_id: &str, body: Value) -> Result<(), String> {
    let client = Client::new();
    let url = format!("https://api.notion.com/v1/pages/{}", task_id);

    let response = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Notion-Version", "2022-06-28")
        .header("Content-Type", "application/json")
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
