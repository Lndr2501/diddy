// Checks for Diddy/Matrix/ReactionEmoji.swift (#166). Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc Diddy/Matrix/ReactionEmoji.swift Tools/reaction_check/main.swift -o /tmp/reaction_check && /tmp/reaction_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
func scalars(_ s: String?) -> [UInt32] { s.map { $0.unicodeScalars.map(\.value) } ?? [] }

// Everything the emoji keyboard inserts is one grapheme and comes back unchanged.
let picked: [(String, String)] = [
    ("\u{1F600}", "plain emoji"),
    ("\u{1F44D}\u{1F3FD}", "skin tone"),
    ("\u{1F469}\u{1F3FE}\u{200D}\u{1F4BB}", "ZWJ with skin tone"),
    ("\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}", "family ZWJ"),
    ("\u{2764}\u{FE0F}\u{200D}\u{1F525}", "heart on fire (text-default base)"),
    ("\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}", "rainbow flag"),
    ("\u{1F1E9}\u{1F1EA}", "country flag"),
    ("\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", "tag flag"),
    ("1\u{FE0F}\u{20E3}", "keycap"),
    ("\u{2764}\u{FE0F}", "red heart with VS16"),
    ("\u{263A}\u{FE0F}", "smiling face with VS16"),
    ("\u{1FAE8}", "newer emoji (shaking face)"),
    ("\u{1F426}\u{200D}\u{1F525}", "newer ZWJ (phoenix)"),
]
for (emoji, name) in picked {
    check(emoji.count == 1, "\(name) is one grapheme")
    check(ReactionEmoji.isEmoji(Character(emoji)), "\(name) is an emoji")
    check(scalars(ReactionEmoji.lastEmoji(in: emoji)) == scalars(emoji), "\(name) kept exactly")
}

// Every quick reaction passes the same rule, so menu and picker agree.
check(ReactionEmoji.quick.count == 8, "quick list unchanged")
for emoji in ReactionEmoji.quick {
    check(ReactionEmoji.lastEmoji(in: emoji) == emoji, "quick \(emoji) accepted unchanged")
}
// The quick heart carries VS16 like the desktop's; the variation selector must not be dropped.
check(scalars(ReactionEmoji.quick[1]) == [0x2764, 0xFE0F], "quick heart is U+2764 U+FE0F")

// Text that is not an emoji never becomes a reaction.
for text in ["", " ", "a", "Hi", "1", "#", "*", "\u{00A9}", "\u{2764}", "\u{263A}", "\u{FE0F}", "a\u{FE0F}", "\u{200D}", "\n", "ä"] {
    check(ReactionEmoji.lastEmoji(in: text) == nil, "no emoji in \(scalars(text))")
}

// Mixed input (paste, other keyboard): the last emoji wins, surrounding text is dropped.
check(ReactionEmoji.lastEmoji(in: "ok \u{1F44D}") == "\u{1F44D}", "text before emoji dropped")
check(ReactionEmoji.lastEmoji(in: "\u{1F525} yes") == "\u{1F525}", "text after emoji dropped")
check(ReactionEmoji.lastEmoji(in: "\u{1F600}\u{1F44D}\u{1F3FB}") == "\u{1F44D}\u{1F3FB}", "last of several, with its skin tone")
check(ReactionEmoji.lastEmoji(in: "1\u{FE0F}\u{20E3}2") == "1\u{FE0F}\u{20E3}", "keycap before a digit")

if failures == 0 { print("ALL OK") } else { print("\(failures) FAILED"); exit(1) }
