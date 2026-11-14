import Combine
import Foundation
import MatrixRustSDK
import UIKit

/// One row of the chat, already shaped for the Discord-style message list.
struct ReactionChip: Hashable {
    let key: String
    let count: Int
    let mine: Bool
}

struct MessageRow: Identifiable {
    enum Body {
        case text(String)
        case image(MediaSource, filename: String, width: CGFloat?, height: CGFloat?)
        case file(String, source: MediaSource, mimeType: String?)
        case audio(AudioAttachment)
        case notice(String)
        case undecryptable
        case redacted
    }

    let id: String
    let eventId: EventOrTransactionId?
    let sender: String
    let senderName: String
    let senderAvatar: String?
    let date: Date
    let body: Body
    let isOwn: Bool
    let isEdited: Bool
    let reply: (sender: String, senderId: String, text: String, avatar: String?)?
    let reactions: [ReactionChip]
    /// Discord shows name and avatar only on the first message of a burst from one sender.
    var showsHeader: Bool
    var dayDivider: Date?
    let isPending: Bool
    /// Structured card of a bot message (`dev.diddy.card`); the plain text stays in `body`.
    var card: BotCard? = nil
    /// A shared song (`app.diddy.music`), drawn like iMessage's lyrics card.
    var music: MusicCard? = nil
    /// The change a membership line is about, for its symbol.
    var membership: TimelineLayout.Membership? = nil
    /// Formatted text (HTML or Markdown block syntax); nil keeps the plain rendering of `body`.
    var rich: RichSource? = nil
    var richItalic = false
    /// Web links to preview under the message (empty when previews are off).
    var previewURLs: [String] = []
    /// The chat is encrypted: the app reads the previews itself instead of asking the homeserver.
    var previewsLocal = false
    /// A video message; `body` is its file line, which a client without a player shows.
    var video: VideoAttachment? = nil
    var location: LocationAttachment? = nil
    /// Text sent with a photo, file or audio, shown under it.
    var caption: String? = nil
    var captionRich: RichSource? = nil
    var isSticker = false
    /// Calls this line stands for: 0 for anything but a call, more than 1 for a folded run.
    var callCount = 0
    /// When the last call of a folded run started.
    var lastCallDate: Date?

    var layoutKind: TimelineLayout.Kind {
        if case .notice = body { return .notice }
        return .message
    }
}

@MainActor
final class TimelineController: ObservableObject {
    @Published private(set) var rows: [MessageRow] = []
    @Published private(set) var reachedStart = false
    @Published private(set) var loading = false
    @Published var sendError: String?
    @Published private(set) var typingUserIds: [String] = []

    let room: Room
    let ownUserId: String
    /// A direct message leaves out the joins and invites that set it up.
    let isDirect: Bool
    /// Not the live chat but one thread or the pinned messages, when set.
    let focus: TimelineFocus?
    /// Read receipts, threads, pins and the other things the chat shows beside its rows.
    let nav = TimelineNavModel()
    private var navObserver: AnyCancellable?
    private(set) var timeline: Timeline?
    private(set) var items: [TimelineItem] = []
    private var listener: TaskHandle?
    private var typingListener: TaskHandle?
    private var isTyping = false
    /// Whether the room is encrypted: link previews follow a separate setting there.
    private var roomEncrypted = false

    init(room: Room, ownUserId: String, isDirect: Bool = false, focus: TimelineFocus? = nil) {
        self.room = room
        self.ownUserId = ownUserId
        self.isDirect = isDirect
        self.focus = focus
        navObserver = nav.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
    }

    deinit {
        listener?.cancel()
        typingListener?.cancel()
    }

    func start() async {
        guard timeline == nil else { return }
        do {
            let timeline: Timeline
            if let focus {
                timeline = try await room.timelineWithConfiguration(configuration: TimelineConfiguration(
                    focus: focus, filter: .all, internalIdPrefix: "diddy-focus", dateDividerMode: .daily,
                    trackReadReceipts: .disabled, reportUtds: false))
            } else {
                timeline = try await room.timeline()
            }
            self.timeline = timeline
            roomEncrypted = await room.isEncrypted()
            listener = await timeline.addListener(listener: TimelineUpdates { [weak self] diffs in
                Task { @MainActor in self?.apply(diffs) }
            })
            let me = ownUserId
            if focus == nil { await nav.start(room: room) }
            typingListener = room.subscribeToTypingNotifications(listener: TypingUpdates { [weak self] ids in
                Task { @MainActor in self?.typingUserIds = ChatSettings.shareActivity ? ids.filter { $0 != me } : [] }
            })
            // Sync only brings the members of recent senders (lazy loading), so older messages had
            // no sender profile: no name and no avatar. Loading the member list fills them in;
            // the timeline then updates those items itself. Element X does the same on open.
            Task { await timeline.fetchMembers() }
            await paginate()
            if focus == nil { try? await timeline.markAsRead(receiptType: Self.receiptType) }
        } catch {
            sendError = error.friendlyMessage
        }
    }

