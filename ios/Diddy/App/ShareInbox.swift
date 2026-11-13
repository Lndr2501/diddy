import Foundation
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Something shared to Diddy from another app, while you pick the chat for it.
struct IncomingShare: Identifiable, Equatable {
    struct File: Equatable {
        let url: URL
        let name: String
        let mime: String
        var isImage: Bool { mime.hasPrefix("image/") }
        var isVideo: Bool { mime.hasPrefix("video/") }
    }

    let id: String
    var files: [File] = []
    var text: String?
    var urls: [URL] = []
    /// A song link (with lyrics, if any were shared) becomes a music card.
    var music: MusicCard?
    var resolvingMusic = false
    /// The share's folder in the app group, removed once the chat has it.
    var dir: URL?

    var isEmpty: Bool { files.isEmpty && (text ?? "").isEmpty && urls.isEmpty && music == nil }

    /// What goes into the composer besides files and the card: the text and the other links.
    var draftText: String {
        var parts: [String] = []
        if music == nil, let text, !text.isEmpty { parts.append(text) }
        let musicURL = music?.url
        let rest = urls.filter { $0 != musicURL && !(text ?? "").contains($0.absoluteString) }
        parts.append(contentsOf: rest.map(\.absoluteString))
        return parts.joined(separator: "\n")
    }
}

/// A share on its way into one chat (ChatView picks it up when it opens).
struct StagedShare: Equatable {
    let roomId: String
    let share: IncomingShare
}

/// Receives `diddy://share?…` from the share extension (App/ShareHandoff.swift), asks for the chat
/// (ShareTargetSheet) and hands the share to that chat's composer.
@MainActor
final class ShareInbox: ObservableObject {
    static let shared = ShareInbox()

    @Published var incoming: IncomingShare?
    @Published private(set) var staged: StagedShare?

    private var folder: URL? { ShareHandoff.folder(bundleId: Bundle.main.bundleIdentifier ?? "app.diddy.ios") }

    /// True when the link was a share.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard let request = ShareHandoff.request(from: url) else { return false }
        var share: IncomingShare
        var types: [String] = []
        switch request {
        case .stored(let id):
            guard let folder, let stored = ShareHandoff.read(id: id, in: folder) else {
                DiagLog.shared.write("share: stored share \(id) not found (app group: \(folder == nil ? "missing" : "ok"))")
                return true
            }
            share = IncomingShare(id: id, dir: stored.dir)
            share.files = stored.manifest.files.map {
                IncomingShare.File(url: stored.dir.appendingPathComponent($0.stored), name: $0.name, mime: $0.mime)
            }
            share.text = stored.manifest.text
            share.urls = stored.manifest.urls.compactMap(URL.init(string:))
            types = stored.manifest.types
        case .inline(let text, let urls):
            share = IncomingShare(id: UUID().uuidString)
            share.text = text
            share.urls = urls.compactMap(URL.init(string:))
            types = ["inline"]
        }
        // Links inside the text count too (a lyrics share may put the song link there).
        if let text = share.text {
            let known = share.urls
            let found = Self.links(in: text).filter { !known.contains($0) }
            share.urls += found
        }
        DiagLog.shared.write("share: received types=\(Array(Set(types)).sorted().joined(separator: ",")) files=\(share.files.map(\.mime).joined(separator: ",")) text=\(share.text?.count ?? 0) links=\(share.urls.compactMap(\.host).joined(separator: ","))")
        guard !share.isEmpty else { return true }
        if share.urls.contains(where: { MusicCard.appleMusicSong($0) != nil || $0.host == "open.spotify.com" }) {
            share.resolvingMusic = true
            let id = share.id
            Task { await resolveMusic(shareId: id) }
        }
        incoming = share
        return true
    }

    func stage(_ share: IncomingShare, roomId: String) {
        incoming = nil
        staged = StagedShare(roomId: roomId, share: share)
    }

    /// The share for this chat, once.
    func take(for roomId: String) -> IncomingShare? {
        guard let staged, staged.roomId == roomId else { return nil }
        self.staged = nil
        return staged.share
    }

    func cancel() {
        if let dir = incoming?.dir { try? FileManager.default.removeItem(at: dir) }
        incoming = nil
    }

    /// Files ready for the composer: HEIC photos become JPEG, which every Matrix client shows.
    static func composerFiles(of share: IncomingShare) async -> [(data: Data, name: String, mime: String)] {
        let files = share.files
        let ready = await Task.detached(priority: .userInitiated) { () -> [(data: Data, name: String, mime: String)] in
            files.compactMap { file -> (data: Data, name: String, mime: String)? in
                guard let data = try? Data(contentsOf: file.url) else { return nil }
                let heic = ["image/heic", "image/heif"].contains(file.mime.lowercased())
                if heic, let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.9) {
                    let base = (file.name as NSString).deletingPathExtension
                    return (jpeg, (base.isEmpty ? "image" : base) + ".jpg", "image/jpeg")
                }
                return (data, file.name, file.mime)
            }
        }.value
        if let dir = share.dir { try? FileManager.default.removeItem(at: dir) }
        return ready
    }

    // MARK: Music

    private func resolveMusic(shareId: String) async {
        guard var share = incoming, share.id == shareId else { return }
        var card: MusicCard?
        if let link = share.urls.first(where: { MusicCard.appleMusicSong($0) != nil }), let song = MusicCard.appleMusicSong(link),
           let lookup = MusicCard.lookupURL(id: song.id, country: song.country),
           let json = await Self.json(lookup) {
            card = MusicCard.fromLookup(json, link: link)
        } else if let link = share.urls.first(where: { $0.host == "open.spotify.com" && $0.path.hasPrefix("/track/") }),
                  var components = URLComponents(string: "https://open.spotify.com/oembed") {
            components.queryItems = [URLQueryItem(name: "url", value: link.absoluteString)]
            if let url = components.url, let json = await Self.json(url), let title = MusicCard.text(json["title"], max: 200) {
                var found = MusicCard(title: title, artist: "", url: link, service: "spotify")
                if let thumb = json["thumbnail_url"] as? String { found.remoteArtwork = URL(string: thumb) }
                card = found
            }
        }
        if var found = card, let text = share.text {
            found.lyrics = MusicCard.lyrics(from: text, card: found)
            card = found
        }
        DiagLog.shared.write("share: music \(card == nil ? "not found" : "card lines=\(card?.lyrics.count ?? 0) preview=\(card?.preview != nil)")")
        guard incoming?.id == shareId else { return }
        share.music = card
        share.resolvingMusic = false
        incoming = share
    }

    private static func json(_ url: URL) async -> [String: Any]? {
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private static func links(in text: String) -> [URL] {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return detector.matches(in: text, range: range).compactMap(\.url).filter { $0.scheme == "https" || $0.scheme == "http" }
    }
}
