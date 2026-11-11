// Checks for Diddy/Matrix/MessageSearchLogic.swift: the same cases as the desktop's
// cinny/tests/searchEdits.test.cjs (#109), plus request, answer and highlighting.
// Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/MessageSearchLogic.swift Tools/messagesearch_check/main.swift -o /tmp/messagesearch_check && /tmp/messagesearch_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

let mainRoom = "!room:x"
let alice = "@alice:x"
let bob = "@bob:x"

func msg(_ id: String, _ body: String, room roomId: String = mainRoom, sender: String = alice, ts: Int64 = 1000,
         content: [String: Any]? = nil, unsigned: [String: Any]? = nil) -> MessageSearchEvent {
    MessageSearchEvent(eventId: id, roomId: roomId, sender: sender, type: "m.room.message", timestamp: ts,
                       content: content ?? ["msgtype": "m.text", "body": body], unsigned: unsigned)
}

func edit(_ id: String, _ target: String, _ body: String, room roomId: String = mainRoom, sender: String = alice,
          type: String = "m.room.message", ts: Int64 = 2000) -> MessageSearchEvent {
    MessageSearchEvent(eventId: id, roomId: roomId, sender: sender, type: type, timestamp: ts, content: [
        "msgtype": "m.text",
        "body": "* \(body)",
        "m.new_content": ["msgtype": "m.text", "body": body] as [String: Any],
        "m.relates_to": ["rel_type": "m.replace", "event_id": target] as [String: Any],
    ])
}

func hit(_ event: MessageSearchEvent, rank: Double = 1) -> MessageSearchHit { MessageSearchHit(rank: rank, event: event) }

struct Summary: Equatable {
    let original: String
    let shown: String
    let body: String
    let edited: Bool
}
func summary(_ items: [MessageSearchItem]) -> [Summary] {
    items.map { Summary(original: $0.originalEventId, shown: $0.event.eventId, body: $0.event.body, edited: $0.edited) }
}
func bundledRef(_ id: String, sender: String = alice, ts: Int64 = 2000) -> [String: Any] {
    ["m.relations": ["m.replace": ["event_id": id, "sender": sender, "origin_server_ts": ts] as [String: Any]] as [String: Any]]
}

// no edit: hit is shown unchanged
check(summary(MessageSearch.resolveHits([hit(msg("$a", "hello world"))], extraEvents: [], term: "hello"))
      == [Summary(original: "$a", shown: "$a", body: "hello world", edited: false)], "no edit")

// one edit, both hit: one result with the new text, original id, edited marker
do {
    let r = MessageSearch.resolveHits([hit(edit("$e1", "$a", "hello there")), hit(msg("$a", "hello world"))], extraEvents: [], term: "hello")
    check(summary(r) == [Summary(original: "$a", shown: "$a", body: "hello there", edited: true)], "one edit")
    check(r.first?.event.content["m.new_content"] == nil, "no m.new_content on the shown event")
}

// two edits: the latest wins, once
check(summary(MessageSearch.resolveHits([
    hit(edit("$e1", "$a", "hello one", ts: 2000)),
    hit(edit("$e2", "$a", "hello two", ts: 3000)),
    hit(msg("$a", "hello zero")),
], extraEvents: [], term: "hello")) == [Summary(original: "$a", shown: "$a", body: "hello two", edited: true)], "latest edit wins")

// older edit matched but the latest no longer contains the term: hidden
check(MessageSearch.resolveHits([hit(edit("$e1", "$a", "hello one", ts: 2000))],
                                extraEvents: [msg("$a", "hello zero"), edit("$e2", "$a", "goodbye", ts: 3000)],
                                term: "hello").isEmpty, "stale older edit hidden")

// edit hit without original: the original is fetched and shown with the new text
do {
    let hits = [hit(edit("$e1", "$a", "hello new"))]
    check(MessageSearch.missingOriginals(hits) == [MessageSearchRef(roomId: mainRoom, eventId: "$a")], "missing original")
    check(summary(MessageSearch.resolveHits(hits, extraEvents: [msg("$a", "old text")], term: "hello"))
          == [Summary(original: "$a", shown: "$a", body: "hello new", edited: true)], "fetched original")
}

// edit hit whose original cannot be loaded is dropped
check(MessageSearch.resolveHits([hit(edit("$e1", "$a", "hello"))], extraEvents: [], term: "hello").isEmpty, "edit without original")

// original hit, current text still matches: shown with the new text
do {
    let original = msg("$a", "hello old", unsigned: bundledRef("$e1"))
    check(MessageSearch.missingBundledEdits([original], known: []) == [MessageSearchRef(roomId: mainRoom, eventId: "$e1")], "missing bundled edit")
    check(summary(MessageSearch.resolveHits([hit(original)], extraEvents: [edit("$e1", "$a", "hello new")], term: "hello"))
          == [Summary(original: "$a", shown: "$a", body: "hello new", edited: true)], "bundled edit loaded")
}

// original matched only the old text: hidden
check(MessageSearch.resolveHits([hit(msg("$a", "secret plan", unsigned: bundledRef("$e1")))],
                                extraEvents: [edit("$e1", "$a", "nothing here")], term: "secret").isEmpty, "old text only")

