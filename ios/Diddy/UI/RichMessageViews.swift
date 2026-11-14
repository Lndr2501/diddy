import SwiftUI
import UIKit

/// What the rendering of one message shares between its blocks: which spoilers are open and the
/// pictures of its custom emoji.
@MainActor
final class RichRenderState: ObservableObject {
    @Published var revealed: Set<Int> = []
    @Published var emoji: [String: UIImage] = [:]
}

enum InlineEmoji {
    /// The emoji picture at the height of a line of text, so it can sit inside a `Text`.
    static func sized(_ image: UIImage, height: CGFloat) -> UIImage {
        let ratio = image.size.width / max(image.size.height, 1)
        let width = min(max(height * ratio, height * 0.4), height * 3)
        let size = CGSize(width: width, height: height)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 3
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

/// Turns the inline parts of a message into one `Text`: bold, italic, code, links, mentions,
/// spoilers (a bar until tapped) and custom emoji as pictures.
struct RichTextBuilder {
    let revealed: Set<Int>
    let emoji: [String: UIImage]
    let ownUserId: String

    static let spoilerPrefix = "diddy-spoiler://"
    /// Link schemes a tap may open; anything else in a message stays plain text.
    static let tappableSchemes: Set<String> = ["http", "https", "matrix"]
    private static let linkDetector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    func text(_ inlines: [RichInline], font: Font) -> Text {
        var result = Text(verbatim: "")
        var run = AttributedString()
        var hasRun = false
        var previousLink: URL?

        func flushRun() {
            guard hasRun else { return }
            result = result + Text(run)
            run = AttributedString()
            hasRun = false
        }

        for item in inlines {
            switch item {
            case .text(let value, let style):
                run.append(attributed(value, style: style, font: font, previousLink: &previousLink))
                hasRun = true
            case .emoji(let url, let alt, let style):
                if let image = emoji[url], !isHidden(style) {
                    flushRun()
                    result = result + Text(Image(uiImage: image))
                    previousLink = nil
                } else {
                    run.append(attributed(alt, style: style, font: font, previousLink: &previousLink))
                    hasRun = true
                }
            }
        }
        flushRun()
        return result
    }

    private func isHidden(_ style: RichStyle) -> Bool {
        guard let number = style.spoiler else { return false }
        return !revealed.contains(number)
    }

    private func attributed(_ value: String, style: RichStyle, font: Font, previousLink: inout URL?) -> AttributedString {
        if let number = style.spoiler, !revealed.contains(number) {
            // The words are not in the text at all, so selecting, copying or reading it aloud gives nothing away.
            var bar = AttributedString(String(repeating: "█", count: min(max(value.count, 1), 40)))
            bar.font = font
            bar.foregroundColor = Theme.faint
            bar.link = URL(string: Self.spoilerPrefix + String(number))
            previousLink = nil
            return bar
        }
        var chosen = font
        if style.code { chosen = Font.system(.callout, design: .monospaced) }
        if style.bold { chosen = chosen.bold() }
        if style.italic { chosen = chosen.italic() }
        var piece = AttributedString(value)
        piece.font = chosen
        if style.underline { piece.underlineStyle = .single }
        if style.strike { piece.strikethroughStyle = .single }
        if style.code { piece.backgroundColor = Theme.elevated }
        if let link = style.link, let url = Self.safeURL(link) {
            piece.link = url
            if let userId = MentionText.userId(in: url) {
                // A name split into several runs gets its "@" only once.
                if url != previousLink, !value.hasPrefix("@") {
                    var at = AttributedString("@")
                    at.link = url
                    at.font = chosen
                    piece = at + piece
                }
                piece.font = chosen.weight(.semibold)
                piece.backgroundColor = (userId == ownUserId ? Theme.accent : Theme.accent.opacity(0.6)).opacity(0.25)
            }
            previousLink = url
            return piece
        }
        previousLink = nil
        if !style.code { Self.addBareLinks(to: &piece, plain: value) }
        return piece
    }

    static func safeURL(_ text: String) -> URL? {
        guard let url = URL(string: text), tappableSchemes.contains(url.scheme?.lowercased() ?? "") else { return nil }
        return url
    }

    /// Tappable bare links, which a plain run of text does not have.
    private static func addBareLinks(to piece: inout AttributedString, plain: String) {
        guard plain.contains(":") else { return }
        let matches = linkDetector?.matches(in: plain, range: NSRange(plain.startIndex..., in: plain)) ?? []
        for match in matches {
            guard let url = match.url, tappableSchemes.contains(url.scheme?.lowercased() ?? ""),
                  let range = Range(match.range, in: plain),
                  let start = AttributedString.Index(range.lowerBound, within: piece),
                  let end = AttributedString.Index(range.upperBound, within: piece) else { continue }
            piece[start..<end].link = url
        }
    }
}

private extension RichBlock {
    var endsWithText: Bool {
        switch self {
        case .paragraph, .heading: return true
        default: return false
        }
    }
}

/// The text of a message with its formatting: paragraphs, headings, code blocks, quotes, lists,
/// spoilers and custom emoji, the way the desktop shows `formatted_body`.
struct RichMessageBody: View {
    let source: RichSource
    var italic = false
    var edited = false
    let account: MatrixAccount
    /// Taps on links (people, rooms, web); spoilers are opened here.
    var onLink: (URL) -> OpenURLAction.Result = { _ in .systemAction }

    @StateObject private var state = RichRenderState()
    @ScaledMetric(relativeTo: .subheadline) private var emojiHeight: CGFloat = 18

    private var document: RichDocument {
        var resolved = source
        if case .markdown(let text) = source {
            // Diddy desktop writes the bare user id into the plain body; show it as a name.
            resolved = .markdown(MentionText.linkingBareIds(in: text) { account.name(of: $0) })
        }
        let parsed = RichDocumentCache.document(for: resolved)
        return italic ? parsed.italicized() : parsed
    }

    var body: some View {
        let document = self.document
        let lastIsLine = document.blocks.last?.endsWithText ?? false
        VStack(alignment: .leading, spacing: 4) {
            RichBlocksView(blocks: document.blocks, state: state, ownUserId: account.userId, editedOnLast: edited && lastIsLine)
            if edited && !lastIsLine {
                Text("(edited)").font(.caption2).foregroundColor(Theme.faint)
            }
        }
        .environment(\.openURL, OpenURLAction { url in handle(url) })
        .task(id: document.emojiURLs) { await loadEmoji(document.emojiURLs) }
    }

    private func handle(_ url: URL) -> OpenURLAction.Result {
        let text = url.absoluteString
        let prefix = RichTextBuilder.spoilerPrefix
        if text.hasPrefix(prefix), let number = Int(text.dropFirst(prefix.count)) {
            state.revealed.insert(number)
            return .handled
        }
        return onLink(url)
    }

    private func loadEmoji(_ urls: [String]) async {
        for url in urls.prefix(40) where state.emoji[url] == nil {
            if Task.isCancelled { return }
            guard let image = await MediaLoader.shared.thumbnail(url: url, size: 96, accountId: account.id, client: account.client) else { continue }
            state.emoji[url] = InlineEmoji.sized(image, height: emojiHeight)
        }
    }
}

private struct RichBlocksView: View {
    let blocks: [RichBlock]
    @ObservedObject var state: RichRenderState
    let ownUserId: String
    var editedOnLast = false

    private var builder: RichTextBuilder {
        RichTextBuilder(revealed: state.revealed, emoji: state.emoji, ownUserId: ownUserId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { pair in
                blockView(pair.element, edited: editedOnLast && pair.offset == blocks.count - 1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func blockView(_ block: RichBlock, edited: Bool) -> some View {
        switch block {
        case .paragraph(let inlines):
            line(inlines, font: ChatStyle.bodyFont, edited: edited)
        case .heading(let level, let inlines):
            line(inlines, font: Self.headingFont(level), edited: edited)
        case .code(let code, let label):
            codeBlock(code, label: label)
        case .quote(let inner):
            HStack(alignment: .top, spacing: 8) {
                RoundedRectangle(cornerRadius: 1.5).fill(Theme.faint).frame(width: 3)
                AnyView(RichBlocksView(blocks: inner, state: state, ownUserId: ownUserId))
            }
            .fixedSize(horizontal: false, vertical: true)
        case .list(let ordered, let start, let items):
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(items.enumerated()), id: \.offset) { pair in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(verbatim: ordered ? "\(start + pair.offset)." : "•")
                            .font(ChatStyle.bodyFont)
                            .foregroundStyle(Theme.muted)
                            .frame(minWidth: 18, alignment: .trailing)
                        AnyView(RichBlocksView(blocks: pair.element, state: state, ownUserId: ownUserId))
                    }
                }
            }
            .padding(.leading, 2)
        case .rule:
            Divider().overlay(Theme.faint)
        }
    }

    private func line(_ inlines: [RichInline], font: Font, edited: Bool) -> some View {
        var text = builder.text(inlines, font: font)
        if edited { text = text + Text(" (edited)").font(.caption2).foregroundColor(Theme.faint) }
        return text
            .foregroundStyle(Theme.text)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func codeBlock(_ code: String, label: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label, !label.isEmpty {
                Text(verbatim: label).font(.caption2).foregroundStyle(Theme.faint)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                Text(verbatim: code)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: true, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Same corners and edge as link previews, files and bot cards.
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.elevated))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.faint.opacity(0.25), lineWidth: 1))
    }

    private static func headingFont(_ level: Int) -> Font {
        switch level {
        // One step smaller than before, like the message text.
        case 1: return .title3.bold()
        case 2: return .headline
        case 3: return .subheadline.bold()
        default: return .subheadline.weight(.semibold)
        }
    }
}
