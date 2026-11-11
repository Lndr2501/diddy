import Foundation

/// Reads ZIP files for the import of nameplates, profile effects and profile frames, with the
/// limits and error messages of desktop's `nameplateZip.ts`. Everything in a ZIP is untrusted:
/// sizes are capped before and while unpacking, names are never used as paths.
///
/// Foundation only, so `Tools/diddyzip_check` can test the parsing. Packing is not needed. Deflate
/// is behind `DiddyInflater` (the app uses the Compression framework, see DiddyZipInflate.swift).
protocol DiddyInflater {
    /// The raw deflate stream `data` unpacked. At most `limit` bytes; more is an error.
    func inflate(_ data: Data, expectedSize: Int, limit: Int) throws -> Data
}

struct DiddyZipError: LocalizedError, Equatable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct DiddyZipEntry: Equatable {
    let name: String
    let method: Int
    let compressedSize: Int
    let size: Int
    let offset: Int
}

struct DiddyZip {
    /// `MAX_NAMEPLATE_ZIP_BYTES`
    static let maxArchiveBytes = 24 * 1024 * 1024
    static let maxEntries = 200

    private let bytes: [UInt8]
    /// Every entry of the central directory, also ones with names that are not usable.
    let entries: [DiddyZipEntry]

    init(_ data: Data) throws {
        bytes = [UInt8](data)
        guard bytes.count <= Self.maxArchiveBytes else { throw DiddyZipError("This ZIP file is too large.") }
        entries = try Self.readEntries(bytes)
    }

    // MARK: Names (nameplateZip.ts)

    /// Lowercase text after the last dot, "" without a dot (`extensionOf`).
    static func extensionOf(_ name: String) -> String {
        guard let dot = name.lastIndex(of: ".") else { return "" }
        return String(name[name.index(after: dot)...]).lowercased()
    }

    /// The part after the last slash (`baseName`).
    static func baseName(_ name: String) -> String {
        guard let slash = name.lastIndex(of: "/") else { return name }
        return String(name[name.index(after: slash)...])
    }

    /// The folder part including the last slash, "" at the top (`dirOf`).
    static func dirOf(_ name: String) -> String {
        guard let slash = name.lastIndex(of: "/") else { return "" }
        return String(name[...slash])
    }

    /// A file that is not a folder, not outside the ZIP, not macOS metadata and not hidden.
    static func isUsableName(_ name: String) -> Bool {
        !name.isEmpty && !name.hasSuffix("/") && !name.split(separator: "/", omittingEmptySubsequences: false).contains("..")
            && !name.hasPrefix("__MACOSX/") && !baseName(name).hasPrefix(".")
    }

    /// The usable entries.
    var usableEntries: [DiddyZipEntry] { entries.filter { Self.isUsableName($0.name) } }

    // MARK: Reading

    private static func u16(_ b: [UInt8], _ i: Int) -> Int { Int(b[i]) | Int(b[i + 1]) << 8 }
    private static func u32(_ b: [UInt8], _ i: Int) -> Int { u16(b, i) | u16(b, i + 2) << 16 }

    private static func readEntries(_ b: [UInt8]) throws -> [DiddyZipEntry] {
        // the end-of-central-directory record is within the last 64 KB + 22 bytes
        guard b.count >= 22 else { throw DiddyZipError("This is not a ZIP file.") }
        let earliest = max(0, b.count - 22 - 0xFFFF)
        var eocd = -1
        var i = b.count - 22
        while i >= earliest {
            if u32(b, i) == 0x0605_4B50 { eocd = i; break }
            i -= 1
        }
        guard eocd >= 0 else { throw DiddyZipError("This is not a ZIP file.") }
        let count = u16(b, eocd + 10)
        var pos = u32(b, eocd + 16)
        if count == 0xFFFF || pos == 0xFFFF_FFFF { throw DiddyZipError("This ZIP file is not supported.") }
        if count > maxEntries { throw DiddyZipError("This ZIP file has too many files.") }
        var entries: [DiddyZipEntry] = []
        for _ in 0..<count {
            guard pos + 46 <= b.count, u32(b, pos) == 0x0201_4B50 else { throw DiddyZipError("This ZIP file is damaged.") }
            let nameLength = u16(b, pos + 28)
            let extraLength = u16(b, pos + 30)
            let commentLength = u16(b, pos + 32)
            let nameEnd = pos + 46 + nameLength
            guard nameEnd <= b.count else { throw DiddyZipError("This ZIP file is damaged.") }
            entries.append(DiddyZipEntry(
                name: String(decoding: b[(pos + 46)..<nameEnd], as: UTF8.self),
                method: u16(b, pos + 10),
                compressedSize: u32(b, pos + 20),
                size: u32(b, pos + 24),
                offset: u32(b, pos + 42)
            ))
            pos = nameEnd + extraLength + commentLength
        }
        return entries
    }

    /// The content of one entry, at most `limit` bytes (`extract`). Stored and deflated entries only.
    func extract(_ entry: DiddyZipEntry, limit: Int, inflater: DiddyInflater) throws -> Data {
        if entry.size > limit { throw DiddyZipError("A file in this ZIP is too large.") }
        let offset = entry.offset
        guard offset + 30 <= bytes.count, Self.u32(bytes, offset) == 0x0403_4B50 else { throw DiddyZipError("This ZIP file is damaged.") }
        let start = offset + 30 + Self.u16(bytes, offset + 26) + Self.u16(bytes, offset + 28)
        guard start + entry.compressedSize <= bytes.count else { throw DiddyZipError("This ZIP file is damaged.") }
        let raw = Data(bytes[start..<(start + entry.compressedSize)])
        switch entry.method {
        case 0:
            if raw.count > limit { throw DiddyZipError("A file in this ZIP is too large.") }
            return raw
        case 8:
            return try inflater.inflate(raw, expectedSize: entry.size, limit: limit)
        default:
            throw DiddyZipError("This ZIP file uses an unsupported compression.")
        }
    }

    /// The text of an entry, nil when it is missing, larger than `limit` or cannot be read.
    func text(of entry: DiddyZipEntry?, limit: Int, inflater: DiddyInflater) -> String? {
        guard let entry, entry.size <= limit, let data = try? extract(entry, limit: limit, inflater: inflater) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: Ordering used by the importers

    /// JavaScript's `a.localeCompare(b)` approximated: case-insensitive, then plain, so the order is
    /// total and does not depend on the input order.
    static func localeLess(_ a: String, _ b: String) -> Bool {
        switch a.localizedCaseInsensitiveCompare(b) {
        case .orderedAscending: return true
        case .orderedDescending: return false
        case .orderedSame: return a < b
        }
    }

    /// `byDepthThenName`: fewer folders first, then by name.
    static func byDepthThenName(_ a: String, _ b: String) -> Bool {
        let depthA = a.split(separator: "/", omittingEmptySubsequences: false).count
        let depthB = b.split(separator: "/", omittingEmptySubsequences: false).count
        return depthA != depthB ? depthA < depthB : localeLess(a, b)
    }
}
