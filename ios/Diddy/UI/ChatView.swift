import MatrixRustSDK
import PhotosUI
import QuickLook
import SwiftUI
import UniformTypeIdentifiers

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
            let controller = TimelineController(room: room, ownUserId: account.userId,
                                                isDirect: account.summary(for: roomId)?.isDirect == true)
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
    @StateObject private var botCommands = BotCommandStore()
    @State private var draft = ""
    @State private var replyTo: MessageRow?
    @State private var editing: MessageRow?
    @State private var photos: [PhotosPickerItem] = []
    @State private var showPhotos = false
    @State private var showFiles = false
    @State private var showCamera = false
    @State private var showEmoji = false
    @State private var packs: [ImagePack] = []
    @State private var tokens: [String: ComposerToken] = [:]
    @State private var selection = NSRange(location: 0, length: 0)
    @State private var restoredReplyId: String?
    @State private var pendingFiles: [ComposerPendingFile] = []
    @State private var attachmentCaption = ""
    @State private var sending = false
    @State private var draftLoaded = false
    @StateObject private var recorder = VoiceRecorder()
    @State private var showMembers = false
    @State private var showInfo = false
    @State private var showSearch = false
    @State private var searchContext: SearchEventTarget?
    @EnvironmentObject private var navigator: AppNavigator
    @State private var profile: ProfileTarget?
    @State private var viewedImage: ViewedImage?
    @State private var openedFile: URL?
    /// The message the full emoji picker reacts to.
    @State private var reactingTo: MessageRow?
    /// Whether the chat follows the newest message. Only the user scrolling up turns this off.
    @State private var atBottom = true
    @State private var bottomVisible = false
    /// Set by a drag, so the end leaving the screen can be told apart from content growing above it.
    @State private var userScrolled = false
    @State private var mentions: [String: String] = [:]
    @State private var canSend = true
    /// Timeline navigation and the extra message actions (TimelineNavViews.swift).
    @State private var navSheet: TimelineNavSheet?
    @State private var jumpTarget: TimelineJumpTarget?
    @State private var highlightedRowId: String?
    @State private var unreadSeen = false
    @State private var unreadDismissed = false
    @FocusState private var composerFocused: Bool

    private var title: String { summary?.name ?? "Channel" }
    private var roomId: String { controller.room.id() }
    private var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            if !isVoiceChat { CallBanner(account: account, summary: summary, roomId: roomId, title: title) }
            messages
            typingLine
            followingLine
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
                    // Like desktop: the other person's picture in a DM and no lock (the channel
                    // details opened from here say whether the room is encrypted).
                    HStack(spacing: 8) {
                        if let summary, summary.isDirect {
                            AvatarView(url: summary.avatarUrl, name: title, size: 24, account: account)
                                .overlay(alignment: .bottomTrailing) { PresenceDot(userId: summary.dmUserId, account: account, size: 8, ring: Theme.chat, onDemand: true).offset(x: 2, y: 2) }
                        } else {
                            Image(systemName: "number").foregroundStyle(Theme.faint)
                        }
                        Text(title).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
                    }
                }
                .accessibilityLabel("\(title), channel details")
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                RoomNotifyMenuButton(account: account, roomId: roomId)
                Button { showSearch = true } label: { Image(systemName: "magnifyingglass") }
                    .accessibilityLabel("Search messages")
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
                Menu {
                    Button { navSheet = .pinned } label: { Label("Pinned Messages", systemImage: "pin") }
                    Button { navSheet = .jumpToDate } label: { Label("Jump to Time", systemImage: "calendar") }
                } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityLabel("More")
            }
        }
        .sheet(item: $navSheet) { sheet in
            TimelineNavSheetView(account: account, controller: controller, sheet: sheet) { eventId in
                navSheet = nil
                jumpTarget = TimelineJumpTarget(eventId: eventId)
            }
        }
        .sheet(isPresented: $showSearch) { MessageSearchView(account: account, roomId: roomId) }
        .sheet(item: $searchContext) { SearchContextView(account: account, target: $0) }
        .sheet(isPresented: $showMembers) { MembersView(account: account, roomId: roomId) }
        .sheet(isPresented: $showInfo) { ChannelInfoView(account: account, roomId: roomId) }
        .sheet(item: $profile) { UserProfileSheet(account: account, userId: $0.userId, roomId: roomId) }
        .sheet(item: $reactingTo) { row in
            EmojiReactionPicker { emoji in Task { await controller.toggleReaction(emoji, on: row) } }
        }
        .fullScreenCover(item: $viewedImage) { ImageViewer(image: $0.image) }
        .quickLookPreview($openedFile)
        .alert("Message", isPresented: Binding(get: { controller.sendError != nil }, set: { if !$0 { controller.sendError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(controller.sendError ?? "") }
        .photosPicker(isPresented: $showPhotos, selection: $photos, maxSelectionCount: 20, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): Task { await addFiles(urls, images: []) }
            case .failure(let error): controller.sendError = error.localizedDescription
            }
        }
        .sheet(isPresented: $showCamera) { ComposerCamera { image in Task { await addFiles([], images: [image]) } } }
        .sheet(isPresented: $showEmoji) {
            ComposerEmojiPicker(account: account, packs: packs, onEmoji: { emoji in insertText(emoji); showEmoji = false }, onCustom: { image, sticker in
                showEmoji = false
                if sticker {
                    Task {
                        do {
                            let content: [String: Any] = ["body": image.body ?? image.shortcode, "url": image.url,
                                "info": ["w": image.width ?? 256, "h": image.height ?? 256, "mimetype": image.mimetype ?? "image/png"]]
                            let data = try JSONSerialization.data(withJSONObject: content)
                            _ = try await controller.room.sendRaw(eventType: "m.sticker", content: String(decoding: data, as: UTF8.self))
                        } catch { controller.sendError = error.friendlyMessage }
                    }
                } else {
                    let key = ":" + image.shortcode + ":"
                    tokens[key] = .emoticon(mxc: image.url, shortcode: image.shortcode)
                    insertText(key)
                }
            })
        }
        .onChange(of: photos) { items in
            Task {
                for item in items {
                    do {
                        guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                        let type = item.supportedContentTypes.first ?? .data
                        await addData(data, name: "attachment." + (type.preferredFilenameExtension ?? "bin"), mime: type.preferredMIMEType ?? "application/octet-stream")
                    } catch { controller.sendError = error.friendlyMessage }
                }
                photos = []
            }
        }
        .onChange(of: draft) { text in
            controller.setTyping(!text.isEmpty && editing == nil)
            saveDraft()
        }
        .onChange(of: replyTo?.id) { _ in saveDraft() }
        .onAppear {
            Sounds.shared.openRoomId = roomId
            if !draftLoaded {
                if let saved = ComposerDraftStore.load(accountId: account.id, roomId: roomId) {
                    draft = saved.text; tokens = saved.tokens; restoredReplyId = saved.replyEventId
                    selection = NSRange(location: (draft as NSString).length, length: 0)
                }
                draftLoaded = true
            }
        }
        .onDisappear {
            saveDraft()
            controller.setTyping(false)
            if Sounds.shared.openRoomId == roomId { Sounds.shared.openRoomId = nil }
        }
        .task { packs = await ComposerServices.packs(account: account, roomId: roomId) }
        .task {
            await account.loadDiddyProfiles()
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
                        ChannelIntro(title: title, summary: summary, account: account)
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
                        if !unreadDismissed, dividerRowId == row.id {
                            NewMessagesDivider().onAppear { unreadSeen = true }
                        }
                        MessageRowView(
                            row: row,
                            account: account,
                            roomId: roomId,
                            onProfile: { profile = ProfileTarget(userId: row.sender) },
                            onMention: { profile = ProfileTarget(userId: $0) },
                            onReact: { key in Task { await controller.toggleReaction(key, on: row) } },
                            onImage: { viewedImage = ViewedImage(image: $0) },
                            onFile: { openedFile = $0 },
                            onCardCommand: { command in Task { await controller.sendCardAction(command) } },
                            onReplyTap: { openReply(of: row) },
                            onReactionInfo: { key in showReactors(of: row, key: key) }
                        )
                        .id(row.id)
                        .background(highlightedRowId == row.id ? Theme.accent.opacity(0.18) : Color.clear)
                        .swipeToReply {
                            // The swipe is also a drag of the chat; at the end it must keep following.
                            if bottomVisible { userScrolled = false }
                            reply(to: row)
                        }
                        .contextMenu { menu(for: row) }
                        if let info = controller.nav.snapshot.threads[row.id], let eventId = row.remoteEventId {
                            ThreadSummaryButton(info: info) { navSheet = .thread(root: eventId) }
                        }
                        if controller.nav.isPinned(row.remoteEventId) { PinnedMarker() }
                    }
                    Color.clear.frame(height: 8).id("bottom")
                        .onAppear {
                            atBottom = true
                            bottomVisible = true
                            userScrolled = false
                            controller.markRead()
                        }
                        .onDisappear {
                            bottomVisible = false
                            // Only a finger leaves the newest message. Anything else that pushes it
                            // out of view (older pages, images and names arriving late, the
                            // keyboard) is undone, however long after opening it happens. VoiceOver
                            // scrolls without a drag, so it is always taken as the user's own.
                            if userScrolled || UIAccessibility.isVoiceOverRunning {
                                atBottom = false
                            } else {
                                proxy.scrollTo("bottom", anchor: .bottom)
                            }
                        }
                }
            }
            .stickToBottom()
            .scrollDismissesKeyboard(.interactively)
            .simultaneousGesture(DragGesture(minimumDistance: 10)
                .onChanged { _ in userScrolled = true }
                .onEnded { _ in
                    // A small drag that stays at the bottom keeps following new content. The
                    // check waits for a fling to carry the list away first.
                    Task {
                        try? await Task.sleep(nanoseconds: 600_000_000)
                        if bottomVisible { userScrolled = false }
                    }
                })
            .onChange(of: controller.rows.count) { _ in
                // The lazy list only estimates the height of rows it has not drawn yet, so one
                // jump can land short of the end; follow up while the chat is meant to be there.
                guard atBottom, !userScrolled else { return }
                proxy.scrollTo("bottom", anchor: .bottom)
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
            .task(id: "\(navigator.searchTarget?.id ?? "")|\(showSearch)") {
                guard !showSearch, let target = navigator.searchTarget, target.roomId == roomId else { return }
                navigator.searchTarget = nil
                if let row = controller.rows.first(where: {
                    if case .eventId(let id)? = $0.eventId { return id == target.eventId }
                    return false
                }) {
                    atBottom = false
                    proxy.scrollTo(row.id, anchor: .center)
                } else { searchContext = target }
            }
            .task(id: jumpTarget?.id) {
                guard let target = jumpTarget else { return }
                await jump(to: target.eventId, proxy: proxy)
            }
            .overlay(alignment: .top) {
                if showsUnreadPill {
                    JumpToUnreadPill(
                        onJump: { Task { await jumpToUnread(proxy: proxy) } },
                        onMarkRead: { unreadDismissed = true; controller.markRead() }
                    )
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !atBottom {
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Theme.text)
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

    // MARK: Moving around the chat

    private var dividerRowId: String? { controller.nav.dividerRowId(me: account.userId) }

    private var unread: TimelineNav.Unread {
        controller.nav.unread(me: account.userId, reachedStart: controller.reachedStart)
    }

    private var showsUnreadPill: Bool {
        guard !unreadDismissed, !unreadSeen else { return false }
        return unread != .none
    }

    /// Shows a message, loading older ones first when it is further back; the sheet of the
    /// surrounding messages is the way out for a message that cannot be reached.
    private func jump(to eventId: String, proxy: ScrollViewProxy) async {
        guard let rowId = await controller.loadRowId(forEvent: eventId) else {
            searchContext = SearchEventTarget(roomId: roomId, eventId: eventId)
            return
        }
        userScrolled = true
        atBottom = false
        proxy.scrollTo(rowId, anchor: .center)
        highlightedRowId = rowId
        // The lazy list only estimates the height of rows it has not drawn yet.
        try? await Task.sleep(nanoseconds: 300_000_000)
        proxy.scrollTo(rowId, anchor: .center)
        try? await Task.sleep(nanoseconds: 1_700_000_000)
        if highlightedRowId == rowId { highlightedRowId = nil }
    }

    private func jumpToUnread(proxy: ScrollViewProxy) async {
        if unread == .notLoaded, let readUpTo = controller.nav.readUpTo {
            _ = await controller.loadRowId(forEvent: readUpTo)
        }
        guard case .divider(let rowId) = unread else { return }
        userScrolled = true
        atBottom = false
        proxy.scrollTo(rowId, anchor: .top)
        try? await Task.sleep(nanoseconds: 300_000_000)
        proxy.scrollTo(rowId, anchor: .top)
    }

    private func openReply(of row: MessageRow) {
        guard let target = controller.nav.snapshot.replyTargets[row.id] else { return }
        jumpTarget = TimelineJumpTarget(eventId: target)
    }

    private func showReactors(of row: MessageRow, key: String) {
        navSheet = .reactions(key: key, senders: controller.nav.snapshot.reactionSenders[row.id]?[key] ?? [])
    }

    /// Who has read the newest message, under the chat.
    @ViewBuilder
    private var followingLine: some View {
        let readers = controller.nav.latestReaders
        if !readers.isEmpty {
            TimelineFollowingLine(names: readers.map { account.name(of: $0) }) {
                if let latest = controller.nav.latestShownEventId { navSheet = .readers(eventId: latest) }
            }
            .onAppear { account.resolveProfiles(readers, in: roomId) }
        }
    }

    /// The desktop's extra message actions: thread, read receipts, pin, link, source, history, report.
    @ViewBuilder
    private func navMenu(for row: MessageRow) -> some View {
        if row.layoutKind == .message, !row.isRedactedMessage, let eventId = row.remoteEventId {
            Button {
                let root = controller.nav.snapshot.entries.first(where: { $0.eventId == eventId })?.threadRoot
                navSheet = .thread(root: root ?? eventId)
            } label: { Label("Reply in Thread", systemImage: "bubble.left.and.bubble.right") }
            if !controller.nav.readers(of: eventId).isEmpty {
                Button { navSheet = .readers(eventId: eventId) } label: { Label("Read Receipts", systemImage: "checkmark.circle") }
            }
            if controller.nav.canPin {
                let pinned = controller.nav.isPinned(eventId)
                Button {
                    Task { await controller.setPinned(eventId: eventId, pinned: !pinned) }
                } label: { Label(pinned ? "Unpin Message" : "Pin Message", systemImage: pinned ? "pin.slash" : "pin") }
            }
            Button {
                Task { if let link = await controller.permalink(of: eventId) { UIPasteboard.general.string = link } }
            } label: { Label("Copy Link", systemImage: "link") }
            if row.isEdited {
                Button { navSheet = .history(row) } label: { Label("Edit History", systemImage: "clock.arrow.circlepath") }
            }
            Button { navSheet = .source(row) } label: { Label("View Source", systemImage: "curlybraces") }
            if !row.isOwn {
                Button(role: .destructive) { navSheet = .report(eventId: eventId) } label: { Label("Report", systemImage: "exclamationmark.bubble") }
            }
        }
    }

    private func reply(to row: MessageRow) {
        replyTo = row
        restoredReplyId = nil
        editing = nil
        composerFocused = true
    }

    @ViewBuilder
    private func menu(for row: MessageRow) -> some View {
        Button { reply(to: row) } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
        Menu {
            ForEach(ReactionEmoji.quick, id: \.self) { emoji in
                Button(emoji) { Task { await controller.toggleReaction(emoji, on: row) } }
            }
            Divider()
            Button { reactingTo = row } label: { Label("More Emoji…", systemImage: "plus") }
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
        navMenu(for: row)
        Button { profile = ProfileTarget(userId: row.sender) } label: { Label("View Profile", systemImage: "person.crop.circle") }
        if row.layoutKind == .message, row.eventId != nil,
           TimelineNav.canDelete(isOwn: row.isOwn, isRedacted: row.isRedactedMessage,
                                 canRedactOwn: controller.nav.canRedactOwn, canRedactOther: controller.nav.canRedactOther) {
            Button(role: .destructive) { navSheet = .delete(row) } label: {
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
        selection = NSRange(location: (draft as NSString).length, length: 0)
        saveDraft()
    }

    private var composer: some View {
        VStack(spacing: 0) {
            BotCommandSuggestions(store: botCommands, draft: $draft, room: controller.room, account: account, enabled: editing == nil)
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
            composerSuggestions
            if !pendingFiles.isEmpty {
                VStack(alignment: .leading) {
                    ForEach(pendingFiles) { file in
                        HStack {
                            Text(file.name).lineLimit(1)
                            Text(ComposerSize.text(Int64(file.data.count))).font(.caption)
                            Button { pendingFiles.removeAll { $0.id == file.id } } label: { Image(systemName: "xmark.circle") }.disabled(sending)
                        }
                    }
                    TextField("Caption (optional)", text: $attachmentCaption)
                    if controller.uploadingAttachment {
                        HStack { ProgressView(); Text("Uploading…"); Button("Cancel") { controller.cancelAttachment() } }
                    }
                }.padding(12)
            }
            if ChatSettings.editorToolbar {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(ComposerFormat.allCases) { format in
                            Button(format.title) {
                                let result = format.apply(to: draft, selection: selection)
                                draft = result.text; selection = result.selection
                            }.font(.caption).padding(6)
                        }
                    }.padding(.horizontal, 12)
                }
            }
            if replyTo == nil, restoredReplyId != nil {
                composerContext(Text("Replying to saved message")) { restoredReplyId = nil; saveDraft() }
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
                    Menu {
                        Button("Photos and videos") { showPhotos = true }
                        Button("Files") { showFiles = true }
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button("Camera") { showCamera = true }
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill").font(.system(size: 26)).foregroundStyle(Theme.muted)
                    }
                    Button { showEmoji = true } label: { Image(systemName: "face.smiling").font(.system(size: 22)) }
                }
                ComposerEditor(text: $draft, selection: $selection, isFocused: composerFocused, onFocus: { composerFocused = $0 }, onSend: send, onFiles: { urls, images in
                    Task { await addFiles(urls, images: images) }
                })
                    .frame(height: min(140, max(38, CGFloat(draft.components(separatedBy: "\n").count) * 22 + 16)))
                    .overlay(alignment: .leading) {
                        if draft.isEmpty { Text("Message \(title)").foregroundStyle(Theme.muted).padding(.leading, 10).allowsHitTesting(false) }
                    }
                    .background(RoundedRectangle(cornerRadius: 20).fill(Theme.input))
                if !trimmedDraft.isEmpty || !pendingFiles.isEmpty {
                    Button(action: send) {
                        Image(systemName: editing == nil ? "paperplane.fill" : "checkmark")
                            .foregroundStyle(Theme.onAccent)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Theme.accent))
                    }
                    .disabled(sending)
                    .accessibilityLabel(editing == nil ? "Send" : "Save edit")
                } else if editing == nil {
                    VoiceMicButton(recorder: recorder)
                }
            }
            .overlay { if recorder.isActive { VoiceRecordingBar(recorder: recorder, onSend: sendVoice) } }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Theme.chat)
    }

    private func sendVoice() async {
        guard let recording = recorder.stop() else { return }
        var reply = replyTo?.eventId
        if reply == nil, let id = restoredReplyId { reply = .eventId(eventId: id) }
        if await controller.sendVoice(recording, inReplyTo: reply) {
            replyTo = nil; restoredReplyId = nil; saveDraft()
        } else { recorder.restore(recording) }
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
        guard !sending, !trimmedDraft.isEmpty || !pendingFiles.isEmpty else { return }
        let original = draft
        var allTokens = tokens
        for (name, id) in mentions { allTokens["@" + name] = .user(id: id) }
        let command = editing == nil ? SlashCommand.command(in: draft) : nil
        var reply = replyTo?.eventId
        if reply == nil, let id = restoredReplyId { reply = .eventId(eventId: id) }
        let edited = editing
        let message = ComposerFormatter.message(from: draft, tokens: allTokens, markdown: ChatSettings.markdown,
            command: command?.sendsMessage == true ? command : nil, isReply: reply != nil,
            replyUserId: replyTo?.sender, ownUserId: account.userId)
        let files = pendingFiles
        let caption = attachmentCaption.isEmpty ? original : attachmentCaption
        sending = true
        Task {
            var success = true
            if !files.isEmpty {
                for file in files {
                    if await controller.sendAttachment(data: file.data, filename: file.name, mime: file.mime, caption: caption, replyTo: reply) {
                        pendingFiles.removeAll { $0.id == file.id }
                    } else { success = false; break }
                }
            } else if let command, !command.sendsMessage {
                do { try await ComposerServices.run(command, draft: original, account: account, roomId: roomId) }
                catch { controller.sendError = error.friendlyMessage; success = false }
            } else if let edited {
                if let message { success = await controller.editComposed(edited, message: message) }
            } else if let message {
                success = await controller.sendComposed(message, command: command, replyTo: reply)
            }
            if success, draft == original {
                draft = ""; mentions = [:]; tokens = [:]; replyTo = nil; restoredReplyId = nil; editing = nil
                attachmentCaption = ""; selection = NSRange(location: 0, length: 0)
                saveDraft()
            }
            sending = false
        }
    }

    private func saveDraft() {
        guard draftLoaded, editing == nil else { return }
        var replyId = restoredReplyId
        if case .eventId(let id)? = replyTo?.eventId { replyId = id }
        var savedTokens = tokens
        for (name, id) in mentions { savedTokens["@" + name] = .user(id: id) }
        ComposerDraftStore.save(ComposerDraft(text: draft, tokens: savedTokens, replyEventId: replyId), accountId: account.id, roomId: roomId)
    }

    private func insertText(_ text: String) {
        let ns = draft as NSString
        let start = min(selection.location, ns.length)
        let length = min(selection.length, ns.length - start)
        draft = ns.replacingCharacters(in: NSRange(location: start, length: length), with: text)
        selection = NSRange(location: start + (text as NSString).length, length: 0)
    }

    private var composerSuggestions: some View {
        VStack(alignment: .leading) {
            if editing == nil {
                ForEach(SlashCommand.suggestions(for: draft).prefix(6)) { command in
                    Button("/" + command.rawValue + " — " + command.description) { draft = "/" + command.rawValue + " "; selection = NSRange(location: (draft as NSString).length, length: 0) }
                        .font(.caption).lineLimit(2)
                }
            }
            if case .room(let query) = ComposerQuery.current(in: draft) {
                ForEach(account.rooms.filter { $0.isJoined && !$0.isSpace && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }.prefix(6)) { room in
                    Button("#" + room.name) {
                        let key = "#" + room.name
                        tokens[key] = .room(id: room.canonicalAlias ?? room.id, via: [])
                        draft = ComposerQuery.replacingWord(in: draft, with: key + " ")
                        selection = NSRange(location: (draft as NSString).length, length: 0)
                    }
                }
            }
            if case .emoticon(let query) = ComposerQuery.current(in: draft) {
                ForEach(EmojiCatalog.search(query, limit: 5)) { emoji in
                    Button(emoji.unicode + " :" + emoji.shortcode + ":") {
                        draft = ComposerQuery.replacingWord(in: draft, with: emoji.unicode + " ")
                        selection = NSRange(location: (draft as NSString).length, length: 0)
                    }
                }
                ForEach(Array(packs.flatMap { $0.images(for: ImagePack.emoticon) }.filter { ImagePack.matches($0, query) }.prefix(5).enumerated()), id: \.offset) { _, image in
                    Button(":" + image.shortcode + ":") {
                        let key = ":" + image.shortcode + ":"
                        tokens[key] = .emoticon(mxc: image.url, shortcode: image.shortcode)
                        draft = ComposerQuery.replacingWord(in: draft, with: key + " ")
                        selection = NSRange(location: (draft as NSString).length, length: 0)
                    }
                }
            }
        }.padding(.horizontal, 12)
    }

    private func addData(_ data: Data, name: String, mime: String) async {
        do {
            let config = try await account.clientRequest("/_matrix/media/v3/config")
            guard !ComposerSize.exceeds(Int64(data.count), limit: ComposerSize.uploadLimit(from: config)) else {
                throw DiddyError("File exceeds the server upload limit.")
            }
            pendingFiles.append(ComposerPendingFile(name: name, mime: mime, data: data))
        } catch { controller.sendError = error.friendlyMessage }
    }

    private func addFiles(_ urls: [URL], images: [UIImage]) async {
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url)
                let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                await addData(data, name: url.lastPathComponent, mime: mime)
            } catch { controller.sendError = error.friendlyMessage }
        }
        for image in images {
            if let data = image.jpegData(compressionQuality: 0.85) { await addData(data, name: "image.jpg", mime: "image/jpeg") }
        }
    }

    /// Mentions are stored as Markdown links, the reverse of what `send` does.
    private static func readableMentions(in text: String) -> (text: String, mentions: [String: String]) {
        var mentions: [String: String] = [:]
        let readable = text.replacing(#/\[([^\]]+)\]\(https://matrix\.to/\#/(@[^)\s]+)\)/#) { match in
            let name = String(match.1).replacingOccurrences(of: "\\", with: "")
            mentions[name] = String(match.2)
            return "@\(name)"
        }
        return (readable, mentions)
    }
}

