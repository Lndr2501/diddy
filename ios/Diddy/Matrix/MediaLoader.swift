import CryptoKit
import Foundation
import MatrixRustSDK
import SwiftUI
import UIKit

/// Downloads avatars and chat images through the SDK (authenticated media, encrypted attachments)
/// and keeps decoded images in memory. Cache and in-flight keys include the account, so the same
/// mxc:// URL is always fetched with the client of the account it was seen in (another login may
/// be on a different homeserver, or not allowed to see that media at all).
actor MediaLoader {
    static let shared = MediaLoader()

    private let cache = NSCache<NSString, UIImage>()
    private var inFlight: [String: Task<UIImage?, Never>] = [:]
    private var audioInFlight: [String: Task<URL?, Never>] = [:]

    init() { cache.countLimit = 400 }

    func thumbnail(url: String, size: Int, accountId: String, client: Client) async -> UIImage? {
        guard let source = try? MediaSource.fromUrl(url: url) else { return nil }
        return await image(key: Self.key(accountId: accountId, url: url, size: size), source: source, size: size, client: client)
    }

    func image(source: MediaSource, size: Int?, accountId: String, client: Client) async -> UIImage? {
        await image(key: Self.key(accountId: accountId, url: source.url(), size: size ?? 0), source: source, size: size, client: client)
    }

    /// A voice message or audio file, downloaded (and decrypted) once into the caches folder.
    /// The OS may clear that folder at any time; a missing file is simply fetched again.
    func audioFile(source: MediaSource, mimeType: String?, accountId: String, client: Client) async -> URL? {
        let key = "\(accountId)|\(source.url())"
        let name = SHA256.hash(data: Data(key.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
        let url = Self.audioFolder.appendingPathComponent("\(name).\(Self.audioExtension(mimeType))")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        if let running = audioInFlight[key] { return await running.value }
        let task = Task<URL?, Never> {
            guard let data = try? await client.getMediaContent(mediaSource: source),
                  data.count <= Self.maxAudioBytes else { return nil }
            do {
                try FileManager.default.createDirectory(at: Self.audioFolder, withIntermediateDirectories: true)
                try data.write(to: url, options: .atomic)
                return url
            } catch { return nil }
        }
        audioInFlight[key] = task
        let result = await task.value
        audioInFlight[key] = nil
        return result
    }

    private static let maxAudioBytes = 100 * 1024 * 1024
    private static var audioFolder: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("VoiceMessages", isDirectory: true)
    }

    /// The file extension AVFoundation uses to guess the format.
    static func audioExtension(_ mimeType: String?) -> String {
        switch mimeType?.split(separator: ";").first?.trimmingCharacters(in: .whitespaces).lowercased() {
        case "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac": return "m4a"
        case "audio/mpeg", "audio/mp3": return "mp3"
        case "audio/ogg", "audio/opus": return "ogg"
        case "audio/webm": return "webm"
        case "audio/wav", "audio/x-wav", "audio/wave": return "wav"
        case "audio/flac", "audio/x-flac": return "flac"
        case "audio/x-caf": return "caf"
        default: return "audio"
        }
    }

    private static func key(accountId: String, url: String, size: Int) -> String {
        "\(accountId)|\(url)#\(size)"
    }

    private func image(key: String, source: MediaSource, size: Int?, client: Client) async -> UIImage? {
        if let cached = cache.object(forKey: key as NSString) { return cached }
        if let running = inFlight[key] { return await running.value }
        let task = Task<UIImage?, Never> {
            let data: Data?
            if let size {
                data = try? await client.getMediaThumbnail(mediaSource: source, width: UInt64(size), height: UInt64(size))
            } else {
                data = try? await client.getMediaContent(mediaSource: source)
            }
            // Servers without thumbnails (and encrypted media) fall back to the full file.
            if let data, let image = UIImage(data: data) { return image }
            if size != nil, let full = try? await client.getMediaContent(mediaSource: source) { return UIImage(data: full) }
            return nil
        }
        inFlight[key] = task
        let image = await task.value
        inFlight[key] = nil
        if let image { cache.setObject(image, forKey: key as NSString) }
        return image
    }
}

/// Round avatar with the Discord fallback: coloured circle with the first letter.
/// `account` is the login the avatar URL came from; its client downloads the image. Without an
/// account only the fallback is shown.
struct AvatarView: View {
    let url: String?
    let name: String
    var size: CGFloat = 40
    var cornerRadius: CGFloat? = nil
    var account: MatrixAccount? = nil
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Theme.color(for: name)
                Text(initial).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius ?? size / 2, style: .continuous))
        .task(id: "\(account?.id ?? "")|\(url ?? "")") {
            guard let url, let account else { image = nil; return }
            image = await MediaLoader.shared.thumbnail(url: url, size: Int(size * 3), accountId: account.id, client: account.client)
        }
    }

    private var initial: String {
        let trimmed = name.trimmingCharacters(in: CharacterSet(charactersIn: "@#!"))
        return trimmed.first.map { String($0).uppercased() } ?? "?"
    }
}
