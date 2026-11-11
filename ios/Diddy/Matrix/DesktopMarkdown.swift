import Foundation

/// The desktop's Markdown dialect (cinny `plugins/markdown`), so a message typed on iOS gets the
/// same `formatted_body` as on desktop: `**bold**`, `*italic*`/`_italic_`, `__underline__`,
/// `~~strike~~`, `` `code` ``, `||spoiler||`, `[text](https://…)`, headings, code blocks, quotes
/// and lists. Same rules, same order, same HTML. Foundation only (checked by
/// Tools/composer_check). The input of `block` is already HTML-escaped text, like on desktop.
enum DesktopMarkdown {
    // MARK: Regex helpers (UTF-16 offsets, like JavaScript strings)

    struct Match {
        let range: NSRange
        let groups: [String?]

        func group(_ index: Int) -> String { index < groups.count ? (groups[index] ?? "") : "" }
    }

    private static var cache: [String: NSRegularExpression] = [:]
    private static let cacheLock = NSLock()

    static func regex(_ pattern: String, multiline: Bool = false) -> NSRegularExpression? {
        let key = (multiline ? "m:" : "s:") + pattern
        cacheLock.lock()
        defer { cacheLock.unlock() }
        if let cached = cache[key] { return cached }
        let compiled = try? NSRegularExpression(pattern: pattern, options: multiline ? [.anchorsMatchLines] : [])
        if let compiled { cache[key] = compiled }
        return compiled
    }

    private static func makeMatch(_ result: NSTextCheckingResult, in text: NSString) -> Match {
        var groups: [String?] = []
        for index in 0..<result.numberOfRanges {
            let range = result.range(at: index)
            groups.append(range.location == NSNotFound ? nil : text.substring(with: range))
        }
        return Match(range: result.range, groups: groups)
    }