// edit content could not be loaded: hidden
check(MessageSearch.resolveHits([hit(msg("$a", "secret plan", unsigned: bundledRef("$e1")))],
                                extraEvents: [], term: "secret").isEmpty, "edit not loaded")

// bundled edit with full content (older servers) is used directly
do {
    let full = edit("$e1", "$a", "secret party")
    let bundled: [String: Any] = [
        "event_id": full.eventId, "room_id": full.roomId, "sender": full.sender, "type": full.type,
        "origin_server_ts": full.timestamp, "content": full.content,
    ]
    let original = msg("$a", "secret plan", unsigned: ["m.relations": ["m.replace": bundled] as [String: Any]])
    check(MessageSearch.missingBundledEdits([original], known: []).isEmpty, "full bundled edit needs no fetch")
    check(summary(MessageSearch.resolveHits([hit(original)], extraEvents: [], term: "secret"))
          == [Summary(original: "$a", shown: "$a", body: "secret party", edited: true)], "full bundled edit used")
}

// edit from another sender is ignored
do {
    let hits = [hit(edit("$e1", "$a", "hello hijacked", sender: bob, ts: 5000)), hit(msg("$a", "hello world"))]
    check(summary(MessageSearch.resolveHits(hits, extraEvents: [], term: "hello"))
          == [Summary(original: "$a", shown: "$a", body: "hello world", edited: false)], "foreign edit ignored")
    check(MessageSearch.resolveHits([hits[0]], extraEvents: [msg("$a", "other text")], term: "hello").isEmpty,
          "foreign edit does not resurrect")
}

// bundled reference from another sender is not trusted
do {
    let original = msg("$a", "hello world", unsigned: bundledRef("$e1", sender: bob))
    check(MessageSearch.missingBundledEdits([original], known: []).isEmpty, "foreign bundled not fetched")
    check(summary(MessageSearch.resolveHits([hit(original)], extraEvents: [], term: "hello"))
          == [Summary(original: "$a", shown: "$a", body: "hello world", edited: false)], "foreign bundled ignored")
}

// replacement in another room or of another type is not trusted
check(summary(MessageSearch.resolveHits([
    hit(edit("$e1", "$a", "hello other room", room: "!other:x")),
    hit(edit("$e2", "$a", "hello sticker", type: "m.sticker")),
    hit(msg("$a", "hello world")),
], extraEvents: [], term: "hello")) == [Summary(original: "$a", shown: "$a", body: "hello world", edited: false)], "room/type")

// same term in old and new text: one result, new text, first rank
do {
    let r = MessageSearch.resolveHits([hit(msg("$a", "pizza tonight")), hit(edit("$e1", "$a", "pizza tomorrow"), rank: 2)],
                                      extraEvents: [], term: "pizza")
    check(summary(r) == [Summary(original: "$a", shown: "$a", body: "pizza tomorrow", edited: true)], "same term")
    check(r.first?.rank == 1, "rank of the first hit")
}

// reply relation of the original is kept on the shown event
do {
    let original = msg("$a", "hello", content: [
        "msgtype": "m.text", "body": "hello",
        "m.relates_to": ["m.in_reply_to": ["event_id": "$p"] as [String: Any]] as [String: Any],
    ])
    let r = MessageSearch.resolveHits([hit(original), hit(edit("$e1", "$a", "hello again"))], extraEvents: [], term: "hello")
    check(r.first?.event.replyToEventId == "$p", "reply kept")
}

// pagination: duplicates across pages dropped, same-room groups merged
do {
    let page1 = MessageSearch.resolveHits([hit(msg("$a", "hello a")), hit(msg("$b", "hello b", room: "!r2:x"))],
                                          extraEvents: [], term: "hello")
    let page2 = MessageSearch.resolveHits([hit(edit("$e1", "$b", "hello b2", room: "!r2:x")), hit(msg("$c", "hello c", room: "!r2:x"))],
                                          extraEvents: [msg("$b", "hello b", room: "!r2:x")], term: "hello")
    let groups = MessageSearch.mergePages([page1, page2])
    check(groups.map(\.roomId) == [mainRoom, "!r2:x"], "group rooms")
    check(groups.map { $0.items.map(\.originalEventId) } == [["$a"], ["$b", "$c"]], "group items")
}

// textMatchesTerm: prefix, case, diacritics, or, negation, quotes
check(MessageSearch.textMatchesTerm("Hallo Wélt", "welt"), "diacritics")
check(MessageSearch.textMatchesTerm("running fast", "run"), "prefix")
check(!MessageSearch.textMatchesTerm("hello world", "hello moon"), "all words")
check(MessageSearch.textMatchesTerm("hello world", "moon or world"), "or")
check(!MessageSearch.textMatchesTerm("hello world", "hello -world"), "negation")
check(MessageSearch.textMatchesTerm("hello world", "\"hello world\""), "quotes")

