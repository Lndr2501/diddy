import AVFoundation
import Foundation
import LiveKit
import SwiftUI
import UniformTypeIdentifiers

/// Soundboard, like the desktop's (`cinny/src/app/plugins/call/soundboard.ts`): short audio clips
/// you import yourself; tapping one plays it for you and, in a call, for everybody.
///
/// Into the call it goes through the microphone: `ClipMixer` adds the clip to each captured frame
/// after noise suppression (see `NoiseSuppressor.swift`). As on the desktop, nobody hears clips
/// while your microphone is muted. One clip plays at a time; a new one replaces it.
@MainActor
final class Soundboard: ObservableObject {
    static let shared = Soundboard()

    struct Clip: Codable, Identifiable, Hashable {
        let id: String
        var name: String
        /// File name inside the soundboard folder.
        let file: String
    }

    @Published private(set) var clips: [Clip] = []
    @Published private(set) var playing: String?
    @Published var volume: Double {
        didSet { UserDefaults.standard.set(volume, forKey: Self.volumeKey) }
    }

    static let maxSeconds: Double = 20
    private static let clipsKey = "soundboardClips"
    private static let volumeKey = "soundboardVolume"

    private let folder: URL
    private var player: AVAudioPlayer?
    private var finished: Task<Void, Never>?

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        folder = support.appendingPathComponent("Soundboard", isDirectory: true)
        let stored = UserDefaults.standard.object(forKey: Self.volumeKey) as? Double
        volume = min(max(stored ?? 0.8, 0), 1)
        if let data = UserDefaults.standard.data(forKey: Self.clipsKey),
           let decoded = try? JSONDecoder().decode([Clip].self, from: data) {
            clips = decoded
        }
    }

    // MARK: Clips

    /// Copies an audio file in. Throws a message for the user if it is not audio or too long.
    func add(from url: URL) throws {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let file: AVAudioFile
        do { file = try AVAudioFile(forReading: url) } catch {
            throw DiddyError("Choose an audio file (mp3, wav, m4a …).")
        }
        let seconds = Double(file.length) / file.processingFormat.sampleRate
        guard seconds <= Self.maxSeconds else {
            throw DiddyError("Clips can be at most \(Int(Self.maxSeconds)) seconds long.")
        }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let id = UUID().uuidString
        let ext = url.pathExtension.isEmpty ? "audio" : url.pathExtension.lowercased()
        let name = "\(id).\(ext)"
        try FileManager.default.copyItem(at: url, to: folder.appendingPathComponent(name))
        let title = String(url.deletingPathExtension().lastPathComponent.prefix(40))
        clips.append(Clip(id: id, name: title.isEmpty ? "Clip" : title, file: name))
        save()
    }

    func remove(_ clip: Clip) {
        if playing == clip.id { stop() }
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(clip.file))
        clips.removeAll { $0.id == clip.id }
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(clips) {
            UserDefaults.standard.set(data, forKey: Self.clipsKey)
        }
    }

    // MARK: Playing

    /// Plays for you, and into the call while one is running.
    func play(_ clip: Clip) {
        stop()
        let url = folder.appendingPathComponent(clip.file)
        if !Sounds.shared.inCall && !BackgroundKeepAlive.shared.isRunning {
            // Outside a call, like the other app sounds: mixes with music, quiet on the silent switch.
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.ambient)
            try? session.setActive(true)
        }
        guard let player = try? AVAudioPlayer(contentsOf: url) else { return }
        player.volume = Float(volume)
        player.play()
        self.player = player
        playing = clip.id
        let duration = player.duration
        finished = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64((duration + 0.1) * 1_000_000_000))
            guard !Task.isCancelled, let self, self.playing == clip.id else { return }
            self.playing = nil
            self.player = nil
        }

        let rate = ClipMixer.shared.sampleRate
        guard rate > 0, Sounds.shared.inCall else { return }
        let gain = Float(volume)
        Task.detached(priority: .userInitiated) {
            guard let samples = ClipMixer.decode(url, sampleRate: rate, gain: gain) else { return }
            await MainActor.run {
                // Still the clip that should play (not stopped or replaced while decoding).
                guard Soundboard.shared.playing == clip.id else { return }
                ClipMixer.shared.start(samples)
            }
        }
    }

    func stop() {
        finished?.cancel()
        player?.stop()
        player = nil
        playing = nil
        ClipMixer.shared.stop()
    }
}

/// Mixes the playing clip into the microphone, on WebRTC's audio thread. Samples are mono, in
/// 16-bit range, at the rate the capture pipeline runs at.
final class ClipMixer: @unchecked Sendable {
    static let shared = ClipMixer()

