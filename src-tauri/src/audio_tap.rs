//! System audio via a Core Audio process tap (macOS 14.2+).
//!
//! Replaces the former ScreenCaptureKit audio stream: a second ScreenCaptureKit client of the same
//! app broke WebKit's screen-share picker (see system_audio.rs). A process tap talks only to
//! coreaudiod, never to the screen sharing daemon.
//!
//! Setup: a private global stereo tap that excludes Diddy and its WebKit helper processes (so the
//! call participants never hear themselves), a private aggregate device that contains the tap, and
//! an IOProc on that device that hands the interleaved f32 frames to a channel. Permission: the
//! "System Audio Recording" privacy setting (NSAudioCaptureUsageDescription in Info.plist).

use std::{
    ffi::c_void,
    ptr,
    sync::mpsc::SyncSender,
};

use objc2::{
    msg_send, sel, Message,
    rc::{Allocated, Retained},
    runtime::{AnyClass, AnyObject, Sel},
};
use objc2_foundation::{NSArray, NSDictionary, NSNumber, NSString};

type AudioObjectID = u32;
type OSStatus = i32;
type AudioDeviceIOProcID = *mut c_void;

#[repr(C)]
struct AudioObjectPropertyAddress {
    selector: u32,
    scope: u32,
    element: u32,
}

#[repr(C)]
struct AudioBuffer {
    number_channels: u32,
    data_byte_size: u32,
    data: *mut c_void,
}

#[repr(C)]
struct AudioBufferList {
    number_buffers: u32,
    buffers: [AudioBuffer; 1],
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct AudioStreamBasicDescription {
    sample_rate: f64,
    format_id: u32,
    format_flags: u32,
    bytes_per_packet: u32,
    frames_per_packet: u32,
    bytes_per_frame: u32,
    channels_per_frame: u32,
    bits_per_channel: u32,
    reserved: u32,
}

type AudioDeviceIOProc = extern "C" fn(
    device: AudioObjectID,
    now: *const c_void,
    input: *const AudioBufferList,
    input_time: *const c_void,
    output: *mut AudioBufferList,
    output_time: *const c_void,
    client: *mut c_void,
) -> OSStatus;

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyDataSize(
        id: AudioObjectID,
        address: *const AudioObjectPropertyAddress,
        qualifier_size: u32,
        qualifier: *const c_void,
        size: *mut u32,
    ) -> OSStatus;
    fn AudioObjectGetPropertyData(
        id: AudioObjectID,
        address: *const AudioObjectPropertyAddress,
        qualifier_size: u32,
        qualifier: *const c_void,
        size: *mut u32,
        data: *mut c_void,
    ) -> OSStatus;
    fn AudioHardwareCreateProcessTap(description: *mut AnyObject, tap: *mut AudioObjectID) -> OSStatus;
    fn AudioHardwareDestroyProcessTap(tap: AudioObjectID) -> OSStatus;
    fn AudioHardwareCreateAggregateDevice(description: *const c_void, device: *mut AudioObjectID) -> OSStatus;
    fn AudioHardwareDestroyAggregateDevice(device: AudioObjectID) -> OSStatus;
    fn AudioDeviceCreateIOProcID(
        device: AudioObjectID,
        proc_: AudioDeviceIOProc,
        client: *mut c_void,
        id: *mut AudioDeviceIOProcID,
    ) -> OSStatus;
    fn AudioDeviceDestroyIOProcID(device: AudioObjectID, id: AudioDeviceIOProcID) -> OSStatus;
    fn AudioDeviceStart(device: AudioObjectID, id: AudioDeviceIOProcID) -> OSStatus;
    fn AudioDeviceStop(device: AudioObjectID, id: AudioDeviceIOProcID) -> OSStatus;
}

extern "C" {
    /// Which app is responsible for `pid` (WebKit's helper processes are attributed to the app).
    fn responsibility_get_pid_responsible_for_pid(pid: i32) -> i32;
}

const fn fourcc(code: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*code)
}

