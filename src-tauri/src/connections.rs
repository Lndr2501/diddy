//! Saved connection metadata only. Tokens, crypto databases and account data stay in WebKit's
//! separate, persistent website data stores; the original main window keeps its existing store.
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs, io::Write, net::Ipv4Addr,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, Url};

/// A saved entry must stay readable after normalization, so the limit applies to the input and to
/// the percent-encoded result (a Unicode path can grow by three bytes per character).
const MAX_SERVER_LEN: usize = 2048;

#[derive(Default)]
pub struct ConnectionState {
    pub lock: Mutex<()>,
    /// Labels whose window construction is queued or running, mapped to that attempt's number.
    /// The number matters: a stale construction that was cancelled must not clear the reservation
    /// of a newer attempt for the same label.
    opening: Mutex<HashMap<String, u64>>,
    #[cfg(target_os = "macos")]
    pub audio_bridges: Mutex<std::collections::HashMap<String, crate::system_audio::AudioBridge>>,
}

static OPEN_ATTEMPT: AtomicU64 = AtomicU64::new(0);

/// Reserves `label` for this attempt; false when another attempt already owns it. A rejected claim
/// must not replace the owner, or the running attempt could never release the label again.
fn claim_opening(opening: &mut HashMap<String, u64>, label: &str, attempt: u64) -> bool {
    match opening.entry(label.to_string()) {
        std::collections::hash_map::Entry::Vacant(slot) => {
            slot.insert(attempt);
            true
        }
        std::collections::hash_map::Entry::Occupied(_) => false,
    }
}

/// Releases the reservation only when it still belongs to `attempt`, so a construction that was
/// cancelled earlier cannot unlock a newer attempt for the same window.
fn release_reserved(opening: &mut HashMap<String, u64>, label: &str, attempt: u64) -> bool {
    if opening.get(label).is_some_and(|saved| *saved == attempt) {
        opening.remove(label);
        return true;
    }
    false
}

/// Releases the construction reservation, but only when it still belongs to `attempt`.
fn release_opening(app: &AppHandle, label: &str, attempt: u64) {
    if let Ok(mut opening) = app.state::<ConnectionState>().opening.lock() {
        release_reserved(&mut opening, label, attempt);
    }
}

const HANDOFF_PENDING: u8 = 0;
const HANDOFF_GAVE_UP: u8 = 1;
const HANDOFF_DELIVERED: u8 = 2;

/// Who finishes one window construction: the waiting command, or, after the command gave up on
/// its timeout, the construction itself (issue #7). Without this, a window that was still being
/// built when the 30 s wait ran out opened anyway, but its new profile was never saved: the login
/// in it vanished from the overview and its store was orphaned.
#[derive(Default)]
struct OpenHandoff(AtomicU8);

impl OpenHandoff {
    /// The construction may start; false once the waiter gave up before it began.
    fn may_start(&self) -> bool {
        self.0.load(Ordering::SeqCst) == HANDOFF_PENDING
    }