    /// The desktop's `(?<!(https?|ftp|mailto|magnet):\/\/\S*)` has no fixed length, which ICU does
    /// not allow in a look-behind. Checked by hand instead: no match may start inside a URL.
    private static func insideURL(_ text: NSString, before location: Int) -> Bool {
        guard location > 0, let url = regex(#"(https?|ftp|mailto|magnet):\/\/\S*$"#) else { return false }
        let prefix = text.substring(to: location)
        return url.firstMatch(in: prefix, range: NSRange(location: 0, length: (prefix as NSString).length)) != nil
    }

    /// The first match like JavaScript's `text.match(regex)`, optionally not starting inside a URL.
    static func firstMatch(_ pattern: String, in text: String, multiline: Bool = false, notInURL: Bool = false) -> Match? {
        guard let regex = regex(pattern, multiline: multiline) else { return nil }
        let ns = text as NSString
        var start = 0
        while start <= ns.length {
            guard let result = regex.firstMatch(in: text, range: NSRange(location: start, length: ns.length - start)) else { return nil }
            if notInURL, insideURL(ns, before: result.range.location) {
                start = result.range.location + 1
                continue
            }
            return makeMatch(result, in: ns)
        }
        return nil
    }

    private static func before(_ text: String, _ match: Match) -> String {
        (text as NSString).substring(to: match.range.location)
    }

    private static func after(_ text: String, _ match: Match) -> String {
        (text as NSString).substring(from: match.range.location + match.range.length)
    }

    // MARK: Inline

    private struct InlineRule {
        let pattern: String
        let notInURL: Bool
        let html: (_ match: Match) -> String
    }

    private static let escapeChars = #"[*_~`|\[\]]"#

    private static let inlineRules: [InlineRule] = [
        InlineRule(pattern: #"(?<!\\)`(.+?)(?<!\\)`(?!`)"#, notInURL: true) { "<code data-md=\"`\">\($0.group(1))</code>" },
        InlineRule(pattern: #"(?<!\\)\*{2}(.+?)(?<!\\)\*{2}(?!\*)"#, notInURL: true) { "<strong data-md=\"**\">\(inline($0.group(1)))</strong>" },
        InlineRule(pattern: #"(?<!\\)\*(.+?)(?<!\\)\*(?!\*)"#, notInURL: true) { "<i data-md=\"*\">\(inline($0.group(1)))</i>" },
        InlineRule(pattern: #"(?<!\\)_{2}(.+?)(?<!\\)_{2}(?!_)"#, notInURL: true) { "<u data-md=\"__\">\(inline($0.group(1)))</u>" },
        InlineRule(pattern: #"(?<!\\)_(.+?)(?<!\\)_(?!_)"#, notInURL: true) { "<i data-md=\"_\">\(inline($0.group(1)))</i>" },
        InlineRule(pattern: #"(?<!\\)~{2}(.+?)(?<!\\)~{2}(?!~)"#, notInURL: true) { "<s data-md=\"~~\">\(inline($0.group(1)))</s>" },
        InlineRule(pattern: #"(?<!\\)\|{2}(.+?)(?<!\\)\|{2}(?!\|)"#, notInURL: true) { "<span data-md=\"||\" data-mx-spoiler>\(inline($0.group(1)))</span>" },
        InlineRule(pattern: #"\[(.+?)\]\((https?:\/\/.+?)\)"#, notInURL: false) { "<a data-md href=\"\($0.group(2))\">\(inline($0.group(1)))</a>" },
        InlineRule(pattern: #"\\("# + escapeChars + ")", notInURL: true) { $0.group(1) },
    ]

    /// `parseInlineMD`: the rule matching earliest wins (the first listed on a tie), the text
    /// before and after it is parsed the same way.
    static func inline(_ text: String) -> String {
        if text.isEmpty { return text }
        var best: (rule: InlineRule, match: Match)?
        for rule in inlineRules {
            guard let match = firstMatch(rule.pattern, in: text, notInURL: rule.notInURL) else { continue }
            if best == nil || match.range.location < best!.match.range.location {
                best = (rule, match)
            }
        }
        guard let best else { return text }
        return inline(before(text, best.match)) + best.rule.html(best.match) + inline(after(text, best.match))
    }

    /// `ignoreHTMLParseInlineMD`: tags already in the text (mentions, custom emoji) stay as they are.
    static func inlineIgnoringHTML(_ text: String) -> String {
        guard let tag = regex(#"<([\w-]+)(?: [^>]*)?(?:(?:\/>)|(?:>.*?<\/\1>))"#) else { return inline(text) }
        let ns = text as NSString
        var result = ""
        var last = 0
        for match in tag.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            result += inline(ns.substring(with: NSRange(location: last, length: match.range.location - last)))
            result += ns.substring(with: match.range)
            last = match.range.location + match.range.length
        }
        result += inline(ns.substring(from: last))
        return result
    }

    // MARK: Block

    static let escapedBlockSequence = #"^\\(\\*(#{1,6} +|```|>|(-|\d+\.|[aAiI]\.) +|\* +))"#
    static let unescapedBlockSequence = #"^\\*(#{1,6} +|```|>|(-|\d+\.|[aAiI]\.) +|\* +)"#

    /// `parseBlockMD`: code blocks, then quotes, lists and headings; plain lines are joined with
    /// `<br/>` so empty lines stay.
    static func block(_ text: String, inline parseInline: (String) -> String = inlineIgnoringHTML) -> String {
        if text.isEmpty { return text }
        if let match = firstMatch(#"^(`{3,})(?!`)(\S*)\n((?:.*\n)+?)\1 *(?!.)\n?"#, in: text, multiline: true) {
            let info = match.group(2)
            let lang: String? = info.isEmpty ? nil : (info.range(of: ".", options: .backwards).map { String(info[$0.upperBound...]) } ?? info)
            let filename: String? = info != lang ? (info.isEmpty ? nil : info) : nil
            let classAttr = lang.map { " class=\"language-\($0)\"" } ?? ""
            let labelAttr = filename.map { " data-label=\"\($0)\"" } ?? ""
            let html = "<pre data-md=\"\(match.group(1))\"><code\(classAttr)\(labelAttr)>\(match.group(3))</code></pre>"
            return block(before(text, match), inline: parseInline) + html + block(after(text, match), inline: parseInline)
        }
        if let match = firstMatch(#"(^>.*\n?)+"#, in: text, multiline: true) {
            var quoted = match.group(0)
            if quoted.hasSuffix("\n") { quoted.removeLast() }
            let lines = quoted.components(separatedBy: "\n").map { line -> String in
                guard let prefix = firstMatch("^> *", in: line) else { return line }
                return (line as NSString).substring(from: prefix.range.length)
            }.joined(separator: "\n")
            let html = "<blockquote data-md=\">\">\(block(lines, inline: parseInline))</blockquote>"
            return block(before(text, match), inline: parseInline) + html + block(after(text, match), inline: parseInline)
        }
        if let match = firstMatch(#"^(?: *(?:[-*]|\d+\.|[aAiI]\.) +.+\n?)+"#, in: text, multiline: true) {
            let html = list(match.group(0), inline: parseInline)
            return block(before(text, match), inline: parseInline) + html + block(after(text, match), inline: parseInline)
        }
        if let match = firstMatch(#"^(#{1,6}) +(.+)\n?"#, in: text, multiline: true) {
            let level = match.group(1).count
            let html = "<h\(level) data-md=\"\(match.group(1))\">\(parseInline(match.group(2)))</h\(level)>"
            return block(before(text, match), inline: parseInline) + html + block(after(text, match), inline: parseInline)
        }
        return text.components(separatedBy: "\n").map { line -> String in
            guard let match = firstMatch(escapedBlockSequence, in: line) else { return parseInline(line) }
            return parseInline(before(line, match)) + match.group(1) + parseInline(after(line, match))
        }.joined(separator: "<br/>")
    }

    private struct ListLine {
        let indent: Int
        let marker: String
        let content: String
        var isUnordered: Bool { marker == "*" || marker == "-" }
    }

    private static func openList(_ line: ListLine) -> String {
        if line.isUnordered { return "<ul data-md=\"*\">" }
        let start = firstMatch(#"^(\d+)\."#, in: line.marker)?.group(1)
        let type = firstMatch(#"^([aAiI])\."#, in: line.marker)?.group(1)
        let dataMd = "data-md=\"\(type ?? start ?? "1.")\""
        return "<ol \(dataMd)\(start.map { " start=\"\($0)\"" } ?? "")\(type.map { " type=\"\($0)\"" } ?? "")>"
    }

    private static func closeList(unordered: Bool) -> String { unordered ? "</ul>" : "</ol>" }

    /// `buildList` of the desktop, nesting by indentation.
    private static func list(_ text: String, inline parseInline: (String) -> String) -> String {
        var source = text
        if source.hasSuffix("\n") { source.removeLast() }
        let lines: [ListLine] = source.components(separatedBy: "\n").compactMap { line in
            guard let match = firstMatch(#"^( *)([-*]|\d+\.|[aAiI]\.) +(.+)$"#, in: line) else { return nil }
            return ListLine(indent: match.group(1).count, marker: match.group(2), content: match.group(3))
        }
        var html = ""
        var stack: [(unordered: Bool, indent: Int)] = []
        for (index, line) in lines.enumerated() {
            let prev: ListLine? = index > 0 ? lines[index - 1] : nil
            let isLast = index == lines.count - 1
            let content = parseInline(line.content)
            if let prev {
                if line.indent > prev.indent {
                    html += openList(line)
                    stack.append((line.isUnordered, line.indent))
                } else if line.indent == prev.indent {
                    html += "</li>"
                    if line.isUnordered != prev.isUnordered {
                        if let top = stack.popLast() { html += closeList(unordered: top.unordered) }
                        html += openList(line)
                        stack.append((line.isUnordered, line.indent))
                    }
                } else {
                    html += "</li>"
                    while stack.count > 1, let top = stack.last, top.indent > line.indent {
                        stack.removeLast()
                        html += closeList(unordered: top.unordered)
                        if !stack.isEmpty { html += "</li>" }
                    }
                    if let top = stack.last, line.isUnordered != top.unordered {
                        stack.removeLast()
                        html += closeList(unordered: top.unordered)
                        html += openList(line)
                        stack.append((line.isUnordered, line.indent))
                    }
                }
            } else {
                html += openList(line)
                stack.append((line.isUnordered, line.indent))
            }
            html += "<li><p>\(content)</p>"
            if isLast {
                html += "</li>"
                while let top = stack.popLast() {
                    html += closeList(unordered: top.unordered)
                    if !stack.isEmpty { html += "</li>" }
                }
            }
        }
        return html
    }

    // MARK: Plain text

    /// `unescapeMarkdownInlineSequences`: `\*` becomes `*` (not inside URLs).
    static func unescapeInline(_ text: String) -> String {
        guard let match = firstMatch(#"\\("# + escapeChars + ")", in: text, notInURL: true) else { return text }
        return unescapeInline(before(text, match)) + match.group(1) + unescapeInline(after(text, match))
    }

    /// `unescapeMarkdownBlockSequences` with the inline unescape for the rest of the line.
    static func unescapeBlock(_ text: String) -> String {
        guard let match = firstMatch(escapedBlockSequence, in: text) else { return unescapeInline(text) }
        return unescapeInline(before(text, match)) + match.group(1) + unescapeInline(after(text, match))
    }

    /// The desktop's `sanitizeText`.
    static func escapeHTML(_ text: String) -> String {
        var result = ""
        result.reserveCapacity(text.utf8.count)
        for character in text {
            switch character {
            case "&": result += "&amp;"
            case "<": result += "&lt;"
            case ">": result += "&gt;"
            case "\"": result += "&quot;"
            case "'": result += "&#39;"
            default: result.append(character)
            }
        }
        return result
    }
}
