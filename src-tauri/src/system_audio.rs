//! System-audio capture for screen sharing (macOS only).
//!
//! WebKit's `getDisplayMedia()` cannot capture audio, so the sound is captured natively with
//! ScreenCaptureKit and streamed to the page over a loopback WebSocket. The page turns the stream
//! into a `MediaStreamTrack` and hands it to Element Call
//! (see `cinny/src/app/plugins/call/screenShareAudio.ts`).
//!
//! Wire format (server -> page):
//!   1. one text frame: `{"type":"format","sampleRate":48000,"channels":2}`
//!   2. binary frames: interleaved little-endian f32 PCM
//!
//! Security: the socket only listens on 127.0.0.1, requires a random per-launch token (injected
//! into the app's own page, unreadable for other origins) and checks the `Origin` header.
//! A capture session lives exactly as long as its WebSocket connection.

use std::{
    fs::OpenOptions,
    io::{ErrorKind, Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
        Arc,
    },
    thread,
    time::Duration,
};

use screencapturekit::prelude::*;
use tungstenite::{
    accept_hdr,
    handshake::server::{ErrorResponse, Request, Response},
    http, Error as WsError, Message,
};

const SAMPLE_RATE: i32 = 48_000;
const CHANNELS: i32 = 2;
const BUNDLE_ID: &str = "app.diddy.desktop";

extern "C" {
    /// Private-but-stable libSystem call used by Activity Monitor / TCC: which app is
    /// responsible for `pid` (WebKit's helper processes are attributed to the app that owns them).
    fn responsibility_get_pid_responsible_for_pid(pid: i32) -> i32;
}

pub struct AudioBridge {
    pub port: u16,
    pub token: String,
}

impl AudioBridge {
    /// Script injected into the main frame before any page script runs.
    pub fn init_script(&self) -> String {
        format!(
            "Object.defineProperty(window,'__CINNY_SYS_AUDIO__',{{value:Object.freeze({{port:{},token:'{}'}})}});",
            self.port, self.token
        )
    }
}

pub fn log(msg: &str) {
    eprintln!("[system-audio] {msg}");
    if let Some(home) = std::env::var_os("HOME") {
        let dir = std::path::Path::new(&home).join("Library/Logs/Diddy");
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("system-audio.log"))
        {
            let _ = writeln!(f, "{msg}");
        }
    }
}

fn random_token() -> std::io::Result<String> {
    let mut bytes = [0u8; 24];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Start the loopback server. `allowed_origins` are the page origins that may connect.
pub fn spawn(allowed_origins: Vec<String>) -> std::io::Result<AudioBridge> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let token = random_token()?;
    let busy = Arc::new(AtomicBool::new(false));

    let server_token = token.clone();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let token = server_token.clone();
            let origins = allowed_origins.clone();
            let busy = busy.clone();
            thread::spawn(move || {
                if let Err(e) = serve(stream, &token, &origins, &busy) {
                    log(&format!("session ended with error: {e}"));
                }
            });
        }
    });

    log(&format!("bridge listening on 127.0.0.1:{port}"));
    Ok(AudioBridge { port, token })
}

