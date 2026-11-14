import Foundation

/// The formatting of a message, the way the desktop app (Cinny) renders it: the HTML body
/// (`formatted_body`) when there is one, else the plain body read as Diddy's Markdown
/// (`cinny/src/app/plugins/markdown`). Foundation only, so `Tools/richtext_check` can test it.

struct RichStyle: Hashable {
    var bold = false
    var italic = false
    var underline = false
    var strike = false
    var code = false
    /// The spoiler this text belongs to, numbered from 0 within the message.
    var spoiler: Int?
    var link: String?
}

enum RichInline: Hashable {
    case text(String, RichStyle)
    /// A custom emoji (`<img data-mx-emoticon src="mxc://…">`, MSC2545 image packs).
    case emoji(url: String, alt: String, style: RichStyle)
}

indirect enum RichBlock: Hashable {
    case paragraph([RichInline])
    case heading(level: Int, [RichInline])
    case code(String, label: String?)
    case quote([RichBlock])
    case list(ordered: Bool, start: Int, items: [[RichBlock]])
    case rule
}

struct RichDocument: Hashable {
    var blocks: [RichBlock]
    var spoilers: Int

    /// Every custom emoji image of the message, in order, without repeats.
    var emojiURLs: [String] {
        var found: [String] = []
        var pending: [RichBlock] = blocks
        while !pending.isEmpty {
            let block = pending.removeFirst()
            switch block {
            case .paragraph(let inlines), .heading(_, let inlines):
                for case .emoji(let url, _, _) in inlines where !found.contains(url) { found.append(url) }
            case .quote(let inner):
                pending.append(contentsOf: inner)
            case .list(_, _, let items):
                for item in items { pending.append(contentsOf: item) }
            case .code, .rule:
                break
            }
        }
        return found
    }

    /// The same message in italics, for `/me` (desktop writes emotes as the name plus the text).
    func italicized() -> RichDocument {
        func italic(_ items: [RichInline]) -> [RichInline] {
            items.map { item -> RichInline in
                switch item {
                case .text(let text, let style):
                    var changed = style
                    changed.italic = true
                    return .text(text, changed)
                case .emoji(let url, let alt, let style):
                    var changed = style
                    changed.italic = true
                    return .emoji(url: url, alt: alt, style: changed)
                }
            }
        }
        func transform(_ item: RichBlock) -> RichBlock {
            switch item {
            case .paragraph(let inlines): return .paragraph(italic(inlines))
            case .heading(let level, let inlines): return .heading(level: level, italic(inlines))
            case .code, .rule: return item
            case .quote(let inner): return .quote(inner.map(transform))
            case .list(let ordered, let start, let items):
                return .list(ordered: ordered, start: start, items: items.map { $0.map(transform) })
            }
        }
        return RichDocument(blocks: blocks.map(transform), spoilers: spoilers)
    }

    /// The text without formatting, for tests and accessibility.
    var plainText: String {
        func inlineText(_ inlines: [RichInline]) -> String {
            inlines.map { item -> String in
                switch item {
                case .text(let text, _): return text
                case .emoji(_, let alt, _): return alt
                }
            }.joined()
        }
        func blockText(_ block: RichBlock) -> String {
            switch block {
            case .paragraph(let inlines), .heading(_, let inlines): return inlineText(inlines)
            case .code(let code, _): return code
            case .quote(let inner): return inner.map(blockText).joined(separator: "\n")
            case .list(_, _, let items): return items.map { $0.map(blockText).joined(separator: "\n") }.joined(separator: "\n")
            case .rule: return "---"
            }
        }
        return blocks.map(blockText).joined(separator: "\n")
    }
}

enum RichText {
    /// Deeper nesting than this (quotes in quotes in lists ...) is flattened to text.
    static let maxDepth = 12
    /// Longer messages keep the plain rendering; formatting 100 KB of text is not worth a stall.
    static let maxInput = 30_000

    static func accepts(_ text: String) -> Bool { text.utf8.count <= maxInput }

    static func parse(html: String) -> RichDocument {
        let root = HTMLTree.parse(html)
        let builder = HTMLBlockBuilder()
        let blocks = builder.blocks(root.children, style: RichStyle(), depth: 0)
        return RichDocument(blocks: blocks, spoilers: builder.spoilers)
    }

    static func parse(markdown: String) -> RichDocument {
        let parser = MarkdownParser()
        let lines = markdown.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        let blocks = parser.blocks(lines, depth: 0)
        return RichDocument(blocks: blocks, spoilers: parser.spoilers)
    }

