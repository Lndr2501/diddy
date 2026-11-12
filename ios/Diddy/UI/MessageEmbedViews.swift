import AVFoundation
import AVKit
import CryptoKit
import MatrixRustSDK
import SwiftUI
import UIKit

// MARK: - Link previews

/// The preview cards under a message (desktop `UrlPreviewCard`): picture, site, title, description.
struct LinkPreviewStrip: View {
    let urls: [String]
    let account: MatrixAccount

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(urls, id: \.self) { url in
                LinkPreviewCard(url: url, account: account)
            }
        }
        .padding(.top, 4)
    }
}

private struct LinkPreviewCard: View {
    let url: String
    let account: MatrixAccount
    @State private var data: LinkPreviewData?
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let data { card(data) }
        }
        .task(id: "\(account.id)|\(url)") {
            let loaded = await LinkPreviewStore.shared.preview(for: url, accountId: account.id, client: account.client)
            data = loaded
            image = nil
            if let loaded, let mxc = loaded.imageURL {
                image = await MediaLoader.shared.thumbnail(url: mxc, size: 256, accountId: account.id, client: account.client)
            }
        }
    }

    /// Site and address on top like the desktop: `Site | example.org/page`.
    private func header(_ data: LinkPreviewData) -> String {
        let address = url.removingPercentEncoding ?? url
        if let site = data.siteName { return "\(site) | \(address)" }
        return address
    }

    @ViewBuilder
    private func card(_ data: LinkPreviewData) -> some View {
        let content = HStack(alignment: .top, spacing: 10) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: header(data)).font(.caption).foregroundStyle(Theme.online).lineLimit(1)
                if let title = data.title {
                    Text(verbatim: title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(2)
                }
                if let description = data.description {
                    Text(verbatim: description).font(.caption).foregroundStyle(Theme.muted).lineLimit(3)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: 360, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.elevated))
        if let target = RichTextBuilder.safeURL(url) {
            Link(destination: target) { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}

// MARK: - Video

/// Downloads a video (decrypting it if needed) into the caches folder, once.
actor VideoFileLoader {
    static let shared = VideoFileLoader()

    private var inFlight: [String: Task<URL?, Never>] = [:]
    private static let maxBytes = 250 * 1024 * 1024

    func file(source: MediaSource, filename: String, mimeType: String?, accountId: String, client: Client) async -> URL? {
        let key = "\(accountId)|\(source.url())"
        let name = SHA256.hash(data: Data(key.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
        let url = Self.folder.appendingPathComponent("\(name).\(Self.fileExtension(filename: filename, mimeType: mimeType))")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        if let running = inFlight[key] { return await running.value }
        let task = Task<URL?, Never> {
            guard let data = try? await client.getMediaContent(mediaSource: source), data.count <= Self.maxBytes else { return nil }
            do {
                try FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
                try data.write(to: url, options: .atomic)
                return url
            } catch { return nil }
        }
        inFlight[key] = task
        let result = await task.value
        inFlight[key] = nil
        return result
    }

    private static var folder: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("VideoMessages", isDirectory: true)
    }

    /// AVFoundation picks the decoder by the extension.
    static func fileExtension(filename: String, mimeType: String?) -> String {
        switch mimeType?.split(separator: ";").first?.trimmingCharacters(in: .whitespaces).lowercased() {
        case "video/mp4": return "mp4"
        case "video/quicktime": return "mov"
        case "video/x-m4v": return "m4v"
        case "video/webm": return "webm"
        case "video/x-matroska": return "mkv"
        case "video/3gpp": return "3gp"
        default:
            let ext = (filename as NSString).pathExtension.lowercased()
            let safe = ext.count >= 2 && ext.count <= 5 && ext.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) }
            return safe ? ext : "mp4"
        }
    }
}

/// A video in the chat: the picture the sender attached with a play button; a tap downloads it
/// and plays it right there with the system controls (which include full screen).
struct VideoMessageView: View {
    let video: VideoAttachment
    let account: MatrixAccount
    var onFile: (URL) -> Void = { _ in }