    /// The construction is done. True: the waiter is still there and takes the result. False: it
    /// gave up, so the construction has to save a new profile itself.
    fn deliver(&self) -> bool {
        self.0
            .compare_exchange(HANDOFF_PENDING, HANDOFF_DELIVERED, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    /// The waiter stops waiting. True: nothing was delivered, the construction takes over. False:
    /// the result was delivered at the same moment and is about to arrive, so keep waiting for it.
    fn give_up(&self) -> bool {
        self.0
            .compare_exchange(HANDOFF_PENDING, HANDOFF_GAVE_UP, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ConnectionProfile {
    pub id: String,
    pub server: String,
}

pub fn profile_identifier(id: &str) -> Result<[u8; 16], String> {
    if id.len() != 32 || !id.bytes().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        || id.as_bytes()[12] != b'4' || !b"89ab".contains(&id.as_bytes()[16])
    {
        return Err("Ungültige Verbindungskennung.".into());
    }
    let mut bytes = [0u8; 16];
    for (i, value) in bytes.iter_mut().enumerate() {
        *value = u8::from_str_radix(&id[i * 2..i * 2 + 2], 16)
            .map_err(|_| "Ungültige Verbindungskennung.".to_string())?;
    }
    Ok(bytes)
}

/// The window of a connection. The original login keeps the label `main`; every saved connection
/// gets its own label, so two profiles never share a window.
pub fn window_label(profile: Option<&ConnectionProfile>) -> String {
    profile.map(|p| format!("connection-{}", p.id)).unwrap_or_else(|| "main".into())
}

/// The WebKit data store a window uses on macOS: `None` is the original login's default store,
/// a saved connection always has its own persistent store addressed by its UUID. There is no
/// path from a saved connection to `None`: an invalid id fails instead of falling back.
pub fn store_identifier(profile: Option<&ConnectionProfile>) -> Result<Option<[u8; 16]>, String> {
    profile.map(|p| profile_identifier(&p.id)).transpose()
}

/// Linux/Windows: the web view data directory of a saved connection, one per id under
/// `<app data>/connections`. The id is validated, so it cannot point outside that directory.
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn connection_data_dir(app_data: &Path, id: &str) -> Result<PathBuf, String> {
    profile_identifier(id)?;
    Ok(app_data.join("connections").join(id))
}

/// macOS: the separate persistent store of a saved connection, never the default store. Must run
/// on the main thread (WebKit).
#[cfg(target_os = "macos")]
pub fn isolated_data_store(
    identifier: [u8; 16],
    mtm: objc2::MainThreadMarker,
) -> Result<objc2::rc::Retained<objc2_web_kit::WKWebsiteDataStore>, String> {
    use objc2::{msg_send, runtime::Bool, sel};
    use objc2_foundation::NSUUID;
    use objc2_web_kit::WKWebsiteDataStore;
    unsafe {
        let supported: Bool = msg_send![objc2::class!(WKWebsiteDataStore), respondsToSelector: sel!(dataStoreForIdentifier:)];
        if !supported.as_bool() {
            return Err("Getrennte Anmeldungen benötigen macOS 14 oder neuer. Dein bisheriges Konto wurde nicht verändert.".into());
        }
        let store = WKWebsiteDataStore::dataStoreForIdentifier(&NSUUID::from_bytes(identifier), mtm);
        let default_store = WKWebsiteDataStore::defaultDataStore(mtm);
        let same_id = store.identifier().is_some_and(|id| id.as_bytes() == identifier);
        if std::ptr::eq(&*store, &*default_store) || !store.isPersistent() || !same_id {
            return Err("Getrennte Anmeldung konnte nicht sicher isoliert werden. Dein bisheriges Konto wurde nicht verändert.".into());
        }
        Ok(store)
    }
}

pub fn normalize_server(server: &str) -> Result<String, String> {
    let trimmed = server.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_SERVER_LEN {
        return Err("Bitte eine Homeserver-Adresse eingeben.".into());
    }
    let input = if trimmed.contains("://") { trimmed.to_string() } else { format!("https://{trimmed}") };
    let url = Url::parse(&input).map_err(|_| "Die Homeserver-Adresse ist ungültig.".to_string())?;
    let host = url.host_str().ok_or("Die Homeserver-Adresse braucht einen Hostnamen.")?;
    let loopback = matches!(host, "localhost" | "[::1]" | "::1")
        || host.parse::<Ipv4Addr>().map(|ip| ip.is_loopback()).unwrap_or(false);
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("Bitte HTTPS verwenden; HTTP ist nur für lokale Testserver erlaubt.".into());
    }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("Nur die Server-Adresse eingeben, ohne Passwort, Abfrage oder Fragment.".into());
    }
    let normalized = url.to_string().trim_end_matches('/').to_string();
    if normalized.len() > MAX_SERVER_LEN {
        return Err("Die Homeserver-Adresse ist zu lang.".into());
    }
    Ok(normalized)
}

fn metadata_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|_| "Verbindungsverzeichnis nicht verfügbar.")?
        .join("connections.json"))
}

/// Parses and validates a stored registry blob (issue #7: pure so the lifecycle is unit-testable).
fn decode_profiles(raw: &[u8]) -> Result<Vec<ConnectionProfile>, String> {
    if raw.len() > 128 * 1024 { return Err("Verbindungsliste ist zu groß.".into()); }
    let profiles: Vec<ConnectionProfile> = serde_json::from_slice(raw)
        .map_err(|_| "Die gespeicherte Verbindungsliste ist ungültig; sie wurde nicht verändert.")?;
    validate_profiles(&profiles)?;
    Ok(profiles)
}

fn validate_profiles(profiles: &[ConnectionProfile]) -> Result<(), String> {
    if profiles.len() > 20 { return Err("Zu viele gespeicherte Verbindungen.".into()); }
    let mut ids = std::collections::HashSet::new();
    for profile in profiles {
        if !ids.insert(&profile.id) { return Err("Doppelte Verbindungskennung in der gespeicherten Liste.".into()); }
        profile_identifier(&profile.id)?;
        if normalize_server(&profile.server)? != profile.server {
            return Err("Eine gespeicherte Server-Adresse ist ungültig.".into());
        }
    }
    Ok(())
}

fn encode_profiles(profiles: &[ConnectionProfile]) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(profiles).map_err(|_| "Verbindungen konnten nicht gespeichert werden.".into())
}

fn read_profiles(app: &AppHandle) -> Result<Vec<ConnectionProfile>, String> {
    read_profiles_at(&metadata_path(app)?)
}

fn read_profiles_at(path: &Path) -> Result<Vec<ConnectionProfile>, String> {
    if !path.exists() { return Ok(Vec::new()); }
    let length = fs::metadata(path).map_err(|_| "Verbindungsliste konnte nicht gelesen werden.")?.len();
    if length > 128 * 1024 { return Err("Verbindungsliste ist zu groß.".into()); }
    let raw = fs::read(path).map_err(|_| "Gespeicherte Verbindungen konnten nicht gelesen werden.")?;
    decode_profiles(&raw)
}

fn save_profiles(app: &AppHandle, profiles: &[ConnectionProfile]) -> Result<(), String> {
    save_profiles_at(&metadata_path(app)?, profiles)
}