    /// Joins neighbouring runs of the same style.
    static func merged(_ inlines: [RichInline]) -> [RichInline] {
        var out: [RichInline] = []
        for item in inlines {
            if case .text(let text, _) = item, text.isEmpty { continue }
            if case .text(let text, let style) = item, let last = out.last, case .text(let previous, let previousStyle) = last, previousStyle == style {
                out[out.count - 1] = .text(previous + text, style)
            } else {
                out.append(item)
            }
        }
        return out
    }
}

/// What a message body is read from: the HTML body when there is one, else the plain body when it
/// uses block formatting. Most plain messages are not a source at all (the chat shows them as
/// before), which also keeps the older Markdown links to people working.
enum RichSource: Hashable {
    case html(String)
    case markdown(String)

    static func choose(body: String, html: String?) -> RichSource? {
        if let html {
            guard RichText.accepts(html) else { return nil }
            // The timeline asks this for every HTML message on every change; the parsed document
            // is kept, and the chat draws it from the same cache.
            let document = RichDocumentCache.document(for: .html(html))
            return document.blocks.isEmpty ? nil : .html(html)
        }
        guard RichText.accepts(body), looksFormatted(body) else { return nil }
        return .markdown(body)
    }

    var document: RichDocument {
        switch self {
        case .html(let html): return RichText.parse(html: html)
        case .markdown(let text): return RichText.parse(markdown: text)
        }
    }

    /// A plain body that carries a spoiler, a code block, a quote, a heading or a list.
    static func looksFormatted(_ body: String) -> Bool {
        if body.contains("```") || body.contains("||") { return true }
        for line in body.split(separator: "\n", omittingEmptySubsequences: true) {
            if line.hasPrefix("> ") || line.hasPrefix("- ") || line.hasPrefix("* ") { return true }
            let hashes = line.prefix(while: { $0 == "#" })
            if (1...6).contains(hashes.count), line.dropFirst(hashes.count).first == " " { return true }
            let digits = line.prefix(while: { $0.isASCII && $0.isNumber })
            if !digits.isEmpty, digits.count <= 9, line.dropFirst(digits.count).hasPrefix(". ") { return true }
        }
        return false
    }
}

// MARK: - HTML

final class HTMLNode {
    /// Lowercased tag name; empty for text.
    let name: String
    let attributes: [String: String]
    let text: String
    var children: [HTMLNode] = []

    init(name: String, attributes: [String: String]) {
        self.name = name
        self.attributes = attributes
        self.text = ""
    }

    init(text: String) {
        self.name = ""
        self.attributes = [:]
        self.text = text
    }

    var isText: Bool { name.isEmpty }
}

/// A forgiving HTML reader for message bodies: unknown tags are kept (their text shows), stray
/// end tags are ignored and the quoted message of a reply (`mx-reply`) is dropped like desktop.
enum HTMLTree {
    static let voidTags: Set<String> = ["br", "hr", "img", "wbr", "input", "meta", "link", "col", "area", "source", "base"]
    /// Content never shown: desktop's sanitizer drops these with their text.
    static let maxNesting = 200
    static let droppedTags: Set<String> = ["mx-reply", "script", "style", "textarea", "option", "noscript", "head", "title"]

    static func parse(_ html: String) -> HTMLNode {
        let root = HTMLNode(name: "#root", attributes: [:])
        var stack: [HTMLNode] = [root]
        let chars = Array(html)
        var text = ""
        var i = 0

        func flushText() {
            guard !text.isEmpty else { return }
            stack[stack.count - 1].children.append(HTMLNode(text: decodeEntities(text)))
            text = ""
        }

        while i < chars.count {
            let c = chars[i]
            guard c == "<", i + 1 < chars.count else {
                text.append(c)
                i += 1
                continue
            }
            if hasPrefix(chars, at: i, "<!--") {
                flushText()
                i = find(chars, "-->", from: i + 4).map { $0 + 3 } ?? chars.count
                continue
            }
            let next = chars[i + 1]
            guard next == "/" || next == "!" || next.isLetter else {
                text.append(c)
                i += 1
                continue
            }
            guard let end = tagEnd(chars, from: i + 1) else {
                text.append(c)
                i += 1
                continue
            }
            let inner = String(chars[(i + 1)..<end])
            i = end + 1
            if next == "!" { continue }
            flushText()
            if next == "/" {
                let name = tagName(String(inner.dropFirst()))
                if let index = stack.lastIndex(where: { $0.name == name }), index > 0 {
                    stack.removeSubrange(index...)
                }
                continue
            }
            var content = inner
            let selfClosing = content.hasSuffix("/")
            if selfClosing { content.removeLast() }
            let name = tagName(content)
            guard !name.isEmpty else { continue }
            if droppedTags.contains(name) {
                if !selfClosing {
                    // Skip to the matching end tag, or to the end when it is missing.
                    if let close = findCaseInsensitive(chars, "</" + name, from: i) {
                        i = tagEnd(chars, from: close + 1).map { $0 + 1 } ?? chars.count
                    } else {
                        i = chars.count
                    }
                }
                continue
            }
            // Browsers close an open paragraph or list item when the next one starts.
            if (name == "li" || name == "p"), stack.count > 1, stack[stack.count - 1].name == name {
                stack.removeLast()
            }
            let node = HTMLNode(name: name, attributes: attributes(content))
            stack[stack.count - 1].children.append(node)
            // Nesting beyond this stays flat: a tree thousands of levels deep would overflow the
            // stack when it is freed.
            if !selfClosing && !voidTags.contains(name) && stack.count < maxNesting {
                stack.append(node)
            }
        }
        flushText()
        return root
    }

