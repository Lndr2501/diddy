//! Update check that runs BEFORE the main window opens (#120): Check -> (Update) -> Launch.
//!
//! A small "updater" window shows "Checking for updates...", then "Update to vX?" with release notes
//! (Update / Skip this version / Not now), a progress bar while the macOS DMG downloads, and relaunches
//! after installing. Offline or slow (3 s) means the app starts at once. The settings (on/off and the
//! GitHub repository) are written by the page of the main window into `updater.json` and read here.
//!
//! No signing keys are involved: the release workflow publishes a DMG, this module downloads it from
//! GitHub over https, checks the bundle identifier and swaps the running `.app` for the new one.
//! Pure logic (repo validation, version compare, release parsing, asset choice) is unit tested below.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const DEFAULT_REPO: &str = "Lndr2501/diddy";
const CHECK_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_DOWNLOAD_BYTES: u64 = 600 * 1024 * 1024;
const MAX_NOTES_CHARS: usize = 1500;
pub const WINDOW_LABEL: &str = "updater";

// ---------------------------------------------------------------- pure logic

/// "owner/name" as GitHub allows it.
pub fn valid_repo(repo: &str) -> bool {
    let repo = repo.trim();
    let Some((owner, name)) = repo.split_once('/') else { return false };
    let owner_ok = !owner.is_empty()
        && owner.len() <= 39
        && !owner.starts_with('-')
        && owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    let name_ok = !name.is_empty()
        && name.len() <= 100
        && name != "."
        && name != ".."
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    owner_ok && name_ok
}

/// Compares dotted versions ("1.10.0" > "1.9.2"); a leading "v" and a "-suffix" are ignored.
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    fn parse(v: &str) -> Vec<u64> {
        v.trim()
            .trim_start_matches('v')
            .split(['-', '+'])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect()
    }
    let (pa, pb) = (parse(a), parse(b));
    for i in 0..pa.len().max(pb.len()) {
        let o = pa.get(i).unwrap_or(&0).cmp(pb.get(i).unwrap_or(&0));
        if o != Ordering::Equal {
            return o;
        }
    }
    Ordering::Equal
}

/// Only GitHub hosts may serve a download or a release page.
pub fn is_github_url(raw: &str) -> bool {
    let Some(rest) = raw.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.contains('@') || host.contains(':') {
        return false;
    }
    host == "github.com" || host.ends_with(".github.com") || host.ends_with(".githubusercontent.com")
}

#[derive(Debug, Clone, PartialEq)]
pub struct Asset {
    pub name: String,
    pub url: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Release {
    pub version: String,
    pub notes: String,
    pub page_url: String,
    pub assets: Vec<Asset>,
}

/// Parses the GitHub "latest release" JSON. Drafts and pre-releases give `None`.
pub fn parse_release(json: &str, repo: &str) -> Option<Release> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    if v["draft"].as_bool() == Some(true) || v["prerelease"].as_bool() == Some(true) {
        return None;
    }
    let version = v["tag_name"].as_str()?.trim().trim_start_matches('v').to_string();
    if version.is_empty() || !version.split('.').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
        return None;
    }
    let assets = v["assets"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    let url = a["browser_download_url"].as_str()?.to_string();
                    is_github_url(&url).then(|| Asset { name, url, size: a["size"].as_u64().unwrap_or(0) })
                })
                .collect()
        })
        .unwrap_or_default();
    let page_url = v["html_url"]
        .as_str()
        .filter(|u| is_github_url(u))
        .map(str::to_string)
        .unwrap_or_else(|| format!("https://github.com/{repo}/releases/latest"));
    let mut notes: String = v["body"].as_str().unwrap_or("").trim().chars().take(MAX_NOTES_CHARS).collect();
    if v["body"].as_str().map_or(0, |b| b.trim().chars().count()) > MAX_NOTES_CHARS {
        notes.push('…');
    }
    Some(Release { version, notes, page_url, assets })
}

