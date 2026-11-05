//! Fetching from MyInstants for the soundboard import. The page itself cannot do this: the site
//! sends no CORS headers. These two commands are deliberately narrow, they only talk to
//! myinstants.com over https and are not a general download proxy.

use std::time::Duration;
use tauri_plugin_http::reqwest;

const HOSTS: [&str; 2] = ["www.myinstants.com", "myinstants.com"];
const MAX_HTML_BYTES: usize = 3 * 1024 * 1024;
const MAX_AUDIO_BYTES: usize = 8 * 1024 * 1024;

fn allowed(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(|h| HOSTS.contains(&h))
}

fn checked_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|e| format!("invalid url: {e}"))?;
    if allowed(&url) {
        Ok(url)
    } else {
        Err("only https://myinstants.com links are allowed".to_string())
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Diddy/1.0 (soundboard import)")
        .timeout(Duration::from_secs(20))
        // Redirects must stay on myinstants.com as well.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() < 5 && allowed(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

async fn get_limited(url: &str, limit: usize, audio: bool) -> Result<Vec<u8>, String> {
    let url = checked_url(url)?;
    let response = client()?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("MyInstants answered {}", response.status()));
    }
    if audio {
        let kind = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        if !kind.starts_with("audio/") {
            return Err("not an audio file".to_string());
        }
    }
    if response.content_length().is_some_and(|len| len as usize > limit) {
        return Err("file is too large".to_string());
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > limit {
        return Err("file is too large".to_string());
    }
    Ok(bytes.to_vec())
}

/// HTML of a MyInstants page (search results or a single sound).
#[tauri::command]
pub async fn myinstants_fetch_text(url: String) -> Result<String, String> {
    let bytes = get_limited(&url, MAX_HTML_BYTES, false).await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Raw bytes of a MyInstants sound file.
#[tauri::command]
pub async fn myinstants_fetch_audio(url: String) -> Result<tauri::ipc::Response, String> {
    let bytes = get_limited(&url, MAX_AUDIO_BYTES, true).await?;
    Ok(tauri::ipc::Response::new(bytes))
}
