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
    msg_send, Message,
    rc::{Allocated, Retained},
    runtime::{AnyClass, AnyObject},
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
        unsafe {
            let _: () = msg_send![&*description, setPrivateTap: true];
            let name = NSString::from_str("Diddy screen share audio");
            let _: () = msg_send![&*description, setName: &*name];
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