    private static func hasPrefix(_ chars: [Character], at index: Int, _ prefix: String) -> Bool {
        var j = index
        for p in prefix {
            guard j < chars.count, chars[j] == p else { return false }
            j += 1
        }
        return true
    }

    private static func find(_ chars: [Character], _ needle: String, from start: Int) -> Int? {
        guard start < chars.count else { return nil }
        var j = start
        while j < chars.count {
            if hasPrefix(chars, at: j, needle) { return j }
            j += 1
        }
        return nil
    }

    private static func findCaseInsensitive(_ chars: [Character], _ needle: String, from start: Int) -> Int? {
        let wanted = needle.lowercased().map { String($0) }
        guard start < chars.count, !wanted.isEmpty else { return nil }
        var j = start
        while j + wanted.count <= chars.count {
            var same = true
            for k in 0..<wanted.count where chars[j + k].lowercased() != wanted[k] {
                same = false
                break
            }
            if same { return j }
            j += 1
        }
        return nil
    }

    /// The `>` that ends the tag starting at `start`, skipping quoted attribute values. A tag longer
    /// than `maxTagLength` is no tag (and a message full of unclosed ones cannot make this quadratic).
    private static let maxTagLength = 4096

    private static func tagEnd(_ chars: [Character], from start: Int) -> Int? {
        var quote: Character?
        var j = start
        while j < chars.count, j - start < maxTagLength {
            let c = chars[j]
            if let open = quote {
                if c == open { quote = nil }
            } else if c == "\"" || c == "'" {
                quote = c
            } else if c == ">" {
                return j
            }
            j += 1
        }
        return nil
    }

    private static func tagName(_ content: String) -> String {
        var name = ""
        for c in content {
            if c.isWhitespace || c == "/" { break }
            name.append(c)
        }
        return name.lowercased()
    }

    static func attributes(_ content: String) -> [String: String] {
        let chars = Array(content)
        var result: [String: String] = [:]
        var i = 0
        // Skip the tag name.
        while i < chars.count, !chars[i].isWhitespace { i += 1 }
        while i < chars.count {
            while i < chars.count, chars[i].isWhitespace || chars[i] == "/" { i += 1 }
            var name = ""
            while i < chars.count, !chars[i].isWhitespace, chars[i] != "=", chars[i] != "/" {
                name.append(chars[i])
                i += 1
            }
            while i < chars.count, chars[i].isWhitespace { i += 1 }
            var value = ""
            if i < chars.count, chars[i] == "=" {
                i += 1
                while i < chars.count, chars[i].isWhitespace { i += 1 }
                if i < chars.count, chars[i] == "\"" || chars[i] == "'" {
                    let quote = chars[i]
                    i += 1
                    while i < chars.count, chars[i] != quote {
                        value.append(chars[i])
                        i += 1
                    }
                    i += 1
                } else {
                    while i < chars.count, !chars[i].isWhitespace {
                        value.append(chars[i])
                        i += 1
                    }
                }
            }
            if !name.isEmpty { result[name.lowercased()] = decodeEntities(value) }
        }
        return result
    }

    private static let namedEntities: [String: String] = [
        "lt": "<", "gt": ">", "amp": "&", "quot": "\"", "apos": "'", "nbsp": "\u{00A0}",
        "ndash": "\u{2013}", "mdash": "\u{2014}", "hellip": "\u{2026}", "copy": "\u{00A9}",
        "reg": "\u{00AE}", "trade": "\u{2122}", "laquo": "\u{00AB}", "raquo": "\u{00BB}",
        "lsquo": "\u{2018}", "rsquo": "\u{2019}", "ldquo": "\u{201C}", "rdquo": "\u{201D}",
        "bull": "\u{2022}", "middot": "\u{00B7}", "times": "\u{00D7}", "euro": "\u{20AC}",
    ]

