import AVFoundation
import SwiftUI

/// A shared song like iMessage's Apple Music lyrics: the lines large on a backdrop made from the
/// cover, below title, artist, the service and a round play button for the preview. Without
/// lines the cover sits next to the title instead. A tap opens the song.
struct MusicCardView: View {
    let card: MusicCard
    var account: MatrixAccount?
    /// False in previews (share sheet, composer): no playing, no opening.
    var interactive = true
    @ObservedObject private var player = MusicPreviewPlayer.shared
    @State private var cover: UIImage?
    @Environment(\.openURL) private var openURL

    private static let width: CGFloat = 300

    private var playing: Bool { player.current == card.preview && player.isPlaying }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !card.lyrics.isEmpty { lyrics }
            footer
        }
        .frame(maxWidth: Self.width, alignment: .leading)
        .background { backdrop }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.06), lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .onTapGesture { if interactive { openURL(card.url) } }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isLink)
        .task(id: card.artwork ?? card.remoteArtwork?.absoluteString) { await loadCover() }
    }

    private var lyrics: some View {
        HStack(alignment: .lastTextBaseline, spacing: 10) {
            Text(card.lyrics.joined(separator: "\n"))
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let time = card.time {
                Text(MusicCard.clock(time))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.white.opacity(0.55))
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 16)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if card.lyrics.isEmpty {
                Group {
                    if let cover { Image(uiImage: cover).resizable().scaledToFill() } else { Color.white.opacity(0.12) }
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(card.title).font(.headline).foregroundStyle(.white).lineLimit(1)
                if !card.artist.isEmpty {
                    Text(card.artist).font(.subheadline).foregroundStyle(.white.opacity(0.85)).lineLimit(1)
                }
                service.padding(.top, 2)
            }
            Spacer(minLength: 8)
            if card.preview != nil {
                Button {
                    if interactive, let preview = card.preview { player.toggle(preview) }
                } label: {
                    ZStack {
                        Circle().fill(.white.opacity(0.16))
                        if interactive, player.current == card.preview, player.isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: playing ? "pause.fill" : "play.fill")
                                .font(.system(size: 19, weight: .semibold))
                                .foregroundStyle(.white)
                                .offset(x: playing ? 0 : 2)
                        }
                    }
                    .frame(width: 46, height: 46)
                    .overlay {
                        if playing {
                            Circle().trim(from: 0, to: player.progress)
                                .stroke(.white.opacity(0.8), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(playing ? "Pause preview" : "Play preview")
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(Color.black.opacity(card.lyrics.isEmpty ? 0 : 0.14))
    }

    @ViewBuilder private var service: some View {
        switch card.service {
        case "apple":
            HStack(spacing: 2) {
                Image(systemName: "apple.logo").font(.system(size: 13, weight: .semibold))
                Text("Music").font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(.white.opacity(0.5))
        case "spotify":
            Text("Spotify").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white.opacity(0.5))
        default:
            Text(card.url.host ?? "").font(.footnote).foregroundStyle(.white.opacity(0.5)).lineLimit(1)
        }
    }

    /// The cover, blurred and darkened, like the colours behind iMessage's card.
    private var backdrop: some View {
        ZStack {
            Color(white: 0.17)
            if let cover {
                Image(uiImage: cover)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 38, opaque: true)
                    .saturation(1.2)
                    .opacity(0.75)
            }
            LinearGradient(colors: [.black.opacity(0.18), .black.opacity(0.42)], startPoint: .top, endPoint: .bottom)
        }
        .clipped()
    }

    private var accessibilityText: String {
        var parts: [String] = []
        if !card.lyrics.isEmpty { parts.append(card.lyrics.joined(separator: " ")) }
        parts.append(card.heading)
        return parts.joined(separator: ", ")
    }

    private func loadCover() async {
        if let mxc = card.artwork, let account {
            cover = await MediaLoader.shared.thumbnail(url: mxc, size: 600, accountId: account.id, client: account.client)
        } else if let remote = card.remoteArtwork,
                  let (data, _) = try? await URLSession.shared.data(from: remote) {
            cover = UIImage(data: data)
        }
    }
}

/// Plays one song preview at a time (the cards share it); stops at the end.
@MainActor
final class MusicPreviewPlayer: ObservableObject {
    static let shared = MusicPreviewPlayer()

    @Published private(set) var current: URL?
    @Published private(set) var isPlaying = false
    @Published private(set) var isLoading = false
    @Published private(set) var progress: Double = 0

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?

    func toggle(_ url: URL) {
        if current == url, let player {
            if isPlaying { player.pause(); isPlaying = false } else { player.play(); isPlaying = true }
            return
        }
        stop()
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player
        current = url
        isLoading = true
        isPlaying = true
        progress = 0
        // A running call keeps its own audio setup (play and record); otherwise play even when muted.
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord { try? session.setCategory(.playback, options: [.mixWithOthers]) }
        statusObserver = item.observe(\.status) { [weak self] item, _ in
            Task { @MainActor in
                guard let self, self.current == url else { return }
                if item.status != .unknown { self.isLoading = false }
                if item.status == .failed { self.stop() }
            }
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self, let duration = self.player?.currentItem?.duration.seconds, duration.isFinite, duration > 0 else { return }
                self.progress = min(1, time.seconds / duration)
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
        player.play()
    }

    func stop() {
        player?.pause()
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        statusObserver?.invalidate()
        timeObserver = nil
        endObserver = nil
        statusObserver = nil
        player = nil
        current = nil
        isPlaying = false
        isLoading = false
        progress = 0
    }
}