/// Writes a temporary file and renames it over the registry, so a crash or a failed write leaves
/// either the old or the new list, never half of one.
fn save_profiles_at(path: &Path, profiles: &[ConnectionProfile]) -> Result<(), String> {
    let parent = path.parent().ok_or("Verbindungsverzeichnis fehlt.")?;
    fs::create_dir_all(parent).map_err(|_| "Verbindungsverzeichnis konnte nicht angelegt werden.")?;
    let temporary = path.with_extension("json.new");
    let data = encode_profiles(profiles)?;
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary).map_err(|_| "Verbindungen konnten nicht gespeichert werden.")?;
    file.write_all(&data).and_then(|_| file.sync_all())
        .map_err(|_| "Verbindungen konnten nicht gespeichert werden.")?;
    drop(file);
    fs::rename(&temporary, path).map_err(|_| "Verbindungsliste konnte nicht aktualisiert werden.".to_string())
}

/// What opening a saved or new connection means, given the current registry: the profile to open
/// and whether it is new (and has to be saved once its window exists).
fn plan_open(
    profiles: &[ConnectionProfile],
    id: &str,
    server: Option<String>,
) -> Result<(ConnectionProfile, bool), String> {
    profile_identifier(id)?;
    if let Some(found) = profiles.iter().find(|profile| profile.id == id) {
        if let Some(server) = server {
            if normalize_server(&server)? != found.server {
                return Err("Für einen anderen Server bitte eine neue Verbindung anlegen.".into());
            }
        }
        return Ok((found.clone(), false));
    }
    // A new profile is persisted only after its window really exists, so a failed attempt
    // cannot quietly consume one of the 20 registry slots.
    if profiles.len() >= 20 { return Err("Es sind bereits 20 Verbindungen gespeichert.".into()); }
    let server = normalize_server(&server.ok_or("Diese Verbindung ist nicht gespeichert.")?)?;
    Ok((ConnectionProfile { id: id.to_string(), server }, true))
}

/// The registry after a new connection's window opened: `None` when it is already saved (a retry,
/// or the late construction of a timed out attempt got there first), so nothing is written twice.
fn registry_with_opened(
    profiles: Vec<ConnectionProfile>,
    opened: &ConnectionProfile,
) -> Result<Option<Vec<ConnectionProfile>>, String> {
    if profiles.iter().any(|saved| saved.id == opened.id) { return Ok(None); }
    if profiles.len() >= 20 { return Err("Es sind bereits 20 Verbindungen gespeichert.".into()); }
    let mut updated = profiles;
    updated.push(opened.clone());
    validate_profiles(&updated)?;
    Ok(Some(updated))
}

fn persist_opened_at(path: &Path, opened: &ConnectionProfile) -> Result<(), String> {
    if let Some(updated) = registry_with_opened(read_profiles_at(path)?, opened)? {
        save_profiles_at(path, &updated)?;
    }
    Ok(())
}

/// Saves a new connection whose window is open. On failure the window stays usable; its store id
/// goes to the log so the account stays findable although it is not listed in the overview.
fn persist_opened(app: &AppHandle, opened: &ConnectionProfile) -> Result<(), String> {
    let result = (|| {
        let state = app.state::<ConnectionState>();
        let _guard = state.lock.lock().map_err(|_| "Verbindungsliste ist gerade belegt.")?;
        persist_opened_at(&metadata_path(app)?, opened)
    })();
    if let Err(error) = &result {
        crate::diag::diag_log(format!(
            "connection: window open but not registered store={} server={} error={}",
            opened.id, opened.server, error
        ));
    }
    result
}

#[tauri::command]
pub fn connection_profiles(app: AppHandle, state: State<'_, ConnectionState>) -> Result<Vec<ConnectionProfile>, String> {
    let _guard = state.lock.lock().map_err(|_| "Verbindungsliste ist gerade belegt.")?;
    read_profiles(&app)
}