    static func decodeEntities(_ text: String) -> String {
        guard text.contains("&") else { return text }
        let chars = Array(text)
        var out = ""
        var i = 0
        while i < chars.count {
            let c = chars[i]
            guard c == "&" else {
                out.append(c)
                i += 1
                continue
            }
            var j = i + 1
            var name = ""
            while j < chars.count, j - i <= 10, chars[j] != ";", chars[j] != "&", !chars[j].isWhitespace {
                name.append(chars[j])
                j += 1
            }
            guard j < chars.count, chars[j] == ";", !name.isEmpty else {
                out.append(c)
                i += 1
                continue
            }
            var decoded: String?
            if name.hasPrefix("#x") || name.hasPrefix("#X") {
                decoded = UInt32(name.dropFirst(2), radix: 16).flatMap { Unicode.Scalar($0) }.map { String(Character($0)) }
            } else if name.hasPrefix("#") {
                decoded = UInt32(name.dropFirst(1), radix: 10).flatMap { Unicode.Scalar($0) }.map { String(Character($0)) }
            } else {
                decoded = namedEntities[name.lowercased()]
            }
            if let decoded, decoded != "\u{0}" {
                out += decoded
                i = j + 1
            } else {
                out.append(c)
                i += 1
            }
        }
        return out
    }
}

final class HTMLBlockBuilder {
    private(set) var spoilers = 0

    static let blockTags: Set<String> = [
        "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "ul", "ol", "li", "hr",
        "table", "thead", "tbody", "tfoot", "tr", "caption", "details", "summary", "section", "article",
        "header", "footer", "figure", "figcaption", "dl", "dt", "dd", "center", "main", "nav", "aside",
    ]

    func blocks(_ nodes: [HTMLNode], style: RichStyle, depth: Int) -> [RichBlock] {
        var result: [RichBlock] = []
        var inline: [RichInline] = []

        func flush() {
            let cleaned = Self.normalized(inline)
            if !cleaned.isEmpty { result.append(.paragraph(cleaned)) }
            inline = []
        }

        for node in nodes {
            guard !node.isText, Self.blockTags.contains(node.name) else {
                inline.append(contentsOf: inlines([node], style: style, depth: depth))
                continue
            }
            flush()
            if depth >= RichText.maxDepth {
                let text = Self.normalized(inlines(node.children, style: style, depth: depth))
                if !text.isEmpty { result.append(.paragraph(text)) }
                continue
            }
            switch node.name {
            case "h1", "h2", "h3", "h4", "h5", "h6":
                let level = Int(String(node.name.dropFirst())) ?? 1
                let text = Self.normalized(inlines(node.children, style: style, depth: depth + 1))
                if !text.isEmpty { result.append(.heading(level: level, text)) }
            case "pre":
                result.append(Self.codeBlock(node))
            case "blockquote":
                let inner = blocks(node.children, style: style, depth: depth + 1)
                if !inner.isEmpty { result.append(.quote(inner)) }
            case "ul", "ol":
                var items: [[RichBlock]] = []
                for child in node.children {
                    if child.name == "li" {
                        items.append(blocks(child.children, style: style, depth: depth + 1))
                    } else if child.isText && child.text.allSatisfy(\.isWhitespace) {
                        continue
                    } else {
                        // A nested list written straight into the list belongs to the item above.
                        let extra = blocks([child], style: style, depth: depth + 1)
                        if extra.isEmpty { continue }
                        if items.isEmpty { items.append(extra) } else { items[items.count - 1].append(contentsOf: extra) }
                    }
                }
                let start = node.name == "ol" ? (node.attributes["start"].flatMap { Int($0.trimmingCharacters(in: .whitespaces)) } ?? 1) : 1
                if !items.isEmpty { result.append(.list(ordered: node.name == "ol", start: start, items: items)) }
            case "hr":
                result.append(.rule)
            case "tr":
                var cells: [RichInline] = []
                var header = style
                header.bold = true
                for cell in node.children where !cell.isText {
                    let text = Self.normalized(inlines(cell.children, style: cell.name == "th" ? header : style, depth: depth + 1))
                    if text.isEmpty { continue }
                    if !cells.isEmpty { cells.append(.text(" | ", style)) }
                    cells.append(contentsOf: text)
                }
                if !cells.isEmpty { result.append(.paragraph(cells)) }
            default:
                result.append(contentsOf: blocks(node.children, style: style, depth: depth + 1))
            }
        }
        flush()
        return result
    }

