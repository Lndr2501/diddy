import AVFoundation
import MatrixRustSDK
import os
import SwiftUI

/// What the timeline needs to show an `m.audio` message: voice messages (MSC3245) with their
/// waveform, and plain audio files, both with the same compact player.
struct AudioAttachment {
    let source: MediaSource
    let filename: String
    let mimeType: String?
    let duration: TimeInterval?
    /// Bar heights 0...1; empty when the sender gave no waveform.
    let waveform: [Float]
    let isVoice: Bool

    /// Remote content is untrusted: the duration is clamped and the waveform is capped.
    init(_ content: AudioMessageContent) {
        source = content.source
        filename = content.filename
        mimeType = content.info?.mimetype
        let seconds = content.audio?.duration ?? content.info?.duration
        duration = seconds.flatMap { $0.isFinite && $0 >= 0 ? min($0, 24 * 3600) : nil }
        waveform = VoiceWaveform.normalized(content.audio?.waveform ?? [])
        isVoice = content.voice != nil
    }
}

enum VoiceFormat {
    /// `0:07`, `12:30`, `1:02:03`
    static func time(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds.isFinite ? seconds : 0).rounded())
        let (h, m, s) = (total / 3600, total / 60 % 60, total % 60)
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}

/// Playback position of the message that is playing. Kept apart from `VoicePlayer`, so only the
/// player on screen redraws while the position moves.
@MainActor
final class PlaybackProgress: ObservableObject {
    @Published fileprivate(set) var time: TimeInterval = 0
    @Published fileprivate(set) var duration: TimeInterval = 0
    var fraction: Double { duration > 0 ? min(max(time / duration, 0), 1) : 0 }
}

/// Plays one voice message at a time; starting another stops the first.
@MainActor
final class VoicePlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {
    static let shared = VoicePlayer()

    @Published private(set) var currentId: String?
    @Published private(set) var isPlaying = false
    @Published private(set) var isLoading = false
    /// The message whose last attempt failed (download or a format iOS cannot play).
    @Published private(set) var failedId: String?
    let progress = PlaybackProgress()

    private let log = Logger(subsystem: "app.diddy.ios", category: "voice")
    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loading: Task<Void, Never>?
    private var holdsSession = false

    func toggle(id: String, audio: AudioAttachment, account: MatrixAccount) {
        if currentId == id, let player {
            if player.isPlaying { pause() } else { resume() }
            return
        }
        stop()
        currentId = id
        failedId = nil
        isLoading = true
        progress.time = 0
        progress.duration = audio.duration ?? 0
        let client = account.client, accountId = account.id
        loading = Task { [weak self] in
            let url = await MediaLoader.shared.audioFile(source: audio.source, mimeType: audio.mimeType, accountId: accountId, client: client)
            guard let self, !Task.isCancelled, self.currentId == id else { return }
            self.isLoading = false
            guard let url, self.begin(url: url, mimeType: audio.mimeType) else {
                self.currentId = nil
                self.failedId = id
                return
            }
        }
    }

    func seek(to fraction: Double) {
        guard let player else { return }
        player.currentTime = min(max(fraction, 0), 1) * player.duration
        progress.time = player.currentTime
    }

    func stop() {
        loading?.cancel()
        loading = nil
        timer?.invalidate()
        timer = nil
        player?.stop()
        player = nil
        if holdsSession {
            holdsSession = false
            VoiceAudioSession.release(recording: false)
        }
        currentId = nil
        isPlaying = false
        isLoading = false
        progress.time = 0
        progress.duration = 0
    }

    private func begin(url: URL, mimeType: String?) -> Bool {
        do {
            let hints: [String: AVFileType] = ["m4a": .m4a, "mp3": .mp3, "wav": .wav, "caf": .caf]
            let player = try AVAudioPlayer(contentsOf: url, fileTypeHint: hints[url.pathExtension]?.rawValue)
            player.delegate = self
            guard player.prepareToPlay() else { return false }
            try VoiceAudioSession.acquire(recording: false)
            holdsSession = true
            self.player = player
            progress.duration = player.duration
            guard player.play() else { stop(); return false }
            isPlaying = true
            startTimer()
            return true
        } catch {
            log.error("cannot play \(mimeType ?? "?", privacy: .public): \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func pause() {
        player?.pause()
        isPlaying = false
        timer?.invalidate()
        timer = nil
    }

    private func resume() {
        guard let player else { return }
        guard player.play() else {
            let failed = currentId
            stop()
            failedId = failed
            return
        }
        isPlaying = true
        startTimer()
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let player = self.player else { return }
                self.progress.time = player.currentTime
                // A phone call or Siri pauses the player without telling the views.
                if self.isPlaying != player.isPlaying, !player.isPlaying { self.pause() }
            }
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.player === player else { return }
            let failed = self.currentId
            self.stop()
            if !flag { self.failedId = failed }
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            guard self.player === player else { return }
            let failed = self.currentId
            self.stop()
            self.failedId = failed
        }
    }
}

// MARK: Timeline player

/// A voice message or audio file in the timeline: play / pause, waveform with progress, duration.
struct VoiceMessageView: View {
    let id: String
    let audio: AudioAttachment
    let account: MatrixAccount
    @ObservedObject private var player = VoicePlayer.shared

    private var active: Bool { player.currentId == id }
    private var failed: Bool { player.failedId == id }
    private var playing: Bool { active && player.isPlaying }

