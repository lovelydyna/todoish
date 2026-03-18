use crate::config::load_config;
use crate::notion;
use chrono::{DateTime, Duration, NaiveDate, NaiveTime, TimeZone, Utc};
use std::collections::HashSet;
use std::time::Duration as StdDuration;
use tauri::{AppHandle, Emitter};

fn parse_due(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(date) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let eod = date.and_time(NaiveTime::from_hms_opt(23, 59, 59)?);
        return Some(Utc.from_utc_datetime(&eod));
    }
    None
}

pub async fn start_notification_loop(app: AppHandle) {
    let mut notified: HashSet<String> = HashSet::new();

    loop {
        if let Some(config) = load_config() {
            if let Ok(tasks) =
                notion::fetch_tasks(&config.notion_api_key, &config.database_id).await
            {
                let now = Utc::now();
                let window = Duration::minutes(15);

                for task in &tasks {
                    if notified.contains(&task.id) {
                        continue;
                    }
                    if task.status == "Done" {
                        notified.insert(task.id.clone());
                        continue;
                    }
                    if let Some(ref due_str) = task.due {
                        if let Some(due_utc) = parse_due(due_str) {
                            let diff = due_utc - now;
                            if diff >= Duration::zero() && diff <= window {
                                let _ = app.emit("task-reminder", task.clone());
                                notified.insert(task.id.clone());
                            }
                        }
                    }
                }

                let active_ids: HashSet<String> =
                    tasks.iter().map(|t| t.id.clone()).collect();
                notified.retain(|id| active_ids.contains(id));
            }
        }

        tokio::time::sleep(StdDuration::from_secs(300)).await;
    }
}