    func inlines(_ nodes: [HTMLNode], style: RichStyle, depth: Int) -> [RichInline] {
        var out: [RichInline] = []
        for node in nodes {
            if node.isText {
                out.append(.text(Self.collapsed(node.text), style))
                continue
            }
            if depth >= RichText.maxDepth * 2 {
                out.append(.text(Self.collapsed(Self.textContent(node)), style))
                continue
            }
            var inner = style
            switch node.name {
            case "br":
                out.append(.text("\n", style))
                continue
            case "img":
                let src = node.attributes["src"] ?? ""
                let alt = node.attributes["alt"] ?? node.attributes["title"] ?? ""
                if src.hasPrefix("mxc://") {
                    out.append(.emoji(url: src, alt: alt.isEmpty ? ":emoji:" : alt, style: style))
                } else if !src.isEmpty {
                    // Desktop shows an outside image as a link to it.
                    var linked = style
                    linked.link = src
                    out.append(.text(alt.isEmpty ? src : alt, linked))
                }
                continue
            case "strong", "b":
                inner.bold = true
            case "em", "i", "cite", "dfn":
                inner.italic = true
            case "u", "ins":
                inner.underline = true
            case "del", "s", "strike":
                inner.strike = true
            case "code", "kbd", "samp", "tt":
                inner.code = true
            case "a":
                if let href = node.attributes["href"], !href.isEmpty { inner.link = href }
            case "span":
                if node.attributes["data-mx-spoiler"] != nil {
                    inner.spoiler = spoilers
                    spoilers += 1
                }
            default:
                break
            }
            if Self.blockTags.contains(node.name) {
                // A block inside inline text (a paragraph in bold, say) still starts a new line.
                out.append(.text("\n", style))
                out.append(contentsOf: inlines(node.children, style: inner, depth: depth + 1))
                out.append(.text("\n", style))
            } else {
                out.append(contentsOf: inlines(node.children, style: inner, depth: depth + 1))
            }
        }
        return out
    }

    private static func codeBlock(_ pre: HTMLNode) -> RichBlock {
        var label: String?
        if let code = pre.children.first(where: { !$0.isText }), code.name == "code" {
            if let custom = code.attributes["data-label"], !custom.isEmpty {
                label = custom
            } else if let language = code.attributes["class"], !language.isEmpty {
                label = language.hasPrefix("language-") ? String(language.dropFirst("language-".count)) : language
            }
        }
        var text = textContent(pre)
        if text.hasSuffix("\n") { text.removeLast() }
        return .code(text, label: label)
    }

    /// All text below a node, `<br>` as a line break. Iterative, so deep nesting cannot overflow.
    static func textContent(_ node: HTMLNode) -> String {
        var out = ""
        var pending: [HTMLNode] = [node]
        while let next = pending.popLast() {
            if next.isText {
                out += next.text
            } else if next.name == "br" {
                out += "\n"
            } else {
                pending.append(contentsOf: next.children.reversed())
            }
        }
        return out
    }

    /// HTML whitespace: any run of spaces, tabs and line breaks is one space.
    static func collapsed(_ text: String) -> String {
        var out = ""
        var lastWasSpace = false
        for c in text {
            if c == " " || c == "\n" || c == "\t" || c == "\r" {
                if !lastWasSpace { out.append(" ") }
                lastWasSpace = true
            } else {
                out.append(c)
                lastWasSpace = false
            }
        }
        return out
    }

    /// Drops the spaces HTML would not show: at the start and end, twice in a row, around breaks.
    static func normalized(_ inlines: [RichInline]) -> [RichInline] {
        var out: [RichInline] = []
        var last: Character?
        for item in inlines {
            switch item {
            case .text(let raw, let style):
                if raw == "\n" {
                    trimTrailingSpaces(&out)
                    out.append(item)
                    last = "\n"
                    continue
                }
                var text = Substring(raw)
                if last == nil || last == " " || last == "\n" {
                    while text.first == " " { text = text.dropFirst() }
                }
                guard !text.isEmpty else { continue }
                out.append(.text(String(text), style))
                last = text.last
            case .emoji:
                out.append(item)
                last = "x"
            }
        }
        // No empty lines at the end.
        while let tail = out.last, case .text(let text, let style) = tail {
            let trimmed = String(text.reversed().drop(while: { $0 == " " || $0 == "\n" }).reversed())
            if trimmed.isEmpty {
                out.removeLast()
            } else {
                out[out.count - 1] = .text(trimmed, style)
                break
            }
        }
        // Nor at the start (a `<br>` first).
        while let head = out.first, case .text(let text, let style) = head {
            let trimmed = String(text.drop(while: { $0 == " " || $0 == "\n" }))
            if trimmed.isEmpty {
                out.removeFirst()
            } else {
                out[0] = .text(trimmed, style)
                break
            }
        }
        return RichText.merged(out)
    }