    func paginate() async {
        guard let timeline, !loading, !reachedStart else { return }
        loading = true
        defer { loading = false }
        if let end = try? await timeline.paginateBackwards(numEvents: 40), end != reachedStart {
            reachedStart = end
            // Knowing where the room starts can hide the setup lines of a direct message.
            rebuild()
        }
    }

    /// A page can hold nothing the chat shows (state changes only), so keep going until something
    /// new appears; otherwise the spinner at the top of the channel would stay forever.
    func loadOlderMessages() async {
        let before = rows.count
        for _ in 0..<5 where !reachedStart && rows.count == before {
            await paginate()
        }
    }

    func setTyping(_ typing: Bool) {
        // With sharing off nothing is announced; a "stopped typing" is still sent if one started.
        guard typing != isTyping, !typing || ChatSettings.shareActivity else { return }
        isTyping = typing
        let room = room
        Task { try? await room.typingNotice(isTyping: typing) }
    }

    func markRead() {
        guard let timeline else { return }
        let type = Self.receiptType
        Task { try? await timeline.markAsRead(receiptType: type) }
    }

    /// A private receipt clears your unread count without showing others how far you have read.
    private static var receiptType: ReceiptType { ChatSettings.shareActivity ? .read : .readPrivate }

    // MARK: Sending

