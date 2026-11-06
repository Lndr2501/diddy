//! System-audio capture for screen sharing (macOS only).
//!
//! WebKit's `getDisplayMedia()` cannot capture audio, so the sound is captured natively with a
//! Core Audio process tap (src/audio_tap.rs) and streamed to the page over a loopback WebSocket. The page turns the stream
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
//!
//! History: the audio used to come from a ScreenCaptureKit stream. A second ScreenCaptureKit client
//! of the same app breaks WebKit's screen-share picker: in the app process the NEXT picker choice
//! went to our client instead of WebKit; in a helper process, the helper's exit made the screen
//! sharing daemon (replayd) purge every picker of the bundle (`purgePickersForApplicationBundleID`).
//! Either way the second share hung for 60 s and blocked camera requests meanwhile. A process tap
//! does not involve replayd at all. The capture still runs in a short-lived helper process (this
//! same executable started with `--diddy-system-audio-helper`) so a crash in Core Audio code can
//! never take the app down.
//!
//! Helper wire format (helper stdout -> app): frames of `[kind: u8][len: u32 LE][payload]`,
//! kind 0 = capture running, 1 = error (UTF-8 text), 2 = interleaved f32 PCM. The helper stops
//! when its stdin is closed (the app ends the share or exits).

use std::{
    fs::OpenOptions,
    io::{BufReader, ErrorKind, Read, Write},
    net::{TcpListener, TcpStream},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc::{self, SyncSender},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use tungstenite::{
    accept_hdr,
    handshake::server::{ErrorResponse, Request, Response},
    http, Error as WsError, Message,
};

const SAMPLE_RATE: i32 = 48_000;
const CHANNELS: i32 = 2;
pub const HELPER_FLAG: &str = "--diddy-system-audio-helper";
const FRAME_STARTED: u8 = 0;
const FRAME_ERROR: u8 = 1;
const FRAME_PCM: u8 = 2;
/// Upper bound for one frame; a 10 ms stereo f32 chunk at 48 kHz is 3840 bytes.
const MAX_FRAME: usize = 1 << 20;

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
    let busy = Arc::new(Busy::default());

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

/// Running sessions per kind: one screen-share audio, and two microphones (a live device switch
/// opens the new microphone before the old one is closed).
#[derive(Default)]
struct Busy {
    screen: AtomicUsize,
    mic: AtomicUsize,
}

const MAX_SCREEN_SESSIONS: usize = 1;
const MAX_MIC_SESSIONS: usize = 2;

struct BusyGuard<'a>(&'a AtomicUsize);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

fn claim(counter: &AtomicUsize, max: usize) -> Option<BusyGuard<'_>> {
    let previous = counter.fetch_add(1, Ordering::SeqCst);
    if previous >= max {
        counter.fetch_sub(1, Ordering::SeqCst);
        return None;
    }
    Some(BusyGuard(counter))
}

#[derive(Debug, PartialEq)]
enum SessionKind {
    /// system audio of other apps (screen sharing)
    Screen,
    /// the microphone `device` (Core Audio name; None = default input)
    Mic { device: Option<String> },
}

#[derive(Debug, PartialEq)]
struct SessionRequest {
    kind: SessionKind,
    /// sample rate the page plays at
    rate: f64,
}

fn percent_decode(value: &str) -> String {
    let hex = |b: u8| -> Option<u8> {
        match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            b'A'..=b'F' => Some(b - b'A' + 10),
            _ => None,
        }
    };
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'%' {
            if let (Some(hi), Some(lo)) = (bytes.get(i + 1).copied().and_then(hex), bytes.get(i + 2).copied().and_then(hex)) {
                out.push(hi << 4 | lo);
                i += 3;
                continue;
            }
        }
        out.push(if b == b'+' { b' ' } else { b });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Reads `mode`, `device` and `rate` from the WebSocket query (the token is checked separately).
fn parse_request(query: &str) -> SessionRequest {
    let mut mode = "screen";
    let mut device = None;
    let mut rate = SAMPLE_RATE as f64;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        match key {
            "mode" if value == "mic" => mode = "mic",
            "device" => device = Some(percent_decode(value)).filter(|d| !d.is_empty() && d.len() <= 256),
            "rate" => {
                if let Ok(r) = value.parse::<f64>() {
                    if (8_000.0..=192_000.0).contains(&r) {
                        rate = r;
                    }
                }
            }
            _ => {}
        }
    }
    let kind = if mode == "mic" { SessionKind::Mic { device } } else { SessionKind::Screen };
    SessionRequest { kind, rate }
}

/// One running capture of either kind.
enum Capture {
    Screen(Helper),
    Mic(crate::audio_tap::MicCapture),
}

impl Capture {
    fn stop(self) {
        match self {
            Capture::Screen(helper) => helper.stop(),
            Capture::Mic(mic) => mic.stop(),
        }
    }
}

