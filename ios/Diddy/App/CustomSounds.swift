import AVFoundation
import Foundation

/// Own audio files that replace Diddy's sounds (Settings > Sounds > Replace), like the desktop's
/// `setCustomSound`: at most 800 KB, kept on this device only. Notifications in the background keep
/// Diddy's own sound (iOS plays only sounds inside the app bundle there).
@MainActor
enum CustomSounds {
    private static func nameKey(_ sound: Sound) -> String { "diddy.sound.custom.\(sound.rawValue)" }
    private static func fileKey(_ sound: Sound) -> String { "diddy.sound.customFile.\(sound.rawValue)" }

    private static var folder: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return support.appendingPathComponent("CustomSounds", isDirectory: true)
    }

    /// The name of the own file replacing `sound`, if there is one.
    static func name(of sound: Sound) -> String? {
        guard url(for: sound) != nil else { return nil }
        return UserDefaults.standard.string(forKey: nameKey(sound))
    }

    /// The own file of `sound`, if there is one and it still exists.
    static func url(for sound: Sound) -> URL? {
        guard let file = UserDefaults.standard.string(forKey: fileKey(sound)) else { return nil }
        let url = folder.appendingPathComponent(file)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Copies `source` (from the Files picker) in as the sound. Throws a message for the user.
    static func set(_ sound: Sound, from source: URL) throws {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let data: Data
        do { data = try Data(contentsOf: source) } catch {
            throw DiddyError("The file could not be read.")
        }
        if let problem = CustomSoundRules.problem(byteCount: data.count) { throw DiddyError(problem) }
        guard (try? AVAudioPlayer(data: data)) != nil else {
            throw DiddyError("Please choose an audio file (MP3, WAV, M4A).")
        }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let rawExt = source.pathExtension.lowercased()
        let ext = rawExt.isEmpty || rawExt.count > 5 || !rawExt.allSatisfy({ $0.isLetter || $0.isNumber }) ? "audio" : rawExt
        let file = "\(sound.rawValue)-\(UUID().uuidString).\(ext)"
        do {
            try data.write(to: folder.appendingPathComponent(file), options: .atomic)
        } catch {
            throw DiddyError("Not enough space to store this sound.")
        }
        removeFile(of: sound)
        UserDefaults.standard.set(file, forKey: fileKey(sound))
        UserDefaults.standard.set(source.lastPathComponent, forKey: nameKey(sound))
        Sounds.shared.reload(sound)
    }

    /// Back to Diddy's own sound.
    static func reset(_ sound: Sound) {
        removeFile(of: sound)
        UserDefaults.standard.removeObject(forKey: fileKey(sound))
        UserDefaults.standard.removeObject(forKey: nameKey(sound))
        Sounds.shared.reload(sound)
    }

    private static func removeFile(of sound: Sound) {
        guard let file = UserDefaults.standard.string(forKey: fileKey(sound)) else { return }
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(file))
    }
}
