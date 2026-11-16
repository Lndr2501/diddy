//! WASAPI process loopback capture. See main.rs for the protocol.
use std::fs::File;
use std::io::Write;
use std::mem::ManuallyDrop;
use std::os::windows::io::{AsRawHandle, FromRawHandle};
use std::time::{Duration, Instant};

use windows::core::{implement, Interface, IUnknown, Ref, HRESULT};
use windows::Wdk::System::SystemServices::RtlGetVersion;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT};
use windows::Win32::Media::Audio::{
    ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation,
    IActivateAudioInterfaceCompletionHandler, IActivateAudioInterfaceCompletionHandler_Impl,
    IAudioCaptureClient, IAudioClient, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
    AUDCLNT_STREAMFLAGS_LOOPBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
    AUDIOCLIENT_ACTIVATION_PARAMS, AUDIOCLIENT_ACTIVATION_PARAMS_0,
    AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK, AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE, VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
    WAVEFORMATEX,
};
use windows::Win32::System::Com::{CoInitializeEx, IAgileObject, IAgileObject_Impl, COINIT_MULTITHREADED};
use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
use windows::Win32::System::Threading::{
    CreateEventW, OpenProcess, SetEvent, WaitForMultipleObjects, WaitForSingleObject,
    PROCESS_SYNCHRONIZE,
};

use crate::report;
use crate::Framer;

/// First Windows build with the process loopback client (Windows 10 version 2004).
pub const MIN_BUILD: u32 = 19041;
const RATE: u32 = 48000;
const CHANNELS: u16 = 2;
const WAVE_FORMAT_PCM: u16 = 1;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
/// Engine buffer, 100-ns units: 20 ms.
const BUFFER_DURATION: i64 = 200_000;
const PROBE_DURATION: Duration = Duration::from_millis(300);

type Result<T> = std::result::Result<T, String>;

fn context(what: &'static str) -> impl Fn(windows::core::Error) -> String {
    move |error| format!("{what} failed (0x{:08X}: {})", error.code().0 as u32, error.message())
}

pub fn run(args: Vec<String>) -> i32 {
    let (target, probe) = match args.as_slice() {
        [flag] if flag == "--probe" => (std::process::id(), true),
        [pid] => match pid.parse::<u32>() {
            Ok(pid) if pid > 0 => (pid, false),
            _ => return usage(),
        },
        _ => return usage(),
    };
    let build = windows_build();
    report("INFO", &format!("Windows build {build}, excluding process tree {target}"));
    if build < MIN_BUILD {
        report("ERROR", "Windows 10 version 2004 (build 19041) or later is required");
        return 3;
    }
    match capture(target, probe) {
        Ok(()) => 0,
        Err(message) => {
            report("ERROR", &message);
            1
        }
    }
}

fn usage() -> i32 {
    report("ERROR", "usage: diddy-system-audio <diddy-pid> | --probe");
    2
}

/// The real build number (GetVersionEx answers what the manifest claims).
fn windows_build() -> u32 {
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    if unsafe { RtlGetVersion(&mut info) }.is_ok() {
        info.dwBuildNumber
    } else {
        0
    }
}

/// Signals an event once Windows has created the audio client. Agile: Windows may call it on any thread.
#[implement(IActivateAudioInterfaceCompletionHandler, IAgileObject)]
struct Completion(HANDLE);

impl IActivateAudioInterfaceCompletionHandler_Impl for Completion_Impl {
    fn ActivateCompleted(
        &self,
        _operation: Ref<'_, IActivateAudioInterfaceAsyncOperation>,
    ) -> windows::core::Result<()> {
        unsafe { SetEvent(self.0) }
    }
}

impl IAgileObject_Impl for Completion_Impl {}

/// Closes the handle when dropped.
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

fn new_event() -> Result<Handle> {
    unsafe { CreateEventW(None, false, false, None) }
        .map(Handle)
        .map_err(context("CreateEvent"))
}

/// An audio client for everything except the target process and its children.
fn activate(target: u32) -> Result<IAudioClient> {
    let params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId: target,
                ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
            },
        },
    };
    let blob = blob_propvariant(&params);
    let done = new_event()?;
    let handler: IActivateAudioInterfaceCompletionHandler = Completion(done.0).into();
    let operation = unsafe {
        ActivateAudioInterfaceAsync(
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
            &IAudioClient::IID,
            Some(&*blob),
            &handler,
        )
    }
    .map_err(context("ActivateAudioInterfaceAsync"))?;
    if unsafe { WaitForSingleObject(done.0, 10_000) } != WAIT_OBJECT_0 {
        return Err("the audio service did not answer the loopback activation".into());
    }
    let mut result = HRESULT(0);
    let mut client: Option<IUnknown> = None;
    unsafe { operation.GetActivateResult(&mut result, &mut client) }
        .map_err(context("GetActivateResult"))?;
    result.ok().map_err(context("process loopback activation"))?;
    client
        .ok_or_else(|| "process loopback activation returned no client".to_string())?
        .cast::<IAudioClient>()
        .map_err(context("IAudioClient"))
}