    func send(text: String, replyTo: EventOrTransactionId?, mentions: [String] = []) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let timeline, !trimmed.isEmpty else { return }
        var content = messageEventContentFromMarkdown(md: trimmed)
        if !mentions.isEmpty { content = content.withMentions(mentions: Mentions(userIds: mentions, room: false)) }
        setTyping(false)
        do {
            if case .eventId(let id) = replyTo {
                _ = try await timeline.sendReply(msg: content, eventId: id)
            } else {
                _ = try await timeline.send(msg: content)
            }
        } catch {
            sendError = error.friendlyMessage
        }
    }

    @Published private(set) var uploadingAttachment = false
    private var attachmentHandle: SendAttachmentJoinHandle?
    private var attachmentCancelled = false

    func cancelAttachment() {
        attachmentCancelled = true
        attachmentHandle?.cancel()
    }

    /// Attachment APIs encrypt both the media and the event in encrypted rooms.
    func sendAttachment(data: Data, filename: String, mime: String, caption: String, replyTo: EventOrTransactionId?) async -> Bool {
        guard let timeline, !uploadingAttachment else { return false }
        uploadingAttachment = true
        attachmentCancelled = false
        defer { uploadingAttachment = false; attachmentHandle = nil }
        var replyId: String?
        if case .eventId(let id)? = replyTo { replyId = id }
        let params = UploadParameters(source: .data(bytes: data, filename: filename),
                                      caption: caption.isEmpty ? nil : caption,
                                      formattedCaption: nil, mentions: nil, inReplyTo: replyId, extraContentJson: nil)
        do {
            let handle: SendAttachmentJoinHandle
            if mime.hasPrefix("image/"), let image = UIImage(data: data) {
                let info = ImageInfo(height: UInt64(image.size.height * image.scale), width: UInt64(image.size.width * image.scale),
                                     mimetype: mime, size: UInt64(data.count), thumbnailInfo: nil, thumbnailSource: nil,
                                     blurhash: nil, isAnimated: mime == "image/gif")
                handle = try timeline.sendImage(params: params, thumbnailSource: nil, imageInfo: info)
            } else if mime.hasPrefix("video/") {
                let info = VideoInfo(duration: nil, height: nil, width: nil, mimetype: mime, size: UInt64(data.count),
                                     thumbnailInfo: nil, thumbnailSource: nil, blurhash: nil)
                handle = try timeline.sendVideo(params: params, thumbnailSource: nil, videoInfo: info)
            } else {
                handle = try timeline.sendFile(params: params, fileInfo: FileInfo(mimetype: mime, size: UInt64(data.count), thumbnailInfo: nil, thumbnailSource: nil))
            }
            attachmentHandle = handle
            try await handle.join()
            return !attachmentCancelled
        } catch {
            if !attachmentCancelled { sendError = error.friendlyMessage }
            return false
        }
    }

    func editComposed(_ row: MessageRow, message: ComposedMessage) async -> Bool {
        guard let timeline, let id = row.eventId else { return false }
        let content = messageEventContentFromHtml(body: message.body, htmlBody: message.html ?? DesktopMarkdown.escapeHTML(message.body))
            .withMentions(mentions: Mentions(userIds: message.mentionedUserIds, room: false))
        do {
            try await timeline.edit(eventOrTransactionId: id, newContent: .roomMessage(content: content))
            return true
        } catch { sendError = error.friendlyMessage; return false }
    }

    func sendComposed(_ message: ComposedMessage, command: SlashCommand?, replyTo: EventOrTransactionId?) async -> Bool {
        guard let timeline else { return false }
        do {
            var content: RoomMessageEventContentWithoutRelation
            if command == .notice {
                let formatted = message.html.map { FormattedBody(format: .html, body: $0) }
                content = try messageEventContentNew(msgtype: .notice(content: NoticeMessageContent(body: message.body, formatted: formatted)))
            } else if command == .me {
                let formatted = message.html.map { FormattedBody(format: .html, body: $0) }
                content = try messageEventContentNew(msgtype: .emote(content: EmoteMessageContent(body: message.body, formatted: formatted)))
            } else {
                let formatted = message.html.map { FormattedBody(format: .html, body: $0) }
                content = try messageEventContentNew(msgtype: .text(content: TextMessageContent(body: message.body, formatted: formatted)))
            }
            content = content.withMentions(mentions: Mentions(userIds: message.mentionedUserIds, room: false))
            setTyping(false)
            if case .eventId(let id)? = replyTo { _ = try await timeline.sendReply(msg: content, eventId: id) }
            else { _ = try await timeline.send(msg: content) }
            return true
        } catch { sendError = error.friendlyMessage; return false }
    }

    func sendImage(_ image: UIImage) async {
        guard let timeline, let data = image.jpegData(compressionQuality: 0.85) else { return }
        let info = ImageInfo(
            height: UInt64(image.size.height * image.scale),
            width: UInt64(image.size.width * image.scale),
            mimetype: "image/jpeg",
            size: UInt64(data.count),
            thumbnailInfo: nil,
            thumbnailSource: nil,
            blurhash: nil,
            isAnimated: false
        )
        let params = UploadParameters(
            source: .data(bytes: data, filename: "image.jpg"),
            caption: nil,
            formattedCaption: nil,
            mentions: nil,
            inReplyTo: nil,
            extraContentJson: nil
        )
        do {
            let handle = try timeline.sendImage(params: params, thumbnailSource: nil, imageInfo: info)
            try await handle.join()
        } catch {
            sendError = error.friendlyMessage
        }
    }

    /// Sends a recorded voice message the way the desktop does: `m.audio` with the voice flag
    /// (MSC3245) and duration and waveform (MSC1767), encrypted in encrypted rooms by the SDK.
    /// Returns false when it failed, so the caller can keep the recording.
    func sendVoice(_ recording: VoiceRecording, inReplyTo: EventOrTransactionId?) async -> Bool {
        guard let timeline else { return false }
        var replyId: String?
        if case .eventId(let id)? = inReplyTo { replyId = id }
        let params = UploadParameters(
            source: .file(filename: recording.url.path),
            caption: nil,
            formattedCaption: nil,
            mentions: nil,
            inReplyTo: replyId,
            extraContentJson: VoiceWaveform.contentJSON(duration: recording.duration, wire: recording.waveform)
        )
        let info = AudioInfo(duration: recording.duration, size: recording.size, mimetype: "audio/mp4")
        do {
            let handle = try timeline.sendAttachment(params: params, attachment: .audio(audioInfo: info))
            try await handle.join()
            try? FileManager.default.removeItem(at: recording.url)
            return true
        } catch {
            sendError = error.friendlyMessage
            return false
        }
    }

    func edit(_ row: MessageRow, text: String, mentions: [String] = []) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let timeline, let id = row.eventId, !trimmed.isEmpty else { return }
        var content = messageEventContentFromMarkdown(md: trimmed)
        if !mentions.isEmpty { content = content.withMentions(mentions: Mentions(userIds: mentions, room: false)) }
        do {
            try await timeline.edit(eventOrTransactionId: id, newContent: .roomMessage(content: content))
        } catch {
            sendError = error.friendlyMessage
        }
    }

    func toggleReaction(_ key: String, on row: MessageRow) async {
        guard let timeline, let id = row.eventId else { return }
        do {
            _ = try await timeline.toggleReaction(itemId: id, key: key)
        } catch {
            sendError = error.friendlyMessage
        }
    }

    func redact(_ row: MessageRow) async {
        guard let timeline, let id = row.eventId else { return }
        do {
            try await timeline.redactEvent(eventOrTransactionId: id, reason: nil)
        } catch {
            sendError = error.friendlyMessage
        }
    }

    // MARK: Diffs → rows

    private func apply(_ diffs: [TimelineDiff]) {
        for diff in diffs { ListDiff<TimelineItem>(diff).apply(to: &items) }
        rebuild()
    }

    private func rebuild() {
        var built: [MessageRow] = []
        var pendingDay: Date?
        var createdAt: Date?
        var firstEventDate: Date?
        let previews = ChatSettings.urlPreviews(encrypted: roomEncrypted)
        for item in items {
            if let virtual = item.asVirtual() {
                if case .dateDivider(let ts) = virtual {
                    pendingDay = Date(timeIntervalSince1970: TimeInterval(ts) / 1000)
                }
                continue
            }
            guard let event = item.asEvent() else { continue }
            let date = Date(timeIntervalSince1970: TimeInterval(event.timestamp) / 1000)
            if firstEventDate == nil { firstEventDate = date }
            if createdAt == nil, case .state(_, let content) = event.content, case .roomCreate = content {
                createdAt = date
            }
            guard var row = Self.row(for: event, id: item.uniqueId().id, me: ownUserId, previews: previews) else { continue }
            row.previewsLocal = roomEncrypted
            row.dayDivider = pendingDay
            pendingDay = nil
            built.append(row)
        }
        // The creation event may be filtered out; the first event of a fully loaded room is as good.
        if createdAt == nil, reachedStart { createdAt = firstEventDate }

        let hidden = TimelineLayout.hiddenSetupLines(built.map { row -> TimelineLayout.Item in
            if let change = row.membership { return .membership(change, row.date) }
            return row.layoutKind == .message ? .message(row.date) : .other(row.date)
        }, isDirect: isDirect, createdAt: createdAt)

        var result: [MessageRow] = []
        var carriedDay: Date?
        var previous: TimelineLayout.Entry?
        for (index, original) in built.enumerated() {
            var row = original
            if hidden.contains(index) {
                // The day above a hidden line still belongs above the next row shown.
                carriedDay = row.dayDivider ?? carriedDay
                continue
            }
            row.dayDivider = row.dayDivider ?? carriedDay
            carriedDay = nil
            // Call attempts right after each other become one line ("3 calls").
            if let last = result.last,
               TimelineLayout.joinsCallRun(isCall: row.callCount > 0, previousIsCall: last.callCount > 0,
                                           hasDayDivider: row.dayDivider != nil) {
                result[result.count - 1].callCount += row.callCount
                result[result.count - 1].lastCallDate = row.date
                continue
            }
            let entry = TimelineLayout.Entry(sender: row.sender, date: row.date, kind: row.layoutKind,
                                             isReply: row.reply != nil, hasDayDivider: row.dayDivider != nil)
            row.showsHeader = !TimelineLayout.continuesGroup(entry, after: previous)
            previous = entry
            result.append(row)
        }
        rows = result
        nav.update(items: items, rowIds: Set(result.map { $0.id }), me: ownUserId)
    }

    private static func row(for event: EventTimelineItem, id: String, me: String, previews: Bool = false) -> MessageRow? {
        let (name, avatar): (String, String?) = {
            if case .ready(let displayName, _, let avatarUrl, _, _) = event.senderProfile {
                return (displayName ?? event.sender, avatarUrl)
            }
            return (event.sender, nil)
        }()
        let body: MessageRow.Body
        var edited = false
        var reply: (sender: String, senderId: String, text: String, avatar: String?)?
        var card: BotCard?
        var music: MusicCard?
        var membership: TimelineLayout.Membership?
        var extras = MessageExtras()
        var isSticker = false
        var isCall = false
        switch event.content {
        case .msgLike(let content):
            if let details = content.inReplyTo, case .ready(let replied, let sender, let profile, _, _) = details.event() {
                var replyName = sender
                var replyAvatar: String?
                if case .ready(let displayName, _, let avatarUrl, _, _) = profile {
                    if let displayName { replyName = displayName }
                    replyAvatar = avatarUrl
                }
                reply = (sender: replyName, senderId: sender, text: Self.preview(of: replied) ?? "…", avatar: replyAvatar)
            }
            switch content.kind {
            case .message(let message):
                edited = message.isEdited
                body = Self.body(of: message)
                extras = MessageRendering.extras(of: message)
                let inspection = BotCardLookup.inspect(event, id: id, message: message)
                if inspection.hidden { return nil }
                card = inspection.card
                music = inspection.music
            case .sticker(let text, let info, let source):
                isSticker = true
                body = .image(source, filename: text, width: info.width.map { CGFloat($0) }, height: info.height.map { CGFloat($0) })
            case .redacted:
                body = .redacted
            case .unableToDecrypt:
                body = .undecryptable
            case .poll(let question, _, _, _, _, _, _):
                body = .text("📊 \(question)")
            default:
                return nil
            }
        case .roomMembership(let userId, let displayName, let change, _):
            // Profile edits and other no-ops are noise in a channel; Discord does not show them either.
            guard ChatSettings.showMembership, let kind = Self.membership(change) else { return nil }
            membership = kind
            body = .notice(kind.text(name: displayName ?? userId))
        case .rtcNotification, .callInvite:
            body = .notice(TimelineLayout.callText(starter: name, count: 1))
            isCall = true
        default:
            return nil
        }
        let reactions = event.reactions.map { reaction in
            ReactionChip(key: reaction.key, count: reaction.senders.count, mine: reaction.senders.contains { $0.senderId == me })
        }
        var row = MessageRow(
            id: id,
            eventId: event.eventOrTransactionId,
            sender: event.sender,
            senderName: name,
            senderAvatar: avatar,
            date: Date(timeIntervalSince1970: TimeInterval(event.timestamp) / 1000),
            body: body,
            isOwn: event.isOwn,
            isEdited: edited,
            reply: reply,
            reactions: reactions,
            showsHeader: true,
            dayDivider: nil,
            isPending: !event.isRemote,
            card: card,
            membership: membership
        )
        if isCall { row.callCount = 1 }
        row.music = card == nil ? music : nil
        // A bot card or a song keeps its own look; everything else gets the desktop's rendering.
        if card == nil && music == nil {
            row.rich = extras.rich
            row.richItalic = extras.italic
            row.video = extras.video
            row.location = extras.location
            if !isSticker { row.caption = extras.caption; row.captionRich = extras.captionRich }
            if previews, let text = extras.previewText { row.previewURLs = LinkPreviewURLs.find(in: text) }
        }
        row.isSticker = isSticker
        return row
    }

    private static func body(of message: MessageContent) -> MessageRow.Body {
        switch message.msgType {
        case .text(let text): return .text(Self.text(text.body, formatted: text.formatted))
        case .emote(let emote): return .text("_\(Self.text(emote.body, formatted: emote.formatted))_")
        case .notice(let notice): return .text(Self.text(notice.body, formatted: notice.formatted))
        case .image(let image):
            return .image(image.source, filename: image.filename,
                          width: image.info?.width.map { CGFloat($0) }, height: image.info?.height.map { CGFloat($0) })
        case .video(let video): return .file("🎬 \(video.filename)", source: video.source, mimeType: video.info?.mimetype)
        case .audio(let audio): return .audio(AudioAttachment(audio))
        case .file(let file): return .file("📎 \(file.filename)", source: file.source, mimeType: file.info?.mimetype)
        default: return .text(message.body)
        }
    }

    /// The plain body, unless the HTML body has mentions the plain body may only name in passing.
    private static func text(_ body: String, formatted: FormattedBody?) -> String {
        guard let formatted, case .html = formatted.format, let markdown = MentionText.markdown(fromHTML: formatted.body) else { return body }
        return markdown
    }

    /// One line for reply previews and the direct message list.
    static func preview(of content: TimelineItemContent) -> String? {
        guard case .msgLike(let like) = content else { return nil }
        switch like.kind {
        case .message(let message):
            switch message.msgType {
            case .image: return "📷 Photo"
            case .video: return "🎬 Video"
            case .audio(let audio): return audio.voice != nil ? "🎤 Voice message" : "🔊 Audio"
            case .file(let file): return "📎 \(file.filename)"
            default: return message.body
            }
        case .sticker: return "Sticker"
        case .redacted: return "Message deleted"
        case .unableToDecrypt: return "🔒 Encrypted message"
        default: return nil
        }
    }

    private static func membership(_ change: MembershipChange?) -> TimelineLayout.Membership? {
        switch change {
        case .joined?, .invitationAccepted?, .knockAccepted?: return .joined
        case .left?: return .left
        case .invited?: return .invited
        case .banned?, .kickedAndBanned?: return .banned
        case .unbanned?: return .unbanned
        case .kicked?: return .removed
        case .invitationRejected?: return .declined
        default: return nil
        }
    }
}