    private static func trimTrailingSpaces(_ out: inout [RichInline]) {
        guard let tail = out.last, case .text(let text, let style) = tail else { return }
        let trimmed = String(text.reversed().drop(while: { $0 == " " }).reversed())
        if trimmed.isEmpty { out.removeLast() } else { out[out.count - 1] = .text(trimmed, style) }
    }
}

// MARK: - Markdown

/// Diddy's Markdown, as the desktop composer reads it (`plugins/markdown`): fenced code, headings,
/// quotes and lists per line; bold, italic, underline, strike, code, spoilers and links inline.
final class MarkdownParser {
    private(set) var spoilers = 0

    private struct ListLine {
        let indent: Int
        let ordered: Bool
        let number: Int?
        let content: String
    }

    func blocks(_ lines: [String], depth: Int) -> [RichBlock] {
        var result: [RichBlock] = []
        var paragraph: [String] = []

        func flush() {
            var kept = paragraph
            while let first = kept.first, first.trimmingCharacters(in: .whitespaces).isEmpty { kept.removeFirst() }
            while let last = kept.last, last.trimmingCharacters(in: .whitespaces).isEmpty { kept.removeLast() }
            paragraph = []
            guard !kept.isEmpty else { return }
            let inlines = RichText.merged(self.inlines(kept.joined(separator: "\n"), style: RichStyle()))
            if !inlines.isEmpty { result.append(.paragraph(inlines)) }
        }

        // Fences that have no closing line below them; the next of the same kind has none either.
        var unclosed = Set<String>()
        var i = 0
        while i < lines.count {
            let line = lines[i]
            if depth < RichText.maxDepth, let fence = Self.fence(line), !unclosed.contains(fence.fence) {
                guard let close = Self.closingFence(lines, fence: fence.fence, from: i + 1) else {
                    unclosed.insert(fence.fence)
                    paragraph.append(line)
                    i += 1
                    continue
                }
                flush()
                let code = lines[(i + 1)..<close].joined(separator: "\n")
                // The info string is the label, a language (`swift`) or a file name (`example.json`).
                let info = fence.info
                result.append(.code(code, label: info.isEmpty ? nil : info))
                i = close + 1
                continue
            }
            if let heading = Self.heading(line) {
                flush()
                let inlines = RichText.merged(self.inlines(heading.text, style: RichStyle()))
                result.append(.heading(level: heading.level, inlines))
                i += 1
                continue
            }
            if line.hasPrefix(">"), depth < RichText.maxDepth {
                flush()
                var quoted: [String] = []
                while i < lines.count, lines[i].hasPrefix(">") {
                    var content = Substring(lines[i].dropFirst())
                    while content.first == " " { content = content.dropFirst() }
                    quoted.append(String(content))
                    i += 1
                }
                let inner = blocks(quoted, depth: depth + 1)
                if !inner.isEmpty { result.append(.quote(inner)) }
                continue
            }
            if Self.listLine(line) != nil, depth < RichText.maxDepth {
                flush()
                var items: [ListLine] = []
                while i < lines.count, let item = Self.listLine(lines[i]) {
                    items.append(item)
                    i += 1
                }
                result.append(contentsOf: list(items, depth: depth))
                continue
            }
            paragraph.append(line)
            i += 1
        }
        flush()
        return result
    }

    private func list(_ lines: [ListLine], depth: Int) -> [RichBlock] {
        var result: [RichBlock] = []
        var i = 0
        while i < lines.count {
            let first = lines[i]
            var items: [[RichBlock]] = []
            while i < lines.count, lines[i].indent <= first.indent, lines[i].ordered == first.ordered {
                let line = lines[i]
                var item: [RichBlock] = []
                let text = RichText.merged(inlines(line.content, style: RichStyle()))
                if !text.isEmpty { item.append(.paragraph(text)) }
                i += 1
                var nested: [ListLine] = []
                while i < lines.count, lines[i].indent > line.indent {
                    nested.append(lines[i])
                    i += 1
                }
                if !nested.isEmpty {
                    if depth + 1 < RichText.maxDepth {
                        item.append(contentsOf: list(nested, depth: depth + 1))
                    } else {
                        for extra in nested { item.append(.paragraph([.text(extra.content, RichStyle())])) }
                    }
                }
                items.append(item)
            }
            if items.isEmpty {
                // A line indented less than the first one of a nested list: a list of its own.
                items.append([.paragraph(RichText.merged(inlines(first.content, style: RichStyle())))])
                i += 1
            }
            result.append(.list(ordered: first.ordered, start: first.number ?? 1, items: items))
        }
        return result
    }