/// The download that fits this system (`os` as in `std::env::consts::OS`, `arch` as `ARCH`).
pub fn pick_asset<'a>(assets: &'a [Asset], os: &str, arch: &str) -> Option<&'a Asset> {
    let ext = match os {
        "macos" => ".dmg",
        _ => return None,
    };
    let (own, other): (&[&str], &[&str]) = match arch {
        "aarch64" => (&["aarch64", "arm64"], &["x86_64", "x64", "amd64"]),
        "x86_64" => (&["x86_64", "x64", "amd64"], &["aarch64", "arm64"]),
        _ => (&[], &[]),
    };
    let matches: Vec<&Asset> = assets.iter().filter(|a| a.name.to_lowercase().ends_with(ext)).collect();
    let has = |a: &Asset, names: &[&str]| names.iter().any(|n| a.name.to_lowercase().contains(n));
    if let Some(a) = matches.iter().find(|a| has(a, own)) {
        return Some(a);
    }
    matches.into_iter().find(|a| !has(a, other))
}

// ---------------------------------------------------------------- config

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Config {
    pub enabled: bool,
    pub repo: String,
    pub skipped: String,
}

impl Default for Config {
    fn default() -> Self {
        Config { enabled: true, repo: DEFAULT_REPO.to_string(), skipped: String::new() }
    }
}

/// An invalid or missing repo falls back to the default.
pub fn sanitize(mut cfg: Config) -> Config {
    if !valid_repo(&cfg.repo) {
        cfg.repo = DEFAULT_REPO.to_string();
    }
    cfg.repo = cfg.repo.trim().to_string();
    cfg
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("updater.json"))
}

fn load_config(app: &AppHandle) -> Config {
    let cfg = config_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Config>(&t).ok())
        .unwrap_or_default();
    sanitize(cfg)
}