const SYSTEM_OBJECT: AudioObjectID = 1;
const SCOPE_GLOBAL: u32 = fourcc(b"glob");
const ELEMENT_MAIN: u32 = 0;
const PROCESS_OBJECT_LIST: u32 = fourcc(b"prs#");
const PROCESS_PID: u32 = fourcc(b"ppid");
const DEFAULT_OUTPUT_DEVICE: u32 = fourcc(b"dOut");
const DEVICE_UID: u32 = fourcc(b"uid ");
const TAP_FORMAT: u32 = fourcc(b"tfmt");
const HARDWARE_DEVICES: u32 = fourcc(b"dev#");
const DEFAULT_INPUT_DEVICE: u32 = fourcc(b"dIn ");
const OBJECT_NAME: u32 = fourcc(b"lnam");
const DEVICE_STREAMS: u32 = fourcc(b"stm#");
const DEVICE_STREAM_FORMAT: u32 = fourcc(b"sfmt");
const SCOPE_INPUT: u32 = fourcc(b"inpt");
const FORMAT_FLAG_IS_FLOAT: u32 = 1;
const FORMAT_FLAG_NON_INTERLEAVED: u32 = 1 << 5;

fn address(selector: u32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress { selector, scope: SCOPE_GLOBAL, element: ELEMENT_MAIN }
}

fn check(status: OSStatus, what: &str) -> Result<(), String> {
    if status == 0 {
        Ok(())
    } else {
        Err(format!("{what} failed ({status})"))
    }
}

fn get_pod<T: Copy + Default>(id: AudioObjectID, selector: u32, what: &str) -> Result<T, String> {
    let mut value = T::default();
    let mut size = std::mem::size_of::<T>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(id, &address(selector), 0, ptr::null(), &mut size, &mut value as *mut T as *mut c_void)
    };
    check(status, what)?;
    Ok(value)
}

/// Process objects of all processes that currently use audio.
fn process_objects() -> Result<Vec<AudioObjectID>, String> {
    let mut size = 0u32;
    check(
        unsafe { AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &address(PROCESS_OBJECT_LIST), 0, ptr::null(), &mut size) },
        "process list size",
    )?;
    let mut ids = vec![0 as AudioObjectID; size as usize / std::mem::size_of::<AudioObjectID>()];
    check(
        unsafe {
            AudioObjectGetPropertyData(
                SYSTEM_OBJECT,
                &address(PROCESS_OBJECT_LIST),
                0,
                ptr::null(),
                &mut size,
                ids.as_mut_ptr() as *mut c_void,
            )
        },
        "process list",
    )?;
    ids.truncate(size as usize / std::mem::size_of::<AudioObjectID>());
    Ok(ids)
}

/// Asks Core Audio for the default output device. Used as a health probe: when coreaudiod does not
/// answer, this call blocks (forever), and so does WebKit's GPU process, which leaves every web view
/// unpainted (#26). Call it on a thread that may hang.
pub fn probe_default_output() -> Result<AudioObjectID, String> {
    get_pod(SYSTEM_OBJECT, DEFAULT_OUTPUT_DEVICE, "default output device")
}

/// The UID of the default output device (the aggregate device is clocked by it).
fn default_output_uid() -> Result<Retained<NSString>, String> {
    let device: AudioObjectID = get_pod(SYSTEM_OBJECT, DEFAULT_OUTPUT_DEVICE, "default output device")?;
    let mut uid: *const NSString = ptr::null();
    let mut size = std::mem::size_of::<*const NSString>() as u32;
    check(
        unsafe {
            AudioObjectGetPropertyData(device, &address(DEVICE_UID), 0, ptr::null(), &mut size, &mut uid as *mut _ as *mut c_void)
        },
        "output device uid",
    )?;
    // The property returns a +1 CFString, toll-free bridged to NSString.
    unsafe { Retained::from_raw(uid as *mut NSString) }.ok_or_else(|| "output device has no uid".to_string())
}