    private static func fence(_ line: String) -> (fence: String, info: String)? {
        guard line.hasPrefix("```") else { return nil }
        let ticks = line.prefix(while: { $0 == "`" })
        let rest = line.dropFirst(ticks.count)
        guard !rest.contains(where: { $0 == "`" || $0.isWhitespace }) else { return nil }
        return (String(ticks), String(rest))
    }

    private static func closingFence(_ lines: [String], fence: String, from start: Int) -> Int? {
        guard start < lines.count else { return nil }
        for index in start..<lines.count {
            let line = lines[index]
            if line.hasPrefix(fence), line.dropFirst(fence.count).allSatisfy({ $0 == " " }) { return index }
        }
        return nil
    }

    private static func heading(_ line: String) -> (level: Int, text: String)? {
        let hashes = line.prefix(while: { $0 == "#" })
        guard (1...6).contains(hashes.count) else { return nil }
        let rest = line.dropFirst(hashes.count)
        guard rest.first == " " else { return nil }
        let text = rest.drop(while: { $0 == " " })
        guard !text.isEmpty else { return nil }
        return (hashes.count, String(text))
    }

    private static func listLine(_ line: String) -> ListLine? {
        let indent = line.prefix(while: { $0 == " " }).count
        let rest = line.dropFirst(indent)
        var ordered = false
        var number: Int?
        var afterMarker: Substring
        if rest.hasPrefix("- ") || rest.hasPrefix("* ") {
            afterMarker = rest.dropFirst(1)
        } else {
            let digits = rest.prefix(while: { $0.isASCII && $0.isNumber })
            guard !digits.isEmpty, digits.count <= 9 else { return nil }
            let after = rest.dropFirst(digits.count)
            guard after.hasPrefix(". ") else { return nil }
            ordered = true
            number = Int(digits)
            afterMarker = after.dropFirst(1)
        }
        guard afterMarker.first == " " else { return nil }
        afterMarker = afterMarker.drop(while: { $0 == " " })
        guard !afterMarker.isEmpty else { return nil }
        return ListLine(indent: indent, ordered: ordered, number: number, content: String(afterMarker))
    }

    /// Desktop's escapes, plus the ones `MentionText.escaped` writes into names.
    private static let escapable = Set("\\`*_{}[]()<>#+-.!|~")

    /// Emphasis inside emphasis inside ... is plain text from this depth on (stack safety).
    private static let maxInlineDepth = 10

    func inlines(_ text: String, style: RichStyle, depth: Int = 0) -> [RichInline] {
        if depth >= Self.maxInlineDepth { return text.isEmpty ? [] : [.text(text, style)] }
        let chars = Array(text)
        var out: [RichInline] = []
        var buffer = ""
        var i = 0

        func flushBuffer() {
            if !buffer.isEmpty { out.append(.text(buffer, style)) }
            buffer = ""
        }

        while i < chars.count {
            let c = chars[i]
            let next: Character? = i + 1 < chars.count ? chars[i + 1] : nil
            // Nothing inside a link is formatting (`https://x.org/a_b_c`).
            if c == "h", let end = Self.urlEnd(chars, from: i) {
                buffer += String(chars[i..<end])
                i = end
                continue
            }
            if c == "\\", let next, Self.escapable.contains(next) {
                buffer.append(next)
                i += 2
                continue
            }
            if c == "`", let close = Self.closing(chars, ["`"], from: i + 1) {
                flushBuffer()
                var code = style
                code.code = true
                out.append(.text(String(chars[(i + 1)..<close]), code))
                i = close + 1
                continue
            }
            if c == "[", let link = Self.link(chars, from: i) {
                flushBuffer()
                var linked = style
                linked.link = link.url
                out.append(contentsOf: inlines(link.label, style: linked, depth: depth + 1))
                i = link.end
                continue
            }
            if let found = Self.delimiter(chars, at: i),
               let close = Self.closing(chars, found.delimiter, from: i + found.delimiter.count) {
                let delimiter = found.delimiter
                // snake_case stays as it is: a single `_` needs no letter or digit outside it.
                let wordBefore = i > 0 && (chars[i - 1].isLetter || chars[i - 1].isNumber)
                let wordAfter = close + 1 < chars.count && (chars[close + 1].isLetter || chars[close + 1].isNumber)
                if delimiter == ["_"] && (wordBefore || wordAfter) {
                    // Plain text.
                } else {
                    flushBuffer()
                    var inner = style
                    if delimiter == ["|", "|"] {
                        inner.spoiler = spoilers
                        spoilers += 1
                    } else {
                        found.apply(&inner)
                    }
                    out.append(contentsOf: inlines(String(chars[(i + delimiter.count)..<close]), style: inner, depth: depth + 1))
                    i = close + delimiter.count
                    continue
                }
            }
            buffer.append(c)
            i += 1
        }
        flushBuffer()
        return out
    }