fn save_config(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let path = config_path(app).ok_or("Datenverzeichnis nicht verfügbar.")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- state shared with the page

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum Phase {
    Checking,
    #[serde(rename_all = "camelCase")]
    Available { version: String, current: String, notes: String, repo: String, can_install: bool },
    Downloading { percent: Option<u8>, received: u64, total: u64 },
    Installing,
    #[serde(rename_all = "camelCase")]
    Failed { message: String, page_url: String },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Action {
    Update,
    Skip,
    Later,
}

pub struct UpdaterState {
    phase: Mutex<Phase>,
    tx: Mutex<Option<Sender<Action>>>,
    page_url: Mutex<String>,
    /// True from the start of the check until the main window is launched.
    active: AtomicBool,
}

impl Default for UpdaterState {
    fn default() -> Self {
        UpdaterState {
            phase: Mutex::new(Phase::Checking),
            tx: Mutex::new(None),
            page_url: Mutex::new(String::new()),
            active: AtomicBool::new(false),
        }
    }
}

/// True while the updater window is up; launches into the main window wait until it is done.
pub fn is_active(app: &AppHandle) -> bool {
    app.try_state::<UpdaterState>().is_some_and(|s| s.active.load(AtomicOrdering::SeqCst))
}

fn set_phase(app: &AppHandle, phase: Phase) {
    if let Some(state) = app.try_state::<UpdaterState>() {
        if let Ok(mut p) = state.phase.lock() {
            *p = phase;
        }
    }
}

#[tauri::command]
pub fn updater_state(state: tauri::State<'_, UpdaterState>) -> Phase {
    state.phase.lock().map(|p| p.clone()).unwrap_or(Phase::Checking)
}

#[tauri::command]
pub fn updater_action(action: String, state: tauri::State<'_, UpdaterState>) -> Result<(), String> {
    let action = match action.as_str() {
        "update" => Action::Update,
        "skip" => Action::Skip,
        "later" => Action::Later,
        _ => return Err("unknown action".into()),
    };
    if let Some(tx) = state.tx.lock().map_err(|_| "busy")?.as_ref() {
        let _ = tx.send(action);
    }
    Ok(())
}

#[tauri::command]
pub fn updater_open_release_page(app: AppHandle, state: tauri::State<'_, UpdaterState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = state.page_url.lock().map_err(|_| "busy")?.clone();
    if !is_github_url(&url) {
        return Err("no release page".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// The page of the main window mirrors its two settings here.
#[tauri::command]
pub fn updater_set_config(app: AppHandle, enabled: bool, repo: String) -> Result<(), String> {
    if !valid_repo(&repo) {
        return Err("Repository muss die Form owner/name haben.".into());
    }
    let mut cfg = load_config(&app);
    if cfg.repo != repo.trim() {
        cfg.skipped.clear();
    }
    cfg.enabled = enabled;
    cfg.repo = repo.trim().to_string();
    save_config(&app, &cfg)
}

// ---------------------------------------------------------------- flow

fn updater_url() -> WebviewUrl {
    #[cfg(debug_assertions)]
    {
        WebviewUrl::App("updater.html".into())
    }
    #[cfg(not(debug_assertions))]
    {
        WebviewUrl::External(format!("http://localhost:{}/updater.html", crate::app_port()).parse().unwrap())
    }
}

fn updater_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window(WINDOW_LABEL)
}

fn build_window(app: &AppHandle) {
    let built = WebviewWindowBuilder::new(app, WINDOW_LABEL, updater_url())
        .title("Diddy")
        .inner_size(460.0, 340.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        .visible(false)
        .disable_drag_drop_handler()
        .build();
    match built {
        Ok(window) => {
            // Closing the window with the red button means "Not now".
            let handle = app.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                    if let Some(state) = handle.try_state::<UpdaterState>() {
                        if let Ok(tx) = state.tx.lock() {
                            if let Some(tx) = tx.as_ref() {
                                let _ = tx.send(Action::Later);
                            }
                        }
                    }
                }
            });
        }
        Err(e) => crate::diag::diag_log(format!("updater: window failed: {e}")),
    }
}

async fn fetch_latest(repo: &str) -> Result<Option<Release>, String> {
    use tauri_plugin_http::reqwest;
    let client = reqwest::Client::builder()
        .user_agent(format!("Diddy/{} (update check)", env!("CARGO_PKG_VERSION")))
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(format!("https://api.github.com/repos/{repo}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(parse_release(&text, repo))
}

/// Starts the chain Check -> (Update) -> Launch. Always ends in `crate::launch_main`, unless an
/// update was installed and the app relaunches itself.
pub fn start(app: AppHandle) {
    let cfg = load_config(&app);
    // A dev build (identifier ending in .dev) must never replace itself with a stable release.
    if !cfg.enabled || app.config().identifier.ends_with(".dev") {
        crate::launch_main(&app);
        return;
    }
    let (tx, rx) = channel::<Action>();
    if let Some(state) = app.try_state::<UpdaterState>() {
        if let Ok(mut t) = state.tx.lock() {
            *t = Some(tx);
        }
        state.active.store(true, AtomicOrdering::SeqCst);
    }
    set_phase(&app, Phase::Checking);
    let window_app = app.clone();
    let _ = app.run_on_main_thread(move || build_window(&window_app));
    std::thread::spawn(move || run(app, cfg, rx));
}

fn finish(app: &AppHandle) {
    if let Some(state) = app.try_state::<UpdaterState>() {
        state.active.store(false, AtomicOrdering::SeqCst);
        if let Ok(mut t) = state.tx.lock() {
            *t = None;
        }
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        // Open the main window first: closing the last window would end the app.
        crate::launch_main(&handle);
        if let Some(w) = updater_window(&handle) {
            let _ = w.destroy();
        }
    });
}

fn show_window(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = updater_window(&handle) {
            let _ = w.show();
            let _ = w.set_focus();
        }
    });
}

fn run(app: AppHandle, mut cfg: Config, rx: Receiver<Action>) {
    // The window only appears when the check takes noticeably long, so a quick "no update" is invisible.
    let done = std::sync::Arc::new(AtomicBool::new(false));
    {
        let (app, done) = (app.clone(), done.clone());
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(700));
            if !done.load(AtomicOrdering::SeqCst) {
                show_window(&app);
            }
        });
    }
    let result = tauri::async_runtime::block_on(fetch_latest(&cfg.repo));
    done.store(true, AtomicOrdering::SeqCst);
    let current = env!("CARGO_PKG_VERSION");
    let release = match result {
        Ok(Some(r)) if compare_versions(&r.version, current) == Ordering::Greater && r.version != cfg.skipped => r,
        Ok(_) => return finish(&app),
        Err(e) => {
            crate::diag::diag_log(format!("updater: check failed, starting the app: {e}"));
            return finish(&app);
        }
    };

    let asset = pick_asset(&release.assets, std::env::consts::OS, std::env::consts::ARCH).cloned();
    let can_install = cfg!(target_os = "macos") && asset.is_some();
    if let Some(state) = app.try_state::<UpdaterState>() {
        if let Ok(mut u) = state.page_url.lock() {
            *u = release.page_url.clone();
        }
    }
    set_phase(
        &app,
        Phase::Available {
            version: release.version.clone(),
            current: current.to_string(),
            notes: release.notes.clone(),
            repo: cfg.repo.clone(),
            can_install,
        },
    );
    show_window(&app);

    loop {
        match rx.recv() {
            Ok(Action::Update) if can_install => {
                let Some(asset) = asset.clone() else { return finish(&app) };
                match install(&app, &asset) {
                    // The relaunch is already scheduled; leave without opening the main window.
                    Ok(()) => return,
                    Err(message) => {
                        crate::diag::diag_log(format!("updater: install failed: {message}"));
                        set_phase(&app, Phase::Failed { message, page_url: release.page_url.clone() });
                        // Wait for "Open release page" (handled by the command) or "Start Diddy".
                        loop {
                            match rx.recv() {
                                Ok(Action::Later) | Err(_) => return finish(&app),
                                Ok(_) => {}
                            }
                        }
                    }
                }
            }
            Ok(Action::Skip) => {
                cfg.skipped = release.version.clone();
                if let Err(e) = save_config(&app, &cfg) {
                    crate::diag::diag_log(format!("updater: could not remember skipped version: {e}"));
                }
                return finish(&app);
            }
            Ok(Action::Update) => {}
            Ok(Action::Later) | Err(_) => return finish(&app),
        }
    }
}

