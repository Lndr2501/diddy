import MatrixRustSDK
import PhotosUI
import SwiftUI

struct ChatView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    @StateObject private var holder = TimelineHolder()

    var body: some View {
        Group {
            if let controller = holder.controller {
                ChatContent(account: account, controller: controller, summary: account.summary(for: roomId))
            } else {
                ZStack { Theme.chat.ignoresSafeArea(); ProgressView() }
            }
        }
        .task {
            guard holder.controller == nil, let room = account.room(roomId) else { return }
            let controller = TimelineController(room: room, ownUserId: account.userId)
            holder.controller = controller
            await controller.start()
        }
    }
}

@MainActor
final class TimelineHolder: ObservableObject {
    @Published var controller: TimelineController?
}

private struct ChatContent: View {
    @ObservedObject var account: MatrixAccount
    @ObservedObject var controller: TimelineController
    let summary: RoomSummary?
    @EnvironmentObject private var calls: CallManager
    @State private var draft = ""
    @State private var replyTo: MessageRow?
    @State private var photo: PhotosPickerItem?
    @FocusState private var composerFocused: Bool

    private var title: String { summary?.name ?? "Channel" }

    var body: some View {
        VStack(spacing: 0) {
            messages
            composer
        }
        .background(Theme.chat.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.chat, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 6) {
                    Image(systemName: summary?.isDirect == true ? "at" : "number").foregroundStyle(Theme.faint)
                    Text(title).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
                    if summary?.isEncrypted == true {
                        Image(systemName: "lock.fill").font(.caption2).foregroundStyle(Theme.faint)
                    }
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await calls.join(account: account, roomId: controller.room.id(), roomName: title) }
                } label: {
                    Image(systemName: "phone.fill")
                }
                .accessibilityLabel("Start voice call")
            }
        }
        .alert("Message", isPresented: Binding(get: { controller.sendError != nil }, set: { if !$0 { controller.sendError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(controller.sendError ?? "") }
        .onChange(of: photo) { item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    await controller.sendImage(image)
                }
                photo = nil
            }
        }
    }

    private var messages: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if controller.reachedStart {
                        ChannelIntro(title: title, isDirect: summary?.isDirect == true)
                    } else {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                            .onAppear { Task { await controller.paginate() } }
                    }
                    ForEach(controller.rows) { row in
                        MessageRowView(row: row, account: account)
                            .id(row.id)
                            .contextMenu { menu(for: row) }
                    }
                    Color.clear.frame(height: 8).id("bottom")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: controller.rows.last?.id) { _ in
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
                controller.markRead()
            }
            .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
        }
    }

    @ViewBuilder
    private func menu(for row: MessageRow) -> some View {
        Button { replyTo = row; composerFocused = true } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
        Menu {
            ForEach(["👍", "❤️", "😂", "😮", "😢", "🔥", "👀", "✅"], id: \.self) { emoji in
                Button(emoji) { Task { await controller.toggleReaction(emoji, on: row) } }
            }
        } label: { Label("Add Reaction", systemImage: "face.smiling") }
        if case .text(let text) = row.body {
            Button { UIPasteboard.general.string = text } label: { Label("Copy Text", systemImage: "doc.on.doc") }
        }
        if row.isOwn {
            Button(role: .destructive) { Task { await controller.redact(row) } } label: {
                Label("Delete Message", systemImage: "trash")
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 0) {
            if let replyTo {
                HStack {
                    Text("Replying to ").foregroundColor(Theme.muted) + Text(replyTo.senderName).bold().foregroundColor(Theme.text)
                    Spacer()
                    Button { self.replyTo = nil } label: { Image(systemName: "xmark.circle.fill") }
                        .foregroundStyle(Theme.muted)
                }
                .font(.footnote)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Theme.elevated)
            }
            HStack(alignment: .bottom, spacing: 10) {
                PhotosPicker(selection: $photo, matching: .images) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Send a photo")
                TextField("Message \(summary?.isDirect == true ? "@" : "#")\(title)", text: $draft, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($composerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Theme.input))
                if !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(action: send) {
                        Image(systemName: "paperplane.fill")
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Theme.accent))
                    }
                    .accessibilityLabel("Send")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Theme.chat)
    }

    private func send() {
        let text = draft
        let reply = replyTo?.eventId
        draft = ""
        replyTo = nil
        Task { await controller.send(text: text, replyTo: reply) }
    }
}

private struct ChannelIntro: View {
    let title: String
    let isDirect: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: isDirect ? "at" : "number")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Theme.text)
                .frame(width: 68, height: 68)
                .background(Circle().fill(Theme.elevated))
            Text(isDirect ? title : "Welcome to #\(title)!").font(.title2.bold()).foregroundStyle(Theme.text)
            Text(isDirect ? "This is the beginning of your direct message history." : "This is the start of the #\(title) channel.")
                .foregroundStyle(Theme.muted)
        }
        .padding(16)
        .padding(.top, 24)
    }
}

