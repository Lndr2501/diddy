//! Opt-in soundboard shortcuts on macOS. Like agent_voice_wait, this reads CoreGraphics' hardware
//! key state without an event tap or accessibility permission. A binding exists only during a call;
//! the page ignores native presses while focused, since the keydown already reached the page.
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Clone, serde::Deserialize)]
pub struct Hotkey {
    code: String,
    ctrl: bool,
    alt: bool,
    shift: bool,
    meta: bool,
}

#[derive(serde::Serialize)]
pub struct BindInfo {
    generation: u64,
    seq: u64,
    path: &'static str,
    consumes: bool,
    bound: Vec<bool>,
}

#[derive(serde::Serialize)]
pub struct WaitAnswer {
    generation: u64,
    seq: u64,
    presses: Vec<usize>,
}

#[derive(Default)]
struct State {
    generation: u64,
    seq: u64,
    keys: Vec<Option<Hotkey>>,
    previous: Vec<bool>,
}
static STATE: OnceLock<Mutex<State>> = OnceLock::new();
fn state() -> &'static Mutex<State> { STATE.get_or_init(|| Mutex::new(State::default())) }

#[cfg(target_os = "macos")]
mod native {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" { fn CGEventSourceKeyState(state_id: i32, key: u16) -> bool; }
    const HID: i32 = 1;
    fn down(key: u16) -> bool { unsafe { CGEventSourceKeyState(HID, key) } }
    fn code(key: &str) -> Option<u16> {
        Some(match key {
            "KeyA" => 0x00, "KeyS" => 0x01, "KeyD" => 0x02, "KeyF" => 0x03,
            "KeyH" => 0x04, "KeyG" => 0x05, "KeyZ" => 0x06, "KeyX" => 0x07,
            "KeyC" => 0x08, "KeyV" => 0x09, "KeyB" => 0x0B, "KeyQ" => 0x0C,
            "KeyW" => 0x0D, "KeyE" => 0x0E, "KeyR" => 0x0F, "KeyY" => 0x10,
            "KeyT" => 0x11, "Digit1" => 0x12, "Digit2" => 0x13, "Digit3" => 0x14,
            "Digit4" => 0x15, "Digit6" => 0x16, "Digit5" => 0x17, "Digit9" => 0x19,
            "Digit7" => 0x1A, "Digit8" => 0x1C, "Digit0" => 0x1D, "KeyO" => 0x1F,
            "KeyU" => 0x20, "KeyI" => 0x22, "KeyP" => 0x23, "KeyL" => 0x25,
            "KeyJ" => 0x26, "KeyK" => 0x28, "KeyN" => 0x2D, "KeyM" => 0x2E,
            "F1" => 0x7A, "F2" => 0x78, "F3" => 0x63, "F4" => 0x76,
            "F5" => 0x60, "F6" => 0x61, "F7" => 0x62, "F8" => 0x64,
            "F9" => 0x65, "F10" => 0x6D, "F11" => 0x67, "F12" => 0x6F,
            "F13" => 0x69, "F14" => 0x6B, "F15" => 0x71, "F16" => 0x6A,
            "F17" => 0x40, "F18" => 0x4F, "F19" => 0x50, "F20" => 0x5A,
            _ => return None,
        })
    }
    pub fn supported(key: &str) -> bool { code(key).is_some() }
    pub fn pressed(key: &super::Hotkey) -> bool {
        let Some(main) = code(&key.code) else { return false };
        down(main)
            && (down(0x3B) || down(0x3E)) == key.ctrl
            && (down(0x3A) || down(0x3D)) == key.alt
            && (down(0x38) || down(0x3C)) == key.shift
            && (down(0x37) || down(0x36)) == key.meta
    }
}

#[cfg(not(target_os = "macos"))]
mod native {
    pub fn supported(_: &str) -> bool { false }
    pub fn pressed(_: &super::Hotkey) -> bool { false }
}

#[tauri::command]
pub fn soundboard_hotkeys_bind(hotkeys: Vec<Hotkey>) -> BindInfo {
    let mut lock = state().lock().unwrap_or_else(|e| e.into_inner());
    lock.generation += 1;
    lock.keys = hotkeys.into_iter().take(64).map(|key| {
        // A printable key without Ctrl, Option or Command must never capture other apps' typing.
        let function = key.code.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| n >= 13);
        if native::supported(&key.code) && (key.ctrl || key.alt || key.meta || function) {
            Some(key)
        } else { None }
    }).collect();
    lock.previous = lock.keys.iter().map(|key| key.as_ref().is_some_and(native::pressed)).collect();
    BindInfo { generation: lock.generation, seq: lock.seq, path: if lock.keys.iter().any(Option::is_some) { "poll" } else { "window" }, consumes: false, bound: lock.keys.iter().map(Option::is_some).collect() }
}

#[tauri::command]
pub async fn soundboard_hotkeys_wait(after: u64, timeout_ms: Option<u64>) -> WaitAnswer {
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        let limit = Duration::from_millis(timeout_ms.unwrap_or(25_000).min(25_000));
        let generation = state().lock().unwrap_or_else(|e| e.into_inner()).generation;
        loop {
            let mut lock = state().lock().unwrap_or_else(|e| e.into_inner());
            let mut presses = Vec::new();
            if lock.generation == generation {
                for index in 0..lock.keys.len() {
                    let pressed = lock.keys[index].as_ref().is_some_and(native::pressed);
                    if pressed && !lock.previous[index] { presses.push(index); }
                    lock.previous[index] = pressed;
                }
                if !presses.is_empty() { lock.seq += 1; }
            }
            let result = WaitAnswer { generation: lock.generation, seq: lock.seq, presses };
            if result.generation != generation || !result.presses.is_empty() || result.seq > after || start.elapsed() >= limit { return result; }
            drop(lock);
            std::thread::sleep(Duration::from_millis(30));
        }
    }).await.unwrap_or_else(|_| {
        let lock = state().lock().unwrap_or_else(|e| e.into_inner());
        WaitAnswer { generation: lock.generation, seq: lock.seq, presses: Vec::new() }
    })
}