    var body: some View {
        HStack(spacing: 10) {
            Button { player.toggle(id: id, audio: audio, account: account) } label: {
                ZStack {
                    Circle().fill(failed ? Theme.danger : Theme.accent)
                    if active && player.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: failed ? "exclamationmark" : playing ? "pause.fill" : "play.fill")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(playing ? "Pause" : audio.isVoice ? "Play voice message" : "Play audio")
            VStack(alignment: .leading, spacing: 3) {
                if !audio.isVoice {
                    Text(audio.filename).font(.footnote).foregroundStyle(Theme.text).lineLimit(1)
                }
                if failed {
                    Text("This audio cannot be played on iOS.").font(.caption).foregroundStyle(Theme.danger)
                } else {
                    HStack(spacing: 8) {
                        if active {
                            ActiveWaveform(values: audio.waveform, progress: player.progress) { player.seek(to: $0) }
                            ElapsedLabel(progress: player.progress)
                        } else {
                            IdleWaveform(values: audio.waveform) { player.toggle(id: id, audio: audio, account: account) }
                            Text(audio.duration.map(VoiceFormat.time) ?? "").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: 320, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.elevated))
        .accessibilityElement(children: .contain)
    }
}

private struct ElapsedLabel: View {
    @ObservedObject var progress: PlaybackProgress
    var body: some View {
        Text(VoiceFormat.time(progress.time))
            .font(.caption.monospacedDigit())
            .foregroundStyle(Theme.muted)
    }
}

private struct ActiveWaveform: View {
    let values: [Float]
    @ObservedObject var progress: PlaybackProgress
    let onSeek: (Double) -> Void
    var body: some View {
        GeometryReader { geo in
            WaveformBars(values: values, fraction: progress.fraction)
                .contentShape(Rectangle())
                .gesture(SpatialTapGesture().onEnded { onSeek(Double($0.location.x / max(geo.size.width, 1))) })
        }
        .frame(height: 28)
        .accessibilityLabel("Playback position")
        .accessibilityValue("\(Int(progress.fraction * 100)) percent")
    }
}

private struct IdleWaveform: View {
    let values: [Float]
    let onTap: () -> Void
    var body: some View {
        WaveformBars(values: values, fraction: 0)
            .frame(height: 28)
            .contentShape(Rectangle())
            .onTapGesture(perform: onTap)
            .accessibilityHidden(true)
    }
}

/// Rounded bars; the part already played is drawn in the accent colour.
private struct WaveformBars: View {
    let values: [Float]
    let fraction: Double

    var body: some View {
        Canvas { context, size in
            let step: CGFloat = 4
            let count = max(Int(size.width / step), 1)
            let bars = VoiceWaveform.bars(values, count: count)
            for (i, bar) in bars.enumerated() {
                let height = max(CGFloat(bar) * size.height, 3)
                let rect = CGRect(x: CGFloat(i) * step, y: (size.height - height) / 2, width: 2.5, height: height)
                let played = Double(i) / Double(count) < fraction
                context.fill(Path(roundedRect: rect, cornerRadius: 1.25), with: .color(played ? Theme.accent : Theme.faint))
            }
        }
    }
}

// MARK: Composer

/// The microphone next to the message field. A tap starts recording; the recording bar takes over.
struct VoiceMicButton: View {
    @ObservedObject var recorder: VoiceRecorder

    var body: some View {
        Button { Task { await recorder.start() } } label: {
            Image(systemName: "mic")
                .font(.system(size: 18))
                .foregroundStyle(Theme.muted)
                .frame(width: ChatStyle.minTapSize, height: ChatStyle.minTapSize)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Record voice message")
        .alert("Voice message", isPresented: Binding(get: { recorder.error != nil }, set: { if !$0 { recorder.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(recorder.error ?? "") }
    }
}

/// Covers the composer while recording: discard, blinking dot, time, live level, send.
struct VoiceRecordingBar: View {
    @ObservedObject var recorder: VoiceRecorder
    /// Sends the recording; the bar waits for it.
    let onSend: () async -> Void
    @State private var sending = false

    private var time: TimeInterval { recorder.pending?.duration ?? recorder.elapsed }

    var body: some View {
        HStack(spacing: 10) {
            Button { recorder.cancel() } label: {
                Image(systemName: "trash")
                    .foregroundStyle(Theme.danger)
                    .frame(width: 36, height: 36)
            }
            .disabled(sending)
            .accessibilityLabel("Discard recording")
            HStack(spacing: 8) {
                Circle().fill(Theme.danger).frame(width: 9, height: 9)
                    .opacity(recorder.pending == nil ? 1 : 0.4)
                Text(VoiceFormat.time(time)).font(.subheadline.monospacedDigit()).foregroundStyle(Theme.text)
                LiveMeter(levels: recorder.recentLevels)
                    .frame(height: 22)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20).fill(Theme.input))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Recording, \(VoiceFormat.time(time))")
            Button {
                guard !sending else { return }
                sending = true
                Task {
                    await onSend()
                    sending = false
                }
            } label: {
                Group {
                    if sending {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                    }
                }
                .frame(width: 36, height: 36)
                .background(Circle().fill(Theme.accent))
            }
            .disabled(sending)
            .accessibilityLabel("Send voice message")
        }
        .background(Theme.chat)
        // Leaving the chat while recording throws the recording away.
        .onDisappear { recorder.cancel() }
    }
}

private struct LiveMeter: View {
    let levels: [Float]
    var body: some View {
        Canvas { context, size in
            let step: CGFloat = 4
            let count = max(Int(size.width / step), 1)
            let shown = Array(levels.suffix(count))
            for (i, level) in shown.enumerated() {
                // Speech sits low on a linear scale; the square root makes it readable.
                let height = max(CGFloat(level.squareRoot()) * size.height, 3)
                let x = size.width - CGFloat(shown.count - i) * step
                let rect = CGRect(x: x, y: (size.height - height) / 2, width: 2.5, height: height)
                context.fill(Path(roundedRect: rect, cornerRadius: 1.25), with: .color(Theme.muted))
            }
        }
    }
}