// ---------------------------------------------------------------- download + install

async fn download(app: &AppHandle, asset: &Asset, dest: &Path) -> Result<(), String> {
    use std::io::Write;
    use tauri_plugin_http::reqwest;
    let client = reqwest::Client::builder()
        .user_agent(format!("Diddy/{} (update)", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() < 8 && is_github_url(attempt.url().as_str()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client.get(&asset.url).send().await.map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download fehlgeschlagen: HTTP {}", resp.status()));
    }
    let total = resp.content_length().filter(|n| *n > 0).unwrap_or(asset.size);
    if total > MAX_DOWNLOAD_BYTES {
        return Err("Die Datei ist ungewöhnlich groß, Abbruch.".into());
    }
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut received: u64 = 0;
    let mut last_reported = 0u8;
    set_phase(app, Phase::Downloading { percent: if total > 0 { Some(0) } else { None }, received: 0, total });
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Download abgebrochen: {e}"))? {
        received += chunk.len() as u64;
        if received > MAX_DOWNLOAD_BYTES {
            return Err("Die Datei ist ungewöhnlich groß, Abbruch.".into());
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        let percent = (total > 0).then(|| ((received * 100) / total).min(100) as u8);
        if percent.unwrap_or(0) != last_reported || percent.is_none() {
            last_reported = percent.unwrap_or(0);
            set_phase(app, Phase::Downloading { percent, received, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    if total > 0 && received != total {
        return Err("Der Download ist unvollständig.".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn install(_app: &AppHandle, _asset: &Asset) -> Result<(), String> {
    Err("Automatische Installation gibt es nur unter macOS. Bitte die Release-Seite öffnen.".into())
}

/// The `.app` bundle the running executable lives in.
#[cfg(target_os = "macos")]
fn running_bundle() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.ancestors()
        .find(|p| p.extension().is_some_and(|e| e == "app"))
        .map(Path::to_path_buf)
        .ok_or_else(|| "Diddy läuft nicht aus einer .app (Entwicklungsbuild?). Bitte die Release-Seite öffnen.".to_string())
}

#[cfg(target_os = "macos")]
fn run_cmd(program: &str, args: &[&std::ffi::OsStr]) -> Result<String, String> {
    let out = std::process::Command::new(program).args(args).output().map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(format!("{program}: {}", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

#[cfg(target_os = "macos")]
fn install(app: &AppHandle, asset: &Asset) -> Result<(), String> {
    use std::ffi::OsStr;
    let target = running_bundle()?;
    let parent = target.parent().ok_or("Programmordner nicht gefunden.")?.to_path_buf();
    // Replace the app only where it is installed and the user may write; otherwise point at the release page.
    let probe = parent.join(format!(".diddy-write-test-{}", std::process::id()));
    std::fs::write(&probe, b"").map_err(|_| format!("Kein Schreibzugriff auf {}. Bitte manuell aktualisieren.", parent.display()))?;
    let _ = std::fs::remove_file(&probe);

    let work = std::env::temp_dir().join(format!("diddy-update-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let dmg = work.join("Diddy.dmg");
    let mount = work.join("mnt");
    std::fs::create_dir_all(&mount).map_err(|e| e.to_string())?;

    let cleanup = |mounted: bool| {
        if mounted {
            let _ = std::process::Command::new("hdiutil").args(["detach", "-force"]).arg(&mount).output();
        }
        let _ = std::fs::remove_dir_all(&work);
    };

    if let Err(e) = tauri::async_runtime::block_on(download(app, asset, &dmg)) {
        cleanup(false);
        return Err(e);
    }
    set_phase(app, Phase::Installing);
    let attached = run_cmd(
        "hdiutil",
        &[
            OsStr::new("attach"), OsStr::new("-nobrowse"), OsStr::new("-readonly"), OsStr::new("-noautoopen"),
            OsStr::new("-mountpoint"), mount.as_os_str(), dmg.as_os_str(),
        ],
    );
    if let Err(e) = attached {
        cleanup(false);
        return Err(format!("Das Disk-Image ließ sich nicht öffnen: {e}"));
    }
    let result = swap_bundle(&mount, &target, &parent);
    cleanup(true);
    result?;

    // Relaunch from a detached shell: the new instance must start after this process has exited
    // (single-instance would otherwise hand the launch to us).
    std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg("sleep 1.5; /usr/bin/open -n \"$0\"")
        .arg(&target)
        .spawn()
        .map_err(|e| format!("Neustart fehlgeschlagen: {e}"))?;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        handle.exit(0);
    });
    Ok(())
}

/// Copies the new app out of the mounted image next to the old one and swaps them.
#[cfg(target_os = "macos")]
fn swap_bundle(mount: &Path, target: &Path, parent: &Path) -> Result<(), String> {
    use std::ffi::OsStr;
    let new_app = std::fs::read_dir(mount)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|e| e == "app"))
        .ok_or("Im Disk-Image liegt keine App.")?;
    let id = run_cmd(
        "/usr/bin/defaults",
        &[OsStr::new("read"), new_app.join("Contents/Info").as_os_str(), OsStr::new("CFBundleIdentifier")],
    )?;
    if id.trim() != "app.diddy.desktop" {
        return Err("Das Disk-Image enthält nicht Diddy.".into());
    }
    let staging = parent.join(format!(".Diddy-update-{}.app", std::process::id()));
    let backup = parent.join(format!(".Diddy-old-{}.app", std::process::id()));
    let _ = std::fs::remove_dir_all(&staging);
    run_cmd("/usr/bin/ditto", &[new_app.as_os_str(), staging.as_os_str()]).map_err(|e| format!("Kopieren fehlgeschlagen: {e}"))?;
    std::fs::rename(target, &backup).map_err(|e| {
        let _ = std::fs::remove_dir_all(&staging);
        format!("Die alte App ließ sich nicht ersetzen: {e}")
    })?;
    if let Err(e) = std::fs::rename(&staging, target) {
        // Put the old app back; never leave the user without Diddy.
        let _ = std::fs::rename(&backup, target);
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!("Die neue App ließ sich nicht einsetzen: {e}"));
    }
    let _ = std::fs::remove_dir_all(&backup);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_validation() {
        assert!(valid_repo("Lndr2501/diddy"));
        assert!(valid_repo(" me/my_repo.v2 "));
        for bad in ["", "diddy", "a/b/c", "/x", "x/", "-a/b", "a/..", "a b/c", "https://github.com/a/b", "a/b?x=1"] {
            assert!(!valid_repo(bad), "{bad}");
        }
    }

    #[test]
    fn sanitize_falls_back_to_default() {
        let cfg = sanitize(Config { enabled: false, repo: "nonsense".into(), skipped: "1.0".into() });
        assert_eq!(cfg.repo, DEFAULT_REPO);
        assert!(!cfg.enabled);
        assert_eq!(sanitize(Config { repo: " a/b ".into(), ..Config::default() }).repo, "a/b");
    }

    #[test]
    fn missing_config_fields_use_defaults() {
        let cfg: Config = serde_json::from_str(r#"{"skipped":"1.2.3"}"#).unwrap();
        assert!(cfg.enabled);
        assert_eq!(cfg.repo, DEFAULT_REPO);
        assert_eq!(cfg.skipped, "1.2.3");
    }

    #[test]
    fn version_compare() {
        assert_eq!(compare_versions("1.4.1", "1.4.0"), Ordering::Greater);
        assert_eq!(compare_versions("v1.10.0", "1.9.9"), Ordering::Greater);
        assert_eq!(compare_versions("1.4", "1.4.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.4.0", "1.4.1"), Ordering::Less);
        assert_eq!(compare_versions("1.5.0-rc1", "1.4.9"), Ordering::Greater);
    }

    #[test]
    fn github_urls_only() {
        assert!(is_github_url("https://github.com/a/b/releases/download/v1/x.dmg"));
        assert!(is_github_url("https://objects.githubusercontent.com/x"));
        assert!(!is_github_url("http://github.com/a"));
        assert!(!is_github_url("https://evil.example/github.com"));
        assert!(!is_github_url("https://github.com.evil.example/x"));
        assert!(!is_github_url("https://github.com@evil.example/x"));
    }

    const RELEASE: &str = r#"{
        "tag_name": "v1.4.1", "draft": false, "prerelease": false,
        "html_url": "https://github.com/Lndr2501/diddy/releases/tag/v1.4.1",
        "body": "Fixes\n- a",
        "assets": [
          {"name": "Diddy_1.4.1_aarch64.dmg", "browser_download_url": "https://github.com/Lndr2501/diddy/releases/download/v1.4.1/Diddy_1.4.1_aarch64.dmg", "size": 1234},
          {"name": "Diddy_1.4.1_x86_64.AppImage", "browser_download_url": "https://github.com/x/y/z.AppImage", "size": 9},
          {"name": "evil.dmg", "browser_download_url": "https://evil.example/evil.dmg", "size": 1}
        ]}"#;

    #[test]
    fn parses_a_release() {
        let r = parse_release(RELEASE, "Lndr2501/diddy").unwrap();
        assert_eq!(r.version, "1.4.1");
        assert_eq!(r.assets.len(), 2);
        assert_eq!(r.notes, "Fixes\n- a");
        assert!(r.page_url.ends_with("/tag/v1.4.1"));
    }

    #[test]
    fn ignores_drafts_prereleases_and_odd_tags() {
        assert!(parse_release(r#"{"tag_name":"v2.0.0","prerelease":true}"#, "a/b").is_none());
        assert!(parse_release(r#"{"tag_name":"v2.0.0","draft":true}"#, "a/b").is_none());
        assert!(parse_release(r#"{"tag_name":"nightly"}"#, "a/b").is_none());
        assert!(parse_release("not json", "a/b").is_none());
        let r = parse_release(r#"{"tag_name":"1.0.0","html_url":"http://evil/x"}"#, "a/b").unwrap();
        assert_eq!(r.page_url, "https://github.com/a/b/releases/latest");
    }

    #[test]
    fn long_notes_are_cut() {
        let body = "x".repeat(MAX_NOTES_CHARS + 50);
        let r = parse_release(&format!(r#"{{"tag_name":"1.0.1","body":"{body}"}}"#), "a/b").unwrap();
        assert_eq!(r.notes.chars().count(), MAX_NOTES_CHARS + 1);
    }

    #[test]
    fn picks_the_dmg_for_the_architecture() {
        let a = |n: &str| Asset { name: n.into(), url: format!("https://github.com/{n}"), size: 1 };
        let assets = vec![a("Diddy_1_x86_64.dmg"), a("Diddy_1_aarch64.dmg"), a("Diddy_1_x86_64.AppImage")];
        assert_eq!(pick_asset(&assets, "macos", "aarch64").unwrap().name, "Diddy_1_aarch64.dmg");
        assert_eq!(pick_asset(&assets, "macos", "x86_64").unwrap().name, "Diddy_1_x86_64.dmg");
        assert!(pick_asset(&assets[2..], "macos", "aarch64").is_none());
        assert!(pick_asset(&assets[..1], "macos", "aarch64").is_none());
        assert!(pick_asset(&assets, "linux", "x86_64").is_none());
        // a DMG without architecture in its name is used
        assert_eq!(pick_asset(&[a("Diddy.dmg")], "macos", "aarch64").unwrap().name, "Diddy.dmg");
    }
}
