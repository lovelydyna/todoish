//! Read-only calendars via a plain iCal (.ics) feed URL — the "secret
//! address" Google Calendar (and anything else that speaks iCal) hands out
//! per calendar, under its own sharing settings.
//!
//! This is the low-effort alternative to linking a full Google account: no
//! OAuth client to create, no browser round trip, just a URL. The trade is
//! real, though — an .ics feed is read-only and typically only refreshes
//! every few hours on Google's side, so todoish can't write status/deadline
//! back into it the way it does for a linked Google account, and a change
//! made in Google Calendar may take a while to show up here.
//!
//! Timezones are handled loosely: a `Z`-suffixed value is UTC; anything else
//! (a bare local time, or one qualified by `TZID`) is read as its own wall
//! clock time without resolving the zone. That matches how todoish already
//! displays other date-only and local values, and is enough for a calendar
//! read in the timezone it was written in — cross-timezone accuracy is the
//! one thing this module does not attempt.

use crate::gcal::shift_date;
use crate::notion::{Item, SOURCE_ICS};

#[derive(Debug, Clone)]
pub struct IcsEvent {
    pub uid: String,
    pub name: String,
    pub description: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
}

/// Un-folds RFC 5545 line continuations (a line starting with a space or tab
/// is a continuation of the previous one) and splits on CRLF or bare LF.
fn unfold(raw: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw_line in raw.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if (line.starts_with(' ') || line.starts_with('\t')) && !lines.is_empty() {
            let last = lines.last_mut().unwrap();
            last.push_str(&line[1..]);
        } else if !line.is_empty() {
            lines.push(line.to_string());
        }
    }
    lines
}

/// Splits `NAME;PARAM=X:value` into its bare property name and value —
/// params (TZID, VALUE=DATE, …) are read separately by the caller when they
/// matter, not carried through here.
fn split_prop(line: &str) -> Option<(&str, &str)> {
    let colon = line.find(':')?;
    let (head, value) = line.split_at(colon);
    let name = head.split(';').next().unwrap_or(head);
    Some((name, &value[1..]))
}

