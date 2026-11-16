import Foundation

// The folder of downloaded and decoded voice messages (MediaLoader.audioFile). Decoded Ogg/Opus
// is 16-bit PCM, about 5.8 MB per minute of mono, so the folder is kept under a size limit: the
// files used longest ago go first. Foundation only (checked in `Tools/oggopus_check/main.swift`).

/// What the player shows when a voice message cannot be played.
enum VoiceFailure {
    static let download = "This audio could not be downloaded."
    static let generic = "This audio cannot be played on iOS."

    /// A message for an error from decoding (OpusTranscoder) or writing the decoded file.
    static func message(for error: Error) -> String {
        if let container = error as? OpusContainerError { return container.userMessage }
        if let writer = error as? OpusCAFWriterError, writer == .tooLarge { return OpusContainerError.tooLarge.userMessage }
        return generic
    }
}

struct VoiceCacheEntry: Equatable {
    let name: String
    let bytes: Int
    let lastUsed: Date
}

enum VoiceCache {
    /// About 35 minutes of decoded mono voice, or many hours of m4a.
    static let maxBytes = 200 * 1024 * 1024

    /// The files to delete, oldest use first, until the rest fits into `limit`. Names in `keep`
    /// (the file about to be played) are never chosen, even if the rest then stays over the limit.
    static func evictions(_ entries: [VoiceCacheEntry], limit: Int, keep: Set<String>) -> [String] {
        var total = entries.reduce(0) { $0 + max($1.bytes, 0) }
        guard total > limit else { return [] }
        let candidates = entries
            .filter { !keep.contains($0.name) }
            .sorted { $0.lastUsed != $1.lastUsed ? $0.lastUsed < $1.lastUsed : $0.name < $1.name }
        var out: [String] = []
        for entry in candidates where total > limit {
            out.append(entry.name)
            total -= max(entry.bytes, 0)
        }
        return out
    }

    /// Marks a file as just used; the modification date is the "last used" of the eviction order.
    static func touch(_ url: URL, now: Date = Date()) {
        try? FileManager.default.setAttributes([.modificationDate: now], ofItemAtPath: url.path)
    }

    /// Cached files are named after a 128-bit hash in hex (MediaLoader.audioFile). Everything else,
    /// such as the temporary file of a decode that is still running, is left alone.
    static func isCacheName(_ name: String) -> Bool {
        let prefix = name.utf8.prefix(32)
        return prefix.count == 32 && prefix.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }

    /// Deletes the least recently used cached files of `folder` until they fit into `limit`.
    @discardableResult
    static func prune(folder: URL, limit: Int = maxBytes, keep: Set<String>) -> [String] {
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        guard let urls = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys) else { return [] }
        var entries: [VoiceCacheEntry] = []
        for url in urls {
            guard isCacheName(url.lastPathComponent),
                  let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }
            entries.append(VoiceCacheEntry(name: url.lastPathComponent, bytes: values.fileSize ?? 0,
                                           lastUsed: values.contentModificationDate ?? .distantPast))
        }
        let names = evictions(entries, limit: limit, keep: keep)
        for name in names {
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
        }
        return names
    }
}