struct BusyGuard(Arc<AtomicBool>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn serve(
    stream: TcpStream,
    token: &str,
    origins: &[String],
    busy: &Arc<AtomicBool>,
) -> Result<(), String> {
    let expected = format!("token={token}");
    let callback = |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        let origin_ok = req
            .headers()
            .get("Origin")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|o| origins.iter().any(|a| a == o));
        let token_ok = req
            .uri()
            .query()
            .is_some_and(|q| q.split('&').any(|kv| kv == expected));
        if origin_ok && token_ok {
            Ok(resp)
        } else {
            Err(http::Response::builder()
                .status(403)
                .body(None)
                .expect("static response"))
        }
    };

    let mut ws = accept_hdr(stream, callback).map_err(|e| format!("handshake: {e}"))?;

    if busy.swap(true, Ordering::SeqCst) {
        let _ = ws.send(Message::text(r#"{"type":"error","message":"busy"}"#));
        let _ = ws.close(None);
        return Ok(());
    }
    let _guard = BusyGuard(busy.clone());

    let tcp = ws.get_mut();
    let _ = tcp.set_nodelay(true);
    let _ = tcp.set_read_timeout(Some(Duration::from_millis(5)));
    let _ = tcp.set_write_timeout(Some(Duration::from_secs(2)));

    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(64);
    let capture = match start_capture(tx) {
        Ok(c) => c,
        Err(e) => {
            log(&format!("capture failed to start: {e}"));
            let msg = format!(
                r#"{{"type":"error","message":{}}}"#,
                serde_json::Value::String(e)
            );
            let _ = ws.send(Message::text(msg));
            let _ = ws.close(None);
            return Ok(());
        }
    };
    log("capture started");

    if let Err(e) = ws.send(Message::text(format!(
        r#"{{"type":"format","sampleRate":{SAMPLE_RATE},"channels":{CHANNELS}}}"#
    ))) {
        // Don't leave the native capture running when the page is already gone.
        return finish(capture, Err(e.to_string()));
    }

    let result = loop {
        // Reading doubles as pacing (5 ms timeout) and notices when the page goes away.
        match ws.read() {
            Ok(Message::Close(_)) => break Ok(()),
            Ok(_) => {}
            Err(WsError::Io(e)) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(WsError::ConnectionClosed | WsError::AlreadyClosed) => break Ok(()),
            Err(e) => break Err(e.to_string()),
        }
        while let Ok(buf) = rx.try_recv() {
            if let Err(e) = ws.send(Message::binary(buf)) {
                match e {
                    WsError::Io(ref io)
                        if matches!(io.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                    other => return finish(capture, Err(other.to_string())),
                }
            }
        }
    };
    let _ = ws.close(None);
    finish(capture, result)
}

fn finish(capture: SCStream, result: Result<(), String>) -> Result<(), String> {
    let _ = capture.stop_capture();
    log("capture stopped");
    result
}

fn is_ours(app: &SCRunningApplication, own_pid: i32) -> bool {
    let pid = app.process_id();
    pid == own_pid
        || app.bundle_identifier() == BUNDLE_ID
        // WebKit helper processes (WebContent/GPU/Networking) are attributed to us.
        || unsafe { responsibility_get_pid_responsible_for_pid(pid) } == own_pid
}

fn start_capture(tx: SyncSender<Vec<u8>>) -> Result<SCStream, String> {
    let content = SCShareableContent::get().map_err(|e| format!("shareable content: {e:?}"))?;
    let display = content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| "no display found".to_string())?;

    let own_pid = std::process::id() as i32;
    let apps = content.applications();
    for app in &apps {
        log(&format!(
            "app pid={} bundle={} name={} ours={}",
            app.process_id(),
            app.bundle_identifier(),
            app.application_name(),
            is_ours(app, own_pid)
        ));
    }

    // Capture the audio of every app except Cinny itself, otherwise the other call
    // participants would hear their own voices coming back.
    let others: Vec<&SCRunningApplication> = apps.iter().filter(|a| !is_ours(a, own_pid)).collect();

    let filter = SCContentFilter::create()
        .with_display(&display)
        .with_including_applications(&others, &[])
        .build()
        .map_err(|e| format!("content filter: {e:?}"))?;

    // We only want audio: keep the (unused) video side as tiny and slow as possible.
    let config = SCStreamConfiguration::new()
        .with_width(64)
        .with_height(64)
        .with_fps(1)
        .with_captures_audio(true)
        .with_sample_rate(SAMPLE_RATE)
        .with_channel_count(CHANNELS)
        .with_excludes_current_process_audio(true);

    let mut stream =
        SCStream::new(&filter, &config).map_err(|e| format!("create stream: {e:?}"))?;
    stream
        .add_output_handler(AudioHandler { tx }, SCStreamOutputType::Audio)
        .map_err(|e| format!("add audio handler: {e:?}"))?;
    stream
        .start_capture()
        .map_err(|e| format!("start capture: {e:?}"))?;
    Ok(stream)
}

struct AudioHandler {
    tx: SyncSender<Vec<u8>>,
}

impl SCStreamOutputTrait for AudioHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
        if !matches!(output_type, SCStreamOutputType::Audio) {
            return;
        }
        let Ok(list) = sample.audio_buffer_list() else {
            return;
        };

        let out = match list.num_buffers() {
            0 => return,
            // One buffer: already interleaved.
            1 => {
                let buf = list.get(0).expect("checked length");
                let data = buf.data();
                match buf.number_channels {
                    2 => data.to_vec(),
                    1 => data
                        .chunks_exact(4)
                        .flat_map(|s| [s, s].concat())
                        .collect(),
                    n if n > 2 => data
                        .chunks_exact(4 * n as usize)
                        .flat_map(|frame| frame[..8].to_vec())
                        .collect(),
                    _ => return,
                }
            }
            // One buffer per channel (ScreenCaptureKit's usual layout): interleave L and R.
            _ => {
                let left = list.get(0).expect("checked length").data();
                let right = list.get(1).expect("checked length").data();
                let frames = left.len().min(right.len()) / 4;
                let mut out = Vec::with_capacity(frames * 8);
                for i in 0..frames {
                    out.extend_from_slice(&left[i * 4..i * 4 + 4]);
                    out.extend_from_slice(&right[i * 4..i * 4 + 4]);
                }
                out
            }
        };

        // Never block ScreenCaptureKit's queue: if the page can't keep up, drop the chunk.
        let _ = self.tx.try_send(out);
    }
}
