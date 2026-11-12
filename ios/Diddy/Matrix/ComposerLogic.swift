import Foundation

// The message composer's rules, taken from the desktop (cinny `features/room/RoomInput.tsx`,
// `hooks/useCommands.ts`, `components/editor/output.ts`, `plugins/custom-emoji`,
// `plugins/recent-emoji.ts`, `state/room/roomInputDrafts.ts`). Foundation only, checked by
// Tools/composer_check.

// MARK: - Matrix ids (desktop utils/matrix.ts)

enum MatrixIdRules {
    private static func matchMxId(_ id: String) -> DesktopMarkdown.Match? {
        DesktopMarkdown.firstMatch(#"^([@$+#])([^\s:]+):(\S+)$"#, in: id)
    }

    static func isUserId(_ id: String) -> Bool { id.hasPrefix("@") && matchMxId(id) != nil }
    static func isRoomId(_ id: String) -> Bool { id.hasPrefix("!") }
    static func isRoomAlias(_ id: String) -> Bool { id.hasPrefix("#") && matchMxId(id) != nil }
    /// Like desktop: anything that contains a domain name.
    static func isServerName(_ name: String) -> Bool {
        DesktopMarkdown.firstMatch(#"\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b"#, in: name) != nil
    }

    /// The server part of `@user:server`, `#alias:server` or `!room:server`.
    static func server(of id: String) -> String? {
        guard let colon = id.firstIndex(of: ":") else { return nil }
        let server = String(id[id.index(after: colon)...])
        return server.isEmpty ? nil : server
    }

    /// The desktop's `splitWithSpace`: trimmed, split at single spaces.
    static func splitWithSpace(_ text: String) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return [] }
        return trimmed.components(separatedBy: " ")
    }

    /// `https://matrix.to/#/<id>` with `via` servers, encoded like the desktop's `encodeURI`.
    static func matrixTo(_ id: String, via: [String] = []) -> String {
        var fragment = id
        if !via.isEmpty { fragment += "?" + via.map { "via=\($0)" }.joined(separator: "&") }
        return encodeURI("https://matrix.to/#/" + fragment)
    }

    /// JavaScript's `encodeURI`.
    static func encodeURI(_ text: String) -> String {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789;,/?:@&=+$-_.!~*'()#")
        return text.addingPercentEncoding(withAllowedCharacters: allowed) ?? text
    }
}

// MARK: - Slash commands (desktop hooks/useCommands.ts)

enum SlashCommand: String, CaseIterable, Identifiable {
    // Same order as the desktop's command record, which is the order of its suggestions.
    case me, notice, shrug, tableflip, unflip, startdm, join, leave, invite, disinvite, kick, ban,
         unban, ignore, unignore, myroomnick, myroomavatar, converttodm, converttoroom, delete, acl

    var id: String { rawValue }

    static let shrugText = "¯\\_(ツ)_/¯"
    static let tableflipText = "(╯°□°)╯︵ ┻━┻"
    static let unflipText = "┬─┬ノ( º_ºノ)"

    var description: String {
        switch self {
        case .me: return "Send action message"
        case .notice: return "Send notice message"
        case .shrug: return "Send ¯\\_(ツ)_/¯ as message"
        case .tableflip: return "Send \(Self.tableflipText) as message"
        case .unflip: return "Send \(Self.unflipText) as message"
        case .startdm: return "Start direct message with user. Example: /startdm userId1"
        case .join: return "Join room with address. Example: /join address1 address2"
        case .leave: return "Leave current room."
        case .invite: return "Invite user to room. Example: /invite userId1 userId2 [-r reason]"
        case .disinvite: return "Disinvite user to room. Example: /disinvite userId1 userId2 [-r reason]"
        case .kick: return "Kick user from room. Example: /kick userId1 userId2 servername [-r reason]"
        case .ban: return "Ban user from room. Example: /ban userId1 userId2 servername [-r reason]"
        case .unban: return "Unban user from room. Example: /unban userId1 userId2"
        case .ignore: return "Ignore user. Example: /ignore userId1 userId2"
        case .unignore: return "Unignore user. Example: /unignore userId1 userId2"
        case .myroomnick: return "Change nick in current room."
        case .myroomavatar: return "Change profile picture in current room. Example /myroomavatar mxc://xyzabc"
        case .converttodm: return "Convert room to direct message"
        case .converttoroom: return "Convert direct message to room"
        case .delete:
            return "Delete messages from users. Example: /delete userId1 servername -past 1d|2h|5m|30s [-t m.room.message] [-r spam]"
        case .acl:
            return "Manage server access control list. Example /acl [-a servername1] [-d servername2] [-ra servername1] [-rd servername2]"
        }
    }

