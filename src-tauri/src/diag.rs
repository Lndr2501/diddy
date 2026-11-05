//! A tiny diagnostics log the page can write to (`diag_log`). Lines go to
//! `~/Library/Logs/Diddy/app.log` so media problems (screen share that does not start, pixelated
//! streams) can be analysed from outside the app.

use std::{fs::OpenOptions, io::Write, time::{SystemTime, UNIX_EPOCH}};

const MAX_LINE: usize = 600;
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn diag_log(line: String) {
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let dir = std::path::Path::new(&home).join("Library/Logs/Diddy");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("app.log");

    // Start over instead of growing forever.
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_LOG_BYTES) {
        let _ = std::fs::rename(&path, dir.join("app.log.old"));
    }

    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or_default();
    let line: String = line.chars().filter(|c| *c != '\n' && *c != '\r').take(MAX_LINE).collect();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{secs:.3} {line}");
    }
}
