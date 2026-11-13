// Checks for Diddy/Matrix/BotCard.swift. Run from the ios folder:
//   swiftc Diddy/Matrix/BotCard.swift Tools/botcard_check/main.swift -o /tmp/botcard_check && /tmp/botcard_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

func event(_ card: String, extra: String = "") -> String {
    #"{"type":"m.room.message","content":{"msgtype":"m.notice","body":"x","dev.diddy.card":\#(card)\#(extra)}}"#
}
func parse(_ card: String) -> BotCard? { BotCardParser.card(originalJson: event(card), latestEditJson: nil) }

// track
if case .track(let t)? = parse(#"{"v":1,"kind":"track","state":"playing","title":"  Cheri Cheri Lady ","artist":"Modern Talking","duration":197,"position":10,"startedAt":1000,"thumbnail":"mxc://example.org/abc","url":"https://example.org/x","seek":"!seek","volume":50,"actions":[{"label":"Pause","send":"!pause"},{"label":"Bad","send":"pause"},{"label":"","send":"!x"}]}"#) {
    check(t.title == "Cheri Cheri Lady", "title trimmed")
    check(t.state == .playing && t.duration == 197 && t.volume == 50, "numbers")
    check(t.thumbnail == "mxc://example.org/abc", "mxc kept")
    check(t.url == "https://example.org/x", "https url kept")
    check(t.seek == "!seek", "seek kept")
    check(t.actions == [BotCardAction(label: "Pause", send: "!pause")], "only command-like buttons")
} else { check(false, "track parses") }

// player layout
if case .track(let t)? = parse(#"{"v":1,"kind":"track","state":"paused","title":"t","room":" Call #1 ","requestedBy":"Lndr","volume":60,"volumeMax":150,"upNext":[{"title":"a","artist":"b"},{"title":""},{"title":"c"},{"title":"d"},{"title":"e"}],"controls":{"prev":"!previous","toggle":"!resume","skip":"!skip now","volume":"!volume","dashboard":"!dashboard","bad":"!x"},"more":[{"label":"Loop","send":"!loop"},{"label":"x","send":"loop"}]}"#) {
    check(t.room == "Call #1" && t.requestedBy == "Lndr", "room and requester")
    check(t.upNext == [BotCardUpNext(title: "a", artist: "b"), BotCardUpNext(title: "c", artist: nil), BotCardUpNext(title: "d", artist: nil)], "up next: max 3, empty titles dropped")
    check(t.controls == BotCardControls(prev: "!previous", toggle: "!resume", skip: "!skip now", volume: "!volume", dashboard: "!dashboard"), "controls")
    check(t.volumeMax == 150, "volumeMax")
    check(t.more == [BotCardAction(label: "Loop", send: "!loop")], "more: only commands")
} else { check(false, "player track parses") }

if case .track(let t)? = parse(#"{"v":1,"kind":"track","state":"playing","title":"t","controls":{"prev":"!a b c","toggle":"pause","skip":"!xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","volume":"! x"},"volumeMax":0}"#) {
    check(t.controls == BotCardControls(), "bad player commands dropped, controls object kept")
    check(t.volumeMax == nil, "volumeMax 0 dropped")
} else { check(false, "player track 2 parses") }

