import SwiftUI

/// "Send to …" after sharing from another app: what you shared on top, then your chats (newest
/// first) with a search. Picking one opens it with the share in the composer, ready to send.
struct ShareTargetSheet: View {
    @ObservedObject var account: MatrixAccount
    @ObservedObject var inbox: ShareInbox
    let share: IncomingShare
    let onPick: (String) -> Void
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    private var chats: [RoomSummary] {
        let all = account.rooms.filter { $0.isJoined && !$0.isSpace && !account.isDiddyOptionsRoom($0.id, topic: $0.topic) && !account.isVoiceChannel($0.id) }
        let matching = query.isEmpty ? all : all.filter { $0.name.localizedCaseInsensitiveContains(query) }
        return ChatListLogic.sortedByActivity(matching) { $0.lastActivity }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    preview
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
                }
                Section {
                    ForEach(chats) { room in
                        Button { onPick(room.id) } label: { row(room) }
                            .buttonStyle(.plain)
                            .listRowBackground(Theme.sidebar)
                    }
                    if chats.isEmpty {
                        Text(query.isEmpty ? "No chats yet." : "No chat matches “\(query)”.").foregroundStyle(Theme.muted)
                            .listRowBackground(Theme.sidebar)
                    }
                } header: {
                    Text("Send to")
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        inbox.cancel()
                        dismiss()
                    }
                }
            }
        }
    }

    // MARK: What is shared

    @ViewBuilder private var preview: some View {
        let current = inbox.incoming?.id == share.id ? inbox.incoming ?? share : share
        VStack(spacing: 10) {
            if let music = current.music {
                MusicCardView(card: music, account: account, interactive: false)
            } else if current.resolvingMusic {
                HStack(spacing: 8) { ProgressView(); Text("Looking up the song…").foregroundStyle(Theme.muted) }
                    .frame(height: 80)
            }
            if !current.files.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(current.files, id: \.url) { file in SharedFileThumb(file: file) }
                    }
                }
            }
            let text = current.draftText
            if !text.isEmpty {
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .lineLimit(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.elevated))
            }
        }
    }

    private func row(_ room: RoomSummary) -> some View {
        HStack(spacing: 12) {
            AvatarView(url: room.avatarUrl, name: room.name, size: 40, account: account)
            VStack(alignment: .leading, spacing: 2) {
                Text(room.name).font(.body.weight(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                if let server = account.server(of: room.id) {
                    Text(account.serverInfo(server).name).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                } else if room.isDirect {
                    Text("Direct message").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "paperplane.fill").font(.footnote).foregroundStyle(Theme.accent)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

/// A shared photo (or a symbol for other files) in the preview row.
private struct SharedFileThumb: View {
    let file: IncomingShare.File
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Theme.elevated
                Image(systemName: file.isVideo ? "film" : file.isImage ? "photo" : "doc")
                    .font(.title2).foregroundStyle(Theme.muted)
            }
        }
        .frame(width: 84, height: 84)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(alignment: .bottomLeading) {
            if file.isVideo {
                Image(systemName: "video.fill").font(.caption2).foregroundStyle(.white).padding(6)
            }
        }
        .accessibilityLabel(file.name)
        .task {
            guard file.isImage else { return }
            let url = file.url
            image = await Task.detached(priority: .userInitiated) {
                UIImage(contentsOfFile: url.path)?.preparingThumbnail(of: CGSize(width: 252, height: 252))
            }.value
        }
    }
}