private extension View {
    /// From iOS 17 the scroll view itself opens at the end and, from iOS 18, stays anchored there
    /// when content changes size. Older systems rely on the bottom marker in the chat alone.
    @ViewBuilder
    func stickToBottom() -> some View {
        if #available(iOS 17.0, *) {
            defaultScrollAnchor(.bottom)
        } else {
            self
        }
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
                SaveImageButton(image: image)
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
    let summary: RoomSummary?
    let account: MatrixAccount

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let summary, summary.isDirect {
                // Discord's start of a DM: the other person's big picture, then the name.
                AvatarView(url: summary.avatarUrl, name: title, size: 80, account: account)
                    .padding(.bottom, 4)
                Text(title).font(.title2.bold()).foregroundStyle(Theme.text)
                Text("This is the beginning of your direct message history with \(title).")
                    .foregroundStyle(Theme.muted)
            } else {
                Image(systemName: "number")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 68, height: 68)
                    .background(Circle().fill(Theme.elevated))
                Text("Welcome to #\(title)!").font(.title2.bold()).foregroundStyle(Theme.text)
                Text("This is the start of the #\(title) channel.")
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 40)
        .padding(.bottom, 8)
    }
}

struct MessageRowView: View {
    @EnvironmentObject private var navigator: AppNavigator
    let row: MessageRow
    /// The account this timeline belongs to; its client loads the avatars and images.
    let account: MatrixAccount
    /// Where names of mentioned people are looked up first.
    var roomId = ""
    var onProfile: () -> Void = {}
    var onMention: (String) -> Void = { _ in }
    var onReact: (String) -> Void = { _ in }
    var onImage: (UIImage) -> Void = { _ in }
    var onFile: (URL) -> Void = { _ in }
    var onCardCommand: (String) -> Void = { _ in }
    /// Tapping the quote of a reply shows the message it answers.
    var onReplyTap: () -> Void = {}
    /// Long-pressing a reaction asks who reacted.
    var onReactionInfo: (String) -> Void = { _ in }
    /// Badges grow with the name next to them when the text size changes.
    @ScaledMetric(relativeTo: .subheadline) private var badgeSize: CGFloat = 13

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let day = row.dayDivider {
                HStack {
                    Rectangle().fill(Theme.elevated).frame(height: 1)
                    Text(day.formatted(date: .long, time: .omitted)).font(.caption2.weight(.semibold)).foregroundStyle(Theme.faint)
                    Rectangle().fill(Theme.elevated).frame(height: 1)
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 4)
            }
            if case .notice(let text) = row.body {
                notice(text)
            } else {
                message
            }
        }
    }

    /// A quiet line about the room. The day is in the divider above, so the time is enough.
    private func notice(_ text: String) -> some View {
        let symbol = noticeSymbol
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            // In the avatar column, so the text lines up with the messages.
            Image(systemName: symbol.name).font(.caption).foregroundStyle(symbol.color)
                .frame(width: 40)
                .accessibilityHidden(true)
            Text(text).font(.footnote).foregroundStyle(Theme.muted)
            Text(ChatSettings.time(row.date)).font(.caption2).foregroundStyle(Theme.faint)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 2)
    }

    /// Discord's green arrow for joins only; every other change gets a neutral symbol of its own.
    private var noticeSymbol: (name: String, color: Color) {
        switch row.membership {
        case .joined?: return ("arrow.right", Theme.online)
        case .invited?: return ("person.badge.plus", Theme.faint)
        case .left?, .removed?: return ("arrow.left", Theme.faint)
        case .banned?: return ("nosign", Theme.faint)
        case .unbanned?: return ("arrow.uturn.backward", Theme.faint)
        case .declined?: return ("xmark", Theme.faint)
        case nil: return ("phone.fill", Theme.faint)
        }
    }

    private var message: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let reply = row.reply {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.turn.up.right").font(.caption2).foregroundStyle(Theme.faint)
                    Text("@\(reply.sender)").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                    Text(MentionText.readable(reply.text) { account.name(of: $0) }).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                }
                .padding(.leading, 64)
                .contentShape(Rectangle())
                .onTapGesture(perform: onReplyTap)
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
                                DiddyName(
                                    name: row.senderName,
                                    profile: account.diddyProfiles[row.sender],
                                    font: .subheadline.weight(.semibold),
                                    size: 15,
                                    fallback: Theme.color(for: row.sender)
                                )
                            }
                            .buttonStyle(.plain)
                            if let badges = account.diddyBadges[row.sender] { DiddyBadges(badges: badges, size: badgeSize, account: account) }
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
        .padding(.bottom, mentionsMe ? 4 : 0)
        .background(mentionsMe ? Theme.accent.opacity(0.1) : .clear)
        .overlay(alignment: .leading) {
            if mentionsMe { Rectangle().fill(Theme.accent).frame(width: 3) }
        }
        .opacity(row.isPending ? 0.6 : 1)
    }

    @ViewBuilder
    private var content: some View {
        switch row.body {
        case .text where row.card != nil:
            if let card = row.card { BotCardView(card: card, account: account, onCommand: onCardCommand) }
        case .text(let text):
            (Text(rendered(text)) + Text(row.isEdited ? " (edited)" : "").font(.caption2).foregroundColor(Theme.faint))
                .foregroundStyle(Theme.text)
                .textSelection(.enabled)
                .environment(\.openURL, OpenURLAction { url in
                    switch MatrixToLink.parse(url.absoluteString) {
                    case .room(let address, let via):
                        navigator.shellLink = ShellRoomLink(address: address, via: via)
                        return .handled
                    case .event(let address, let eventId, let via):
                        navigator.shellLink = ShellRoomLink(address: address, via: via, eventId: eventId)
                        return .handled
                    default: break
                    }
                    guard let userId = MentionText.userId(in: url) else { return .systemAction }
                    onMention(userId)
                    return .handled
                })
                .onAppear {
                    let unknown = MentionText.userIds(in: text).filter { account.profiles[$0] == nil }
                    if !unknown.isEmpty { account.resolveProfiles(unknown, in: roomId) }
                }
        case .image(let source, _, let width, let height):
            ChatImage(source: source, account: account, aspect: (width ?? 4) / max(height ?? 3, 1), onTap: onImage)
        case .audio(let audio):
            VoiceMessageView(id: row.id, audio: audio, account: account)
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
                .contextMenu {
                    Button { onReactionInfo(reaction.key) } label: { Label("Who Reacted", systemImage: "person.2") }
                }
                .accessibilityLabel("\(reaction.key), \(reaction.count), \(reaction.mine ? "remove your reaction" : "add your reaction")")
            }
        }
        .padding(.top, 2)
    }

    /// True when the message names you or the whole room, which Discord marks with a coloured bar.
    private var mentionsMe: Bool {
        guard !row.isOwn, case .text(let text) = row.body else { return false }
        return text.contains("@room") || MentionText.userIds(in: text).contains(account.userId)
    }

    /// The message with mentions as highlighted names. Bare ids (how Diddy desktop writes them into
    /// the plain body) are first turned into links named after the person.
    private func rendered(_ text: String) -> AttributedString {
        let linked = MentionText.linkingBareIds(in: text) { account.name(of: $0) }
        let parsed = Self.markdown(linked)
        var result = AttributedString()
        var previousLink: URL?
        for run in parsed.runs {
            var piece = AttributedString(parsed[run.range])
            if let link = run.link, let userId = MentionText.userId(in: link) {
                // A name split into several runs (bold inside, say) gets its "@" only once.
                if link != previousLink, !String(piece.characters).hasPrefix("@") {
                    var at = AttributedString("@")
                    at.link = link
                    piece = at + piece
                }
                piece.font = .body.weight(.semibold)
                piece.backgroundColor = (userId == account.userId ? Theme.accent : Theme.accent.opacity(0.6)).opacity(0.25)
            }
            previousLink = run.link
            result.append(piece)
        }
        return result
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
    /// Off until tapped when Settings > Chat says not to load pictures by themselves.
    @State private var requested = ChatSettings.autoLoadMedia

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(Theme.elevated)
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else if failed {
                Image(systemName: "photo").foregroundStyle(Theme.faint)
            } else if !requested {
                Label("Tap to load", systemImage: "photo").font(.footnote).foregroundStyle(Theme.muted)
            } else {
                ProgressView()
            }
        }
        .aspectRatio(aspect, contentMode: .fit)
        .frame(maxWidth: 280, maxHeight: 320, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onTapGesture {
            guard requested else { requested = true; return }
            guard image != nil else { return }
            Task {
                // Show the original rather than the chat thumbnail.
                let full = await MediaLoader.shared.image(source: source, size: nil, accountId: account.id, client: account.client)
                if let shown = full ?? image { onTap(shown) }
            }
        }
        .task(id: requested) {
            guard requested else { return }
            image = await MediaLoader.shared.image(source: source, size: 800, accountId: account.id, client: account.client)
            failed = image == nil
        }
        .accessibilityHint(requested ? "" : "Loads the picture")
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

private struct ComposerPendingFile: Identifiable {
    let id = UUID()
    let name: String
    let mime: String
    let data: Data
}