pub struct TapCapture {
    tap: AudioObjectID,
    device: AudioObjectID,
    proc_id: AudioDeviceIOProcID,
    state: *mut CallbackState,
    pub sample_rate: f64,
}

// The raw pointers are only touched again in stop(), after the IOProc has been stopped.
unsafe impl Send for TapCapture {}

struct CallbackState {
    tx: SyncSender<Vec<u8>>,
}

extern "C" fn io_proc(
    _device: AudioObjectID,
    _now: *const c_void,
    input: *const AudioBufferList,
    _input_time: *const c_void,
    _output: *mut AudioBufferList,
    _output_time: *const c_void,
    client: *mut c_void,
) -> OSStatus {
    if input.is_null() || client.is_null() {
        return 0;
    }
    let state = unsafe { &*(client as *const CallbackState) };
    let list = unsafe { &*input };
    let buffers = unsafe { std::slice::from_raw_parts(list.buffers.as_ptr(), list.number_buffers as usize) };
    let bytes = |b: &AudioBuffer| -> &[u8] {
        if b.data.is_null() {
            &[]
        } else {
            unsafe { std::slice::from_raw_parts(b.data as *const u8, b.data_byte_size as usize) }
        }
    };
    let out: Vec<u8> = match buffers {
        [] => return 0,
        // one buffer: interleaved (stereo, or mono that is doubled)
        [only] => match only.number_channels {
            2 => bytes(only).to_vec(),
            1 => bytes(only).chunks_exact(4).flat_map(|s| [s, s].concat()).collect(),
            n if n > 2 => bytes(only).chunks_exact(4 * n as usize).flat_map(|f| f[..8].to_vec()).collect(),
            _ => return 0,
        },
        // one buffer per channel: interleave the first two
        [left, right, ..] => {
            let (l, r) = (bytes(left), bytes(right));
            let frames = l.len().min(r.len()) / 4;
            let mut out = Vec::with_capacity(frames * 8);
            for i in 0..frames {
                out.extend_from_slice(&l[i * 4..i * 4 + 4]);
                out.extend_from_slice(&r[i * 4..i * 4 + 4]);
            }
            out
        }
    };
    // never block the real-time thread: drop the chunk when the reader lags
    let _ = state.tx.try_send(out);
    0
}

