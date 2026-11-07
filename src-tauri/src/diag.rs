//! The app's log file. Lines come from the Rust side (start, window, audio, connections, panics)
//! and from the page (`diag_log`: media problems, JavaScript errors). One plain text file, rotated
//! at 2 MB (`app.log` and `app.log.old`), so users can attach it to a bug report:
//!   macOS    ~/Library/Logs/Diddy/app.log
//!   Windows  %LOCALAPPDATA%\Diddy\Logs\app.log
//!   Linux    $XDG_STATE_HOME/diddy/app.log (default ~/.local/state/diddy/app.log)
//! It never contains message texts, only technical events; the page truncates error messages.

use std::{
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_LINE: usize = 600;
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

/// Folder of the log file for this platform.
pub fn log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/Diddy"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Diddy").join("Logs"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_STATE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/state")))
            .map(|d| d.join("diddy"))
    }
}

pub fn log_file() -> Option<PathBuf> {
    log_dir().map(|d| d.join("app.log"))
}

/// Appends one line (newlines removed, length limited) with a Unix timestamp.
pub fn write_line(line: &str) {
    let Some(dir) = log_dir() else {
        return;
    };
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

#[tauri::command]
pub fn diag_log(line: String) {
    write_line(&line);
}

/// Path of the log file, for the About page ("where is my log?").
#[tauri::command]
pub fn log_path() -> Option<String> {
    log_file().map(|p| p.to_string_lossy().into_owned())
}

/// Shows the log folder in the file manager.
#[tauri::command]
pub fn open_log_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = log_dir().ok_or_else(|| "Kein Log-Ordner auf diesem System.".to_string())?;
    let _ = std::fs::create_dir_all(&dir);
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Called once at startup: writes a header line (version, system) and makes panics end up in the
/// log file instead of getting lost (a packaged app has no terminal).
pub fn init(version: &str) {
    write_line(&format!(
        "---- Diddy {version} started ({} {}) ----",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let place = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".into());
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "(no message)".into());
        write_line(&format!("PANIC at {place}: {message}"));
        previous(info);
    }));
}