// request body like desktop
do {
    let body = MessageSearch.requestBody(term: "pizza", order: .recent, rooms: ["!a:x"])
    let roomEvents = (body["search_categories"] as? [String: Any])?["room_events"] as? [String: Any]
    check(roomEvents?["search_term"] as? String == "pizza", "term")
    check(roomEvents?["order_by"] as? String == "recent", "order")
    check(roomEvents?["include_state"] as? Bool == false, "no state")
    let filter = roomEvents?["filter"] as? [String: Any]
    check(filter?["limit"] as? Int == 20, "limit 20")
    check(filter?["rooms"] as? [String] == ["!a:x"], "rooms")
    check(filter?["senders"] == nil, "no senders key")
    let context = roomEvents?["event_context"] as? [String: Any]
    check(context?["before_limit"] as? Int == 0 && context?["include_profile"] as? Bool == false, "context")
    let global = MessageSearch.requestBody(term: "x", order: .rank, rooms: nil)
    let globalFilter = ((global["search_categories"] as? [String: Any])?["room_events"] as? [String: Any])?["filter"] as? [String: Any]
    check(globalFilter?["rooms"] == nil, "global: no rooms key")
    check(JSONSerialization.isValidJSONObject(body), "body is JSON")
}

// paths
check(MessageSearch.searchPath(nextBatch: nil) == "/_matrix/client/v3/search", "first page")
check(MessageSearch.searchPath(nextBatch: "") == "/_matrix/client/v3/search", "empty token")
check(MessageSearch.searchPath(nextBatch: "a+b/c=d&e") == "/_matrix/client/v3/search?next_batch=a%2Bb%2Fc%3Dd%26e", "token escaped")
check(MessageSearch.eventPath(roomId: "!r:x.org", eventId: "$ev/1") == "/_matrix/client/v3/rooms/%21r%3Ax.org/event/%24ev%2F1", "event path")
check(MessageSearch.contextPath(roomId: "!r:x", eventId: "$e", limit: 10) == "/_matrix/client/v3/rooms/%21r%3Ax/context/%24e?limit=10", "context path")

// answer parsing
do {
    let text = """
    {"search_categories":{"room_events":{"count":2,"highlights":["pizza","Pizza"],"next_batch":"tok",
    "results":[{"rank":0.5,"result":{"event_id":"$a","room_id":"!r:x","sender":"@a:x","type":"m.room.message",
    "origin_server_ts":1700000000000,"content":{"msgtype":"m.text","body":"pizza time"}}},
    {"rank":1,"result":{"event_id":"$broken"}}]}}}
    """
    let json = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
    let page = MessageSearch.parsePage(json)
    check(page.hits.count == 1, "broken result skipped")
    check(page.hits.first?.event.timestamp == 1_700_000_000_000, "timestamp")
    check(page.hits.first?.rank == 0.5, "rank")
    check(page.nextBatch == "tok", "next batch")
    check(page.highlights == ["pizza", "Pizza"], "highlights")
    let last = MessageSearch.parsePage(["search_categories": ["room_events": ["results": [] as [Any], "next_batch": ""] as [String: Any]]])
    check(last.nextBatch == nil && last.hits.isEmpty, "empty token is the end")
    check(MessageSearch.mergeHighlights([["a", "b"], ["b", "c"]]) == ["a", "b", "c"], "highlights merged")
}

// context in reading order
do {
    func ev(_ id: String, _ ts: Int) -> [String: Any] {
        ["event_id": id, "sender": "@a:x", "type": "m.room.message", "origin_server_ts": ts, "content": ["body": id] as [String: Any]]
    }
    let json: [String: Any] = [
        "events_before": [ev("$b1", 3), ev("$b2", 2), ev("$b3", 1)],
        "event": ev("$e", 4),
        "events_after": [ev("$a1", 5), ev("$e", 4)],
    ]
    let events = MessageSearch.contextEvents(json, roomId: "!r:x")
    check(events.map(\.eventId) == ["$b3", "$b2", "$b1", "$e", "$a1"], "context order")
    check(events.allSatisfy { $0.roomId == "!r:x" }, "context room filled in")
}

// highlighting
do {
    let segments = MessageSearch.highlightSegments("Pizza and pizza.", highlights: ["pizza"])
    check(segments == [
        .init(text: "Pizza", highlighted: true), .init(text: " and ", highlighted: false),
        .init(text: "pizza", highlighted: true), .init(text: ".", highlighted: false),
    ], "case-insensitive highlights")
    check(MessageSearch.highlightSegments("a+b (c)", highlights: ["+b", "(c"]).filter(\.highlighted).map(\.text) == ["+b", "(c"], "regex characters escaped")
    check(MessageSearch.highlightSegments("plain", highlights: []) == [.init(text: "plain", highlighted: false)], "no highlights")
    check(MessageSearch.highlightSegments("", highlights: ["x"]).isEmpty, "empty text")
    check(MessageSearch.highlightSegments("Grüße", highlights: ["grüße"]).first?.highlighted == true, "non-ASCII")
}

if failures == 0 { print("messagesearch_check: all checks passed") } else { print("messagesearch_check: \(failures) failure(s)"); exit(1) }