impl TapCapture {
    /// Starts capturing everything except `app_pid`, its helpers and this process.
    pub fn start(tx: SyncSender<Vec<u8>>, app_pid: i32) -> Result<TapCapture, String> {
        let class = AnyClass::get(c"CATapDescription")
            .ok_or("system audio needs macOS 14.2 or newer")?;
        let own_pid = std::process::id() as i32;
        let mut excluded: Vec<Retained<NSNumber>> = Vec::new();
        for object in process_objects()? {
            let Ok(pid) = get_pod::<i32>(object, PROCESS_PID, "process pid") else { continue };
            let responsible = unsafe { responsibility_get_pid_responsible_for_pid(pid) };
            if pid == app_pid || pid == own_pid || responsible == app_pid {
                excluded.push(NSNumber::new_u32(object));
            }
        }
        crate::system_audio::log(&format!("tap excludes {} of our processes", excluded.len()));
        let excluded = NSArray::from_retained_slice(&excluded);

        let description: Retained<AnyObject> = unsafe {
            let allocated: Allocated<AnyObject> = msg_send![class, alloc];
            msg_send![allocated, initStereoGlobalTapButExcludeProcesses: &*excluded]
        };
        // An unknown selector raises an Objective-C exception, which aborts this process (that
        // happened with a wrong setter name). So every optional setter is checked first.
        let responds = |selector: Sel| description.class().responds_to(selector);
        unsafe {
            if responds(sel!(setPrivate:)) {
                let _: () = msg_send![&*description, setPrivate: true];
            } else {
                crate::system_audio::log("tap: setPrivate: missing, the tap is visible to other apps");
            }
            if responds(sel!(setName:)) {
                let name = NSString::from_str("Diddy screen share audio");
                let _: () = msg_send![&*description, setName: &*name];
            }
        }
        if !responds(sel!(UUID)) {
            return Err("tap description has no UUID".into());
        }
        let tap_uid: Retained<NSString> = unsafe {
            let uuid: Retained<AnyObject> = msg_send![&*description, UUID];
            msg_send![&*uuid, UUIDString]
        };

        let mut tap: AudioObjectID = 0;
        check(
            unsafe { AudioHardwareCreateProcessTap(Retained::as_ptr(&description) as *mut AnyObject, &mut tap) },
            "create process tap",
        )?;
        let cleanup_tap = |tap| unsafe {
            AudioHardwareDestroyProcessTap(tap);
        };

        let format: AudioStreamBasicDescription = match get_pod(tap, TAP_FORMAT, "tap format") {
            Ok(f) => f,
            Err(e) => {
                cleanup_tap(tap);
                return Err(e);
            }
        };
        crate::system_audio::log(&format!(
            "tap format rate={} channels={} non_interleaved={}",
            format.sample_rate,
            format.channels_per_frame,
            format.format_flags & FORMAT_FLAG_NON_INTERLEAVED != 0
        ));

        let output_uid = match default_output_uid() {
            Ok(uid) => uid,
            Err(e) => {
                cleanup_tap(tap);
                return Err(e);
            }
        };
        let device = match create_aggregate(&tap_uid, &output_uid) {
            Ok(device) => device,
            Err(e) => {
                cleanup_tap(tap);
                return Err(e);
            }
        };

        let state = Box::into_raw(Box::new(CallbackState { tx }));
        let mut proc_id: AudioDeviceIOProcID = ptr::null_mut();
        let status = unsafe { AudioDeviceCreateIOProcID(device, io_proc, state as *mut c_void, &mut proc_id) };
        if status != 0 {
            unsafe {
                AudioHardwareDestroyAggregateDevice(device);
                drop(Box::from_raw(state));
            }
            cleanup_tap(tap);
            return Err(format!("create io proc failed ({status})"));
        }
        let capture = TapCapture { tap, device, proc_id, state, sample_rate: format.sample_rate };
        let status = unsafe { AudioDeviceStart(device, proc_id) };
        if status != 0 {
            capture.stop();
            return Err(format!("start audio device failed ({status})"));
        }
        Ok(capture)
    }

    pub fn stop(self) {
        unsafe {
            AudioDeviceStop(self.device, self.proc_id);
            AudioDeviceDestroyIOProcID(self.device, self.proc_id);
            AudioHardwareDestroyAggregateDevice(self.device);
            AudioHardwareDestroyProcessTap(self.tap);
            drop(Box::from_raw(self.state));
        }
    }
}

fn create_aggregate(tap_uid: &NSString, output_uid: &NSString) -> Result<AudioObjectID, String> {
    let s = NSString::from_str;
    let yes = NSNumber::new_bool(true);
    let no = NSNumber::new_bool(false);
    let any = |o: &NSString| -> Retained<AnyObject> { unsafe { Retained::cast_unchecked(o.retain()) } };
    let any_n = |o: &NSNumber| -> Retained<AnyObject> { unsafe { Retained::cast_unchecked(o.retain()) } };

    let tap_entry: Retained<NSDictionary<NSString, AnyObject>> = NSDictionary::from_retained_objects(
        &[&*s("uid"), &*s("drift")],
        &[any(tap_uid), any_n(&yes)],
    );
    let sub_device: Retained<NSDictionary<NSString, AnyObject>> =
        NSDictionary::from_retained_objects(&[&*s("uid")], &[any(output_uid)]);
    let taps = NSArray::from_retained_slice(&[tap_entry]);
    let subs = NSArray::from_retained_slice(&[sub_device]);
    let aggregate_uid = s(&format!("app.diddy.desktop.tap.{}", std::process::id()));

    let description: Retained<NSDictionary<NSString, AnyObject>> = NSDictionary::from_retained_objects(
        &[
            &*s("name"),
            &*s("uid"),
            &*s("master"),
            &*s("private"),
            &*s("stacked"),
            &*s("tapautostart"),
            &*s("subdevices"),
            &*s("taps"),
        ],
        &[
            any(&s("Diddy screen share audio")),
            any(&aggregate_uid),
            any(output_uid),
            any_n(&yes),
            any_n(&no),
            any_n(&yes),
            unsafe { Retained::cast_unchecked(subs) },
            unsafe { Retained::cast_unchecked(taps) },
        ],
    );
    let mut device: AudioObjectID = 0;
    check(
        unsafe { AudioHardwareCreateAggregateDevice(Retained::as_ptr(&description) as *const c_void, &mut device) },
        "create aggregate device",
    )?;
    Ok(device)
}

