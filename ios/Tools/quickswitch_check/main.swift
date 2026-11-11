// Checks for Diddy/Matrix/QuickSwitchLogic.swift (the desktop's search window, Cmd+K).
// Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/QuickSwitchLogic.swift Tools/quickswitch_check/main.swift -o /tmp/quickswitch_check && /tmp/quickswitch_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

typealias Item = QuickSwitch.Item
func room(_ id: String, _ name: String) -> Item { Item(id: id, name: name, dmUsername: nil, kind: .rooms) }
func dm(_ id: String, _ name: String, _ user: String) -> Item { Item(id: id, name: name, dmUsername: user, kind: .directs) }
func space(_ id: String, _ name: String) -> Item { Item(id: id, name: name, dmUsername: nil, kind: .spaces) }

// prefixes
check(QuickSwitch.parse("  #general ").kind == .rooms && QuickSwitch.parse("  #general ").query == "general", "# is rooms")
check(QuickSwitch.parse("@lndr").kind == .directs, "@ is directs")
check(QuickSwitch.parse("*").kind == .spaces && QuickSwitch.parse("*").query == "", "* alone is spaces, empty query")
check(QuickSwitch.parse("hello").kind == nil && QuickSwitch.parse("hello").query == "hello", "no prefix")
check(QuickSwitch.parse("   ").query == "", "blank")
check(QuickSwitch.parse("# gen").query == " gen", "space after the prefix stays, like desktop")

let rooms = [room("!r1", "General"), room("!r2", "Off-Topic"), room("!r3", "Gaming general")]
let directs = [dm("!d1", "Lena", "lena"), dm("!d2", "Max", "maxi_ger")]
let spaces = [space("!s1", "Gen Z Club")]

// targets per type
check(QuickSwitch.targets(nil, rooms: rooms, directs: directs, spaces: spaces).count == 6, "all targets")
check(QuickSwitch.targets(.spaces, rooms: rooms, directs: directs, spaces: spaces).map(\.id) == ["!s1"], "spaces only")

// recent: by activity, 20 at most; spaces all
let activity = ["!d1": 0, "!r3": 1, "!r1": 2, "!d2": 3, "!r2": 4]
check(QuickSwitch.recent(nil, rooms: rooms, directs: directs, spaces: spaces, activity: activity).map(\.id)
      == ["!d1", "!r3", "!r1", "!d2", "!r2"], "recent mixes rooms and DMs by activity")
check(QuickSwitch.recent(.spaces, rooms: rooms, directs: directs, spaces: spaces, activity: activity).map(\.id) == ["!s1"], "recent spaces")
let many = (0..<30).map { room("!m\($0)", "Room \($0)") }
check(QuickSwitch.recent(.rooms, rooms: many, directs: [], spaces: [], activity: [:]).count == 20, "at most 20 recent")

// matching: contains, case and width folded, DM user name searched too
check(QuickSwitch.search("gen", in: rooms + directs + spaces).map(\.id).sorted() == ["!r1", "!r3", "!s1"], "contains")
check(QuickSwitch.search("GENERAL", in: rooms).count == 2, "case-insensitive")
check(QuickSwitch.search("ｇｅｎｅｒａｌ", in: rooms).count == 2, "full-width letters (NFKC)")
check(QuickSwitch.search("ger", in: directs).map(\.id) == ["!d2"], "DM user name")
check(QuickSwitch.search("ger", in: [room("!x", "Tiger")]).map(\.id) == ["!x"], "room name only")
check(QuickSwitch.search("", in: rooms).isEmpty, "empty query finds nothing")
check(QuickSwitch.search("zzz", in: rooms).isEmpty, "no match")
check(QuickSwitch.search("gaming gen", in: rooms).map(\.id) == ["!r3"], "spaces in the query are kept")

// ranking like orderSearchItems: earlier and whole-word matches first, then shorter names
check(QuickSwitch.search("general", in: rooms).map(\.id) == ["!r1", "!r3"], "match at start beats later match")
check(QuickSwitch.search("top", in: [room("!a", "Laptops"), room("!b", "Off-Topic")]).map(\.id) == ["!b", "!a"], "word start wins")
check(QuickSwitch.search("art", in: [room("!a", "Art Club"), room("!b", "Art")]).map(\.id) == ["!b", "!a"], "shorter name wins on a tie")
check(QuickSwitch.search("x", in: [room("!a", "x one"), room("!b", "x two")]).map(\.id) == ["!a", "!b"], "equal scores keep their order")

check(QuickSwitch.highlightWords("gaming  gen") == ["gaming", "gen"], "highlight words")

if failures == 0 { print("quickswitch_check: all checks passed") } else { print("quickswitch_check: \(failures) failure(s)"); exit(1) }
