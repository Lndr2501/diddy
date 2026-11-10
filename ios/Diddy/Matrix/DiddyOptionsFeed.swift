import Foundation
import MatrixRustSDK

/// One Diddy event of an options room as it was sent in "message mode": the data is a normal
/// (end-to-end encrypted in encrypted rooms) timeline event carrying its state key in
/// `content["app.diddy.key"]`. `content` is still untrusted; `DiddyProfiles.swift` checks it.
struct DiddyMessageEvent {
    let type: String
    let sender: String
    let ts: Int64
    let content: [String: Any]
}

/// Reads the message-mode events of an encrypted options room.
///
/// The server only has ciphertext, so the raw `/messages` call that works for unencrypted rooms is
/// no use. The SDK decrypts events inside its timeline instead. A timeline filtered to custom
/// message-like events (plus undecryptable ones, so a missing key is noticed) shows only the Diddy
/// data; the decrypted JSON of each item gives the content. The timeline stays open, so new
/// events arrive live and `onChange` fires (debounced) when something Diddy-related changed.
@MainActor
final class DiddyOptionsFeed {
    static let types: Set<String> = [DiddyEvents.profile, DiddyEvents.badge, DiddyEvents.award]
    /// Desktop looks at the newest 300 events of the room; the same window is read here.
    private static let pageSize: UInt16 = 100
    private static let maxPages = 4
    private static let maxLocal = 24

    private let roomId: String
    private var timeline: Timeline?
    private var listener: TaskHandle?
    private var items: [TimelineItem] = []
    /// Parsed Diddy events by timeline item id (an item is only parsed once; failures are retried).
    private var parsed: [String: DiddyMessageEvent] = [:]
    private var starting = false
    private var local: [DiddyMessageEvent] = []
    private var reloadTask: Task<Void, Never>?
    private(set) var failed = false
    /// True once the first pages were read.
    private(set) var ready = false
    /// Called (on the main actor) when the data may have changed after the first read.
    var onChange: (() -> Void)?

    init(roomId: String) { self.roomId = roomId }

    deinit {
        listener?.cancel()
        reloadTask?.cancel()
    }

    /// Opens the timeline and reads the newest events. Safe to call again: does nothing once running.
    func start(room: Room) async {
        guard timeline == nil, !starting else { return }
        starting = true
        defer { starting = false }
        let configuration = TimelineConfiguration(
            focus: .live(hideThreadedEvents: false),
            filter: .eventFilter(filter: .include([.anyCustomMessageLikeEvent, .eventType(.roomEncrypted)])),
            internalIdPrefix: "diddy-options",
            dateDividerMode: .daily,
            trackReadReceipts: .disabled,
            reportUtds: false
        )
        guard let timeline = try? await room.timelineWithConfiguration(configuration: configuration) else {
            failed = true
            DiagLog.shared.write("diddy: options room timeline failed room=\(roomId)")
            return
        }
        self.timeline = timeline
        failed = false
        listener = await timeline.addListener(listener: TimelineUpdates { [weak self] diffs in
            Task { @MainActor in self?.apply(diffs) }
        })
        for _ in 0..<Self.maxPages {
            guard let reachedStart = try? await timeline.paginateBackwards(numEvents: Self.pageSize) else { break }
            if reachedStart { break }
        }
        // The listener delivers the items on its own thread; give the last diff a moment to land.
        try? await Task.sleep(nanoseconds: 400_000_000)
        ready = true
        let count = events.count
        DiagLog.shared.write("diddy: options room read room=\(roomId) events=\(count) undecryptable=\(undecryptableSenders.count)")
    }

    /// Everything Diddy-related read so far, plus what this device sent and has not seen back.
    var events: [DiddyMessageEvent] {
        Array(parsed.values) + local
    }

    /// Senders with at least one event that could not be decrypted (yet).
    private(set) var undecryptableSenders: Set<String> = []

    /// True when nothing is known to be missing from what was read. An own profile that exists but
    /// cannot be decrypted must not be overwritten by an edit made from an incomplete picture.
    func isCompleteFor(sender: String) -> Bool {
        ready && !failed && !undecryptableSenders.contains(sender)
    }

    /// Remembers an event this device just sent, until the timeline shows it (no decrypted JSON
    /// exists for a local echo).
    func addLocal(type: String, sender: String, content: [String: Any]) {
        local.append(DiddyMessageEvent(type: type, sender: sender, ts: Int64(Date().timeIntervalSince1970 * 1000), content: content))
        if local.count > Self.maxLocal { local.removeFirst(local.count - Self.maxLocal) }
    }

    // MARK: Timeline updates

    private func apply(_ diffs: [TimelineDiff]) {
        for diff in diffs { ListDiff<TimelineItem>(diff).apply(to: &items) }
        let before = signature
        rebuild()
        if ready, signature != before { scheduleChange() }
    }

    private var signature: Int { parsed.count &+ undecryptableSenders.count &* 1000 }

    private func rebuild() {
        var next: [String: DiddyMessageEvent] = [:]
        var utd: Set<String> = []
        for item in items {
            guard let event = item.asEvent() else { continue }
            let id = item.uniqueId().id
            if case .msgLike(let content) = event.content, case .unableToDecrypt = content.kind {
                utd.insert(event.sender)
                continue
            }
            guard let type = event.eventTypeRaw, Self.types.contains(type) else { continue }
            if let known = parsed[id] {
                next[id] = known
            } else if let event = Self.parse(event, type: type) {
                next[id] = event
            }
        }
        parsed = next
        undecryptableSenders = utd
    }

    /// The decrypted JSON the SDK keeps for the event gives type, content and server time.
    private static func parse(_ event: EventTimelineItem, type: String) -> DiddyMessageEvent? {
        guard event.isRemote, let json = event.lazyProvider.debugInfo().originalJson,
              let data = json.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              (object["type"] as? String) == type,
              let content = object["content"] as? [String: Any] else { return nil }
        let ts = (object["origin_server_ts"] as? NSNumber)?.int64Value ?? Int64(event.timestamp)
        return DiddyMessageEvent(type: type, sender: (object["sender"] as? String) ?? event.sender, ts: ts, content: content)
    }

    private func scheduleChange() {
        reloadTask?.cancel()
        reloadTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled else { return }
            self?.onChange?()
        }
    }
}