    @State private var poster: UIImage?
    @State private var player: AVPlayer?
    @State private var loading = false
    @State private var failed = false
    /// Off until tapped when Settings > Chat says not to load pictures by themselves.
    @State private var posterRequested = ChatSettings.autoLoadMedia

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(Color.black)
                if let player {
                    VideoPlayer(player: player)
                } else {
                    thumbnailLayer
                }
            }
            .aspectRatio(MessageMediaSize.aspect(width: video.width, height: video.height), contentMode: .fit)
            .frame(maxWidth: 280, maxHeight: 320, alignment: .leading)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            if let caption = video.caption {
                Text(verbatim: caption).foregroundStyle(Theme.text)
            }
        }
        .task(id: posterRequested) {
            guard posterRequested, poster == nil, let thumbnail = video.thumbnail else { return }
            poster = await MediaLoader.shared.image(source: thumbnail, size: 600, accountId: account.id, client: account.client)
        }
        .onDisappear { player?.pause() }
    }

    /// The picture, the play button and the length, all one button until the player takes over.
    private var thumbnailLayer: some View {
        ZStack {
            if let poster {
                Image(uiImage: poster).resizable().scaledToFit()
            }
            playOverlay
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !loading else { return }
            if !posterRequested { posterRequested = true }
            Task { await play() }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Video \(video.filename)")
        .accessibilityHint("Plays the video")
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var playOverlay: some View {
        if loading {
            ProgressView().tint(.white)
        } else if failed {
            Label("Can't play this video", systemImage: "exclamationmark.triangle")
                .font(.footnote).foregroundStyle(.white)
        } else {
            ZStack {
                Circle().fill(Color.black.opacity(0.55)).frame(width: 56, height: 56)
                Image(systemName: "play.fill").font(.title2).foregroundStyle(.white)
            }
        }
        if !loading, let duration = video.duration {
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Text(VoiceFormat.time(duration))
                        .font(.caption2.weight(.semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Capsule().fill(Color.black.opacity(0.6)))
                }
            }
            .padding(6)
        }
    }

    private func play() async {
        loading = true
        failed = false
        defer { loading = false }
        guard let url = await VideoFileLoader.shared.file(source: video.source, filename: video.filename,
                                                          mimeType: video.mimeType, accountId: account.id, client: account.client) else {
            failed = true
            return
        }
        let asset: AVAsset = AVURLAsset(url: url)
        let playable = (try? await asset.load(.isPlayable)) ?? false
        guard playable else {
            // A format the system cannot play (WebM, say): hand the file over to share or open elsewhere.
            failed = true
            onFile(url)
            return
        }
        let session = AVAudioSession.sharedInstance()
        // Not during a call, which owns the audio session; the silent switch should not mute a video.
        if session.category != .playAndRecord {
            try? session.setCategory(.playback, mode: .moviePlayback)
            try? session.setActive(true)
        }
        let item = AVPlayerItem(asset: asset)
        let created = AVPlayer(playerItem: item)
        player = created
        created.play()
    }
}

// MARK: - Location

/// An `m.location` message: the place and a chip that opens it in a map.
struct LocationMessageView: View {
    let location: LocationAttachment
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label = location.label, label != location.geoURI {
                Label { Text(verbatim: label).foregroundStyle(Theme.text) } icon: {
                    Image(systemName: "mappin.and.ellipse").foregroundStyle(Theme.accent)
                }
            }
            Text(verbatim: location.geoURI).font(.footnote).foregroundStyle(Theme.muted)
            Menu {
                Button("Open in Apple Maps") {
                    if let url = location.location.appleMapsURL(label: location.label) { openURL(url) }
                }
                Button("Open in OpenStreetMap") {
                    if let url = location.location.openStreetMapURL { openURL(url) }
                }
            } label: {
                Label("Open Location", systemImage: "arrow.up.right.square")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Theme.accent.opacity(0.18)))
            }
        }
    }
}

// MARK: - Stickers and custom emoji

/// A sticker: no bubble, 152 points wide like the desktop, the height to scale.
struct StickerView: View {
    let source: MediaSource
    let name: String
    let width: CGFloat?
    let height: CGFloat?
    let account: MatrixAccount
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        let size = MessageMediaSize.sticker(width: width.map { Double($0) }, height: height.map { Double($0) })
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else if failed {
                Image(systemName: "face.smiling").foregroundStyle(Theme.faint)
            } else {
                ProgressView()
            }
        }
        .frame(width: CGFloat(size.width), height: CGFloat(size.height), alignment: .leading)
        .accessibilityLabel(name.isEmpty ? "Sticker" : name)
        .task {
            image = await MediaLoader.shared.image(source: source, size: 456, accountId: account.id, client: account.client)
            failed = image == nil
        }
    }
}

/// A reaction: an emoji, or the picture of a custom emoji when the key is an `mxc://` address.
struct ReactionKeyView: View {
    let key: String
    let account: MatrixAccount
    @State private var image: UIImage?

    var body: some View {
        if key.hasPrefix("mxc://") {
            Group {
                if let image {
                    Image(uiImage: image).resizable().scaledToFit()
                } else {
                    Image(systemName: "face.smiling").foregroundStyle(Theme.faint)
                }
            }
            .frame(width: 20, height: 20)
            .task(id: key) {
                image = await MediaLoader.shared.thumbnail(url: key, size: 64, accountId: account.id, client: account.client)
            }
        } else {
            Text(key)
        }
    }
}