// --- microphone --------------------------------------------------------------------------------
//
// WebKit opens every microphone through Apple's voice processing unit (VPIO), even with
// echoCancellation:false. VPIO ducks all other apps' audio to ~18 % and rebuilds the audio device
// for ~0.7 s, which is the music "stutter" on joining a call, unmuting and switching microphones.
// With voice processing switched off in Diddy, the microphone is read here straight from the
// device (HAL, no VPIO) and streamed to the page like the system audio.

fn input_address(selector: u32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress { selector, scope: SCOPE_INPUT, element: ELEMENT_MAIN }
}

fn object_name(id: AudioObjectID) -> Option<String> {
    let mut name: *const NSString = ptr::null();
    let mut size = std::mem::size_of::<*const NSString>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(id, &address(OBJECT_NAME), 0, ptr::null(), &mut size, &mut name as *mut _ as *mut c_void)
    };
    if status != 0 {
        return None;
    }
    let name = unsafe { Retained::from_raw(name as *mut NSString) }?;
    Some(name.to_string())
}

fn has_input(id: AudioObjectID) -> bool {
    let mut size = 0u32;
    let status = unsafe { AudioObjectGetPropertyDataSize(id, &input_address(DEVICE_STREAMS), 0, ptr::null(), &mut size) };
    status == 0 && size > 0
}

/// The input device whose name equals `wanted` (WebKit's device labels are the Core Audio names),
/// otherwise the system default input.
fn find_input_device(wanted: Option<&str>) -> Result<AudioObjectID, String> {
    if let Some(wanted) = wanted.map(str::trim).filter(|w| !w.is_empty()) {
        let mut size = 0u32;
        if unsafe { AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &address(HARDWARE_DEVICES), 0, ptr::null(), &mut size) } == 0 {
            let mut ids = vec![0 as AudioObjectID; size as usize / std::mem::size_of::<AudioObjectID>()];
            let status = unsafe {
                AudioObjectGetPropertyData(SYSTEM_OBJECT, &address(HARDWARE_DEVICES), 0, ptr::null(), &mut size, ids.as_mut_ptr() as *mut c_void)
            };
            if status == 0 {
                ids.truncate(size as usize / std::mem::size_of::<AudioObjectID>());
                if let Some(id) = ids.into_iter().find(|&id| has_input(id) && object_name(id).as_deref() == Some(wanted)) {
                    return Ok(id);
                }
            }
        }
        crate::system_audio::log("microphone not found by name, using the default input");
    }
    get_pod(SYSTEM_OBJECT, DEFAULT_INPUT_DEVICE, "default input device")
}

