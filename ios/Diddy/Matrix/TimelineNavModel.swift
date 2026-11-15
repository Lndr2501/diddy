import Foundation
import MatrixRustSDK

/// How many replies a thread has and what was said last, shown under the root message.
struct ThreadInfo: Equatable {
    var replies: Int
    var latestSender: String
    var latestText: String
}

/// What the chat needs next to the message rows themselves: who has read what, which message
/// answers which, threads, who reacted and what the room has pinned. Rebuilt with every update of
/// the SDK timeline; keyed by the id of the chat row (`MessageRow.id`).
struct TimelineNavSnapshot: Equatable {
    var entries: [TimelineNav.Entry] = []
    var threads: [String: ThreadInfo] = [:]
    /// Row id → the event it answers.
    var replyTargets: [String: String] = [:]
    /// Row id → reaction key → the people who reacted.
    var reactionSenders: [String: [String: [String]]] = [:]
    /// Row id → the event id the server knows it by (nothing for a message still being sent).
    var eventIds: [String: String] = [:]
}

@MainActor
final class TimelineNavModel: ObservableObject {
    @Published private(set) var snapshot = TimelineNavSnapshot()
    /// The event you had read up to when the room opened (the `m.fully_read` marker).
    @Published private(set) var readUpTo: String?
    /// Pinned event ids, in the order they were pinned.
    @Published private(set) var pinned: [String] = []
    @Published private(set) var canPin = false
    @Published private(set) var canRedactOther = false
    @Published private(set) var canRedactOwn = true

    private var infoHandle: TaskHandle?
    private var started = false

    deinit {
        infoHandle?.cancel()
    }

    /// Reads the read marker (before the app moves it), the pins and what you may do here.
    func start(room: Room) async {
        guard !started else { return }
        started = true
        if let info = try? await room.roomInfo() {
            readUpTo = info.fullyReadEventId
            pinned = info.pinnedEventIds
        }
        if let levels = try? await room.getPowerLevels() {
            canPin = levels.canOwnUserPinUnpin()
            canRedactOther = levels.canOwnUserRedactOther()
            canRedactOwn = levels.canOwnUserRedactOwn()
        }
        infoHandle = room.subscribeToRoomInfoUpdates(listener: RoomInfoUpdates { [weak self] info in
            let ids = info.pinnedEventIds
            Task { @MainActor in
                if self?.pinned != ids { self?.pinned = ids }
            }
        })
    }

    /// Pinning is done through the timeline; this keeps the menu right until the server answers.
    func setPinned(_ eventId: String, _ on: Bool) {
        var ids = pinned.filter { $0 != eventId }
        if on { ids.append(eventId) }
        pinned = ids
    }

    /// The row "New Messages" goes above.
    func dividerRowId(me: String) -> String? {
        TimelineNav.newDividerRowId(snapshot.entries, readUpTo: readUpTo, me: me)
    }

    func readers(of eventId: String) -> [String] {
        TimelineNav.readers(of: eventId, in: snapshot.entries)
    }

    /// Everyone who has read the newest message shown, except you.
    var latestReaders: [String] {
        guard let latest = TimelineNav.latestShownEventId(snapshot.entries) else { return [] }
        return readers(of: latest)
    }

    var latestShownEventId: String? { TimelineNav.latestShownEventId(snapshot.entries) }

    func isPinned(_ eventId: String?) -> Bool {
        guard let eventId else { return false }
        return pinned.contains(eventId)
    }

    /// What one SDK item adds to the snapshot, read once per item object: the SDK hands out a new
    /// object when an item changes, and reading an event over the FFI (content, reactions,
    /// receipts) is the expensive part of a rebuild, which runs for every receipt and edit.
    private struct ItemNav {
        let id: String
        let eventId: String?
        let sender: String
        let readers: [String]
        let threadRoot: String?
        let replyTo: String?
        let thread: ThreadInfo?
        let reactions: [String: [String]]
    }

    private var itemCache: [ObjectIdentifier: (item: TimelineItem, nav: ItemNav?)] = [:]

    private static func read(_ item: TimelineItem, me: String) -> ItemNav? {
        guard let event = item.asEvent() else { return nil }
        var eventId: String?
        if case .eventId(let value) = event.eventOrTransactionId { eventId = value }
        var replyTo: String?
        var threadRoot: String?
        var thread: ThreadInfo?
        if case .msgLike(let like) = event.content {
            replyTo = like.inReplyTo?.eventId()
            threadRoot = like.threadRoot
            if let summary = like.threadSummary { thread = info(of: summary) }
        }
        let readers = event.readReceipts
            .filter { $0.key != me }
            .sorted { ($0.value.timestamp ?? 0) > ($1.value.timestamp ?? 0) }
            .map { $0.key }
        var reactions: [String: [String]] = [:]
        for reaction in event.reactions { reactions[reaction.key] = reaction.senders.map { $0.senderId } }
        return ItemNav(id: item.uniqueId().id, eventId: eventId, sender: event.sender, readers: readers,
                       threadRoot: threadRoot, replyTo: replyTo, thread: thread, reactions: reactions)
    }

    func update(items: [TimelineItem], rowIds: Set<String>, me: String) {
        var next = TimelineNavSnapshot()
        var cache: [ObjectIdentifier: (item: TimelineItem, nav: ItemNav?)] = [:]
        cache.reserveCapacity(items.count)
        for item in items {
            let key = ObjectIdentifier(item)
            let nav: ItemNav?
            if let known = itemCache[key], known.item === item {
                nav = known.nav
            } else {
                nav = Self.read(item, me: me)
            }
            cache[key] = (item, nav)
            guard let nav else { continue }
            let id = nav.id
            if let thread = nav.thread { next.threads[id] = thread }
            let shown = rowIds.contains(id)
            next.entries.append(TimelineNav.Entry(eventId: nav.eventId, rowId: shown ? id : nil, sender: nav.sender,
                                                  readers: nav.readers, threadRoot: nav.threadRoot, replyTo: nav.replyTo))
            guard shown else { continue }
            if let eventId = nav.eventId { next.eventIds[id] = eventId }
            if let replyTo = nav.replyTo { next.replyTargets[id] = replyTo }
            if !nav.reactions.isEmpty { next.reactionSenders[id] = nav.reactions }
        }
        itemCache = cache
        if next != snapshot { snapshot = next }
    }

    private static func info(of summary: ThreadSummary) -> ThreadInfo {
        var sender = ""
        var text = ""
        if case .ready(let content, let from, let profile, _, _) = summary.latestEvent() {
            sender = from
            if case .ready(let displayName, _, _, _, _) = profile, let displayName { sender = displayName }
            text = TimelineController.preview(of: content) ?? ""
        }
        return ThreadInfo(replies: Int(summary.numReplies()), latestSender: sender, latestText: text)
    }
}
