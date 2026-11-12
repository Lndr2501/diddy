import Foundation

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
}
check(SlashCommand.command(in: "/me waves") == .me, "emote")
check(SlashCommand.command(in: "/unknown") == nil, "bot commands remain text")
check(SlashCommand.trim(.me, from: "/me hi") == "hi", "trim")
check(SlashCommand.parseFlags("-r spam -t m.room.message") == ["r": "spam", "t": "m.room.message"], "flags")
check(ComposerQuery.current(in: "hi #test") == .room("test"), "room query")
check(ComposerQuery.replacingWord(in: "hi :sm", with: "😀 ") == "hi 😀 ", "replace")
// The word at the cursor, not at the end (UTF-16 offsets like UITextView).
check(ComposerQuery.current(in: "hi @lu and more", selection: NSRange(location: 6, length: 0)) == .user("lu"), "mention at cursor")
check(ComposerQuery.current(in: "hi @lu and more", selection: NSRange(location: 15, length: 0)) == nil, "end word is plain")
check(ComposerQuery.current(in: "hi @lu", selection: NSRange(location: 3, length: 3)) == nil, "no query while selecting")
check(ComposerQuery.current(in: "😀 #ro x", selection: NSRange(location: 6, length: 0)) == .room("ro"), "UTF16 room query")
check(ComposerQuery.current(in: "a 😀", selection: NSRange(location: 3, length: 0)) == nil, "cursor inside a surrogate pair")
check(ComposerQuery.current(in: "hi :sm", selection: NSRange(location: 99, length: 0)) == .emoticon("sm"), "stale cursor clamps")
check(ComposerQuery.current(in: "/me", selection: NSRange(location: 2, length: 0)) == .command("m"), "command only as the whole draft")
check(ComposerQuery.current(in: "x /me", selection: NSRange(location: 5, length: 0)) == nil, "no command later")
let midWord = ComposerQuery.replacingWord(in: "hi @luis and 😀", selection: NSRange(location: 6, length: 0), with: "@Luis ")
check(midWord.text == "hi @Luis and 😀" && midWord.selection == NSRange(location: 9, length: 0), "replace the whole word at the cursor")
let emojiFirst = ComposerQuery.replacingWord(in: "😀 :sm x", selection: NSRange(location: 6, length: 0), with: "🙂 ")
check(emojiFirst.text == "😀 🙂 x" && emojiFirst.selection == NSRange(location: 6, length: 0), "UTF16 replacement")
let noWord = ComposerQuery.replacingWord(in: "ab", selection: NSRange(location: 1, length: 1), with: "X")
let atEnd = ComposerQuery.replacingWord(in: "hi @l", selection: NSRange(location: 5, length: 0), with: "@Luis ")
check(atEnd.text == "hi @Luis " && atEnd.selection == NSRange(location: 9, length: 0), "replace at the end")
check(noWord.text == "aX" && noWord.selection == NSRange(location: 2, length: 0), "selection is replaced")
let body = ComposerFormatter.bodies(of: "**bold** ||secret||", tokens: [:], markdown: true)
check(body.plain == "**bold** ||secret||", "plain retains markdown")
check(body.html.contains("<strong") && body.html.contains("data-mx-spoiler"), "formatted markdown")
let plain = ComposerFormatter.bodies(of: "**bold** <script>", tokens: [:], markdown: false)
check(plain.html == "**bold** &lt;script&gt;", "markdown disabled / escaping")
let mention = ComposerFormatter.message(from: "hi @Luis", tokens: ["@Luis": .user(id: "@luis:example.org")], markdown: true, command: nil, isReply: false, replyUserId: nil, ownUserId: "@me:example.org")!
check(mention.body == "hi @luis:example.org", "mention plain id")
check(mention.html?.contains("https://matrix.to/#/@luis:example.org") == true, "mention link")
check(mention.mentionedUserIds == ["@luis:example.org"], "mention notification")
check(ComposerFormatter.bodies(of: "#room", tokens: ["#room": .room(id: "!room:example.org", via: [])], markdown: false).html.contains("matrix.to"), "room pill")
let bold = ComposerFormat.bold.apply(to: "hi 😀", selection: NSRange(location: 3, length: 2))
check(bold.text == "hi **😀**", "UTF16 selection")
let defaults = UserDefaults(suiteName: "composer-check-" + UUID().uuidString)!
let saved = ComposerDraft(text: "draft", tokens: ["@Luis": .user(id: "@luis:example.org")], replyEventId: "$event")
ComposerDraftStore.save(saved, accountId: "a", roomId: "r", defaults: defaults)
check(ComposerDraftStore.load(accountId: "a", roomId: "r", defaults: defaults) == saved, "draft roundtrip")
check(ComposerDraftStore.load(accountId: "b", roomId: "r", defaults: defaults) == nil, "account isolation")
ComposerDraftStore.save(nil, accountId: "a", roomId: "r", defaults: defaults)
check(ComposerDraftStore.load(accountId: "a", roomId: "r", defaults: defaults) == nil, "clear on send")
check(EmojiCatalog.all.count > 1500 && !EmojiCatalog.search("smile").isEmpty, "desktop emoji data")
let pack = ImagePack.parse(id: "pack", content: ["pack": ["usage": ["sticker"]], "images": ["cat": ["url": "mxc://example.org/cat"], "dog": ["url": "mxc://example.org/dog", "usage": ["emoticon"]]]])!
check(pack.images(for: ImagePack.sticker).count == 1 && pack.images(for: ImagePack.emoticon).count == 1, "pack usage overrides")
check(ComposerSize.exceeds(100, limit: 100) && !ComposerSize.exceeds(99, limit: 100), "upload limit boundary")
check(SlashCommand.removingDirect(["@a:x": ["!r:x", "!other:x"]], roomId: "!r:x") == ["@a:x": ["!other:x"]], "DM conversion preserves other rooms")
print("composer checks passed")
let malicious = ImagePack.parse(id: "untrusted", content: ["images": ["bad": ["url": "mxc://x/\"onerror=alert(1)"], "web": ["url": "https://example.org/tracker"], "ok": ["url": "mxc://example.org/image"]]])!
check(malicious.images.count == 1, "reject unsafe custom image sources")
let notice = ComposerFormatter.message(from: "/notice hi", tokens: [:], markdown: false, command: .notice, isReply: false, replyUserId: nil, ownUserId: "@me:example.org")!
check(notice.body == "hi" && notice.html == nil, "plain notice has no formatted body")