/// Names of all input devices (the native microphone list for the device menu).
pub fn input_device_names() -> Vec<String> {
    let mut size = 0u32;
    if unsafe { AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &address(HARDWARE_DEVICES), 0, ptr::null(), &mut size) } != 0 {
        return Vec::new();
    }
    let mut ids = vec![0 as AudioObjectID; size as usize / std::mem::size_of::<AudioObjectID>()];
    let status = unsafe {
        AudioObjectGetPropertyData(SYSTEM_OBJECT, &address(HARDWARE_DEVICES), 0, ptr::null(), &mut size, ids.as_mut_ptr() as *mut c_void)
    };
    if status != 0 {
        return Vec::new();
    }
    ids.truncate(size as usize / std::mem::size_of::<AudioObjectID>());
    let default = get_pod::<AudioObjectID>(SYSTEM_OBJECT, DEFAULT_INPUT_DEVICE, "default input").ok();
    let mut names: Vec<(bool, String)> = ids
        .into_iter()
        .filter(|&id| has_input(id))
        .filter_map(|id| object_name(id).map(|n| (Some(id) == default, n)))
        // hide the private aggregate devices Core Audio and Diddy create
        .filter(|(_, n)| !n.is_empty() && !n.starts_with("CADefaultDeviceAggregate") && !n.starts_with("Diddy "))
        .collect();
    // the default input first
    names.sort_by(|a, b| b.0.cmp(&a.0));
    names.into_iter().map(|(_, n)| n).collect()
}

struct MicState {
    tx: SyncSender<Vec<u8>>,
}

/// Channel 0 of the device input, written as interleaved stereo f32 (both sides the same).
extern "C" fn mic_proc(
    _device: AudioObjectID,
    _now: *const c_void,
    input: *const AudioBufferList,
    _input_time: *const c_void,
    _output: *mut AudioBufferList,
    _output_time: *const c_void,
    client: *mut c_void,
) -> OSStatus {
    if input.is_null() || client.is_null() {
        return 0;
    }
    let state = unsafe { &*(client as *const MicState) };
    let list = unsafe { &*input };
    let buffers = unsafe { std::slice::from_raw_parts(list.buffers.as_ptr(), list.number_buffers as usize) };
    let Some(first) = buffers.first() else { return 0 };
    if first.data.is_null() || first.number_channels == 0 {
        return 0;
    }
    let channels = first.number_channels as usize;
    let data = unsafe { std::slice::from_raw_parts(first.data as *const u8, first.data_byte_size as usize) };
    let mut out = Vec::with_capacity(data.len() / channels * 2);
    for frame in data.chunks_exact(4 * channels) {
        out.extend_from_slice(&frame[..4]);
        out.extend_from_slice(&frame[..4]);
    }
    let _ = state.tx.try_send(out);
    0
}

pub struct MicCapture {
    device: AudioObjectID,
    proc_id: AudioDeviceIOProcID,
    state: *mut MicState,
    pub sample_rate: f64,
    pub name: String,
}

unsafe impl Send for MicCapture {}

impl MicCapture {
    pub fn start(tx: SyncSender<Vec<u8>>, wanted: Option<&str>) -> Result<MicCapture, String> {
        // Without microphone permission Core Audio delivers silence instead of an error. Refuse
        // then, so the page falls back to WebKit's microphone (which also shows the system prompt).
        if let Some(class) = AnyClass::get(c"AVCaptureDevice") {
            let media_type = NSString::from_str("soun"); // AVMediaTypeAudio
            let status: isize = unsafe { msg_send![class, authorizationStatusForMediaType: &*media_type] };
            const AUTHORIZED: isize = 3;
            if status != AUTHORIZED {
                return Err(format!("microphone permission not granted (status {status})"));
            }
        }
        let device = find_input_device(wanted)?;
        let format: AudioStreamBasicDescription = {
            let mut value = AudioStreamBasicDescription::default();
            let mut size = std::mem::size_of::<AudioStreamBasicDescription>() as u32;
            check(
                unsafe {
                    AudioObjectGetPropertyData(device, &input_address(DEVICE_STREAM_FORMAT), 0, ptr::null(), &mut size, &mut value as *mut _ as *mut c_void)
                },
                "microphone format",
            )?;
            value
        };
        if format.format_flags & FORMAT_FLAG_IS_FLOAT == 0 || format.bits_per_channel != 32 {
            return Err(format!("unsupported microphone format flags={} bits={}", format.format_flags, format.bits_per_channel));
        }
        // non-interleaved devices deliver channel 0 in the first buffer: mic_proc handles both
        let name = object_name(device).unwrap_or_default();
        let state = Box::into_raw(Box::new(MicState { tx }));
        let mut proc_id: AudioDeviceIOProcID = ptr::null_mut();
        let status = unsafe { AudioDeviceCreateIOProcID(device, mic_proc, state as *mut c_void, &mut proc_id) };
        if status != 0 {
            unsafe { drop(Box::from_raw(state)) };
            return Err(format!("microphone io proc failed ({status})"));
        }
        let capture = MicCapture { device, proc_id, state, sample_rate: format.sample_rate, name };
        let status = unsafe { AudioDeviceStart(device, proc_id) };
        if status != 0 {
            capture.stop();
            return Err(format!("microphone start failed ({status})"));
        }
        Ok(capture)
    }