#[tauri::command]
pub async fn open_connection_profile(
    app: AppHandle,
    state: State<'_, ConnectionState>,
    id: String,
    server: Option<String>,
) -> Result<(), String> {
    // Registry access stays short-lived: the lock must not be held while the window is built,
    // otherwise every other connection action would block for up to 30 seconds.
    let (profile, is_new) = if id == "main" {
        if server.is_some() { return Err("Die ursprüngliche Anmeldung wird nicht verändert.".into()); }
        (None, false)
    } else {
        profile_identifier(&id)?;
        let guard = state.lock.lock().map_err(|_| "Verbindungsliste ist gerade belegt.")?;
        let profiles = read_profiles(&app)?;
        drop(guard);
        let (profile, is_new) = plan_open(&profiles, &id, server)?;
        (Some(profile), is_new)
    };
    let label = window_label(profile.as_ref());
    let attempt = OPEN_ATTEMPT.fetch_add(1, Ordering::SeqCst) + 1;
    {
        let mut opening = state.opening.lock().map_err(|_| "Verbindungsfenster ist gerade belegt.")?;
        if app.get_webview_window(&label).is_none() {
            if !claim_opening(&mut opening, &label, attempt) {
                return Err("Das Verbindungsfenster wird gerade geöffnet.".into());
            }
        }
    }
    let (sender, receiver) = mpsc::sync_channel(1);
    let window_app = app.clone();
    let marker = label.clone();
    // A timed out wait must not leave a queued construction behind that opens a window much later;
    // window creation itself always re-checks the label on the main thread. A construction that
    // was already running when the wait timed out finishes the job itself (OpenHandoff).
    let handoff = Arc::new(OpenHandoff::default());
    let construction = Arc::clone(&handoff);
    // WKWebView configuration must be built on the main thread. Do not block that thread waiting.
    let window_profile = profile.clone();
    let late_profile = if is_new { profile.clone() } else { None };
    // Timing of the phases, written to the app log: the window takes 45-55 s on the Mac and nobody
    // knows yet whether the time goes into the main thread queue or into building the web view.
    let started = Instant::now();
    let scheduled = app.run_on_main_thread(move || {
        let queued_ms = started.elapsed().as_millis();
        let build_started = Instant::now();
        let result = if !construction.may_start() {
            Err("Das Öffnen dieser Verbindung wurde abgebrochen.".to_string())
        } else if let Some(window) = window_app.get_webview_window(&marker) {
            window.show().and_then(|_| window.set_focus()).map_err(|_| "Fenster konnte nicht geöffnet werden.".to_string())
        } else {
            crate::build_client_window(&window_app, &marker, window_profile.as_ref())
        };
        crate::diag::diag_log(format!(
            "connection: window timing label={} queued_ms={} build_ms={} ok={}",
            marker,
            queued_ms,
            build_started.elapsed().as_millis(),
            result.is_ok()
        ));
        if let Ok(mut opening) = window_app.state::<ConnectionState>().opening.lock() {
            release_reserved(&mut opening, &marker, attempt);
        }
        if construction.deliver() {
            let _ = sender.send(result);
        } else if let (Ok(()), Some(opened)) = (&result, late_profile.as_ref()) {
            // The command already returned its timeout error, but the window is open now.
            if persist_opened(&window_app, opened).is_ok() {
                crate::diag::diag_log(format!("connection: late window registered store={}", opened.id));
            }
        }
    });
    if scheduled.is_err() {
        release_opening(&app, &label, attempt);
        return Err("Verbindungsfenster konnte nicht vorbereitet werden.".into());
    }
    let waiter = Arc::clone(&handoff);
    let result = tauri::async_runtime::spawn_blocking(move || {
        match receiver.recv_timeout(Duration::from_secs(30)) {
            Ok(result) => result,
            Err(_) if waiter.give_up() => Err("Das Verbindungsfenster reagiert nicht.".to_string()),
            // delivered at the same moment: the result is already being sent
            Err(_) => receiver
                .recv_timeout(Duration::from_secs(5))
                .map_err(|_| "Das Verbindungsfenster reagiert nicht.".to_string())?,
        }
    }).await.map_err(|_| "Verbindungsfenster konnte nicht geöffnet werden.".to_string())?;
    crate::diag::diag_log(format!(
        "connection: window open total_ms={} label={} ok={}",
        started.elapsed().as_millis(),
        label,
        result.is_ok()
    ));
    if result.is_err() {
        release_opening(&app, &label, attempt);
    }
    result?;
    if let (true, Some(opened)) = (is_new, profile.as_ref()) {
        // Persist only now: a window that could not be built leaves no registry entry behind.
        persist_opened(&app, opened)?;
    }
    Ok(())
}

/// Removes one saved entry from a profile list. The original `main` login is never part of the
/// list, so a request for it (or for an unknown id) must fail without touching the file.
fn remove_profile(profiles: &[ConnectionProfile], id: &str) -> Result<Vec<ConnectionProfile>, String> {
    if id == "main" {
        return Err("Die ursprüngliche Anmeldung kann nicht entfernt werden.".into());
    }
    profile_identifier(id)?;
    if !profiles.iter().any(|profile| profile.id == id) {
        return Err("Diese Verbindung ist nicht gespeichert.".into());
    }
    Ok(profiles.iter().filter(|profile| profile.id != id).cloned().collect())
}

#[tauri::command]
pub async fn remove_connection_profile(
    app: AppHandle,
    state: State<'_, ConnectionState>,
    id: String,
) -> Result<(), String> {
    if id == "main" {
        return Err("Die ursprüngliche Anmeldung kann nicht entfernt werden.".into());
    }
    profile_identifier(&id)?;
    let label = format!("connection-{id}");
    {
        let opening = state.opening.lock().map_err(|_| "Verbindungsfenster ist gerade belegt.")?;
        if opening.contains_key(&label) {
            return Err("Das Verbindungsfenster wird gerade geöffnet; bitte danach erneut versuchen.".into());
        }
    }
    {
        let _guard = state.lock.lock().map_err(|_| "Verbindungsliste ist gerade belegt.")?;
        let profiles = read_profiles(&app)?;
        let kept = remove_profile(&profiles, &id)?;
        // Close the window before registry and data go away, so nothing can still write into the
        // store afterwards. destroy() bypasses close requests; the window has no state to save.
        if let Some(window) = app.get_webview_window(&label) {
            window.destroy().map_err(|_| "Das Fenster konnte nicht geschlossen werden.".to_string())?;
        }
        save_profiles(&app, &kept)?;
    }
    let data = remove_connection_data(&app, &id).await;
    match &data {
        Ok(()) => crate::diag::diag_log(format!("connection: removed profile {id}")),
        Err(error) => crate::diag::diag_log(format!("connection: removed profile {id} but data cleanup failed: {error}")),
    }
    data
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
async fn remove_connection_data(_app: &AppHandle, _id: &str) -> Result<(), String> {
    Ok(())
}

/// Linux: the profile's webview data lives in one dedicated directory (see build_client_window).
/// The id was validated as a UUID hex string, so it cannot escape the connections directory.
#[cfg(target_os = "linux")]
async fn remove_connection_data(app: &AppHandle, id: &str) -> Result<(), String> {
    profile_identifier(id)?;
    let dir = connection_data_dir(
        &app.path().app_data_dir().map_err(|_| "Profilverzeichnis nicht verfügbar.".to_string())?,
        id,
    )?;
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .map_err(|_| String::from("Der Datenspeicher der Verbindung konnte nicht gelöscht werden."))?;
    }
    Ok(())
}