do {
    let many = (0..<20).map { #"{"label":"L\#($0)","send":"!c\#($0)"}"# }.joined(separator: ",")
    if case .track(let t)? = parse(#"{"v":1,"kind":"track","state":"playing","title":"t","controls":{},"more":[\#(many)],"actions":[\#(many)]}"#) {
        check(t.more.count == 16 && t.actions.count == 10, "more takes 16, actions 10")
    } else { check(false, "many buttons parse") }
}

if case .track(let t)? = parse(#"{"v":1,"kind":"track","state":"playing","title":"t"}"#) {
    check(t.controls == nil && t.upNext.isEmpty && t.more.isEmpty, "classic card has no player fields")
} else { check(false, "classic track parses") }

if case .track(let t)? = parse(#"{"v":1,"kind":"track","state":"playing","title":"a","thumbnail":"https://evil/x.png","url":"javascript:alert(1)","seek":"seek","duration":-1,"position":true}"#) {
    check(t.thumbnail == nil, "https thumbnail dropped")
    check(t.url == nil, "javascript url dropped")
    check(t.seek == nil, "seek needs prefix")
    check(t.duration == nil && t.position == nil, "negative and boolean numbers dropped")
} else { check(false, "track 2 parses") }

check(parse(#"{"v":2,"kind":"note","text":"a"}"#) == nil, "unknown version")
check(parse(#"{"v":1,"kind":"nope"}"#) == nil, "unknown kind")
check(parse(#"{"v":1,"kind":"track","state":"weird","title":"a"}"#) == nil, "unknown state")
check(parse(#"{"v":1,"kind":"track","state":"playing"}"#) == nil, "missing title")
check(parse(#"{"v":true,"kind":"note","text":"a"}"#) == nil, "v must be the number 1")
check(parse(#"{"v":1,"kind":"track","state":"playing","title":"a","thumbnail":"mxc://a/b/c"}"#).flatMap { if case .track(let t) = $0 { return t.thumbnail } else { return nil } } == nil, "mxc with extra segment")

// limits
if case .track(let t)? = parse(#"{"v":1,"kind":"track","state":"playing","title":"\#(String(repeating: "a", count: 500))"}"#) {
    check(t.title.count == 200 && t.title.hasSuffix("…"), "title cut to 200")
} else { check(false, "long title parses") }

// queue
if case .queue(let now, let items, let total, _)? = parse(#"{"v":1,"kind":"queue","now":{"title":"N"},"items":[{"title":"A","artist":"X","duration":61},{"nope":1},{"title":"B"}],"total":9}"#) {
    check(now?.title == "N" && items.count == 2 && total == 9, "queue")
} else { check(false, "queue parses") }

// help
check(parse(#"{"v":1,"kind":"help","groups":[{"title":"G","items":[]}]}"#) == nil, "help without items")
if case .help(let groups, let note)? = parse(#"{"v":1,"kind":"help","groups":[{"title":"G","items":[{"usage":"!a","desc":"d"},{"usage":"!b"}]}],"note":"n"}"#) {
    check(groups.count == 1 && groups[0].items.count == 1 && note == "n", "help")
} else { check(false, "help parses") }

// list
if case .list(let title, let items, let total, let empty, _)? = parse(#"{"v":1,"kind":"list","title":"Fav","items":[{"title":"A","subtitle":"S"}],"empty":"leer"}"#) {
    check(title == "Fav" && items.first?.artist == "S" && total == 1 && empty == "leer", "list")
} else { check(false, "list parses") }

// stats
if case .stats(_, let charts, _)? = parse(#"{"v":1,"kind":"stats","title":"S","charts":[{"title":"C","unit":"x","items":[{"label":"a","value":3},{"label":"b","value":-1},{"label":"c","value":"7"}]}]}"#) {
    check(charts.count == 1 && charts[0].items.count == 1, "stats keeps only valid values")
} else { check(false, "stats parses") }
check(parse(#"{"v":1,"kind":"stats","title":"S","charts":[]}"#) == nil, "stats without charts")

// note
if case .note(let text, let tone, let icon)? = parse(#"{"v":1,"kind":"note","text":"hi\u0001there","tone":"bad","icon":"👋"}"#) {
    check(text == "hithere" && tone == .info && icon == "👋", "note")
} else { check(false, "note parses") }

// edits
let original = event(#"{"v":1,"kind":"note","text":"old"}"#)
let edit = #"{"content":{"msgtype":"m.notice","body":"* new","m.new_content":{"msgtype":"m.notice","body":"new","dev.diddy.card":{"v":1,"kind":"note","text":"new"}},"m.relates_to":{"rel_type":"m.replace"}}}"#
if case .note(let text, _, _)? = BotCardParser.card(originalJson: original, latestEditJson: edit) { check(text == "new", "edit replaces card") } else { check(false, "edit card parses") }
let editWithout = #"{"content":{"m.new_content":{"msgtype":"m.notice","body":"new"}}}"#
check(BotCardParser.card(originalJson: original, latestEditJson: editWithout) == nil, "edit without card removes it")
check(BotCardParser.card(originalJson: nil, latestEditJson: nil) == nil, "no json")

// action messages
func action(_ body: String, flag: String = "true", type: String = "m.text") -> Bool {
    let json = #"{"content":{"msgtype":"\#(type)","body":"\#(body)","dev.diddy.card_action":\#(flag)}}"#
    return BotCardParser.isAction(originalJson: json)
}
check(action("!pause"), "!pause")
check(action("!seek 1:23"), "!seek 1:23")
check(action("/volume -10"), "/volume -10")
check(!action("!pause", flag: "1"), "flag must be true")
check(!action("!pause", flag: "false"), "flag false")
check(!action("hello there", flag: "true"), "not command-shaped")
check(!action("!a b c d"), "too many words")
check(!action("!pause", type: "m.notice"), "notice is no action")
check(!action("!" + String(repeating: "a", count: 40)), "too long word")
check(BotCardParser.actionContent("!pause").map { $0.contains("dev.diddy.card_action") && $0.contains("m.text") } == true, "wire format")

// time
check(BotCardParser.formatTime(197) == "3:17", "3:17")
check(BotCardParser.formatTime(3723) == "1:02:03", "1:02:03")
check(BotCardParser.formatTime(-5) == "0:00", "negative")
let track = BotCardTrack(state: .playing, title: "t", artist: nil, duration: 100, position: 10, startedAt: 1_000_000, thumbnail: nil, url: nil, source: nil, note: nil, seek: nil, volume: nil, actions: [])
check(BotCardParser.livePosition(track, now: Date(timeIntervalSince1970: 1010)) == 20, "live position")
check(BotCardParser.livePosition(track, now: Date(timeIntervalSince1970: 5000)) == 100, "live position clamped")

// commands
let commandContent = try! JSONSerialization.jsonObject(with: Data(#"{"v":1,"prefix":"!","commands":[{"name":"play","usage":"!play <x>","desc":"Play"},{"name":"pause"},{"name":"bad name"},{"name":"play2/x"}]}"#.utf8)) as! [String: Any]
let list = BotCommandParser.parse(content: commandContent)
check(list?.commands.map(\.name) == ["play", "pause", "play2/x"], "command names")
check(list?.commands[1].usage == "!pause" && list?.commands[1].desc == "", "default usage")
for bad in [#"{"v":1,"prefix":"a","commands":[{"name":"x"}]}"#, #"{"v":1,"prefix":"!!!","commands":[{"name":"x"}]}"#, #"{"v":2,"prefix":"!","commands":[{"name":"x"}]}"#, #"{"v":1,"prefix":"!","commands":[]}"#] {
    let content = try! JSONSerialization.jsonObject(with: Data(bad.utf8)) as! [String: Any]
    check(BotCommandParser.parse(content: content) == nil, "invalid list \(bad)")
}
let lists = [list!]
check(BotCommandParser.match(lists, typed: "!").count == 3, "all on prefix")
check(BotCommandParser.match(lists, typed: "!pl").map(\.name) == ["play", "play2/x"], "prefix match")
check(BotCommandParser.match(lists, typed: "!pau").count == 1, "single match")
check(BotCommandParser.match(lists, typed: "!pause").isEmpty, "exact match needs no suggestion")
check(BotCommandParser.match(lists, typed: "hello").isEmpty, "other prefix")
check(BotCommandParser.match(lists, typed: "?x").isEmpty, "wrong prefix")

if failures == 0 { print("botcard checks passed") } else { print("\(failures) failures"); exit(1) }
