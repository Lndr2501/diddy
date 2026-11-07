//! "Talking to an agent" (#57): what the page cannot see by itself.
//!
//! * the dictation hotkey while Diddy is in the background (macOS: read from the system's
//!   modifier / key state, no event tap, no new permission prompt);
//! * an external trigger for every other setup: `diddy --agent-voice start|stop|toggle`. A second
//!   launch is forwarded to the running app by the single-instance plugin, so key-remapping tools
//!   (Karabiner, Hammerspoon, skhd, ...) can drive it.
//!
//! The page polls `agent_voice_state` while the feature is switched on.

use std::sync::atomic::{AtomicBool, Ordering};

static TRIGGER: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TriggerCommand {
    Start,
    Stop,
    Toggle,
}

/// `None`: the launch has nothing to do with agent voice. `Some(Err)`: it has, but is invalid.
pub(crate) fn parse_launch(args: &[String]) -> Option<Result<TriggerCommand, String>> {
    let index = args.iter().position(|arg| arg == "--agent-voice")?;
    Some(match args.get(index + 1).map(String::as_str) {
        Some("start") => Ok(TriggerCommand::Start),
        Some("stop") => Ok(TriggerCommand::Stop),
        Some("toggle") => Ok(TriggerCommand::Toggle),
        _ => Err("--agent-voice expects start, stop or toggle".into()),
    })
}

fn apply(command: TriggerCommand) -> bool {
    match command {
        TriggerCommand::Start => TRIGGER.store(true, Ordering::SeqCst),
        TriggerCommand::Stop => TRIGGER.store(false, Ordering::SeqCst),
        TriggerCommand::Toggle => {
            TRIGGER.fetch_xor(true, Ordering::SeqCst);
        }
    }
    TRIGGER.load(Ordering::SeqCst)
}

/// Handles a forwarded launch. Returns true when it was an agent-voice launch: the caller must then
/// not focus the window (that would steal focus from the app the user is dictating into).
pub fn handle_launch(args: &[String]) -> bool {
    match parse_launch(args) {
        None => false,
        Some(Ok(command)) => {
            apply(command);
            true
        }
        Some(Err(error)) => {
            crate::diag::diag_log(format!("agent voice: {error}"));
            true
        }
    }
}

#[derive(serde::Serialize)]
pub struct AgentVoiceState {
    /// the hotkey is held according to the system; null when this key / platform cannot be read
    key: Option<bool>,
    trigger: bool,
}

#[tauri::command]
pub fn agent_voice_state(key: String) -> AgentVoiceState {
    AgentVoiceState { key: native::key_down(&key), trigger: TRIGGER.load(Ordering::SeqCst) }
}

/// macOS virtual key codes (kVK_*) of the keys that can be read natively. Keep in sync with
/// NATIVE_CODES in cinny/src/app/plugins/agentVoice/hotkey.ts.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn mac_keycode(code: &str) -> Option<u16> {
    Some(match code {
        "ShiftLeft" => 0x38,
        "ShiftRight" => 0x3C,
        "ControlLeft" => 0x3B,
        "ControlRight" => 0x3E,
        "AltLeft" => 0x3A,
        "AltRight" => 0x3D,
        "MetaLeft" => 0x37,
        "MetaRight" => 0x36,
        "F13" => 0x69,
        "F14" => 0x6B,
        "F15" => 0x71,
        "F16" => 0x6A,
        "F17" => 0x40,
        "F18" => 0x4F,
        "F19" => 0x50,
        "F20" => 0x5A,
        _ => return None,
    })
}

#[cfg(target_os = "macos")]
mod native {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceFlagsState(state_id: i32) -> u64;
        fn CGEventSourceKeyState(state_id: i32, key: u16) -> bool;
    }
    /// kCGEventSourceStateHIDSystemState: the hardware state, independent of the focused app.
    const HID_SYSTEM_STATE: i32 = 1;
    /// kCGEventFlagMaskSecondaryFn: the Fn / Globe key.
    const FLAG_SECONDARY_FN: u64 = 0x0080_0000;

    pub fn key_down(code: &str) -> Option<bool> {
        if code == "Fn" {
            // SAFETY: plain CoreGraphics query without pointers.
            let flags = unsafe { CGEventSourceFlagsState(HID_SYSTEM_STATE) };
            return Some(flags & FLAG_SECONDARY_FN != 0);
        }
        let keycode = super::mac_keycode(code)?;
        // SAFETY: plain CoreGraphics query without pointers.
        Some(unsafe { CGEventSourceKeyState(HID_SYSTEM_STATE, keycode) })
    }
}

#[cfg(not(target_os = "macos"))]
mod native {
    pub fn key_down(_code: &str) -> Option<bool> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_trigger_commands() {
        assert_eq!(parse_launch(&args(&["diddy", "--agent-voice", "start"])), Some(Ok(TriggerCommand::Start)));
        assert_eq!(parse_launch(&args(&["diddy", "--agent-voice", "stop"])), Some(Ok(TriggerCommand::Stop)));
        assert_eq!(parse_launch(&args(&["diddy", "--agent-voice", "toggle"])), Some(Ok(TriggerCommand::Toggle)));
        assert!(matches!(parse_launch(&args(&["diddy", "--agent-voice"])), Some(Err(_))));
        assert!(matches!(parse_launch(&args(&["diddy", "--agent-voice", "now"])), Some(Err(_))));
        assert_eq!(parse_launch(&args(&["diddy", "--connection-id", "main"])), None);
        assert_eq!(parse_launch(&args(&["diddy"])), None);
    }

    #[test]
    fn trigger_state_follows_commands() {
        assert!(apply(TriggerCommand::Start));
        assert!(apply(TriggerCommand::Start));
        assert!(!apply(TriggerCommand::Toggle));
        assert!(apply(TriggerCommand::Toggle));
        assert!(!apply(TriggerCommand::Stop));
        assert!(!apply(TriggerCommand::Stop));
    }

    #[test]
    fn only_known_keys_have_a_mac_keycode() {
        assert_eq!(mac_keycode("AltRight"), Some(0x3D));
        assert_eq!(mac_keycode("F13"), Some(0x69));
        assert_eq!(mac_keycode("KeyA"), None);
        assert_eq!(mac_keycode("Fn"), None); // read through the modifier flags instead
    }
}