/// A VT_BLOB PROPVARIANT pointing at `params`. Never cleared: the blob is borrowed, not allocated.
fn blob_propvariant(
    params: &AUDIOCLIENT_ACTIVATION_PARAMS,
) -> ManuallyDrop<windows::Win32::System::Com::StructuredStorage::PROPVARIANT> {
    use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
    use windows::Win32::System::Com::BLOB;
    use windows::Win32::System::Variant::VT_BLOB;
    ManuallyDrop::new(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_BLOB,
                Anonymous: PROPVARIANT_0_0_0 {
                    blob: BLOB {
                        cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                        pBlobData: params as *const _ as *mut u8,
                    },
                },
                ..Default::default()
            }),
        },
    })
}

fn wave_format(tag: u16, bits: u16) -> WAVEFORMATEX {
    let align = CHANNELS * bits / 8;
    WAVEFORMATEX {
        wFormatTag: tag,
        nChannels: CHANNELS,
        nSamplesPerSec: RATE,
        nAvgBytesPerSec: RATE * align as u32,
        nBlockAlign: align,
        wBitsPerSample: bits,
        cbSize: 0,
    }
}

#[derive(Clone, Copy)]
enum Sample {
    Float,
    Int16,
}

/// Process loopback has no mix format of its own: ask for float, fall back to 16-bit PCM.
fn open(target: u32) -> Result<(IAudioClient, Sample)> {
    let flags = AUDCLNT_STREAMFLAGS_LOOPBACK
        | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
        | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
        | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    let mut last = String::new();
    for (sample, format) in [
        (Sample::Float, wave_format(WAVE_FORMAT_IEEE_FLOAT, 32)),
        (Sample::Int16, wave_format(WAVE_FORMAT_PCM, 16)),
    ] {
        let bits = format.wBitsPerSample; // packed struct: copy before formatting
        // A client whose Initialize failed is not reused.
        let client = activate(target)?;
        match unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, BUFFER_DURATION, 0, &format, None) } {
            Ok(()) => return Ok((client, sample)),
            Err(error) => {
                last = context("IAudioClient::Initialize")(error);
                report("WARN", &format!("{bits}-bit format refused: {last}"));
            }
        }
    }
    Err(last)
}

/// Writes straight to the stdout handle: std's stdout is line-buffered, and this is binary.
fn raw_stdout() -> ManuallyDrop<File> {
    let handle = std::io::stdout().as_raw_handle();
    ManuallyDrop::new(unsafe { File::from_raw_handle(handle) })
}

fn capture(target: u32, probe: bool) -> Result<()> {
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .map_err(context("CoInitializeEx"))?;
    let (client, sample) = open(target)?;
    let ready = new_event()?;
    unsafe { client.SetEventHandle(ready.0) }.map_err(context("SetEventHandle"))?;
    let packets: IAudioCaptureClient =
        unsafe { client.GetService() }.map_err(context("IAudioCaptureClient"))?;
    // Ends the capture with Diddy, even if it never closes the pipe.
    let parent = if probe {
        None
    } else {
        Some(Handle(
            unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, target) }
                .map_err(context("OpenProcess"))?,
        ))
    };
    unsafe { client.Start() }.map_err(context("IAudioClient::Start"))?;
    report(
        "INFO",
        &format!("capturing 48 kHz stereo {}", if matches!(sample, Sample::Float) { "float" } else { "16-bit" }),
    );
    report("READY", "");

    let mut out = raw_stdout();
    let mut framer = Framer::default();
    let started = Instant::now();
    let mut frames_total: u64 = 0;
    let mut handles = vec![ready.0];
    if let Some(parent) = &parent {
        handles.push(parent.0);
    }
    loop {
        if probe && started.elapsed() >= PROBE_DURATION {
            report("INFO", &format!("probe ok, {frames_total} frames received"));
            break;
        }
        let woke = unsafe { WaitForMultipleObjects(&handles, false, 100) };
        if woke == WAIT_TIMEOUT {
            // Nothing plays: process loopback delivers no packets, the page plays silence.
            continue;
        }
        if woke.0 == WAIT_OBJECT_0.0 + 1 {
            report("INFO", "Diddy ended");
            break;
        }
        if woke != WAIT_OBJECT_0 {
            return Err("waiting for audio failed".into());
        }
        loop {
            let size = unsafe { packets.GetNextPacketSize() }.map_err(context("GetNextPacketSize"))?;
            if size == 0 {
                break;
            }
            let mut data = std::ptr::null_mut();
            let mut frames = 0u32;
            let mut flags = 0u32;
            unsafe { packets.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }
                .map_err(context("GetBuffer"))?;
            let samples = frames as usize * CHANNELS as usize;
            if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                framer.push_silence(samples);
            } else {
                match sample {
                    Sample::Float => framer.push_f32(unsafe {
                        std::slice::from_raw_parts(data as *const f32, samples)
                    }),
                    Sample::Int16 => framer.push_i16(unsafe {
                        std::slice::from_raw_parts(data as *const i16, samples)
                    }),
                }
            }
            unsafe { packets.ReleaseBuffer(frames) }.map_err(context("ReleaseBuffer"))?;
            frames_total += frames as u64;
        }
        if probe {
            framer.clear();
            continue;
        }
        while let Some(block) = framer.next_block() {
            if out.write_all(&block).is_err() {
                // Diddy closed the pipe: the share ended.
                let _ = unsafe { client.Stop() };
                return Ok(());
            }
        }
    }
    let _ = unsafe { client.Stop() };
    Ok(())
}