    /// The text these put in front of the message instead of running something.
    var messagePrefix: String? {
        switch self {
        case .shrug: return Self.shrugText
        case .tableflip: return Self.tableflipText
        case .unflip: return Self.unflipText
        default: return nil
        }
    }

    /// Commands that send a message (an emote, a notice or text with a prefix).
    var sendsMessage: Bool {
        switch self {
        case .me, .notice, .shrug, .tableflip, .unflip: return true
        default: return false
        }
    }

    /// The command the draft starts with: `/name` at the very beginning, then a space, a new line
    /// or the end. Desktop only runs a command picked from its suggestions; here a known name typed
    /// in full counts too, anything else is sent as text.
    static func command(in draft: String) -> SlashCommand? {
        let text = draft.drop { $0 == " " || $0 == "\t" }
        guard text.first == "/" else { return nil }
        let name = text.dropFirst().prefix { !$0.isWhitespace && !$0.isNewline }
        return SlashCommand(rawValue: String(name))
    }

    /// `trimCommand`: removes `/name` and the spaces after it from the start of the text.
    static func trim(_ command: SlashCommand, from text: String) -> String {
        guard let match = DesktopMarkdown.firstMatch(#"^(\s+)?(\/"# + NSRegularExpression.escapedPattern(for: command.rawValue) + #")([^\S\n]+)?"#, in: text)
        else { return text }
        return (text as NSString).substring(from: match.range.length)
    }

    /// Suggestions while the whole draft is `/` and part of a name (desktop's contains search).
    static func suggestions(for draft: String) -> [SlashCommand] {
        guard draft.hasPrefix("/"), !draft.contains(where: { $0.isWhitespace || $0.isNewline }) else { return [] }
        let query = draft.dropFirst().lowercased()
        if query.isEmpty { return allCases }
        return allCases.filter { $0.rawValue.contains(query) }
    }

    // MARK: Payload parsing

    /// `splitPayloadContentAndFlags`: the text before the first ` -flag`, and the flags.
    static func splitFlags(_ payload: String) -> (content: String, flags: String?) {
        guard let match = DesktopMarkdown.firstMatch(#"(?:^|\s)-(\w+)\b"#, in: payload) else { return (payload, nil) }
        let ns = payload as NSString
        return (ns.substring(to: match.range.location), ns.substring(from: match.range.location))
    }

    /// `parseFlags`: `-r spam -t m.room.message` becomes `["r": "spam", "t": "m.room.message"]`.
    static func parseFlags(_ flags: String?) -> [String: String] {
        guard let flags, let regex = DesktopMarkdown.regex(#"(?:^|\s)-(\w+)\b"#) else { return [:] }
        let ns = flags as NSString
        let matches = regex.matches(in: flags, range: NSRange(location: 0, length: ns.length))
        var result: [String: String] = [:]
        for (index, match) in matches.enumerated() {
            let key = ns.substring(with: match.range(at: 1))
            let start = match.range.location + match.range.length
            let end = index + 1 < matches.count ? matches[index + 1].range.location : ns.length
            let value = ns.substring(with: NSRange(location: start, length: max(0, end - start)))
            result[key] = value.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return result
    }

    static func users(in payload: String) -> [String] {
        MatrixIdRules.splitWithSpace(payload).filter(MatrixIdRules.isUserId)
    }

    static func servers(in payload: String) -> [String] {
        MatrixIdRules.splitWithSpace(payload).filter(MatrixIdRules.isServerName)
    }

    /// `parseTimestampFlag`: `1.5d`, `2h`, `5m`, `30s` before now.
    static func pastDate(_ input: String, now: Date = Date()) -> Date? {
        guard let match = DesktopMarkdown.firstMatch(#"^(\d+(?:\.\d+)?)([dhms])$"#, in: input),
              let value = Double(match.group(1)) else { return nil }
        let seconds: Double
        switch match.group(2) {
        case "d": seconds = value * 86_400
        case "h": seconds = value * 3_600
        case "m": seconds = value * 60
        case "s": seconds = value
        default: return nil
        }
        return now.addingTimeInterval(-seconds)
    }

    /// The new `m.room.server_acl` content for `/acl` (`-a`, `-d`, `-ra`, `-rd`), sorted like desktop.
    static func updatedAcl(_ current: [String: Any], flags: [String: String]) -> [String: Any] {
        func list(_ key: String) -> [String] { flags[key].map { MatrixIdRules.splitWithSpace($0) } ?? [] }
        var allow = (current["allow"] as? [String]) ?? []
        var deny = (current["deny"] as? [String]) ?? []
        for server in list("a") where !allow.contains(server) { allow.append(server) }
        for server in list("d") where !deny.contains(server) { deny.append(server) }
        let removeAllow = list("ra")
        let removeDeny = list("rd")
        allow = allow.filter { !removeAllow.contains($0) }.sorted()
        deny = deny.filter { !removeDeny.contains($0) }.sorted()
        var result: [String: Any] = ["allow": allow, "deny": deny]
        if let literals = current["allow_ip_literals"] { result["allow_ip_literals"] = literals }
        return result
    }

    /// `addRoomIdToMDirect`: the room becomes the DM with `userId` and nobody else's.
    static func addingDirect(_ content: [String: [String]], roomId: String, userId: String) -> [String: [String]] {
        var result = content
        for (target, rooms) in content where target != userId {
            result[target] = rooms.filter { $0 != roomId }
        }
        var rooms = result[userId] ?? []
        if !rooms.contains(roomId) { rooms.append(roomId) }
        result[userId] = rooms
        return result
    }

    /// `removeRoomIdFromMDirect`.
    static func removingDirect(_ content: [String: [String]], roomId: String) -> [String: [String]] {
        content.mapValues { $0.filter { $0 != roomId } }
    }
}

// MARK: - Autocomplete

enum ComposerQuery: Equatable {
    case user(String)
    case room(String)
    case emoticon(String)
    case command(String)

    /// The word being typed at the end of the draft and what it asks for, like the desktop's
    /// prefixes `@`, `#`, `:` and `/` (commands only at the very start, where they run).
    static func current(in draft: String) -> ComposerQuery? {
        let word = String(draft.reversed().prefix { !$0.isWhitespace && !$0.isNewline }.reversed())
        guard let first = word.first else { return nil }
        let rest = String(word.dropFirst())
        switch first {
        case "@": return .user(rest)
        case "#": return .room(rest)
        case ":": return rest.contains(":") ? nil : .emoticon(rest)
        case "/": return word == draft ? .command(rest) : nil
        default: return nil
        }
    }

    /// The draft with the word at its end replaced by `replacement`.
    static func replacingWord(in draft: String, with replacement: String) -> String {
        let length = draft.reversed().prefix { !$0.isWhitespace && !$0.isNewline }.count
        return String(draft.dropLast(length)) + replacement
    }

    /// The word at the cursor (a collapsed `selection`, UTF-16 like `UITextView`): `typed` runs
    /// from the word's start to the cursor, `range` to the word's end, which a suggestion replaces.
    /// Nil while text is selected or the cursor sits inside a character.
    static func word(in draft: String, selection: NSRange) -> (typed: String, range: NSRange)? {
        let ns = draft as NSString
        guard selection.length == 0, selection.location != NSNotFound else { return nil }
        let cursor = min(max(selection.location, 0), ns.length)
        guard let before = Range(NSRange(location: 0, length: cursor), in: draft),
              let after = Range(NSRange(location: cursor, length: ns.length - cursor), in: draft) else { return nil }
        let typed = String(draft[before].reversed().prefix { !$0.isWhitespace }.reversed())
        let rest = draft[after].prefix { !$0.isWhitespace }
        let typedLength = (typed as NSString).length
        let restLength = (String(rest) as NSString).length
        return (typed, NSRange(location: cursor - typedLength, length: typedLength + restLength))
    }

    /// What the word at the cursor asks for; the same prefixes as `current(in:)`.
    static func current(in draft: String, selection: NSRange) -> ComposerQuery? {
        guard let word = word(in: draft, selection: selection), let first = word.typed.first else { return nil }
        let rest = String(word.typed.dropFirst())
        switch first {
        case "@": return .user(rest)
        case "#": return .room(rest)
        case ":": return rest.contains(":") ? nil : .emoticon(rest)
        case "/":
            let whole = word.range.location == 0 && word.range.length == (draft as NSString).length
            return whole ? .command(rest) : nil
        default: return nil
        }
    }

    /// The draft with the word at the cursor replaced by `replacement` (inserted at the cursor
    /// when there is no word), and the cursor after it.
    static func replacingWord(in draft: String, selection: NSRange, with replacement: String) -> (text: String, selection: NSRange) {
        let ns = draft as NSString
        let target: NSRange
        if let word = word(in: draft, selection: selection) {
            target = word.range
        } else {
            let start = min(max(selection.location == NSNotFound ? ns.length : selection.location, 0), ns.length)
            target = NSRange(location: start, length: min(max(selection.length, 0), ns.length - start))
        }
        // A word in the middle already has a space after it: reuse it instead of doubling it.
        var inserted = replacement
        let end = NSMaxRange(target)
        if inserted.hasSuffix(" "), end < ns.length, ns.character(at: end) == 0x20 {
            inserted.removeLast()
        }
        let text = ns.replacingCharacters(in: target, with: inserted)
        let skip = inserted.count < replacement.count ? 1 : 0
        return (text, NSRange(location: target.location + (inserted as NSString).length + skip, length: 0))
    }
}

// MARK: - Turning the draft into a message (desktop components/editor/output.ts)

/// Something picked from the suggestions that the plain draft only shows as text.
enum ComposerToken: Codable, Equatable {
    case user(id: String)
    case room(id: String, via: [String])
    case emoticon(mxc: String, shortcode: String)
}

struct ComposedMessage: Equatable {
    var body: String
    /// The HTML body, nil when it says nothing the plain body does not (desktop leaves it out then).
    var html: String?
    var mentionedUserIds: [String]
}

enum ComposerFormatter {
    private enum Segment {
        case text(String)
        case token(String, ComposerToken)
    }

    /// Splits a line at the tokens; longer keys first, so "@Lu" does not eat the start of "@Luis".
    private static func segments(of line: String, tokens: [String: ComposerToken]) -> [Segment] {
        let keys = tokens.keys.filter { !$0.isEmpty }.sorted { $0.count > $1.count }
        guard !keys.isEmpty else { return [.text(line)] }
        var result: [Segment] = []
        var text = ""
        var index = line.startIndex
        outer: while index < line.endIndex {
            for key in keys where line[index...].hasPrefix(key) {
                if !text.isEmpty { result.append(.text(text)); text = "" }
                if let token = tokens[key] { result.append(.token(key, token)) }
                index = line.index(index, offsetBy: key.count)
                continue outer
            }
            text.append(line[index])
            index = line.index(after: index)
        }
        if !text.isEmpty { result.append(.text(text)) }
        return result
    }

    private static func html(of key: String, _ token: ComposerToken) -> String {
        switch token {
        case .user(let id):
            return "<a href=\"\(DesktopMarkdown.escapeHTML(MatrixIdRules.matrixTo(id)))\">\(DesktopMarkdown.escapeHTML(key))</a>"
        case .room(let id, let via):
            return "<a href=\"\(DesktopMarkdown.escapeHTML(MatrixIdRules.matrixTo(id, via: via)))\">\(DesktopMarkdown.escapeHTML(key))</a>"
        case .emoticon(let mxc, let shortcode):
            let name = DesktopMarkdown.escapeHTML(shortcode)
            return "<img data-mx-emoticon src=\"\(mxc)\" alt=\"\(name)\" title=\"\(name)\" height=\"32\" />"
        }
    }

    private static func plain(of key: String, _ token: ComposerToken) -> String {
        switch token {
        case .user(let id): return id
        case .room(let id, _): return id
        case .emoticon(_, let shortcode): return ":\(shortcode):"
        }
    }

    /// `trimCustomHtml`.
    static func trimHTML(_ html: String) -> String {
        var result = html
        while result.hasPrefix("<br/>") { result.removeFirst(5) }
        while result.hasSuffix("<br/>") { result.removeLast(5) }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// `customHtmlEqualsPlainText`.
    static func htmlEqualsPlain(_ html: String, _ plain: String) -> Bool {
        html.replacingOccurrences(of: "<br/>", with: "\n") == DesktopMarkdown.escapeHTML(plain)
    }

    /// The plain and HTML bodies of a draft, as the desktop's `toPlainText` and
    /// `toMatrixCustomHTML` make them: each line a paragraph, Markdown when it is on, mentions as
    /// matrix.to links (plain body: the id), custom emoji as `<img data-mx-emoticon>` (`:code:`).
    static func bodies(of draft: String, tokens: [String: ComposerToken], markdown: Bool) -> (plain: String, html: String) {
        var plainText = ""
        var htmlLines: [String] = []
        for line in draft.components(separatedBy: "\n") {
            var plainLine = ""
            var htmlLine = ""
            for (index, segment) in segments(of: line, tokens: tokens).enumerated() {
                switch segment {
                case .text(let text):
                    plainLine += markdown ? (index == 0 ? DesktopMarkdown.unescapeBlock(text) : DesktopMarkdown.unescapeInline(text)) : text
                    htmlLine += DesktopMarkdown.escapeHTML(text)
                case .token(let key, let token):
                    plainLine += plain(of: key, token)
                    htmlLine += html(of: key, token)
                }
            }
            plainText += plainLine + "\n"
            htmlLines.append(htmlLine)
        }
        let html: String
        if markdown {
            // A quote marker was escaped with the rest of the line; the desktop puts it back.
            let source = htmlLines.map { line -> String in
                guard let match = DesktopMarkdown.firstMatch(#"^(\\*)&gt;"#, in: line) else { return line }
                return match.group(1) + ">" + (line as NSString).substring(from: match.range.length)
            }.map { $0 + "\n" }.joined()
            html = DesktopMarkdown.block(source)
        } else {
            html = htmlLines.map { $0 + "<br/>" }.joined()
        }
        return (plainText.trimmingCharacters(in: .whitespacesAndNewlines), trimHTML(html))
    }

    /// The message the composer sends for `draft`, after any slash command is applied. Nil when
    /// nothing is left to send.
    static func message(
        from draft: String,
        tokens: [String: ComposerToken],
        markdown: Bool,
        command: SlashCommand?,
        isReply: Bool,
        replyUserId: String?,
        ownUserId: String
    ) -> ComposedMessage? {
        var (plain, html) = bodies(of: draft, tokens: tokens, markdown: markdown)
        if let command {
            plain = SlashCommand.trim(command, from: plain)
            html = SlashCommand.trim(command, from: html)
            if let prefix = command.messagePrefix {
                plain = "\(prefix) \(plain)"
                html = "\(prefix) \(html)"
            }
        }
        if plain.isEmpty { return nil }
        var mentioned: [String] = []
        for case .user(let id) in tokens.values {
            if !mentioned.contains(id) && tokenUsed(id, in: draft, tokens: tokens) { mentioned.append(id) }
        }
        if let replyUserId, replyUserId != ownUserId, !mentioned.contains(replyUserId) { mentioned.append(replyUserId) }
        let needsHTML = isReply || !htmlEqualsPlain(html, plain)
        return ComposedMessage(body: plain, html: needsHTML ? html : nil, mentionedUserIds: mentioned.sorted())
    }

    private static func tokenUsed(_ userId: String, in draft: String, tokens: [String: ComposerToken]) -> Bool {
        tokens.contains { key, token in token == .user(id: userId) && draft.contains(key) }
    }

    /// Tokens whose text is no longer in the draft are dropped (a deleted mention is gone).
    static func pruned(_ tokens: [String: ComposerToken], for draft: String) -> [String: ComposerToken] {
        tokens.filter { draft.contains($0.key) }
    }
}

// MARK: - Formatting toolbar (desktop components/editor/Toolbar.tsx, as Markdown)

enum ComposerFormat: String, CaseIterable, Identifiable {
    case bold, italic, underline, strike, code, spoiler, quote, codeBlock, orderedList, unorderedList, heading, link

    var id: String { rawValue }

    var title: String {
        switch self {
        case .bold: return "Bold"
        case .italic: return "Italic"
        case .underline: return "Underline"
        case .strike: return "Strike Through"
        case .code: return "Inline Code"
        case .spoiler: return "Spoiler"
        case .quote: return "Block Quote"
        case .codeBlock: return "Block Code"
        case .orderedList: return "Ordered List"
        case .unorderedList: return "Unordered List"
        case .heading: return "Heading"
        case .link: return "Link"
        }
    }

    private var wrapper: (String, String)? {
        switch self {
        case .bold: return ("**", "**")
        case .italic: return ("*", "*")
        case .underline: return ("__", "__")
        case .strike: return ("~~", "~~")
        case .code: return ("`", "`")
        case .spoiler: return ("||", "||")
        case .link: return ("[", "](https://)")
        default: return nil
        }
    }

    private var linePrefix: String? {
        switch self {
        case .quote: return "> "
        case .orderedList: return "1. "
        case .unorderedList: return "- "
        case .heading: return "# "
        default: return nil
        }
    }

    /// Applies the format to the selected text (UTF-16 range); returns the new text and selection.
    /// Inline formats wrap the selection, or leave the cursor between the markers; line formats
    /// prefix every selected line; a code block fences the selected lines.
    func apply(to text: String, selection: NSRange) -> (text: String, selection: NSRange) {
        let ns = text as NSString
        let location = min(max(0, selection.location), ns.length)
        let length = min(max(0, selection.length), ns.length - location)
        let selected = ns.substring(with: NSRange(location: location, length: length))
        if let (open, close) = wrapper {
            let replaced = ns.replacingCharacters(in: NSRange(location: location, length: length), with: open + selected + close)
            let openLength = (open as NSString).length
            if self == .link, length > 0 {
                // The cursor lands on the address to fill in.
                let urlStart = location + openLength + length + 2
                return (replaced, NSRange(location: urlStart, length: ("https://" as NSString).length))
            }
            return (replaced, NSRange(location: location + openLength, length: length))
        }
        let lineRange = ns.lineRange(for: NSRange(location: location, length: length))
        var lines = ns.substring(with: lineRange)
        let trailingNewline = lines.hasSuffix("\n")
        if trailingNewline { lines.removeLast() }
        let newBlock: String
        if self == .codeBlock {
            newBlock = "```\n" + lines + "\n```"
        } else {
            let prefix = linePrefix ?? ""
            newBlock = lines.components(separatedBy: "\n").map { prefix + $0 }.joined(separator: "\n")
        }
        let replacement = newBlock + (trailingNewline ? "\n" : "")
        let replaced = ns.replacingCharacters(in: lineRange, with: replacement)
        let cursor = self == .codeBlock
            ? lineRange.location + 4 + (lines as NSString).length
            : lineRange.location + (newBlock as NSString).length
        return (replaced, NSRange(location: cursor, length: 0))
    }
}

// MARK: - Drafts (desktop state/room/roomInputDrafts.ts: messageDraft-, replyDraft-)

struct ComposerDraft: Codable, Equatable {
    var text: String
    var tokens: [String: ComposerToken] = [:]
    /// The message being replied to, restored once it is in the loaded timeline.
    var replyEventId: String?

    var isEmpty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && replyEventId == nil }
}

enum ComposerDraftStore {
    /// Per account and room, like the desktop's `messageDraft-<roomId>` in each account's storage.
    static func key(accountId: String, roomId: String) -> String { "composer.draft.\(accountId).\(roomId)" }

    static func load(accountId: String, roomId: String, defaults: UserDefaults = .standard) -> ComposerDraft? {
        guard let data = defaults.data(forKey: key(accountId: accountId, roomId: roomId)),
              let draft = try? JSONDecoder().decode(ComposerDraft.self, from: data), !draft.isEmpty
        else { return nil }
        return draft
    }

    /// Saves the draft, or removes it when there is nothing left (sent or cleared).
    static func save(_ draft: ComposerDraft?, accountId: String, roomId: String, defaults: UserDefaults = .standard) {
        let key = key(accountId: accountId, roomId: roomId)
        guard let draft, !draft.isEmpty, let data = try? JSONEncoder().encode(draft) else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(data, forKey: key)
    }
}

// MARK: - Emoji (desktop plugins/emoji.ts, recent-emoji.ts)

struct EmojiEntry: Hashable, Identifiable {
    let group: Int
    let unicode: String
    let shortcodes: [String]
    let label: String

    var id: String { unicode }
    var shortcode: String { shortcodes.first ?? label }
}

enum EmojiCatalog {
    /// Desktop's group labels (`useEmojiGroupLabels`), in order.
    static let groupNames = [
        "Smileys & People", "Animals & Nature", "Food & Drinks", "Activity",
        "Travel & Places", "Objects", "Symbols", "Flags",
    ]

    static let all: [EmojiEntry] = EmojiData.table.split(separator: "\n").compactMap { line in
        let fields = line.split(separator: "\t", omittingEmptySubsequences: false)
        guard fields.count == 4, let group = Int(fields[0]), !fields[1].isEmpty else { return nil }
        return EmojiEntry(group: group, unicode: String(fields[1]),
                          shortcodes: fields[2].split(separator: ",").map(String.init), label: String(fields[3]))
    }

    static let groups: [[EmojiEntry]] = {
        var result = Array(repeating: [EmojiEntry](), count: groupNames.count)
        for entry in all where entry.group >= 0 && entry.group < result.count { result[entry.group].append(entry) }
        return result
    }()

    private static let byUnicode: [String: EmojiEntry] = {
        var result: [String: EmojiEntry] = [:]
        for entry in all where result[entry.unicode] == nil { result[entry.unicode] = entry }
        return result
    }()

    static func entry(for unicode: String) -> EmojiEntry? { byUnicode[unicode] }

    /// Desktop's `getEmoticonSearchStr` with a case-insensitive contains match.
    static func matches(_ entry: EmojiEntry, _ query: String) -> Bool {
        let q = query.lowercased()
        if ":\(entry.shortcode):".lowercased().contains(q) || entry.label.lowercased().contains(q) { return true }
        return entry.shortcodes.contains { $0.lowercased().contains(q) }
    }

    static func search(_ query: String, limit: Int = 20) -> [EmojiEntry] {
        guard !query.isEmpty else { return [] }
        var result: [EmojiEntry] = []
        for entry in all where matches(entry, query) {
            result.append(entry)
            if result.count >= limit { break }
        }
        return result
    }

    /// `io.element.recent_emoji`: most used first.
    static func recent(from content: [String: Any]?, limit: Int) -> [EmojiEntry] {
        guard let list = content?["recent_emoji"] as? [[Any]] else { return [] }
        let pairs: [(String, Int)] = list.compactMap { item in
            guard item.count >= 2, let unicode = item[0] as? String else { return nil }
            let count = (item[1] as? NSNumber)?.intValue ?? 0
            return (unicode, count)
        }
        let sorted = pairs.enumerated().sorted { a, b in
            a.element.1 != b.element.1 ? a.element.1 > b.element.1 : a.offset < b.offset
        }.map(\.element)
        return Array(sorted.compactMap { entry(for: $0.0) }.prefix(limit))
    }

    /// `addRecentEmoji`: moves the emoji to the front with one more use, keeps 100.
    static func addingRecent(_ unicode: String, to content: [String: Any]?) -> [String: Any] {
        var list: [[Any]] = (content?["recent_emoji"] as? [[Any]]) ?? []
        var entry: [Any] = [unicode, 1]
        if let index = list.firstIndex(where: { ($0.first as? String) == unicode }) {
            let old = list.remove(at: index)
            let count = old.count >= 2 ? ((old[1] as? NSNumber)?.intValue ?? 0) : 0
            entry = [unicode, count + 1]
        }
        list.insert(entry, at: 0)
        return ["recent_emoji": Array(list.prefix(100))]
    }
}

// MARK: - Custom emoji and sticker packs (desktop plugins/custom-emoji, MSC2545)

struct PackImage: Hashable, Identifiable {
    let shortcode: String
    let url: String
    let body: String?
    let usage: [String]?
    let width: Int?
    let height: Int?
    let mimetype: String?
    let size: Int?

    var id: String { shortcode + "|" + url }
}

struct ImagePack: Identifiable, Hashable {
    static let emoticon = "emoticon"
    static let sticker = "sticker"

    let id: String
    let name: String?
    let avatarUrl: String?
    let usage: [String]
    let images: [PackImage]

    /// `PackMetaReader.usage` and `ImagePack.getImages`: an image without its own usage takes the pack's.
    func images(for usage: String) -> [PackImage] {
        images.filter { ($0.usage ?? self.usage).contains(usage) }
    }

    func avatar(for usage: String) -> String? { avatarUrl ?? images(for: usage).first?.url }

    private static func knownUsage(_ value: Any?) -> [String]? {
        guard let list = value as? [Any] else { return nil }
        let known = list.compactMap { $0 as? String }.filter { $0 == emoticon || $0 == sticker }
        return known.isEmpty ? nil : known
    }

    /// Reads an `im.ponies.room_emotes` / `im.ponies.user_emotes` content. Nil when it is empty
    /// (a deleted pack). Images keep the order of the JSON object as far as it is known; they
    /// are sorted by shortcode so the order is stable.
    static func parse(id: String, content: [String: Any]) -> ImagePack? {
        let meta = content["pack"] as? [String: Any]
        let rawImages = content["images"] as? [String: Any]
        if meta == nil && rawImages == nil { return nil }
        var images: [PackImage] = []
        for (shortcode, value) in rawImages ?? [:] {
            guard let image = value as? [String: Any], let url = image["url"] as? String, url.hasPrefix("mxc://"), !url.contains(where: { $0.isWhitespace || $0 == "\"" || $0 == "<" || $0 == ">" }) else { continue }
            let info = image["info"] as? [String: Any]
            images.append(PackImage(
                shortcode: shortcode,
                url: url,
                body: image["body"] as? String,
                usage: knownUsage(image["usage"]),
                width: (info?["w"] as? NSNumber)?.intValue,
                height: (info?["h"] as? NSNumber)?.intValue,
                mimetype: info?["mimetype"] as? String,
                size: (info?["size"] as? NSNumber)?.intValue
            ))
        }
        images.sort { $0.shortcode < $1.shortcode }
        return ImagePack(
            id: id,
            name: meta?["display_name"] as? String,
            avatarUrl: meta?["avatar_url"] as? String,
            usage: knownUsage(meta?["usage"]) ?? [emoticon, sticker],
            images: images
        )
    }

    /// `im.ponies.emote_rooms`: room id → pack state keys the user enabled everywhere.
    static func globalPacks(_ content: [String: Any]?) -> [String: [String]] {
        guard let rooms = content?["rooms"] as? [String: Any] else { return [:] }
        var result: [String: [String]] = [:]
        for (roomId, value) in rooms {
            guard let keys = value as? [String: Any] else { continue }
            result[roomId] = keys.keys.sorted()
        }
        return result
    }

    /// Desktop's search over pack images: `:code:` and the body.
    static func matches(_ image: PackImage, _ query: String) -> Bool {
        let q = query.lowercased()
        return ":\(image.shortcode):".lowercased().contains(q) || (image.body?.lowercased().contains(q) ?? false)
    }
}

// MARK: - Sizes

enum ComposerSize {
    /// The desktop's `bytesToSize`: decimal units, one digit, at least KB.
    static func text(_ bytes: Int64) -> String {
        if bytes <= 0 { return "0KB" }
        let sizes = ["Bytes", "KB", "MB", "GB", "TB"]
        var index = Int(floor(log(Double(bytes)) / log(1000)))
        if index == 0 { index = 1 }
        index = min(index, sizes.count - 1)
        let value = Double(bytes) / pow(1000, Double(index))
        return String(format: "%.1f %@", value, sizes[index])
    }

    /// The upload limit from `/media/config` (`m.upload.size`), nil when the server sets none.
    static func uploadLimit(from config: [String: Any]?) -> Int64? {
        guard let value = (config?["m.upload.size"] as? NSNumber)?.int64Value, value > 0 else { return nil }
        return value
    }

    /// The desktop refuses a file of the limit's size or more.
    static func exceeds(_ size: Int64, limit: Int64?) -> Bool {
        guard let limit else { return false }
        return size >= limit
    }
}
