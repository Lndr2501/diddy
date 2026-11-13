import MatrixRustSDK
import QuickLook
import SwiftUI

/// Pictures, videos and files of a channel in one place (#189), opened from the channel details.
/// It reads the channel's own timeline (the same rows the chat shows) and goes back in time page
/// by page, so it finds what was shared before, not only what the chat has loaded.
struct MediaOverviewView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    @StateObject private var holder = TimelineHolder()

    var body: some View {
        Group {
            if let controller = holder.controller {
                MediaOverviewContent(account: account, controller: controller)
            } else {
                ZStack { Theme.sidebar.ignoresSafeArea(); ProgressView() }
            }
        }
        .navigationTitle("Media & Files")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard holder.controller == nil else { return }
            try? await account.waitForRoom(roomId)
            guard let room = account.room(roomId) else { return }
            let controller = TimelineController(room: room, ownUserId: account.userId,
                                                isDirect: account.summary(for: roomId)?.isDirect == true)
            holder.controller = controller
            await controller.start()
            // A few more pages up front, so a quiet channel already shows its older media.
            for _ in 0..<4 where !controller.reachedStart { await controller.paginate() }
        }
    }
}

private enum MediaKind: String, CaseIterable, Identifiable {
    case pictures = "Pictures"
    case videos = "Videos"
    case files = "Files"
    var id: String { rawValue }
}

private struct MediaOverviewContent: View {
    @ObservedObject var account: MatrixAccount
    @ObservedObject var controller: TimelineController
    @State private var kind: MediaKind = .pictures
    @State private var viewedImage: ViewedImage?
    @State private var openedFile: URL?

    /// Newest first, which is what people look for in an overview.
    private var pictures: [MessageRow] {
        controller.rows.filter { row in
            if case .image = row.body { return !row.isSticker }
            return false
        }.reversed()
    }

    private var videos: [MessageRow] { controller.rows.filter { $0.video != nil }.reversed() }

    private var files: [MessageRow] {
        controller.rows.filter { row in
            if case .file = row.body { return row.video == nil }
            return false
        }.reversed()
    }

    private var shownCount: Int {
        switch kind {
        case .pictures: return pictures.count
        case .videos: return videos.count
        case .files: return files.count
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Type", selection: $kind) {
                ForEach(MediaKind.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(12)
            ScrollView {
                VStack(spacing: 14) {
                    switch kind {
                    case .pictures: pictureGrid
                    case .videos: videoList
                    case .files: fileList
                    }
                    footer
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 16)
            }
        }
        .background(Theme.sidebar.ignoresSafeArea())
        .fullScreenCover(item: $viewedImage) { ImageViewer(image: $0.image) }
        .quickLookPreview($openedFile)
    }

    private var pictureGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6)], spacing: 6) {
            ForEach(pictures) { row in
                if case .image(let source, _, _, _) = row.body {
                    MediaThumb(source: source, account: account) { viewedImage = ViewedImage(image: $0) }
                        .accessibilityLabel("Picture from \(row.senderName)")
                }
            }
        }
    }

    private var videoList: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(videos) { row in
                if let video = row.video {
                    VStack(alignment: .leading, spacing: 4) {
                        VideoMessageView(video: video, account: account, onFile: { openedFile = $0 })
                        caption(row)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var fileList: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(files) { row in
                if case .file(let name, let source, _) = row.body {
                    VStack(alignment: .leading, spacing: 4) {
                        FileAttachment(name: name, source: source, client: account.client, onOpen: { openedFile = $0 })
                        caption(row)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func caption(_ row: MessageRow) -> some View {
        Text("\(row.senderName), \(row.date.formatted(date: .abbreviated, time: .shortened))")
            .font(.caption)
            .foregroundStyle(Theme.faint)
    }

    /// Empty state, the spinner while older messages load, and the button for more.
    @ViewBuilder
    private var footer: some View {
        if shownCount == 0 && controller.reachedStart && !controller.loading {
            Text("Nothing of this kind has been shared in this channel.")
                .font(.subheadline).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.top, 24)
        }
        if controller.loading {
            ProgressView().padding(.top, 8)
        } else if !controller.reachedStart {
            Button("Load Older Messages") { Task { await controller.loadOlderMessages() } }
                .buttonStyle(.bordered)
                .padding(.top, 8)
        }
    }
}

/// A square picture in the grid; tap opens it full screen.
private struct MediaThumb: View {
    let source: MediaSource
    let account: MatrixAccount
    let onTap: (UIImage) -> Void
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                ZStack {
                    Theme.elevated
                    if let image {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else if failed {
                        Image(systemName: "photo").foregroundStyle(Theme.faint)
                    } else {
                        ProgressView()
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .contentShape(Rectangle())
            .onTapGesture {
                guard image != nil else { return }
                Task {
                    let full = await MediaLoader.shared.image(source: source, size: nil, accountId: account.id, client: account.client)
                    if let shown = full ?? image { onTap(shown) }
                }
            }
            .task {
                image = await MediaLoader.shared.image(source: source, size: 300, accountId: account.id, client: account.client)
                failed = image == nil
            }
            .accessibilityAddTraits(.isButton)
    }
}