fn serve(stream: TcpStream, token: &str, origins: &[String], busy: &Busy) -> Result<(), String> {
    let expected = format!("token={token}");
    let mut query = String::new();
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
            query = req.uri().query().unwrap_or_default().to_string();
            Ok(resp)
        } else {
            Err(http::Response::builder()
                .status(403)
                .body(None)
                .expect("static response"))
        }
    };

    let mut ws = accept_hdr(stream, callback).map_err(|e| format!("handshake: {e}"))?;
    let request = parse_request(&query);

    let guard = match request.kind {
        SessionKind::Screen => claim(&busy.screen, MAX_SCREEN_SESSIONS),
        SessionKind::Mic { .. } => claim(&busy.mic, MAX_MIC_SESSIONS),
    };
    let Some(_guard) = guard else {
        let _ = ws.send(Message::text(r#"{"type":"error","message":"busy"}"#));
        let _ = ws.close(None);
        return Ok(());
    };

    let tcp = ws.get_mut();
    let _ = tcp.set_nodelay(true);
    let _ = tcp.set_read_timeout(Some(Duration::from_millis(5)));
    let _ = tcp.set_write_timeout(Some(Duration::from_secs(2)));

    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(64);
    // Screen audio arrives at 48 kHz from the helper; the microphone at the device rate.
    let started = match &request.kind {
        SessionKind::Screen => spawn_helper(tx).map(|h| (Capture::Screen(h), SAMPLE_RATE as f64)),
        SessionKind::Mic { device } => crate::audio_tap::MicCapture::start(tx, device.as_deref()).map(|m| {
            log(&format!("microphone started device={} rate={}", m.name, m.sample_rate));
            let rate = m.sample_rate;
            (Capture::Mic(m), rate)
        }),
    };
    let (capture, source_rate) = match started {
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
    let mut resampler = crate::audio_tap::Resampler::new(source_rate, request.rate);

    if let Err(e) = ws.send(Message::text(format!(
        r#"{{"type":"format","sampleRate":{},"channels":{CHANNELS}}}"#,
        request.rate
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
            let buf = resampler.process(&buf);
            if buf.is_empty() {
                continue;
            }
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

fn finish(capture: Capture, result: Result<(), String>) -> Result<(), String> {
    capture.stop();
    log("capture stopped");
    result
}

/// The running helper process of one share.
struct Helper {
    child: Child,
    stdin: Option<ChildStdin>,
}

impl Helper {
    /// Closing stdin asks the helper to stop its stream and exit; kill it if it does not.
    fn stop(mut self) {
        drop(self.stdin.take());
        let deadline = Instant::now() + Duration::from_millis(1500);
        loop {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
                _ => break,
            }
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        log("helper killed after stop timeout");
    }
}

fn read_frame(reader: &mut impl Read) -> std::io::Result<(u8, Vec<u8>)> {
    let mut head = [0u8; 5];
    reader.read_exact(&mut head)?;
    let len = u32::from_le_bytes([head[1], head[2], head[3], head[4]]) as usize;
    if len > MAX_FRAME {
        return Err(std::io::Error::new(ErrorKind::InvalidData, "frame too large"));
    }
    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload)?;
    Ok((head[0], payload))
}

fn write_frame(writer: &mut impl Write, kind: u8, payload: &[u8]) -> std::io::Result<()> {
    let len = u32::try_from(payload.len()).map_err(|_| std::io::Error::new(ErrorKind::InvalidInput, "frame too large"))?;
    let mut head = [0u8; 5];
    head[0] = kind;
    head[1..].copy_from_slice(&len.to_le_bytes());
    writer.write_all(&head)?;
    writer.write_all(payload)?;
    writer.flush()
}

/// Starts the helper and waits until its capture runs (or failed). PCM goes into `tx`.
fn spawn_helper(tx: SyncSender<Vec<u8>>) -> Result<Helper, String> {
    let exe = std::env::current_exe().map_err(|e| format!("helper path: {e}"))?;
    let mut child = Command::new(exe)
        .arg(HELPER_FLAG)
        .arg(std::process::id().to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("helper start: {e}"))?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take().ok_or("helper output missing")?;
    let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut ready = Some(ready_tx);
        loop {
            match read_frame(&mut reader) {
                Ok((FRAME_STARTED, _)) => {
                    if let Some(r) = ready.take() {
                        let _ = r.send(Ok(()));
                    }
                }
                Ok((FRAME_ERROR, text)) => {
                    let message = String::from_utf8_lossy(&text).into_owned();
                    match ready.take() {
                        Some(r) => {
                            let _ = r.send(Err(message));
                        }
                        None => log(&format!("helper error: {message}")),
                    }
                }
                Ok((FRAME_PCM, pcm)) => {
                    // Never block the reader: if the page can't keep up, drop the chunk.
                    let _ = tx.try_send(pcm);
                }
                Ok(_) => {}
                Err(_) => {
                    if let Some(r) = ready.take() {
                        let _ = r.send(Err("helper ended before the capture started".into()));
                    }
                    return;
                }
            }
        }
    });
    let mut helper = Helper { child, stdin };
    match ready_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(helper),
        Ok(Err(e)) => {
            helper.stdin.take();
            let _ = helper.child.kill();
            let _ = helper.child.wait();
            Err(e)
        }
        Err(_) => {
            let _ = helper.child.kill();
            let _ = helper.child.wait();
            Err("helper did not start in time".into())
        }
    }
}

/// Entry point of the helper process. Returns the exit code when `args` ask for the helper.
pub fn helper_main(args: &[String]) -> Option<i32> {
    if args.get(1).map(String::as_str) != Some(HELPER_FLAG) {
        return None;
    }
    let app_pid = args.get(2).and_then(|p| p.parse::<i32>().ok())?;
    let mut out = std::io::stdout().lock();
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(64);
    let capture = match crate::audio_tap::TapCapture::start(tx, app_pid) {
        Ok(c) => c,
        Err(e) => {
            log(&format!("tap failed: {e}"));
            let _ = write_frame(&mut out, FRAME_ERROR, e.as_bytes());
            return Some(1);
        }
    };
    // the page plays 48 kHz; the tap delivers the output device's rate (often 44.1 kHz)
    let mut resampler = crate::audio_tap::Resampler::new(capture.sample_rate, SAMPLE_RATE as f64);
    if write_frame(&mut out, FRAME_STARTED, &[]).is_err() {
        capture.stop();
        return Some(1);
    }
    // stdin closes when the app ends the share, exits or crashes
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = stop.clone();
    thread::spawn(move || {
        let mut sink = [0u8; 64];
        let mut input = std::io::stdin();
        while matches!(input.read(&mut sink), Ok(n) if n > 0) {}
        stop_flag.store(true, Ordering::SeqCst);
    });
    while !stop.load(Ordering::SeqCst) {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(pcm) => {
                let pcm = resampler.process(&pcm);
                if !pcm.is_empty() && write_frame(&mut out, FRAME_PCM, &pcm).is_err() {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    capture.stop();
    Some(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_frames_round_trip_and_reject_oversized_lengths() {
        let mut buf = Vec::new();
        write_frame(&mut buf, FRAME_STARTED, &[]).unwrap();
        write_frame(&mut buf, FRAME_PCM, &[1, 2, 3, 4]).unwrap();
        write_frame(&mut buf, FRAME_ERROR, b"denied").unwrap();
        let mut reader = std::io::Cursor::new(buf);
        assert_eq!(read_frame(&mut reader).unwrap(), (FRAME_STARTED, vec![]));
        assert_eq!(read_frame(&mut reader).unwrap(), (FRAME_PCM, vec![1, 2, 3, 4]));
        assert_eq!(read_frame(&mut reader).unwrap(), (FRAME_ERROR, b"denied".to_vec()));
        assert!(read_frame(&mut reader).is_err());

        let mut huge = vec![FRAME_PCM];
        huge.extend_from_slice(&u32::MAX.to_le_bytes());
        assert!(read_frame(&mut std::io::Cursor::new(huge)).is_err());
    }

    #[test]
    fn bridge_requests_choose_mode_device_and_rate_safely() {
        assert_eq!(
            parse_request("token=x"),
            SessionRequest { kind: SessionKind::Screen, rate: 48_000.0 }
        );
        assert_eq!(
            parse_request("token=x&mode=mic&device=EarPods%20(USB)&rate=44100"),
            SessionRequest { kind: SessionKind::Mic { device: Some("EarPods (USB)".into()) }, rate: 44_100.0 }
        );
        // absurd rates and empty names fall back to the defaults
        assert_eq!(
            parse_request("mode=mic&device=&rate=5"),
            SessionRequest { kind: SessionKind::Mic { device: None }, rate: 48_000.0 }
        );
        // broken escapes never panic
        assert_eq!(percent_decode("a%2"), "a%2");
        assert_eq!(percent_decode("%zz%41"), "%zzA");
        assert_eq!(percent_decode("Mic%C3%A9"), "Micé");
    }

    #[test]
    fn session_limits_are_per_kind_and_released() {
        let busy = Busy::default();
        let screen = claim(&busy.screen, MAX_SCREEN_SESSIONS);
        assert!(screen.is_some());
        assert!(claim(&busy.screen, MAX_SCREEN_SESSIONS).is_none());
        let a = claim(&busy.mic, MAX_MIC_SESSIONS);
        let b = claim(&busy.mic, MAX_MIC_SESSIONS);
        assert!(a.is_some() && b.is_some());
        assert!(claim(&busy.mic, MAX_MIC_SESSIONS).is_none());
        drop(a);
        assert!(claim(&busy.mic, MAX_MIC_SESSIONS).is_some());
        drop(screen);
        assert!(claim(&busy.screen, MAX_SCREEN_SESSIONS).is_some());
    }

    #[test]
    fn only_the_helper_flag_starts_the_helper() {
        let normal: Vec<String> = vec!["diddy".into()];
        assert_eq!(helper_main(&normal), None);
        let other: Vec<String> = vec!["diddy".into(), "--connection-id".into(), "x".into()];
        assert_eq!(helper_main(&other), None);
        // the flag without a valid app pid does not start a capture either
        let bad: Vec<String> = vec!["diddy".into(), HELPER_FLAG.into(), "nope".into()];
        assert_eq!(helper_main(&bad), None);
    }
}
