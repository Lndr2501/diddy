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
    let reply: (sender: String, text: String)?
    let reactions: [ReactionChip]
    /// Discord shows name and avatar only on the first message of a burst from one sender.
    var showsHeader: Bool
    var dayDivider: Date?
    let isPending: Bool
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
    private var timeline: Timeline?
    private var items: [TimelineItem] = []
    private var listener: TaskHandle?
    private var typingListener: TaskHandle?
    private var isTyping = false

    init(room: Room, ownUserId: String) {
        self.room = room
        self.ownUserId = ownUserId
    }

    deinit {
        listener?.cancel()
        typingListener?.cancel()
    }

    func start() async {
        guard timeline == nil else { return }
        do {
            let timeline = try await room.timeline()
            self.timeline = timeline
            listener = await timeline.addListener(listener: TimelineUpdates { [weak self] diffs in
                Task { @MainActor in self?.apply(diffs) }
            })
            let me = ownUserId
            typingListener = room.subscribeToTypingNotifications(listener: TypingUpdates { [weak self] ids in
                Task { @MainActor in self?.typingUserIds = ids.filter { $0 != me } }
            })
            await paginate()
            try? await timeline.markAsRead(receiptType: .read)
        } catch {
            sendError = error.friendlyMessage
        }
    }

    func paginate() async {
        guard let timeline, !loading, !reachedStart else { return }
        loading = true
        defer { loading = false }
        if let end = try? await timeline.paginateBackwards(numEvents: 40) { reachedStart = end }
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
        guard typing != isTyping else { return }
        isTyping = typing
        let room = room
        Task { try? await room.typingNotice(isTyping: typing) }
    }

    func markRead() {
        guard let timeline else { return }
        Task { try? await timeline.markAsRead(receiptType: .read) }
    }

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
        var result: [MessageRow] = []
        var pendingDay: Date?
        for item in items {
            if let virtual = item.asVirtual() {
                if case .dateDivider(let ts) = virtual {
                    pendingDay = Date(timeIntervalSince1970: TimeInterval(ts) / 1000)
                }
                continue
            }
            guard let event = item.asEvent(), var row = Self.row(for: event, id: item.uniqueId().id, me: ownUserId) else { continue }
            if let previous = result.last, pendingDay == nil,
               previous.sender == row.sender,
               row.date.timeIntervalSince(previous.date) < 7 * 60,
               row.reply == nil {
                row.showsHeader = false
            }
            row.dayDivider = pendingDay
            pendingDay = nil
            result.append(row)
        }
        rows = result
    }

    private static func row(for event: EventTimelineItem, id: String, me: String) -> MessageRow? {
        let (name, avatar): (String, String?) = {
            if case .ready(let displayName, _, let avatarUrl, _, _) = event.senderProfile {
                return (displayName ?? event.sender, avatarUrl)
            }
            return (event.sender, nil)
        }()
        let body: MessageRow.Body
        var edited = false
        var reply: (sender: String, text: String)?
        switch event.content {
        case .msgLike(let content):
            if let details = content.inReplyTo, case .ready(let replied, let sender, let profile, _, _) = details.event() {
                var replyName = sender
                if case .ready(let displayName, _, _, _, _) = profile, let displayName { replyName = displayName }
                reply = (sender: replyName, text: Self.preview(of: replied) ?? "…")
            }
            switch content.kind {
            case .message(let message):
                edited = message.isEdited
                body = Self.body(of: message)
            case .sticker(let text, let info, let source):
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
            guard let text = Self.membershipText(name: displayName ?? userId, change: change) else { return nil }
            body = .notice(text)
        case .rtcNotification, .callInvite:
            body = .notice("\(name) started a call")
        default:
            return nil
        }
        let reactions = event.reactions.map { reaction in
            ReactionChip(key: reaction.key, count: reaction.senders.count, mine: reaction.senders.contains { $0.senderId == me })
        }
        return MessageRow(
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
            isPending: !event.isRemote
        )
    }

    private static func body(of message: MessageContent) -> MessageRow.Body {
        switch message.msgType {
        case .text(let text): return .text(text.body)
        case .emote(let emote): return .text("_\(emote.body)_")
        case .notice(let notice): return .text(notice.body)
        case .image(let image):
            return .image(image.source, filename: image.filename,
                          width: image.info?.width.map { CGFloat($0) }, height: image.info?.height.map { CGFloat($0) })
        case .video(let video): return .file("🎬 \(video.filename)", source: video.source, mimeType: video.info?.mimetype)
        case .audio(let audio): return .file("🔊 \(audio.filename)", source: audio.source, mimeType: audio.info?.mimetype)
        case .file(let file): return .file("📎 \(file.filename)", source: file.source, mimeType: file.info?.mimetype)
        default: return .text(message.body)
        }
    }

    /// One line for reply previews and the direct message list.
    static func preview(of content: TimelineItemContent) -> String? {
        guard case .msgLike(let like) = content else { return nil }
        switch like.kind {
        case .message(let message):
            switch message.msgType {
            case .image: return "📷 Photo"
            case .video: return "🎬 Video"
            case .audio: return "🔊 Audio"
            case .file(let file): return "📎 \(file.filename)"
            default: return message.body
            }
        case .sticker: return "Sticker"
        case .redacted: return "Message deleted"
        case .unableToDecrypt: return "🔒 Encrypted message"
        default: return nil
        }
    }

    private static func membershipText(name: String, change: MembershipChange?) -> String? {
        switch change {
        case .joined?, .invitationAccepted?, .knockAccepted?: return "\(name) joined"
        case .left?: return "\(name) left"
        case .invited?: return "\(name) was invited"
        case .banned?, .kickedAndBanned?: return "\(name) was banned"
        case .unbanned?: return "\(name) was unbanned"
        case .kicked?: return "\(name) was removed"
        case .invitationRejected?: return "\(name) declined the invite"
        default: return nil
        }
    }
}