    private static func delimiter(_ chars: [Character], at i: Int) -> (delimiter: [Character], apply: (inout RichStyle) -> Void)? {
        let c = chars[i]
        let double = i + 1 < chars.count && chars[i + 1] == c
        switch c {
        case "|" where double: return (["|", "|"], { _ in })
        case "*" where double: return (["*", "*"], { $0.bold = true })
        case "_" where double: return (["_", "_"], { $0.underline = true })
        case "~" where double: return (["~", "~"], { $0.strike = true })
        case "*": return (["*"], { $0.italic = true })
        case "_": return (["_"], { $0.italic = true })
        default: return nil
        }
    }

    /// The start of the closing delimiter: on the same line, not escaped, with something between,
    /// and not followed by one more of the same character (desktop's `(?!\*)`).
    private static func closing(_ chars: [Character], _ delimiter: [Character], from start: Int) -> Int? {
        var j = start + 1
        let limit = min(chars.count, start + 1 + maxSpan)
        while j + delimiter.count <= chars.count, j < limit {
            if chars[j - 1] == "\n" || chars[j] == "\n" { return nil }
            var same = true
            for k in 0..<delimiter.count where chars[j + k] != delimiter[k] {
                same = false
                break
            }
            if same, chars[j - 1] != "\\" {
                let after = j + delimiter.count
                if after < chars.count, chars[after] == delimiter[0] {
                    j += 1
                    continue
                }
                return j
            }
            j += 1
        }
        return nil
    }

    /// How far a delimiter looks for its partner; keeps long lines of stray `*` linear.
    private static let maxSpan = 600

    /// A link label or address longer than this is no link (and cannot make parsing quadratic).
    private static let maxLinkLength = 2000

    /// `[label](https://…)`
    private static func link(_ chars: [Character], from start: Int) -> (label: String, url: String, end: Int)? {
        var j = start + 1
        var depth = 0
        while j < chars.count, j - start <= maxLinkLength {
            let c = chars[j]
            if c == "\n" { return nil }
            if c == "\\" { j += 2; continue }
            if c == "[" { depth += 1 }
            if c == "]" {
                if depth == 0 { break }
                depth -= 1
            }
            j += 1
        }
        guard j < chars.count, chars[j] == "]", j > start + 1, j + 1 < chars.count, chars[j + 1] == "(" else { return nil }
        let label = String(chars[(start + 1)..<j])
        var k = j + 2
        var url = ""
        while k < chars.count, k - j <= maxLinkLength, chars[k] != ")" {
            if chars[k].isWhitespace { return nil }
            url.append(chars[k])
            k += 1
        }
        guard k < chars.count, chars[k] == ")", url.hasPrefix("https://") || url.hasPrefix("http://") else { return nil }
        return (label, url, k + 1)
    }

    /// The end of a bare `http(s)://` link starting at `start`, if one starts there.
    private static func urlEnd(_ chars: [Character], from start: Int) -> Int? {
        let prefixes = ["https://", "http://"]
        guard let prefix = prefixes.first(where: { prefix in
            prefix.count <= chars.count - start && String(chars[start..<(start + prefix.count)]) == prefix
        }) else { return nil }
        if start > 0, chars[start - 1].isLetter || chars[start - 1].isNumber { return nil }
        var j = start + prefix.count
        while j < chars.count, !chars[j].isWhitespace, chars[j] != ")" { j += 1 }
        return j > start + prefix.count ? j : nil
    }
}

/// Parsed messages are kept, so scrolling the chat does not parse the same text again.
enum RichDocumentCache {
    private final class Box {
        let document: RichDocument
        init(_ document: RichDocument) { self.document = document }
    }

    private static let cache: NSCache<NSString, Box> = {
        let cache = NSCache<NSString, Box>()
        cache.countLimit = 500
        return cache
    }()

    static func document(for source: RichSource) -> RichDocument {
        let key: String
        switch source {
        case .html(let text): key = "h" + text
        case .markdown(let text): key = "m" + text
        }
        if let hit = cache.object(forKey: key as NSString) { return hit.document }
        let document = source.document
        cache.setObject(Box(document), forKey: key as NSString)
        return document
    }
}