    pub fn stop(self) {
        unsafe {
            AudioDeviceStop(self.device, self.proc_id);
            AudioDeviceDestroyIOProcID(self.device, self.proc_id);
            drop(Box::from_raw(self.state));
        }
    }
}

/// Linear resampler for interleaved stereo f32 frames (the page plays 48 kHz).
pub struct Resampler {
    step: f64,
    pos: f64,
    pending: Vec<[f32; 2]>,
}

impl Resampler {
    pub fn new(input_rate: f64, output_rate: f64) -> Self {
        Resampler { step: input_rate / output_rate, pos: 0.0, pending: Vec::new() }
    }

    pub fn is_passthrough(&self) -> bool {
        (self.step - 1.0).abs() < 1e-9
    }

    /// Takes interleaved stereo f32 bytes, returns interleaved stereo f32 bytes at the output rate.
    pub fn process(&mut self, input: &[u8]) -> Vec<u8> {
        if self.is_passthrough() {
            return input.to_vec();
        }
        for frame in input.chunks_exact(8) {
            let l = f32::from_le_bytes([frame[0], frame[1], frame[2], frame[3]]);
            let r = f32::from_le_bytes([frame[4], frame[5], frame[6], frame[7]]);
            self.pending.push([l, r]);
        }
        let mut out = Vec::new();
        while self.pos + 1.0 < self.pending.len() as f64 {
            let i = self.pos.floor() as usize;
            let t = (self.pos - i as f64) as f32;
            let (a, b) = (self.pending[i], self.pending[i + 1]);
            for c in 0..2 {
                out.extend_from_slice(&(a[c] + (b[c] - a[c]) * t).to_le_bytes());
            }
            self.pos += self.step;
        }
        let consumed = (self.pos.floor() as usize).min(self.pending.len());
        self.pending.drain(..consumed);
        self.pos -= consumed as f64;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::Resampler;

    fn stereo(frames: usize) -> Vec<u8> {
        (0..frames)
            .flat_map(|i| {
                let v = (i as f32 / frames as f32).to_le_bytes();
                [v, v].concat()
            })
            .collect()
    }

    #[test]
    fn resampling_44100_to_48000_keeps_the_duration() {
        let mut r = Resampler::new(44_100.0, 48_000.0);
        let mut produced = 0usize;
        // one second in 10 ms chunks
        for _ in 0..100 {
            produced += r.process(&stereo(441)).len() / 8;
        }
        assert!((47_900..=48_000).contains(&produced), "{produced}");
    }

    #[test]
    fn same_rate_is_passed_through_unchanged() {
        let mut r = Resampler::new(48_000.0, 48_000.0);
        let input = stereo(480);
        assert_eq!(r.process(&input), input);
    }

    #[test]
    fn interpolated_values_stay_between_their_neighbours() {
        let mut r = Resampler::new(44_100.0, 48_000.0);
        let out = r.process(&stereo(1000));
        for frame in out.chunks_exact(4) {
            let v = f32::from_le_bytes([frame[0], frame[1], frame[2], frame[3]]);
            assert!((0.0..=1.0).contains(&v));
        }
    }
}
