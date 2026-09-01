//! Human-readable phrasing for the network errors both API clients hit.
//!
//! `reqwest`'s own message for a failed `.send()` — "error sending request
//! for url (...)" — reads as a problem with that specific service when it
//! is almost always the same thing regardless of which API it happened to
//! hit first: the request never reached anywhere, because the network is
//! down, DNS failed, or something in between (a VPN, a firewall) is
//! blocking it. Naming that plainly, rather than surfacing reqwest's own
//! phrasing, is the whole point of this module.

/// For a failed `.send()` specifically — before any response, good or bad,
/// came back at all.
pub fn describe_send_error(service: &str, e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        format!("Couldn't reach {service} — check your internet connection.")
    } else {
        format!("{service} request failed: {e}")
    }
}