/// macOS: the profile's WebKit store is addressed by its UUID. All data types since the epoch
/// must be removed through WebKit itself; deleting files under ~/Library would race with WebKit.
#[cfg(target_os = "macos")]
async fn remove_connection_data(app: &AppHandle, id: &str) -> Result<(), String> {
    let identifier = profile_identifier(id)?;
    let (sender, receiver) = mpsc::sync_channel(1);
    // WKWebsiteDataStore calls must originate on the main thread, but the completion arrives on a
    // WebKit queue; waiting on the main thread could deadlock, so only start it there.
    app.run_on_main_thread(move || {
        let _ = sender.send(start_webkit_store_wipe(identifier));
    }).map_err(|_| "Der Hauptthread war nicht erreichbar.".to_string())?;
    // Waiting (start + completion) happens off the async worker so a slow wipe never blocks it.
    tauri::async_runtime::spawn_blocking(move || {
        let done = receiver.recv_timeout(Duration::from_secs(10))
            .map_err(|_| "Die Löschung des Speichers konnte nicht gestartet werden.".to_string())??;
        for _ in 0..80 {
            if done.load(Ordering::SeqCst) {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err("Die Löschung der Anmeldedaten wurde WebKit übergeben; die Rückmeldung steht aus.".into())
    }).await.map_err(|_| "Die Löschung des Speichers ging verloren.".to_string())?
}

/// Starts the removal and returns a flag that WebKit flips when it reports completion.
#[cfg(target_os = "macos")]
fn start_webkit_store_wipe(identifier: [u8; 16]) -> Result<Arc<AtomicBool>, String> {
    use block2::RcBlock;
    use objc2::{class, msg_send, sel, MainThreadMarker};
    use objc2::runtime::Bool;
    use objc2_foundation::{NSDate, NSUUID};
    use objc2_web_kit::WKWebsiteDataStore;
    let mtm = MainThreadMarker::new().ok_or("Der Speicherzugriff braucht den Hauptthread.")?;
    unsafe {
        let supported: Bool = msg_send![class!(WKWebsiteDataStore), respondsToSelector: sel!(dataStoreForIdentifier:)];
        if !supported.as_bool() {
            return Err("Dein macOS kann gespeicherte Anmeldungen nicht löschen (macOS 14 oder neuer nötig).".into());
        }
        let store = WKWebsiteDataStore::dataStoreForIdentifier(&NSUUID::from_bytes(identifier), mtm);
        let types = WKWebsiteDataStore::allWebsiteDataTypes(mtm);
        let done = Arc::new(AtomicBool::new(false));
        let signal = Arc::clone(&done);
        let completion = RcBlock::new(move || {
            signal.store(true, Ordering::SeqCst);
        });
        store.removeDataOfTypes_modifiedSince_completionHandler(&types, &NSDate::distantPast(), &completion);
        Ok(done)
    }
}

/// A plain relaunch without connection arguments must restore the main window when the user closed
/// it while the process kept running (for example with only a secondary window left open).
pub fn focus_or_reopen_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let app = app.clone();
    let window_app = app.clone();
    if let Err(e) = app.run_on_main_thread(move || {
        match window_app.get_webview_window("main") {
            Some(window) => {
                let _ = window.show();
                let _ = window.set_focus();
            }
            None => {
                if let Err(e) = crate::build_client_window(&window_app, "main", None) {
                    crate::diag::diag_log(format!("connection: main window rebuild failed: {e}"));
                }
            }
        }
    }) {
        crate::diag::diag_log(format!("connection: main window rebuild not scheduled: {e}"));
    }
}

#[derive(Debug, PartialEq)]
struct LaunchRequest {
    id: String,
    server: Option<String>,
}

fn parse_launch(args: &[String]) -> Result<Option<LaunchRequest>, String> {
    let option = |name: &str| -> Result<Option<String>, String> {
        let positions: Vec<_> = args.iter().enumerate().filter(|(_, arg)| arg.as_str() == name).map(|(i, _)| i).collect();
        if positions.len() > 1 { return Err("Doppelte Verbindungsoption.".into()); }
        positions.first().map(|index| args.get(index + 1).filter(|value| !value.starts_with("--")).cloned()
            .ok_or_else(|| "Eine Verbindungsoption hat keinen Wert.".to_string())).transpose()
    };
    let id = option("--connection-id")?;
    let server = option("--connection-server")?;
    if id.is_none() && server.is_none() { return Ok(None); }
    let id = id.ok_or("Eine neue Verbindung braucht eine eigene Kennung.")?;
    if id == "main" {
        if server.is_some() { return Err("Die ursprüngliche Anmeldung wird nicht verändert.".into()); }
    } else { profile_identifier(&id)?; }
    let server = server.as_deref().map(normalize_server).transpose()?;
    Ok(Some(LaunchRequest { id, server }))
}

/// Supported launch arguments contain public metadata only, never passwords or access tokens.
/// The official single-instance plugin forwards later launches to this same validated code path.
pub fn handle_launch(app: &AppHandle, args: &[String]) -> bool {
    let request = match parse_launch(args) {
        Ok(None) => return false,
        Ok(Some(request)) => request,
        Err(_) => { crate::diag::diag_log("connection: rejected invalid launch options".into()); return true; }
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let id = request.id.clone();
        let state = app.state::<ConnectionState>();
        match open_connection_profile(app.clone(), state, request.id, request.server).await {
            Ok(()) => crate::diag::diag_log(format!("connection: opened profile {id}")),
            Err(error) => crate::diag::diag_log(format!("connection: launch failed: {error}")),
        }
    });
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profile_ids_cannot_escape_storage_or_alias_default() {
        assert!(profile_identifier("0123456789ab4def8123456789abcdef").is_ok());
        for invalid in ["main", "../profile", "00000000000000000000000000000000", "0123456789AB4def8123456789abcdef", "0123456789ab4def7123456789abcdef"] {
            assert!(profile_identifier(invalid).is_err());
        }
    }
    #[test]
    fn server_urls_are_normalized_without_credentials() {
        assert_eq!(normalize_server("matrix.example.org/").unwrap(), "https://matrix.example.org");
        assert_eq!(normalize_server("http://127.0.0.1:8008/").unwrap(), "http://127.0.0.1:8008");
        assert!(normalize_server("http://[::1]:8008").is_ok());
        for invalid in ["http://matrix.example.org", "http://127.example.org", "https://user:password@example.org", "https://example.org/?token=example", "file:///data", "https://example.org/#login"] {
            assert!(normalize_server(invalid).is_err());
        }
    }
    #[test]
    fn normal_launch_does_not_change_any_profile() {
        assert_eq!(parse_launch(&["Diddy".into(), "-psn_0_123".into()]).unwrap(), None);
    }
    #[test]
    fn launch_can_create_or_reopen_a_separate_profile() {
        let id = "0123456789ab4def8123456789abcdef";
        let args = vec!["Diddy".into(), "--connection-id".into(), id.into(), "--connection-server".into(), "http://127.0.0.1:8008/".into()];
        assert_eq!(parse_launch(&args).unwrap(), Some(LaunchRequest { id: id.into(), server: Some("http://127.0.0.1:8008".into()) }));
        assert_eq!(parse_launch(&args[..3]).unwrap(), Some(LaunchRequest { id: id.into(), server: None }));
    }
    #[test]
    fn launch_cannot_retarget_the_original_account_or_use_an_unsafe_server() {
        for args in [
            vec!["--connection-id", "main", "--connection-server", "http://127.0.0.1:8008"],
            vec!["--connection-server", "http://127.0.0.1:8008"],
            vec!["--connection-id", "../data"],
            vec!["--connection-id", "0123456789ab4def8123456789abcdef", "--connection-server", "https://user:fixture@example.org"],
        ] { assert!(parse_launch(&args.into_iter().map(String::from).collect::<Vec<_>>()).is_err()); }
    }
    #[test]
    fn incomplete_or_duplicate_launch_options_are_rejected() {
        for args in [vec!["--connection-id"], vec!["--connection-id", "main", "--connection-id", "main"], vec!["--connection-id", "main", "--connection-server"]] {
            assert!(parse_launch(&args.into_iter().map(String::from).collect::<Vec<_>>()).is_err());
        }
    }
    #[test]
    fn normalized_server_stays_within_the_registry_limit() {
        // Percent-encoding expands Unicode: the input fits the limit, the stored form would not.
        let expanding = format!("https://matrix.example.org/{}", "ä".repeat(800));
        assert!(expanding.len() <= MAX_SERVER_LEN);
        assert!(normalize_server(&expanding).is_err());
        // Everything accepted must survive a save/read round trip unchanged.
        for server in ["matrix.example.org/", "https://matrix.example.org/pfad", "http://127.0.0.1:8008/"] {
            let once = normalize_server(server).unwrap();
            assert_eq!(normalize_server(&once).unwrap(), once);
            assert!(once.len() <= MAX_SERVER_LEN);
        }
    }
    #[test]
    fn a_cancelled_attempt_cannot_unlock_a_newer_one() {
        let mut opening = HashMap::new();
        assert!(claim_opening(&mut opening, "window", 1));
        assert!(!claim_opening(&mut opening, "window", 2));
        // attempt 1 times out and releases, the retry claims the same label
        assert!(release_reserved(&mut opening, "window", 1));
        assert!(claim_opening(&mut opening, "window", 2));
        // the cancelled construction from attempt 1 runs late and must keep the new reservation
        assert!(!release_reserved(&mut opening, "window", 1));
        assert_eq!(opening.get("window"), Some(&2));
        assert!(release_reserved(&mut opening, "window", 2));
        assert!(opening.is_empty());
    }
    #[test]
    fn removal_never_touches_the_original_login_or_unknown_ids() {
        let profiles = vec![ConnectionProfile {
            id: "0123456789ab4def8123456789abcdef".into(),
            server: "https://example.org".into(),
        }];
        assert!(remove_profile(&profiles, "main").is_err());
        assert!(remove_profile(&profiles, "../data").is_err());
        assert!(remove_profile(&profiles, "0123456789ab4def8123456789abcccc").is_err());
        let kept = remove_profile(&profiles, "0123456789ab4def8123456789abcdef").unwrap();
        assert!(kept.is_empty());
    }
    #[test]
    fn registry_contains_only_public_connection_metadata() {
        let profile = ConnectionProfile { id: "0123456789ab4def8123456789abcdef".into(), server: "https://example.org".into() };
        let value = serde_json::to_value(profile).unwrap();
        assert_eq!(value.as_object().unwrap().len(), 2);
        assert!(value.get("accessToken").is_none());
    }
    #[test]
    fn the_saved_registry_round_trips_and_removal_persists_through_the_format() {
        let profiles = vec![
            ConnectionProfile {
                id: "aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa".into(),
                server: "https://matrix.example.org".into(),
            },
            ConnectionProfile {
                id: "bbbbbbbbbbbb4bbbbbbbbbbbbbbbbbbb".into(),
                server: "http://127.0.0.1:8008".into(),
            },
        ];
        let back = decode_profiles(&encode_profiles(&profiles).unwrap()).unwrap();
        let ids: Vec<&str> = back.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbb4bbbbbbbbbbbbbbbbbbb"]);
        let kept = remove_profile(&back, "aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa").unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].id, "bbbbbbbbbbbb4bbbbbbbbbbbbbbbbbbb");
        assert_eq!(decode_profiles(&encode_profiles(&kept).unwrap()).unwrap().len(), 1);
    }
    #[test]
    fn a_broken_or_hostile_registry_is_refused_instead_of_half_applied() {
        assert!(decode_profiles(b"not json at all").is_err(), "truncated or garbage file");
        assert!(decode_profiles(b"[\"just a string\"]").is_err(), "wrong element type");
        assert!(
            decode_profiles(b"[{\"id\":\"../data\",\"server\":\"https://example.org\"}]").is_err(),
            "id that could escape the storage directory"
        );
        assert!(
            decode_profiles(
                b"[{\"id\":\"aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa\",\"server\":\"https://example.org\"},\
                  {\"id\":\"aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa\",\"server\":\"https://other.example\"}]"
            )
            .is_err(),
            "duplicate ids would overwrite each other on reopen"
        );
        assert!(
            decode_profiles(
                b"[{\"id\":\"aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa\",\"server\":\"https://example.org/x/\"}]"
            )
            .is_err(),
            "servers must be stored already normalized"
        );
        let huge = format!(
            "[{{\"id\":\"aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa\",\"server\":\"https://example.org/{}\"}}]",
            "x".repeat(130 * 1024)
        );
        assert!(decode_profiles(huge.as_bytes()).is_err(), "size limit protects the read path");
        let many: Vec<ConnectionProfile> = (0..21)
            .map(|i| ConnectionProfile {
                id: format!("{:012x}4000{}{}", i, "89ab".chars().nth(i % 4).unwrap(), "0".repeat(15)),
                server: "https://example.org".into(),
            })
            .collect();
        assert!(validate_profiles(&many).is_err(), "the registry is capped at 20 entries");
        assert!(validate_profiles(&many[..20]).is_ok());
    }

    // --- issue #7: window/registry lifecycle and store isolation ---------------------------------

    const A: &str = "aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa";
    const B: &str = "bbbbbbbbbbbb4bbbbbbbbbbbbbbbbbbb";

    fn profile(id: &str, server: &str) -> ConnectionProfile {
        ConnectionProfile { id: id.into(), server: server.into() }
    }

    fn numbered(count: usize) -> Vec<ConnectionProfile> {
        (0..count)
            .map(|i| profile(&format!("{:012x}4000{}{}", i, "89ab".chars().nth(i % 4).unwrap(), "0".repeat(15)), "https://example.org"))
            .collect()
    }

    /// A fresh directory per test, removed again at the end.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("diddy-connections-{}-{}", name, std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn registry(&self) -> PathBuf {
            self.0.join("connections.json")
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_timed_out_wait_hands_the_window_to_the_construction() {
        // the wait gave up before the construction started: nothing is built
        let handoff = OpenHandoff::default();
        assert!(handoff.give_up());
        assert!(!handoff.may_start());
        assert!(!handoff.deliver(), "the construction must save a late window itself");

        // the construction was already running when the wait gave up: it still finishes
        let handoff = OpenHandoff::default();
        assert!(handoff.may_start());
        assert!(handoff.give_up());
        assert!(!handoff.deliver());

        // normal case: the result reaches the waiter, which then cannot give up any more
        let handoff = OpenHandoff::default();
        assert!(handoff.may_start());
        assert!(handoff.deliver());
        assert!(!handoff.give_up(), "a delivered result must be received, not dropped");
    }

    #[test]
    fn exactly_one_side_owns_the_result_when_both_race() {
        for _ in 0..200 {
            let handoff = Arc::new(OpenHandoff::default());
            let other = Arc::clone(&handoff);
            let builder = std::thread::spawn(move || other.deliver());
            let gave_up = handoff.give_up();
            let delivered = builder.join().unwrap();
            assert!(gave_up != delivered, "either the waiter or the construction finishes, never both or none");
        }
    }

    #[test]
    fn opening_plans_reopen_new_and_refusals() {
        let saved = vec![profile(A, "https://matrix.example.org")];
        // reopening a saved connection writes nothing
        let (found, is_new) = plan_open(&saved, A, None).unwrap();
        assert_eq!((found.id.as_str(), is_new), (A, false));
        let (_, is_new) = plan_open(&saved, A, Some("matrix.example.org/".into())).unwrap();
        assert!(!is_new, "the same server in another spelling is the same connection");
        assert!(plan_open(&saved, A, Some("https://other.example".into())).is_err(), "a saved id is never retargeted");
        // a new connection needs a valid server and a free slot
        let (new, is_new) = plan_open(&saved, B, Some("http://127.0.0.1:8008/".into())).unwrap();
        assert_eq!((new.server.as_str(), is_new), ("http://127.0.0.1:8008", true));
        assert!(plan_open(&saved, B, None).is_err(), "an unknown id without a server");
        assert!(plan_open(&saved, "../data", Some("https://example.org".into())).is_err());
        assert!(plan_open(&numbered(20), B, Some("https://example.org".into())).is_err(), "all 20 slots used");
    }

    #[test]
    fn registering_an_opened_window_is_idempotent_and_capped() {
        let opened = profile(B, "https://example.org");
        let saved = vec![profile(A, "https://example.org")];
        let updated = registry_with_opened(saved.clone(), &opened).unwrap().unwrap();
        assert_eq!(updated.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), [A, B]);
        // a retry, or the late construction, finds it already saved: no second write
        assert!(registry_with_opened(updated, &opened).unwrap().is_none());
        // two new connections raced for the last slot: the second one is refused, nothing is dropped
        let full = numbered(20);
        assert!(registry_with_opened(full.clone(), &opened).is_err());
        assert_eq!(full.len(), 20);
        // a hostile profile can never get into the file through this path
        assert!(registry_with_opened(saved, &profile(B, "http://example.org")).is_err());
    }

    #[test]
    fn the_registry_file_survives_failed_writes_and_crashes() {
        let dir = TempDir::new("lifecycle");
        let path = dir.registry();
        assert!(read_profiles_at(&path).unwrap().is_empty(), "no file yet is an empty list");

        persist_opened_at(&path, &profile(A, "https://example.org")).unwrap();
        persist_opened_at(&path, &profile(A, "https://example.org")).unwrap();
        assert_eq!(read_profiles_at(&path).unwrap().len(), 1, "a retry does not duplicate the entry");

        // a crash between writing the temporary file and the rename leaves a broken leftover
        fs::write(path.with_extension("json.new"), b"[{\"id\":").unwrap();
        assert_eq!(read_profiles_at(&path).unwrap()[0].id, A, "the leftover is never read");
        persist_opened_at(&path, &profile(B, "https://example.org")).unwrap();
        let ids: Vec<String> = read_profiles_at(&path).unwrap().into_iter().map(|p| p.id).collect();
        assert_eq!(ids, [A, B], "the next save replaces the leftover");

        // a write that fails (here: the temporary file cannot be created) keeps the old list intact
        fs::create_dir(path.with_extension("json.new")).unwrap();
        assert!(save_profiles_at(&path, &[]).is_err());
        assert_eq!(read_profiles_at(&path).unwrap().len(), 2);
        assert!(persist_opened_at(&path, &profile("cccccccccccc4ccc8ccccccccccccccc", "https://example.org")).is_err());
        assert_eq!(read_profiles_at(&path).unwrap().len(), 2, "a failed registration changes nothing");
    }

    #[cfg(unix)]
    #[test]
    fn the_registry_file_is_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new("mode");
        save_profiles_at(&dir.registry(), &[profile(A, "https://example.org")]).unwrap();
        let mode = fs::metadata(dir.registry()).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn every_saved_connection_gets_its_own_window_and_store() {
        let a = profile(A, "https://example.org");
        let b = profile(B, "https://example.org");
        assert_eq!(window_label(None), "main");
        assert_eq!(window_label(Some(&a)), format!("connection-{A}"));
        assert_ne!(window_label(Some(&a)), window_label(Some(&b)), "same server, still two windows");

        // macOS: the original login keeps the default store, saved connections never fall back to it
        assert_eq!(store_identifier(None).unwrap(), None);
        let store_a = store_identifier(Some(&a)).unwrap().unwrap();
        let store_b = store_identifier(Some(&b)).unwrap().unwrap();
        assert_ne!(store_a, store_b);
        assert!(store_identifier(Some(&profile("../data", "https://example.org"))).is_err(), "no default fallback");

        // Linux/Windows: one data directory per id, inside <app data>/connections
        let base = Path::new("/app-data");
        let dir_a = connection_data_dir(base, A).unwrap();
        assert_eq!(dir_a, base.join("connections").join(A));
        assert_ne!(dir_a, connection_data_dir(base, B).unwrap());
        for invalid in ["main", "../data", "", "aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa/.."] {
            assert!(connection_data_dir(base, invalid).is_err(), "{invalid}");
        }
    }
}