fn unescape(value: &str) -> String {
    value
        .replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

/// Reads a `DTSTART`/`DTEND` value into todoish's own date representation —
/// `YYYY-MM-DD` for an all-day `VALUE=DATE`, otherwise the raw timestamp
/// reformatted into ISO 8601 (`Z`-suffixed if the source was UTC).
fn read_endpoint(line: &str) -> Option<(String, bool)> {
    let (name, value) = split_prop(line)?;
    let all_day = line[name.len()..].contains("VALUE=DATE") && !value.contains('T');
    if all_day {
        // 20260825 -> 2026-08-25
        if value.len() != 8 {
            return None;
        }
        return Some((format!("{}-{}-{}", &value[0..4], &value[4..6], &value[6..8]), true));
    }
    // 20260825T090000Z -> 2026-08-25T09:00:00Z (or without the trailing Z).
    let utc = value.ends_with('Z');
    let core = value.trim_end_matches('Z');
    if core.len() < 15 {
        return None;
    }
    let iso = format!(
        "{}-{}-{}T{}:{}:{}{}",
        &core[0..4], &core[4..6], &core[6..8],
        &core[9..11], &core[11..13], &core[13..15],
        if utc { "Z" } else { "" }
    );
    Some((iso, false))
}

fn parse_events(raw: &str) -> Vec<IcsEvent> {
    let lines = unfold(raw);
    let mut events = Vec::new();

    let mut in_event = false;
    let mut uid = String::new();
    let mut name = String::new();
    let mut description: Option<String> = None;
    let mut start: Option<String> = None;
    let mut end: Option<String> = None;
    let mut start_all_day = false;

    for line in &lines {
        if line == "BEGIN:VEVENT" {
            in_event = true;
            uid.clear();
            name.clear();
            description = None;
            start = None;
            end = None;
            start_all_day = false;
            continue;
        }
        if line == "END:VEVENT" {
            if in_event && !uid.is_empty() {
                // An all-day end date is exclusive in iCal too — pull it back a
                // day to mean what it reads as, same as Google's own feed.
                let end = match (&start, &end) {
                    (Some(from), Some(to)) if start_all_day => {
                        shift_date(to, -1).filter(|to| to != from)
                    }
                    _ => end.clone(),
                };
                events.push(IcsEvent {
                    uid: uid.clone(),
                    name: if name.is_empty() { "(untitled)".to_string() } else { name.clone() },
                    description: description.clone(),
                    start: start.clone(),
                    end,
                });
            }
            in_event = false;
            continue;
        }
        if !in_event {
            continue;
        }
        let Some((prop, value)) = split_prop(line) else { continue };
        match prop {
            "UID" => uid = value.to_string(),
            "SUMMARY" => name = unescape(value),
            "DESCRIPTION" => {
                let text = unescape(value);
                description = (!text.trim().is_empty()).then_some(text);
            }
            "DTSTART" => {
                if let Some((iso, all_day)) = read_endpoint(line) {
                    start = Some(iso);
                    start_all_day = all_day;
                }
            }
            "DTEND" => {
                if let Some((iso, _)) = read_endpoint(line) {
                    end = Some(iso);
                }
            }
            _ => {}
        }
    }

    events
}

/// Row id for an .ics event — namespaced by which imported calendar it came
/// from, since two different feeds could otherwise reuse the same UID.
pub fn ics_row_id(calendar_id: &str, uid: &str) -> String {
    format!("ics:{calendar_id}:{uid}")
}

pub fn to_item(event: IcsEvent, calendar_id: &str) -> Item {
    Item {
        id: ics_row_id(calendar_id, &event.uid),
        name: event.name,
        // No status concept in iCal, and nowhere to write one back to —
        // every row just reads as Todo.
        status: "Todo".to_string(),
        start: event.start,
        end: event.end,
        deadline: None,
        description: event.description,
        created_time: None,
        last_edited_time: None,
        source: SOURCE_ICS.to_string(),
        calendar_id: Some(calendar_id.to_string()),
        account_id: None,
        url: None,
    }
}

/// Fetches and parses one .ics feed into rows. A non-2xx response or
/// unreachable host is the one error case — a feed with zero events is not
/// a failure, it just yields nothing.
pub async fn fetch_events(url: &str, calendar_id: &str) -> Result<Vec<Item>, String> {
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("the calendar feed returned {}", response.status()));
    }
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(parse_events(&body)
        .into_iter()
        .map(|e| to_item(e, calendar_id))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_timed_event_parses_its_fields() {
        let ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc123\r\nSUMMARY:Standup\r\nDTSTART:20260825T090000Z\r\nDTEND:20260825T093000Z\r\nDESCRIPTION:daily sync\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let events = parse_events(ics);
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.uid, "abc123");
        assert_eq!(e.name, "Standup");
        assert_eq!(e.start.as_deref(), Some("2026-08-25T09:00:00Z"));
        assert_eq!(e.end.as_deref(), Some("2026-08-25T09:30:00Z"));
        assert_eq!(e.description.as_deref(), Some("daily sync"));
    }

    #[test]
    fn a_folded_line_is_rejoined() {
        let ics = "BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Long meeting\r\n  title continues\r\nDTSTART:20260825T090000Z\r\nEND:VEVENT\r\n";
        let events = parse_events(ics);
        assert_eq!(events[0].name, "Long meeting title continues");
    }

    #[test]
    fn an_all_day_events_exclusive_end_is_pulled_back_a_day() {
        let ics = "BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Conference\r\nDTSTART;VALUE=DATE:20260820\r\nDTEND;VALUE=DATE:20260821\r\nEND:VEVENT\r\n";
        let events = parse_events(ics);
        assert_eq!(events[0].start.as_deref(), Some("2026-08-20"));
        assert_eq!(events[0].end, None, "a single all-day event has no separate end");
    }

    #[test]
    fn a_multi_day_all_day_event_keeps_its_last_day() {
        let ics = "BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Retreat\r\nDTSTART;VALUE=DATE:20260820\r\nDTEND;VALUE=DATE:20260823\r\nEND:VEVENT\r\n";
        let events = parse_events(ics);
        assert_eq!(events[0].start.as_deref(), Some("2026-08-20"));
        assert_eq!(events[0].end.as_deref(), Some("2026-08-22"));
    }

    #[test]
    fn a_naive_local_time_has_no_trailing_z() {
        let ics = "BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Local\r\nDTSTART;TZID=America/Edmonton:20260825T090000\r\nEND:VEVENT\r\n";
        let events = parse_events(ics);
        assert_eq!(events[0].start.as_deref(), Some("2026-08-25T09:00:00"));
    }

    #[test]
    fn an_event_missing_a_uid_is_skipped() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:No id\r\nDTSTART:20260825T090000Z\r\nEND:VEVENT\r\n";
        assert!(parse_events(ics).is_empty());
    }

    #[test]
    fn escaped_characters_are_unescaped() {
        let ics = "BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Comma\\, then newline\\nsecond line\r\nEND:VEVENT\r\n";
        let events = parse_events(ics);
        assert_eq!(events[0].name, "Comma, then newline\nsecond line");
    }

    #[test]
    fn row_ids_are_namespaced_by_calendar() {
        let a = to_item(IcsEvent { uid: "e1".into(), name: "x".into(), description: None, start: None, end: None }, "cal-a");
        let b = to_item(IcsEvent { uid: "e1".into(), name: "x".into(), description: None, start: None, end: None }, "cal-b");
        assert_ne!(a.id, b.id);
        assert_eq!(a.source, SOURCE_ICS);
    }
}
