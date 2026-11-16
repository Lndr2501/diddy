//! Windows application-audio capture for screen sharing (Electron shell).
//!
//! Records everything Windows plays except Diddy's own process tree, with the process loopback
//! client (Windows 10 version 2004, build 19041, and later). The call's voices play inside that
//! tree, so the others never hear themselves as an echo.
//!
//! Same protocol as the Linux helper (`native/system-audio.c`, `lib/systemAudio.cjs`):
//! - argument: the PID of Diddy's main process (its whole tree is excluded), or `--probe`
//! - stdout: interleaved stereo 32-bit float PCM at 48 kHz, in blocks of 480 frames (10 ms)
//! - stderr: one line per message, `READY` once capturing, `INFO`/`WARN` for the log,
//!   `ERROR <text>` for a fatal failure (the process then exits)
//!
//! `--probe` starts a capture that excludes the helper itself, records briefly, reports and exits
//! (used by the Windows CI). The helper ends when Diddy's main process ends or stdout closes.

#[cfg(windows)]
mod capture;

/// One line per call, written at once so lines never interleave; control characters are replaced.
pub fn report(level: &str, message: &str) {
    use std::io::Write;
    let clean: String = message.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let mut line = format!("{level} {clean}");
    if level == "READY" {
        line = "READY".to_string();
    }
    line.truncate(500);
    line.push('\n');
    let _ = std::io::stderr().write_all(line.as_bytes());
}

/// Samples in one output block: 480 stereo frames, 10 ms at 48 kHz (`BLOCK_BYTES` in systemAudio.cjs).
pub const BLOCK_SAMPLES: usize = 480 * 2;
/// At most 200 ms waits for the pipe; older audio is dropped rather than delayed.
const MAX_PENDING: usize = BLOCK_SAMPLES * 20;

/// Collects captured packets (any size) and hands out whole little-endian float blocks.
#[derive(Default)]
pub struct Framer {
    pending: std::collections::VecDeque<f32>,
}

impl Framer {
    pub fn push_f32(&mut self, samples: &[f32]) {
        self.pending.extend(samples.iter().map(|s| if s.is_finite() { s.clamp(-1.0, 1.0) } else { 0.0 }));
        self.bound();
    }
    pub fn push_i16(&mut self, samples: &[i16]) {
        self.pending.extend(samples.iter().map(|&s| s as f32 / 32768.0));
        self.bound();
    }
    pub fn push_silence(&mut self, samples: usize) {
        self.pending.extend(std::iter::repeat(0.0).take(samples));
        self.bound();
    }
    #[allow(dead_code)] // used by the Windows capture loop only
    pub fn clear(&mut self) {
        self.pending.clear();
    }
    fn bound(&mut self) {
        if self.pending.len() > MAX_PENDING {
            let drop = self.pending.len() - MAX_PENDING;
            // Keep block alignment of the remaining stereo frames.
            self.pending.drain(..drop + drop % 2);
        }
    }
    pub fn next_block(&mut self) -> Option<Vec<u8>> {
        if self.pending.len() < BLOCK_SAMPLES {
            return None;
        }
        Some(self.pending.drain(..BLOCK_SAMPLES).flat_map(f32::to_le_bytes).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packets_of_any_size_become_whole_blocks() {
        let mut framer = Framer::default();
        framer.push_f32(&vec![0.5; 700]);
        assert!(framer.next_block().is_none());
        framer.push_f32(&vec![-0.25; 300]);
        let block = framer.next_block().unwrap();
        assert_eq!(block.len(), BLOCK_SAMPLES * 4);
        assert_eq!(f32::from_le_bytes(block[0..4].try_into().unwrap()), 0.5);
        assert_eq!(f32::from_le_bytes(block[699 * 4..700 * 4].try_into().unwrap()), 0.5);
        assert_eq!(f32::from_le_bytes(block[700 * 4..701 * 4].try_into().unwrap()), -0.25);
        assert!(framer.next_block().is_none());
    }

    #[test]
    fn int16_and_silence_convert_to_float() {
        let mut framer = Framer::default();
        framer.push_i16(&[i16::MIN, 16384]);
        framer.push_silence(BLOCK_SAMPLES - 2);
        let block = framer.next_block().unwrap();
        assert_eq!(f32::from_le_bytes(block[0..4].try_into().unwrap()), -1.0);
        assert_eq!(f32::from_le_bytes(block[4..8].try_into().unwrap()), 0.5);
        assert_eq!(f32::from_le_bytes(block[8..12].try_into().unwrap()), 0.0);
    }

    #[test]
    fn bad_samples_are_clamped_and_backlog_is_bounded() {
        let mut framer = Framer::default();
        framer.push_f32(&[f32::NAN, 3.0]);
        framer.push_silence(MAX_PENDING * 3 + 4);
        assert!(framer.pending.len() <= MAX_PENDING);
        assert_eq!(framer.pending.len() % 2, 0);
        let mut framer = Framer::default();
        framer.push_f32(&[f32::NAN, 3.0]);
        framer.push_silence(BLOCK_SAMPLES - 2);
        let block = framer.next_block().unwrap();
        assert_eq!(f32::from_le_bytes(block[0..4].try_into().unwrap()), 0.0);
        assert_eq!(f32::from_le_bytes(block[4..8].try_into().unwrap()), 1.0);
    }
}

#[cfg(windows)]
fn main() {
    std::process::exit(capture::run(std::env::args().skip(1).collect()));
}

#[cfg(not(windows))]
fn main() {
    report("ERROR", "this helper only runs on Windows");
    std::process::exit(2);
}