    private let lock = NSLock()
    private var rate = 0
    private var samples: [Float] = []
    private var position = 0

    /// 0 while no call captures audio.
    var sampleRate: Int {
        lock.lock()
        defer { lock.unlock() }
        return rate
    }

    func configure(sampleRate: Int) {
        lock.lock()
        rate = sampleRate
        lock.unlock()
    }

    func release() {
        lock.lock()
        rate = 0
        let old = samples
        samples = []
        position = 0
        lock.unlock()
        _ = old
    }

    func start(_ clip: [Float]) {
        lock.lock()
        let old = samples
        samples = clip
        position = 0
        lock.unlock()
        // The old buffer is freed here, not on the audio thread.
        _ = old
    }

    func stop() { start([]) }

    func mix(into buffer: LKAudioBuffer) {
        guard lock.try() else { return }
        defer { lock.unlock() }
        guard position < samples.count else { return }
        let count = min(buffer.frames, samples.count - position)
        for channel in 0..<buffer.channels {
            let out = buffer.rawBuffer(forChannel: channel)
            for index in 0..<count {
                out[index] = min(max(out[index] + samples[position + index], -32768), 32767)
            }
        }
        position += count
    }

    /// The clip as mono samples in 16-bit range at `sampleRate`, scaled by `gain`.
    static func decode(_ url: URL, sampleRate: Int, gain: Float) -> [Float]? {
        guard let file = try? AVAudioFile(forReading: url),
              let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(sampleRate), channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: file.processingFormat, to: target)
        else { return nil }
        let inputFrames = AVAudioFrameCount(file.length)
        guard inputFrames > 0,
              let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: inputFrames),
              (try? file.read(into: input)) != nil
        else { return nil }
        let ratio = Double(sampleRate) / file.processingFormat.sampleRate
        let capacity = AVAudioFrameCount(Double(input.frameLength) * ratio) + 1024
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return nil }
        var delivered = false
        var error: NSError?
        let status = converter.convert(to: output, error: &error) { _, outStatus in
            if delivered {
                outStatus.pointee = .endOfStream
                return nil
            }
            delivered = true
            outStatus.pointee = .haveData
            return input
        }
        guard status != .error, let channel = output.floatChannelData?[0] else { return nil }
        let scale = gain * 32767
        return (0..<Int(output.frameLength)).map { channel[$0] * scale }
    }
}

/// The soundboard during a call: tap a clip to play it for everyone.
struct SoundboardSheet: View {
    @ObservedObject private var board = Soundboard.shared
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var error: String?

    private let columns = [GridItem(.adaptive(minimum: 140), spacing: 10)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if board.clips.isEmpty {
                        Text("No clips yet. Add short audio files (up to \(Int(Soundboard.maxSeconds)) seconds) with +.")
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 40)
                    } else {
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(board.clips) { clip in clipButton(clip) }
                        }
                    }
                    HStack {
                        Image(systemName: "speaker.fill").foregroundStyle(Theme.muted)
                        Slider(value: $board.volume, in: 0...1)
                        Image(systemName: "speaker.wave.3.fill").foregroundStyle(Theme.muted)
                    }
                    .accessibilityLabel("Soundboard volume")
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(Theme.danger)
                    }
                    Text("Everyone in the call hears clips while your microphone is on. Hold a clip to delete it.")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
                .padding()
            }
            .background(Theme.sidebar)
            .navigationTitle("Soundboard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItemGroup(placement: .primaryAction) {
                    if board.playing != nil {
                        Button { board.stop() } label: { Image(systemName: "stop.fill") }
                            .accessibilityLabel("Stop clip")
                    }
                    Button { importing = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add clip")
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.audio], allowsMultipleSelection: true) { result in
                error = nil
                switch result {
                case .success(let urls):
                    for url in urls {
                        do { try board.add(from: url) } catch { self.error = error.friendlyMessage }
                    }
                case .failure(let failure):
                    error = failure.friendlyMessage
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func clipButton(_ clip: Soundboard.Clip) -> some View {
        let isPlaying = board.playing == clip.id
        return Button {
            if isPlaying { board.stop() } else { board.play(clip) }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isPlaying ? "stop.circle.fill" : "play.circle.fill")
                Text(clip.name).lineLimit(2).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(RoundedRectangle(cornerRadius: 10).fill(isPlaying ? Theme.accent : Theme.elevated))
            .foregroundStyle(Theme.text)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) { board.remove(clip) } label: { Label("Delete", systemImage: "trash") }
        }
    }
}
