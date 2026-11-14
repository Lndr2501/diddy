//! Reads a web page's head for a link card under a chat message (#197). The page cannot fetch it
//! itself (most sites send no CORS headers). Narrow on purpose: only http(s) to public hosts
//! (no `localhost`, private addresses or local names, also after redirects), only HTML, at most
//! 1 MB, 10 seconds. The page parses the answer (`cinny/src/app/plugins/linkEmbeds.ts`).

use std::net::IpAddr;
use std::time::Duration;
use tauri_plugin_http::reqwest;

const MAX_BYTES: usize = 1024 * 1024;
const MAX_REDIRECTS: usize = 5;

/// Same rules as `isPublicHost` in linkEmbeds.ts.
pub(crate) fn public_host(host: &str) -> bool {
    let host = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host.is_empty() || host == "localhost" || host.ends_with(".localhost") {
        return false;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => {
                let [a, b, ..] = v4.octets();
                !(v4.is_private()
                    || v4.is_loopback()
                    || v4.is_link_local()
                    || v4.is_unspecified()
                    || v4.is_multicast()
                    || v4.is_broadcast()
                    || a == 0
                    || a >= 224
                    || (a == 100 && (64..=127).contains(&b)))
            }
            IpAddr::V6(v6) => {
                let first = v6.segments()[0];
                !(v6.is_loopback()
                    || v6.is_unspecified()
                    || v6.to_ipv4_mapped().is_some()
                    || (first & 0xfe00) == 0xfc00
                    || (first & 0xffc0) == 0xfe80)
            }
        };
    }
    if !host.contains('.') {
        return false;
    }
    const LOCAL: [&str; 7] = [".local", ".lan", ".home", ".internal", ".intranet", ".corp", ".home.arpa"];
    !LOCAL.iter().any(|suffix| host.ends_with(suffix))
}

fn allowed(url: &reqwest::Url) -> bool {
    matches!(url.scheme(), "http" | "https") && url.host_str().is_some_and(public_host)
}

/// HTML of the page behind a chat link (only its start, see MAX_BYTES).
#[tauri::command]
pub async fn link_preview_fetch(url: String) -> Result<String, String> {
    let url = reqwest::Url::parse(&url).map_err(|e| format!("invalid url: {e}"))?;
    if !allowed(&url) {
        return Err("only links to public web pages are read".to_string());
    }
    let client = reqwest::Client::builder()
        // Many sites (YouTube, Twitter) only put OpenGraph tags into pages for known crawlers.
        .user_agent("Mozilla/5.0 (compatible; Diddy/1.0; +https://github.com/Lndr2501/diddy) facebookexternalhit/1.1")
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() < MAX_REDIRECTS && allowed(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("page answered {}", response.status()));
    }
    let kind = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !kind.contains("html") {
        return Err("not a web page".to_string());
    }
    // Read only the start: the head with the OpenGraph tags is at the top.
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() >= MAX_BYTES {
            body.truncate(MAX_BYTES);
            break;
        }
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

#[cfg(test)]
mod tests {
    use super::public_host;

    #[test]
    fn public_and_local_hosts() {
        for host in ["example.com", "www.youtube.com", "8.8.8.8", "172.32.0.1", "[2001:4860::8888]"] {
            assert!(public_host(host), "{host}");
        }
        for host in [
            "localhost",
            "router",
            "nas.local",
            "x.lan",
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "192.168.178.62",
            "169.254.0.1",
            "100.64.0.1",
            "0.0.0.0",
            "[::1]",
            "[fd00::1]",
            "[fe80::1]",
            "[::ffff:127.0.0.1]",
        ] {
            assert!(!public_host(host), "{host}");
        }
    }
}
