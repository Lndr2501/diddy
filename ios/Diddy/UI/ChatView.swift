import MatrixRustSDK
import PhotosUI
import QuickLook
import SwiftUI

struct ChatView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    /// The text chat of a voice channel, opened from inside it: no call button or banner needed.
    var isVoiceChat = false
    @StateObject private var holder = TimelineHolder()

    var body: some View {
        Group {
            if let controller = holder.controller {
                ChatContent(account: account, controller: controller, summary: account.summary(for: roomId), isVoiceChat: isVoiceChat)
            } else {
                ZStack { Theme.chat.ignoresSafeArea(); ProgressView() }
            }
        }
        .task {
            guard holder.controller == nil else { return }
            // A channel joined a moment ago may still be on its way from the server.
            try? await account.waitForRoom(roomId)
            guard let room = account.room(roomId) else { return }
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
    let isVoiceChat: Bool
    @EnvironmentObject private var calls: CallManager
    @StateObject private var memberStore = MemberStore()
    @State private var draft = ""
    @State private var replyTo: MessageRow?
    @State private var editing: MessageRow?
    @State private var photo: PhotosPickerItem?
    @State private var showMembers = false
    @State private var showInfo = false
    @State private var profile: ProfileTarget?
    @State private var viewedImage: ViewedImage?
    @State private var openedFile: URL?
    @State private var atBottom = true
    /// While a chat opens, rows and images keep arriving and push the bottom out of view.
    @State private var settling = true
    @State private var mentions: [String: String] = [:]
    @State private var canSend = true
    @FocusState private var composerFocused: Bool

    private var title: String { summary?.name ?? "Channel" }
    private var roomId: String { controller.room.id() }
    private var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            if !isVoiceChat { CallBanner(account: account, summary: summary, roomId: roomId, title: title) }
            messages
            typingLine
            if canSend {
                composer
            } else {
                Text("You do not have permission to send messages here.")
                    .font(.footnote).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity)
                    .padding(14)
                    .background(Theme.chat)
            }
        }
        .background(Theme.chat.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.chat, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button { showInfo = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: summary?.isDirect == true ? "at" : "number").foregroundStyle(Theme.faint)
                        Text(title).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
                        if summary?.isEncrypted == true {
                            Image(systemName: "lock.fill").font(.caption2).foregroundStyle(Theme.faint)
                        }
                    }
                }
                .accessibilityLabel("\(title), channel details")
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                if !isVoiceChat {
                    Button {
                        Task { await calls.join(account: account, roomId: roomId, roomName: title, showCallScreen: true) }
                    } label: {
                        Image(systemName: "phone.fill")
                    }
                    .accessibilityLabel("Start voice call")
                }
                Button { showMembers = true } label: {
                    Image(systemName: "person.2.fill")
                }
                .accessibilityLabel("Members")
            }
        }
        .sheet(isPresented: $showMembers) { MembersView(account: account, roomId: roomId) }
        .sheet(isPresented: $showInfo) { ChannelInfoView(account: account, roomId: roomId) }
        .sheet(item: $profile) { UserProfileSheet(account: account, userId: $0.userId, roomId: roomId) }
        .fullScreenCover(item: $viewedImage) { ImageViewer(image: $0.image) }
        .quickLookPreview($openedFile)
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
        .onChange(of: draft) { text in
            controller.setTyping(!text.isEmpty && editing == nil)
        }
        .onDisappear { controller.setTyping(false) }
        .task {
            await memberStore.load(account: account, roomId: roomId)
            if let levels = try? await controller.room.getPowerLevels() {
                canSend = levels.canOwnUserSendMessage(message: .roomMessage)
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
                            // Runs again after each page, in case the spinner is still in view.
                            .task(id: controller.rows.count) {
                                let top = controller.rows.first?.id
                                await controller.loadOlderMessages()
                                if let top, !atBottom { proxy.scrollTo(top, anchor: .top) }
                            }
                    }
                    ForEach(controller.rows) { row in
                        MessageRowView(
                            row: row,
                            account: account,
                            onProfile: { profile = ProfileTarget(userId: row.sender) },
                            onReact: { key in Task { await controller.toggleReaction(key, on: row) } },
                            onImage: { viewedImage = ViewedImage(image: $0) },
                            onFile: { openedFile = $0 }
                        )
                        .id(row.id)
                        .contextMenu { menu(for: row) }
                    }
                    Color.clear.frame(height: 8).id("bottom")
                        .onAppear { atBottom = true; controller.markRead() }
                        .onDisappear {
                            if settling { proxy.scrollTo("bottom", anchor: .bottom) } else { atBottom = false }
                        }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .simultaneousGesture(DragGesture(minimumDistance: 10).onChanged { _ in settling = false })
            .task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                settling = false
            }
            .onChange(of: controller.rows.last?.id) { _ in
                // Reading further up stays put when a message comes in, unless it is your own.
                guard atBottom || controller.rows.last?.isOwn == true else { return }
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
                controller.markRead()
            }
            .onChange(of: composerFocused) { focused in
                guard focused, atBottom else { return }
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
            .overlay(alignment: .bottomTrailing) {
                if !atBottom {
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Theme.elevated))
                            .overlay(Circle().stroke(Theme.faint.opacity(0.4), lineWidth: 1))
                    }
                    .padding(12)
                    .accessibilityLabel("Jump to latest messages")
                }
            }
        }
    }

    @ViewBuilder
    private func menu(for row: MessageRow) -> some View {
        Button { replyTo = row; editing = nil; composerFocused = true } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
        Menu {
            ForEach(["👍", "❤️", "😂", "😮", "😢", "🔥", "👀", "✅"], id: \.self) { emoji in
                Button(emoji) { Task { await controller.toggleReaction(emoji, on: row) } }
            }
        } label: { Label("Add Reaction", systemImage: "face.smiling") }
        if case .text(let text) = row.body {
            let readable = Self.readableMentions(in: text)
            Button { UIPasteboard.general.string = readable.text } label: { Label("Copy Text", systemImage: "doc.on.doc") }
            if row.isOwn {
                Button {
                    editing = row
                    replyTo = nil
                    draft = readable.text
                    mentions = readable.mentions
                    composerFocused = true
                } label: { Label("Edit Message", systemImage: "pencil") }
            }
        }
        Button { profile = ProfileTarget(userId: row.sender) } label: { Label("View Profile", systemImage: "person.crop.circle") }
        if row.isOwn {
            Button(role: .destructive) { Task { await controller.redact(row) } } label: {
                Label("Delete Message", systemImage: "trash")
            }
        }
    }

    /// Discord's line under the chat, always reserving no space when nobody types.
    @ViewBuilder
    private var typingLine: some View {
        let names = controller.typingUserIds.map { account.name(of: $0) }
        if !names.isEmpty {
            Text(names.count == 1 ? "\(names[0]) is typing…"
                 : names.count == 2 ? "\(names[0]) and \(names[1]) are typing…"
                 : "Several people are typing…")
                .font(.caption.weight(.medium))
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 3)
                .onAppear { account.resolveProfiles(controller.typingUserIds, in: roomId) }
        }
    }

    /// The `@word` being typed at the end of the message, if any.
    private var mentionQuery: String? {
        guard let at = draft.lastIndex(of: "@") else { return nil }
        if at != draft.startIndex, !draft[draft.index(before: at)].isWhitespace { return nil }
        let query = draft[draft.index(after: at)...]
        return query.contains(where: \.isWhitespace) ? nil : String(query)
    }

    private var mentionSuggestions: [MemberEntry] {
        guard let query = mentionQuery else { return [] }
        let found = memberStore.members.filter {
            $0.userId != account.userId && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.userId.localizedCaseInsensitiveContains(query))
        }
        return Array(found.prefix(6))
    }

    private func insertMention(_ member: MemberEntry) {
        guard let at = draft.lastIndex(of: "@") else { return }
        draft = String(draft[..<at]) + "@\(member.name) "
        mentions[member.name] = member.userId
    }

    private var composer: some View {
        VStack(spacing: 0) {
            if !mentionSuggestions.isEmpty {
                VStack(spacing: 0) {
                    ForEach(mentionSuggestions) { member in
                        Button { insertMention(member) } label: {
                            PersonRow(name: member.name, subtitle: member.userId, avatarUrl: member.avatarUrl, account: account)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Theme.elevated)
            }
            if let replyTo {
                composerContext(Text("Replying to ").foregroundColor(Theme.muted) + Text(replyTo.senderName).bold().foregroundColor(Theme.text)) {
                    self.replyTo = nil
                }
            }
            if editing != nil {
                composerContext(Text("Editing message").foregroundColor(Theme.muted)) {
                    editing = nil
                    draft = ""
                }
            }
            HStack(alignment: .bottom, spacing: 10) {
                if editing == nil {
                    PhotosPicker(selection: $photo, matching: .images) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(Theme.muted)
                            .frame(width: 36, height: 36)
                    }
                    .accessibilityLabel("Send a photo")
                }
                TextField("Message \(summary?.isDirect == true ? "@" : "#")\(title)", text: $draft, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($composerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Theme.input))
                if !trimmedDraft.isEmpty {
                    Button(action: send) {
                        Image(systemName: editing == nil ? "paperplane.fill" : "checkmark")
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Theme.accent))
                    }
                    .accessibilityLabel(editing == nil ? "Send" : "Save edit")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Theme.chat)
    }

    private func composerContext(_ text: Text, cancel: @escaping () -> Void) -> some View {
        HStack {
            text
            Spacer()
            Button(action: cancel) { Image(systemName: "xmark.circle.fill").frame(width: 30, height: 30) }
                .foregroundStyle(Theme.muted)
                .accessibilityLabel("Cancel")
        }
        .font(.footnote)
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(Theme.elevated)
    }

    private func send() {
        var text = draft
        // Picked mentions become real links, so they highlight and notify the person.
        var mentioned: [String] = []
        for (name, userId) in mentions where text.contains("@\(name)") {
            text = text.replacingOccurrences(of: "@\(name)", with: "[\(name)](https://matrix.to/#/\(userId))")
            mentioned.append(userId)
        }
        let reply = replyTo?.eventId
        let edited = editing
        draft = ""
        replyTo = nil
        editing = nil
        mentions = [:]
        Task {
            if let edited {
                await controller.edit(edited, text: text, mentions: mentioned)
            } else {
                await controller.send(text: text, replyTo: reply, mentions: mentioned)
            }
        }
    }

    /// Mentions are stored as Markdown links, the reverse of what `send` does.
    private static func readableMentions(in text: String) -> (text: String, mentions: [String: String]) {
        var mentions: [String: String] = [:]
        let readable = text.replacing(#/\[([^\]]+)\]\(https://matrix\.to/\#/(@[^)\s]+)\)/#) { match in
            mentions[String(match.1)] = String(match.2)
            return "@\(match.1)"
        }
        return (readable, mentions)
    }
}

struct ViewedImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

/// Full screen photo: pinch to zoom, drag when zoomed, share or save.
private struct ImageViewer: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .scaleEffect(scale)
                .offset(offset)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(MagnificationGesture()
                    .onChanged { scale = max(1, lastScale * $0) }
                    .onEnded { _ in
                        lastScale = scale
                        if scale == 1 { offset = .zero; lastOffset = .zero }
                    })
                .simultaneousGesture(DragGesture()
                    .onChanged { value in
                        guard scale > 1 else { return }
                        offset = CGSize(width: lastOffset.width + value.translation.width, height: lastOffset.height + value.translation.height)
                    }
                    .onEnded { value in
                        lastOffset = offset
                        if scale == 1 && value.translation.height > 120 { dismiss() }
                    })
                .onTapGesture(count: 2) {
                    withAnimation(.spring(response: 0.3)) {
                        scale = scale > 1 ? 1 : 2.5
                        lastScale = scale
                        offset = .zero
                        lastOffset = .zero
                    }
                }
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.headline).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Close")
                Spacer()
                ShareLink(item: Image(uiImage: image), preview: SharePreview("Image", image: Image(uiImage: image))) {
                    Image(systemName: "square.and.arrow.up").font(.headline).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Share or save")
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
        }
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
    var onProfile: () -> Void = {}
    var onReact: (String) -> Void = { _ in }
    var onImage: (UIImage) -> Void = { _ in }
    var onFile: (URL) -> Void = { _ in }

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
                    Button(action: onProfile) {
                        AvatarView(url: row.senderAvatar, name: row.senderName, size: 40, account: account)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(row.senderName), view profile")
                } else {
                    Color.clear.frame(width: 40, height: 1)
                }
                VStack(alignment: .leading, spacing: 3) {
                    if row.showsHeader {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Button(action: onProfile) {
                                Text(row.senderName).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.color(for: row.sender))
                            }
                            .buttonStyle(.plain)
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
            ChatImage(source: source, account: account, aspect: (width ?? 4) / max(height ?? 3, 1), onTap: onImage)
        case .file(let name, let source, _):
            FileAttachment(name: name, source: source, client: account.client, onOpen: onFile)
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
                Button { onReact(reaction.key) } label: {
                    HStack(spacing: 4) {
                        Text(reaction.key)
                        Text("\(reaction.count)").font(.caption.weight(.semibold))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(RoundedRectangle(cornerRadius: 8).fill(reaction.mine ? Theme.accent.opacity(0.3) : Theme.elevated))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(reaction.mine ? Theme.accent : .clear, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(reaction.key), \(reaction.count), \(reaction.mine ? "remove your reaction" : "add your reaction")")
            }
        }
        .padding(.top, 2)
    }

    private static let linkDetector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    /// Markdown plus tappable bare links, which Markdown alone leaves as plain text.
    private static func markdown(_ text: String) -> AttributedString {
        guard let parsed = try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
        else { return withBareLinks(AttributedString(text)) }
        return withBareLinks(withSafeLinks(parsed))
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

    private static func withBareLinks(_ parsed: AttributedString) -> AttributedString {
        var result = parsed
        let plain = String(result.characters)
        let matches = linkDetector?.matches(in: plain, range: NSRange(plain.startIndex..., in: plain)) ?? []
        for match in matches {
            guard let url = match.url, tappableSchemes.contains(url.scheme?.lowercased() ?? ""),
                  let range = Range(match.range, in: plain),
                  let start = AttributedString.Index(range.lowerBound, within: result),
                  let end = AttributedString.Index(range.upperBound, within: result),
                  result[start..<end].link == nil else { continue }
            result[start..<end].link = url
        }
        return result
    }
}

private struct ChatImage: View {
    let source: MediaSource
    let account: MatrixAccount
    let aspect: CGFloat
    let onTap: (UIImage) -> Void
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(Theme.elevated)
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else if failed {
                Image(systemName: "photo").foregroundStyle(Theme.faint)
            } else {
                ProgressView()
            }
        }
        .aspectRatio(aspect, contentMode: .fit)
        .frame(maxWidth: 280, maxHeight: 320, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onTapGesture {
            guard image != nil else { return }
            Task {
                // Show the original rather than the chat thumbnail.
                let full = await MediaLoader.shared.image(source: source, size: nil, accountId: account.id, client: account.client)
                if let shown = full ?? image { onTap(shown) }
            }
        }
        .task {
            image = await MediaLoader.shared.image(source: source, size: 800, accountId: account.id, client: account.client)
            failed = image == nil
        }
    }
}

private struct FileAttachment: View {
    let name: String
    let source: MediaSource
    let client: Client
    let onOpen: (URL) -> Void
    @State private var loading = false
    @State private var failed = false

    var body: some View {
        Button { Task { await open() } } label: {
            HStack(spacing: 10) {
                Image(systemName: failed ? "exclamationmark.triangle" : "arrow.down.circle.fill")
                    .foregroundStyle(failed ? Theme.danger : Theme.accent)
                Text(name).lineLimit(2).multilineTextAlignment(.leading).foregroundStyle(Theme.text)
                if loading { ProgressView() }
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.elevated))
        }
        .buttonStyle(.plain)
        .disabled(loading)
    }

    private func open() async {
        loading = true
        failed = false
        defer { loading = false }
        // Encrypted attachments need the SDK; the decrypted copy stays in the temporary folder.
        guard let data = try? await client.getMediaContent(mediaSource: source) else { failed = true; return }
        let filename = name.split(separator: " ").dropFirst().joined(separator: " ")
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let url = folder.appendingPathComponent(filename.isEmpty ? "file" : filename)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: url)
            onOpen(url)
        } catch { failed = true }
    }
}
