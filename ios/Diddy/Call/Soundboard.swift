import AVFoundation
import Foundation
import LiveKit
import SwiftUI
import UniformTypeIdentifiers

/// Soundboard, like the desktop's (`cinny/src/app/plugins/call/soundboard.ts`): short audio clips
/// you import yourself; tapping one plays it for you and, in a call, for everybody. Clips stay on
/// this device (the desktop does not sync them through Matrix either).
///
/// Into the call it goes through the microphone: `ClipMixer` adds the clip to each captured frame
/// after noise suppression (see `NoiseSuppressor.swift`). As on the desktop, nobody hears clips
/// while your microphone is muted (muting, and deafening which also mutes, stop it for the call).
/// Several clips can play at once, like on the desktop; "Stop" ends all of them.
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
    /// The MyInstants result (its path) that is being previewed, if any.
    @Published private(set) var previewing: String?
    @Published var volume: Double {
        didSet {
            UserDefaults.standard.set(volume, forKey: Self.volumeKey)
            player?.volume = Float(volume)
            for entry in clipPlayers.values { entry.player.volume = Float(volume) }
            ClipMixer.shared.gain = Float(volume)
        }
    }

    static let maxSeconds: Double = 20
    private static let clipsKey = "soundboardClips"
    private static let volumeKey = "soundboardVolume"

    private let folder: URL
    /// The preview of a MyInstants result.
    private var player: AVAudioPlayer?
    private var finished: Task<Void, Never>?
    /// Clips playing for you right now, each with the task that notices its end.
    private var clipPlayers: [UUID: (player: AVAudioPlayer, end: Task<Void, Never>)] = [:]
    /// Bumped whenever playback starts or stops, so a slow decode never starts a stale clip.
    private var generation = 0
    /// Decoded clips at the call's sample rate, so a repeated tap starts at once.
    private var decoded: [String: [Float]] = [:]
    private var decodedOrder: [String] = []
    private var decodedRate = 0

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        folder = support.appendingPathComponent("Soundboard", isDirectory: true)
        let stored = UserDefaults.standard.object(forKey: Self.volumeKey) as? Double
        volume = min(max(stored ?? 0.8, 0), 1)
        ClipMixer.shared.gain = Float(volume)
        if let data = UserDefaults.standard.data(forKey: Self.clipsKey),
           let stored = try? JSONDecoder().decode([Clip].self, from: data) {
            // A clip whose file is gone (restored backup, cleared storage) would only fail when tapped.
            let present = stored.filter { FileManager.default.fileExists(atPath: folder.appendingPathComponent($0.file).path) }
            clips = present
            if present.count != stored.count { save() }
        }
    }

    // MARK: Clips

    /// Copies an audio file in (from the Files picker). Throws a message for the user if it is not
    /// audio or too long.
    func add(from url: URL) throws {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let ext = url.pathExtension.lowercased()
        try register(source: url, ext: ext, title: MyInstantsParser.clipTitle(url.deletingPathExtension().lastPathComponent))
    }

    /// Adds downloaded audio (MyInstants). Returns false if a clip with that name exists already.
    @discardableResult
    func add(data: Data, name: String, ext: String = "mp3") throws -> Bool {
        let title = MyInstantsParser.clipTitle(name)
        if hasClip(named: title) { return false }
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).\(ext)")
        try data.write(to: temp)
        defer { try? FileManager.default.removeItem(at: temp) }
        try register(source: temp, ext: ext, title: title)
        return true
    }

    func hasClip(named name: String) -> Bool {
        let wanted = MyInstantsParser.clipTitle(name).lowercased()
        return clips.contains { $0.name.lowercased() == wanted }
    }

    /// Checks the file is audio of an allowed length, copies it into the soundboard folder.
    private func register(source: URL, ext rawExt: String, title: String) throws {
        let file: AVAudioFile
        do { file = try AVAudioFile(forReading: source) } catch {
            throw DiddyError("Choose an audio file (mp3, wav, m4a …).")
        }
        let seconds = Double(file.length) / file.processingFormat.sampleRate
        guard seconds <= Self.maxSeconds else {
            throw DiddyError("Clips can be at most \(Int(Self.maxSeconds)) seconds long.")
        }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let id = UUID().uuidString
        let ext = rawExt.isEmpty || rawExt.count > 5 || !rawExt.allSatisfy({ $0.isLetter || $0.isNumber }) ? "audio" : rawExt
        let name = "\(id).\(ext)"
        try FileManager.default.copyItem(at: source, to: folder.appendingPathComponent(name))
        clips.append(Clip(id: id, name: title, file: name))
        save()
    }

    func remove(_ clip: Clip) {
        if playing == clip.id { stopAll() }
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(clip.file))
        decoded[clip.id] = nil
        decodedOrder.removeAll { $0 == clip.id }
        clips.removeAll { $0.id == clip.id }
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(clips) {
            UserDefaults.standard.set(data, forKey: Self.clipsKey)
        }
    }

    // MARK: Playing

    /// Plays for you, and into the call while one is running. Clips that already play go on.
    func play(_ clip: Clip) {
        stopPreview()
        let current = generation
        let url = folder.appendingPathComponent(clip.file)
        playing = clip.id

        let rate = ClipMixer.shared.sampleRate
        guard rate > 0, Sounds.shared.inCall else {
            startLocal(url, clip: clip)
            return
        }
        // In a call: decode first (cached after the first tap), then start both together.
        if decodedRate != rate {
            decoded = [:]
            decodedOrder = []
            decodedRate = rate
        }
        if let samples = decoded[clip.id] {
            startLocal(url, clip: clip)
            ClipMixer.shared.start(samples)
            return
        }
        Task.detached(priority: .userInitiated) {
            let samples = ClipMixer.decode(url, sampleRate: rate)
            await MainActor.run {
                let board = Soundboard.shared
                // Still wanted (not stopped while decoding).
                guard board.generation == current else { return }
                board.startLocal(url, clip: clip)
                guard let samples, ClipMixer.shared.sampleRate == rate else { return }
                board.cache(samples, for: clip.id)
                ClipMixer.shared.start(samples)
            }
        }
    }

    private func cache(_ samples: [Float], for id: String) {
        decoded[id] = samples
        decodedOrder.removeAll { $0 == id }
        decodedOrder.append(id)
        while decodedOrder.count > 6 { decoded[decodedOrder.removeFirst()] = nil }
    }

    private func startLocal(_ url: URL, clip: Clip) {
        prepareLocalPlayback()
        guard let player = try? AVAudioPlayer(contentsOf: url) else {
            if clipPlayers.isEmpty { playing = nil }
            return
        }
        player.volume = Float(volume)
        player.play()
        let key = UUID()
        let duration = player.duration
        let end = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64((duration + 0.1) * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.clipEnded(key)
        }
        clipPlayers[key] = (player, end)
    }

    private func clipEnded(_ key: UUID) {
        clipPlayers[key] = nil
        guard clipPlayers.isEmpty else { return }
        playing = nil
        // The call part must end with the local part, even if the capture pipeline paused
        // while the microphone was muted and would otherwise resume the clips on unmute.
        ClipMixer.shared.stop()
    }

    /// Plays downloaded audio for you only (MyInstants preview). `id` tells the UI what plays.
    func preview(data: Data, id: String) throws {
        stopAll()
        prepareLocalPlayback()
        guard let player = try? AVAudioPlayer(data: data) else {
            throw DiddyError("This sound could not be played.")
        }
        player.volume = Float(volume)
        player.play()
        self.player = player
        previewing = id
        watchEnd(of: player) { [weak self] in
            guard let self, self.previewing == id else { return }
            self.previewing = nil
        }
    }

    private func watchEnd(of player: AVAudioPlayer, _ done: @escaping @MainActor () -> Void) {
        let duration = player.duration
        finished = Task {
            try? await Task.sleep(nanoseconds: UInt64((duration + 0.1) * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self.player = nil
            done()
        }
    }

    private func prepareLocalPlayback() {
        guard !Sounds.shared.inCall && !BackgroundKeepAlive.shared.isRunning else { return }
        // Outside a call, like the other app sounds: mixes with music, quiet on the silent switch.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.ambient)
        try? session.setActive(true)
    }

    private func stopPreview() {
        guard previewing != nil || player != nil else { return }
        finished?.cancel()
        player?.stop()
        player = nil
        previewing = nil
    }

    /// Stops every clip that is playing right now (and the preview), for you and for the call.
    func stopAll() {
        generation += 1
        stopPreview()
        for entry in clipPlayers.values {
            entry.end.cancel()
            entry.player.stop()
        }
        clipPlayers = [:]
        playing = nil
        ClipMixer.shared.stop()
    }

    /// Same as `stopAll()`; kept for the callers that end a call.
    func stop() { stopAll() }
}

/// Mixes the playing clips into the microphone, on WebRTC's audio thread. Samples are mono, in
/// 16-bit range, at the rate the capture pipeline runs at. Several clips play at once.
final class ClipMixer: @unchecked Sendable {
    static let shared = ClipMixer()

    private let lock = NSLock()
    private var rate = 0
    private var voices: [Voice] = []
    private var _gain: Float = 0.8

    private struct Voice {
        let samples: [Float]
        var position: Int
    }

    /// More at once only gets louder and costs the audio thread time; the oldest stops first.
    private static let maxVoices = 8

    /// 0 while no call captures audio.
    var sampleRate: Int {
        lock.lock()
        defer { lock.unlock() }
        return rate
    }

    /// Soundboard volume, applies to the clip that is playing too.
    var gain: Float {
        get { lock.lock(); defer { lock.unlock() }; return _gain }
        set { lock.lock(); _gain = newValue; lock.unlock() }
    }

    func configure(sampleRate: Int) {
        lock.lock()
        rate = sampleRate
        lock.unlock()
    }

    func release() {
        lock.lock()
        rate = 0
        let old = voices
        voices = []
        lock.unlock()
        _ = old
    }

    /// Adds a clip; clips already playing go on.
    func start(_ clip: [Float]) {
        guard !clip.isEmpty else { return }
        lock.lock()
        var old: [Voice] = []
        if voices.count >= Self.maxVoices {
            old = Array(voices.prefix(voices.count - Self.maxVoices + 1))
            voices.removeFirst(old.count)
        }
        voices.append(Voice(samples: clip, position: 0))
        lock.unlock()
        // Old buffers are freed here, not on the audio thread.
        _ = old
    }

    /// Ends every clip.
    func stop() {
        lock.lock()
        let old = voices
        voices = []
        lock.unlock()
        _ = old
    }

    func mix(into buffer: LKAudioBuffer) {
        guard lock.try() else { return }
        defer { lock.unlock() }
        guard !voices.isEmpty else { return }
        let frames = buffer.frames
        for channel in 0..<buffer.channels {
            let out = buffer.rawBuffer(forChannel: channel)
            for voice in voices where voice.position < voice.samples.count {
                let count = min(frames, voice.samples.count - voice.position)
                for index in 0..<count {
                    out[index] = min(max(out[index] + voice.samples[voice.position + index] * _gain, -32768), 32767)
                }
            }
        }
        // Finished voices are dropped on the next start()/stop(), never freed here.
        for index in voices.indices {
            voices[index].position = min(voices[index].samples.count, voices[index].position + frames)
        }
    }

    /// The clip as mono samples in 16-bit range at `sampleRate` (not yet scaled by the volume).
    static func decode(_ url: URL, sampleRate: Int) -> [Float]? {
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
        return (0..<Int(output.frameLength)).map { channel[$0] * 32767 }
    }
}

/// The soundboard during a call: tap a clip to play it for everyone.
struct SoundboardSheet: View {
    /// The call the sheet belongs to: clips go out through its microphone.
    @ObservedObject var session: CallSession
    @ObservedObject private var board = Soundboard.shared
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var showMyInstants = false
    @State private var error: String?
    @State private var filter = ""

    private let columns = [GridItem(.adaptive(minimum: 140), spacing: 10)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if board.clips.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "music.note.list")
                                .font(.system(size: 40))
                                .foregroundStyle(Theme.faint)
                            Text("No clips yet. Add short audio files (up to \(Int(Soundboard.maxSeconds)) seconds) with the + button.")
                                .multilineTextAlignment(.center)
                                .foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 32)
                    } else if visibleClips.isEmpty {
                        Text("No clips match \u{201C}\(filter)\u{201D}.")
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 24)
                    } else {
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(visibleClips) { clip in clipButton(clip) }
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
                    if !session.microphoneOn {
                        Label("Your microphone is muted, so nobody hears your clips.", systemImage: "mic.slash.fill")
                            .font(.footnote)
                            .foregroundStyle(Theme.danger)
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
                        Button { board.stopAll() } label: { Image(systemName: "stop.fill") }
                            .accessibilityLabel("Stop All Clips")
                    }
                    Menu {
                        Button { importing = true } label: { Label("Add from Files", systemImage: "folder") }
                        Button { showMyInstants = true } label: { Label("Import from MyInstants", systemImage: "magnifyingglass") }
                    } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add clip")
                }
            }
            .modifier(ClipSearch(active: board.clips.count > 8, text: $filter))
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
        .sheet(isPresented: $showMyInstants) { MyInstantsSheet() }
        .presentationDetents([.medium, .large])
    }

    private var visibleClips: [Soundboard.Clip] {
        let wanted = filter.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty else { return board.clips }
        return board.clips.filter { $0.name.localizedCaseInsensitiveContains(wanted) }
    }

    private func clipButton(_ clip: Soundboard.Clip) -> some View {
        let isPlaying = board.playing == clip.id
        return Button {
            if isPlaying { board.stopAll() } else { board.play(clip) }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isPlaying ? "stop.circle.fill" : "play.circle.fill")
                Text(clip.name).lineLimit(2).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(RoundedRectangle(cornerRadius: 10).fill(isPlaying ? Theme.accent : Theme.elevated))
            .foregroundStyle(isPlaying ? Theme.onAccent : Theme.text)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(clip.name)
        .accessibilityValue(isPlaying ? "Playing" : "")
        .accessibilityHint(isPlaying ? "Stops the clip" : "Plays it for everyone in the call")
        .contextMenu {
            Button(role: .destructive) { board.remove(clip) } label: { Label("Delete", systemImage: "trash") }
        }
    }
}

/// A search field above the clips once there are many (the desktop does the same above 8).
private struct ClipSearch: ViewModifier {
    let active: Bool
    @Binding var text: String

    func body(content: Content) -> some View {
        if active {
            content.searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search clips")
        } else {
            content
        }
    }
}