struct MessageRowView: View {
    let row: MessageRow
    /// The account this timeline belongs to; its client loads the avatars and images.
    let account: MatrixAccount

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let day = row.dayDivider {
                HStack {
                    Rectangle().fill(Theme.elevated).frame(height: 1)
                    Text(day.formatted(date: .long, time: .omitted)).font(.caption2.weight(.semibold)).foregroundStyle(Theme.faint)
                    Rectangle().fill(Theme.elevated).frame(height: 1)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            if case .notice(let text) = row.body {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.right").foregroundStyle(Theme.online).font(.caption)
                    Text(text).font(.footnote).foregroundStyle(Theme.muted)
                    Text(row.date.chatTimestamp).font(.caption2).foregroundStyle(Theme.faint)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            } else {
                message
            }
        }
    }

    private var message: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let reply = row.reply {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.turn.up.right").font(.caption2).foregroundStyle(Theme.faint)
                    Text("@\(reply.sender)").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                    Text(reply.text).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                }
                .padding(.leading, 64)
            }
            HStack(alignment: .top, spacing: 12) {
                if row.showsHeader {
                    AvatarView(url: row.senderAvatar, name: row.senderName, size: 40, account: account)
                } else {
                    Color.clear.frame(width: 40, height: 1)
                }
                VStack(alignment: .leading, spacing: 3) {
                    if row.showsHeader {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(row.senderName).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.color(for: row.sender))
                            Text(row.date.chatTimestamp).font(.caption2).foregroundStyle(Theme.faint)
                        }
                    }
                    content
                    if !row.reactions.isEmpty { reactions }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
        }
        .padding(.top, row.showsHeader ? 12 : 2)
        .opacity(row.isPending ? 0.6 : 1)
    }

    @ViewBuilder
    private var content: some View {
        switch row.body {
        case .text(let text):
            (Text(Self.markdown(text)) + Text(row.isEdited ? " (edited)" : "").font(.caption2).foregroundColor(Theme.faint))
                .foregroundStyle(Theme.text)
                .textSelection(.enabled)
        case .image(let source, _, let width, let height):
            ChatImage(source: source, account: account, aspect: (width ?? 4) / max(height ?? 3, 1))
        case .file(let name):
            Label(name, systemImage: "doc").padding(10)
                .background(RoundedRectangle(cornerRadius: 8).fill(Theme.elevated))
        case .undecryptable:
            Label("Waiting for this message's key. Verify this device in Settings.", systemImage: "lock")
                .font(.footnote).foregroundStyle(Theme.faint)
        case .redacted:
            Text("Message deleted").italic().foregroundStyle(Theme.faint)
        case .notice(let text):
            Text(text).foregroundStyle(Theme.muted)
        }
    }

    private var reactions: some View {
        HStack(spacing: 6) {
            ForEach(row.reactions, id: \.key) { reaction in
                HStack(spacing: 4) {
                    Text(reaction.key)
                    Text("\(reaction.count)").font(.caption.weight(.semibold))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 8).fill(reaction.mine ? Theme.accent.opacity(0.3) : Theme.elevated))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(reaction.mine ? Theme.accent : .clear, lineWidth: 1))
            }
        }
        .padding(.top, 2)
    }

    private static func markdown(_ text: String) -> AttributedString {
        guard let parsed = try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
        else { return AttributedString(text) }
        return withSafeLinks(parsed)
    }

    /// Link schemes a tap may open. Anything else in someone's message (tel:, sms:, file:, other
    /// apps' URL schemes, ...) stays as plain text with the rest of the formatting intact.
    private static let tappableSchemes: Set<String> = ["http", "https", "matrix"]

    private static func withSafeLinks(_ parsed: AttributedString) -> AttributedString {
        // Rebuilt run by run, so no index into `parsed` is used after a mutation.
        var result = AttributedString()
        for run in parsed.runs {
            var piece = AttributedString(parsed[run.range])
            if let link = run.link, !tappableSchemes.contains(link.scheme?.lowercased() ?? "") {
                piece.link = nil
            }
            result.append(piece)
        }
        return result
    }
}

private struct ChatImage: View {
    let source: MediaSource
    let account: MatrixAccount
    let aspect: CGFloat
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(Theme.elevated)
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                ProgressView()
            }
        }
        .aspectRatio(aspect, contentMode: .fit)
        .frame(maxWidth: 280, maxHeight: 320, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .task { image = await MediaLoader.shared.image(source: source, size: 800, accountId: account.id, client: account.client) }
    }
}
