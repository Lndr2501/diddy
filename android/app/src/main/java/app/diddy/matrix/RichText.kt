package app.diddy.matrix

import android.util.LruCache

/**
 * The formatting of a message, the way the desktop app (Cinny) renders it: the HTML body when
 * there is one, else the plain body read as Diddy's Markdown (ios RichText.swift).
 */
data class RichStyle(
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false,
    val strike: Boolean = false,
    val code: Boolean = false,
    /** The spoiler this text belongs to, numbered from 0 within the message. */
    val spoiler: Int? = null,
    val link: String? = null,
)

sealed class RichInline {
    data class Text(val text: String, val style: RichStyle) : RichInline()
    /** A custom emoji (`<img data-mx-emoticon src="mxc://…">`, MSC2545 image packs). */
    data class Emoji(val url: String, val alt: String, val style: RichStyle) : RichInline()
}

sealed class RichBlock {
    data class Paragraph(val inlines: List<RichInline>) : RichBlock()
    data class Heading(val level: Int, val inlines: List<RichInline>) : RichBlock()
    data class Code(val code: String, val label: String?) : RichBlock()
    data class Quote(val blocks: List<RichBlock>) : RichBlock()
    data class ListBlock(val ordered: Boolean, val start: Int, val items: List<List<RichBlock>>) : RichBlock()
    data object Rule : RichBlock()
}

data class RichDocument(val blocks: List<RichBlock>, val spoilers: Int) {
    /** Every custom emoji image of the message, in order, without repeats. */
    val emojiUrls: List<String>
        get() {
            val found = mutableListOf<String>()
            val pending = ArrayDeque(blocks)
            while (pending.isNotEmpty()) {
                when (val block = pending.removeFirst()) {
                    is RichBlock.Paragraph -> block.inlines.forEach { if (it is RichInline.Emoji && it.url !in found) found += it.url }
                    is RichBlock.Heading -> block.inlines.forEach { if (it is RichInline.Emoji && it.url !in found) found += it.url }
                    is RichBlock.Quote -> pending.addAll(block.blocks)
                    is RichBlock.ListBlock -> block.items.forEach { pending.addAll(it) }
                    else -> {}
                }
            }
            return found
        }

    /** The same message in italics, for `/me`. */
    fun italicized(): RichDocument {
        fun italic(items: List<RichInline>): List<RichInline> = items.map {
            when (it) {
                is RichInline.Text -> it.copy(style = it.style.copy(italic = true))
                is RichInline.Emoji -> it.copy(style = it.style.copy(italic = true))
            }
        }
        fun transform(block: RichBlock): RichBlock = when (block) {
            is RichBlock.Paragraph -> RichBlock.Paragraph(italic(block.inlines))
            is RichBlock.Heading -> RichBlock.Heading(block.level, italic(block.inlines))
            is RichBlock.Quote -> RichBlock.Quote(block.blocks.map(::transform))
            is RichBlock.ListBlock -> RichBlock.ListBlock(block.ordered, block.start, block.items.map { it.map(::transform) })
            else -> block
        }
        return RichDocument(blocks.map(::transform), spoilers)
    }

    /** The text without formatting, for tests and accessibility. */
    val plainText: String
        get() {
            fun inlineText(inlines: List<RichInline>) = inlines.joinToString("") {
                when (it) {
                    is RichInline.Text -> it.text
                    is RichInline.Emoji -> it.alt
                }
            }
            fun blockText(block: RichBlock): String = when (block) {
                is RichBlock.Paragraph -> inlineText(block.inlines)
                is RichBlock.Heading -> inlineText(block.inlines)
                is RichBlock.Code -> block.code
                is RichBlock.Quote -> block.blocks.joinToString("\n", transform = ::blockText)
                is RichBlock.ListBlock -> block.items.joinToString("\n") { item -> item.joinToString("\n", transform = ::blockText) }
                RichBlock.Rule -> "---"
            }
            return blocks.joinToString("\n", transform = ::blockText)
        }
}

object RichText {
    const val MAX_DEPTH = 12
    const val MAX_INPUT = 30_000

    fun accepts(text: String): Boolean = text.toByteArray().size <= MAX_INPUT

    fun parseHtml(html: String): RichDocument {
        val root = HtmlTree.parse(html)
        val builder = HtmlBlockBuilder()
        val blocks = builder.blocks(root.children, RichStyle(), 0)
        return RichDocument(blocks, builder.spoilers)
    }

    fun parseMarkdown(markdown: String): RichDocument {
        val parser = MarkdownParser()
        val lines = markdown.replace("\r\n", "\n").split("\n")
        val blocks = parser.blocks(lines, 0)
        return RichDocument(blocks, parser.spoilers)
    }

    /** Joins neighbouring runs of the same style. */
    fun merged(inlines: List<RichInline>): List<RichInline> {
        val out = mutableListOf<RichInline>()
        for (item in inlines) {
            if (item is RichInline.Text && item.text.isEmpty()) continue
            val last = out.lastOrNull()
            if (item is RichInline.Text && last is RichInline.Text && last.style == item.style) {
                out[out.size - 1] = RichInline.Text(last.text + item.text, item.style)
            } else out += item
        }
        return out
    }
}

/** What a message body is read from: the HTML body when there is one, else formatted plain text. */
sealed class RichSource {
    data class Html(val html: String) : RichSource()
    data class Markdown(val text: String) : RichSource()

    val document: RichDocument
        get() = when (this) {
            is Html -> RichText.parseHtml(html)
            is Markdown -> RichText.parseMarkdown(text)
        }

    companion object {
        fun choose(body: String, html: String?): RichSource? {
            if (html != null) {
                if (!RichText.accepts(html)) return null
                val document = RichDocumentCache.document(Html(html))
                return if (document.blocks.isEmpty()) null else Html(html)
            }
            if (!RichText.accepts(body) || !looksFormatted(body)) return null
            return Markdown(body)
        }

        /** A plain body that carries a spoiler, a code block, a quote, a heading or a list. */
        fun looksFormatted(body: String): Boolean {
            if (body.contains("```") || body.contains("||")) return true
            for (line in body.split("\n")) {
                if (line.isEmpty()) continue
                if (line.startsWith("> ") || line.startsWith("- ") || line.startsWith("* ")) return true
                val hashes = line.takeWhile { it == '#' }.length
                if (hashes in 1..6 && line.getOrNull(hashes) == ' ') return true
                val digits = line.takeWhile { it in '0'..'9' }.length
                if (digits in 1..9 && line.startsWith(". ", digits)) return true
            }
            return false
        }
    }
}

// MARK: - HTML

class HtmlNode(val name: String, val attributes: Map<String, String>, val text: String = "") {
    val children = mutableListOf<HtmlNode>()
    val isText: Boolean get() = name.isEmpty()

    companion object {
        fun text(text: String) = HtmlNode("", emptyMap(), text)
    }
}

/** A forgiving HTML reader for message bodies; the quoted message of a reply is dropped like desktop. */
object HtmlTree {
    val voidTags = setOf("br", "hr", "img", "wbr", "input", "meta", "link", "col", "area", "source", "base")
    const val MAX_NESTING = 200
    val droppedTags = setOf("mx-reply", "script", "style", "textarea", "option", "noscript", "head", "title")
    private const val MAX_TAG_LENGTH = 4096

    fun parse(html: String): HtmlNode {
        val root = HtmlNode("#root", emptyMap())
        val stack = mutableListOf(root)
        val text = StringBuilder()
        var i = 0
        val n = html.length

        fun flushText() {
            if (text.isEmpty()) return
            stack.last().children += HtmlNode.text(decodeEntities(text.toString()))
            text.clear()
        }

        while (i < n) {
            val c = html[i]
            if (c != '<' || i + 1 >= n) {
                text.append(c)
                i += 1
                continue
            }
            if (html.startsWith("<!--", i)) {
                flushText()
                val end = html.indexOf("-->", i + 4)
                i = if (end >= 0) end + 3 else n
                continue
            }
            val next = html[i + 1]
            if (!(next == '/' || next == '!' || next.isLetter())) {
                text.append(c)
                i += 1
                continue
            }
            val end = tagEnd(html, i + 1)
            if (end == null) {
                text.append(c)
                i += 1
                continue
            }
            val inner = html.substring(i + 1, end)
            i = end + 1
            if (next == '!') continue
            flushText()
            if (next == '/') {
                val name = tagName(inner.drop(1))
                val index = stack.indexOfLast { it.name == name }
                if (index > 0) while (stack.size > index) stack.removeAt(stack.size - 1)
                continue
            }
            var content = inner
            val selfClosing = content.endsWith("/")
            if (selfClosing) content = content.dropLast(1)
            val name = tagName(content)
            if (name.isEmpty()) continue
            if (name in droppedTags) {
                if (!selfClosing) {
                    val close = html.indexOf("</$name", i, ignoreCase = true)
                    i = if (close >= 0) (tagEnd(html, close + 1)?.plus(1) ?: n) else n
                }
                continue
            }
            // Browsers close an open paragraph or list item when the next one starts.
            if ((name == "li" || name == "p") && stack.size > 1 && stack.last().name == name) stack.removeAt(stack.size - 1)
            val node = HtmlNode(name, attributes(content))
            stack.last().children += node
            if (!selfClosing && name !in voidTags && stack.size < MAX_NESTING) stack += node
        }
        flushText()
        return root
    }

    private fun tagEnd(html: String, start: Int): Int? {
        var quote: Char? = null
        var j = start
        while (j < html.length && j - start < MAX_TAG_LENGTH) {
            val c = html[j]
            if (quote != null) {
                if (c == quote) quote = null
            } else if (c == '"' || c == '\'') {
                quote = c
            } else if (c == '>') return j
            j += 1
        }
        return null
    }

    private fun tagName(content: String): String = content.takeWhile { !it.isWhitespace() && it != '/' }.lowercase()

    fun attributes(content: String): Map<String, String> {
        val result = mutableMapOf<String, String>()
        var i = 0
        val n = content.length
        while (i < n && !content[i].isWhitespace()) i += 1
        while (i < n) {
            while (i < n && (content[i].isWhitespace() || content[i] == '/')) i += 1
            val name = StringBuilder()
            while (i < n && !content[i].isWhitespace() && content[i] != '=' && content[i] != '/') {
                name.append(content[i]); i += 1
            }
            while (i < n && content[i].isWhitespace()) i += 1
            val value = StringBuilder()
            if (i < n && content[i] == '=') {
                i += 1
                while (i < n && content[i].isWhitespace()) i += 1
                if (i < n && (content[i] == '"' || content[i] == '\'')) {
                    val quote = content[i]
                    i += 1
                    while (i < n && content[i] != quote) { value.append(content[i]); i += 1 }
                    i += 1
                } else {
                    while (i < n && !content[i].isWhitespace()) { value.append(content[i]); i += 1 }
                }
            }
            if (name.isNotEmpty()) result[name.toString().lowercase()] = decodeEntities(value.toString())
        }
        return result
    }

    private val namedEntities = mapOf(
        "lt" to "<", "gt" to ">", "amp" to "&", "quot" to "\"", "apos" to "'", "nbsp" to " ",
        "ndash" to "–", "mdash" to "—", "hellip" to "…", "copy" to "©",
        "reg" to "®", "trade" to "™", "laquo" to "«", "raquo" to "»",
        "lsquo" to "‘", "rsquo" to "’", "ldquo" to "“", "rdquo" to "”",
        "bull" to "•", "middot" to "·", "times" to "×", "euro" to "€",
    )

    fun decodeEntities(text: String): String {
        if (!text.contains('&')) return text
        val out = StringBuilder()
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (c != '&') { out.append(c); i += 1; continue }
            var j = i + 1
            val name = StringBuilder()
            while (j < text.length && j - i <= 10 && text[j] != ';' && text[j] != '&' && !text[j].isWhitespace()) {
                name.append(text[j]); j += 1
            }
            if (j >= text.length || text[j] != ';' || name.isEmpty()) { out.append(c); i += 1; continue }
            val entity = name.toString()
            val decoded: String? = when {
                entity.startsWith("#x") || entity.startsWith("#X") -> entity.drop(2).toIntOrNull(16)?.let(::codePointString)
                entity.startsWith("#") -> entity.drop(1).toIntOrNull()?.let(::codePointString)
                else -> namedEntities[entity.lowercase()]
            }
            if (decoded != null && decoded != "\u0000") {
                out.append(decoded)
                i = j + 1
            } else {
                out.append(c)
                i += 1
            }
        }
        return out.toString()
    }

    private fun codePointString(code: Int): String? =
        if (Character.isValidCodePoint(code) && code !in 0xD800..0xDFFF) String(Character.toChars(code)) else null
}

class HtmlBlockBuilder {
    var spoilers = 0
        private set

    companion object {
        val blockTags = setOf(
            "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "ul", "ol", "li", "hr",
            "table", "thead", "tbody", "tfoot", "tr", "caption", "details", "summary", "section", "article",
            "header", "footer", "figure", "figcaption", "dl", "dt", "dd", "center", "main", "nav", "aside",
        )

        fun textContent(node: HtmlNode): String {
            val out = StringBuilder()
            val pending = ArrayDeque<HtmlNode>().apply { add(node) }
            while (pending.isNotEmpty()) {
                val next = pending.removeLast()
                when {
                    next.isText -> out.append(next.text)
                    next.name == "br" -> out.append("\n")
                    else -> next.children.asReversed().forEach { pending.add(it) }
                }
            }
            return out.toString()
        }

        /** HTML whitespace: any run of spaces, tabs and line breaks is one space. */
        fun collapsed(text: String): String {
            val out = StringBuilder()
            var lastWasSpace = false
            for (c in text) {
                if (c == ' ' || c == '\n' || c == '\t' || c == '\r') {
                    if (!lastWasSpace) out.append(' ')
                    lastWasSpace = true
                } else {
                    out.append(c)
                    lastWasSpace = false
                }
            }
            return out.toString()
        }

        /** Drops the spaces HTML would not show: at the start and end, twice in a row, around breaks. */
        fun normalized(inlines: List<RichInline>): List<RichInline> {
            val out = mutableListOf<RichInline>()
            var last: Char? = null
            for (item in inlines) {
                when (item) {
                    is RichInline.Text -> {
                        if (item.text == "\n") {
                            trimTrailingSpaces(out)
                            out += item
                            last = '\n'
                            continue
                        }
                        var text = item.text
                        if (last == null || last == ' ' || last == '\n') text = text.trimStart(' ')
                        if (text.isEmpty()) continue
                        out += RichInline.Text(text, item.style)
                        last = text.last()
                    }
                    is RichInline.Emoji -> {
                        out += item
                        last = 'x'
                    }
                }
            }
            while (true) {
                val tail = out.lastOrNull() as? RichInline.Text ?: break
                val trimmed = tail.text.trimEnd(' ', '\n')
                if (trimmed.isEmpty()) out.removeAt(out.size - 1) else {
                    out[out.size - 1] = RichInline.Text(trimmed, tail.style)
                    break
                }
            }
            while (true) {
                val head = out.firstOrNull() as? RichInline.Text ?: break
                val trimmed = head.text.trimStart(' ', '\n')
                if (trimmed.isEmpty()) out.removeAt(0) else {
                    out[0] = RichInline.Text(trimmed, head.style)
                    break
                }
            }
            return RichText.merged(out)
        }

        private fun trimTrailingSpaces(out: MutableList<RichInline>) {
            val tail = out.lastOrNull() as? RichInline.Text ?: return
            val trimmed = tail.text.trimEnd(' ')
            if (trimmed.isEmpty()) out.removeAt(out.size - 1) else out[out.size - 1] = RichInline.Text(trimmed, tail.style)
        }

        private fun codeBlock(pre: HtmlNode): RichBlock {
            var label: String? = null
            val code = pre.children.firstOrNull { !it.isText }
            if (code != null && code.name == "code") {
                val custom = code.attributes["data-label"]
                val language = code.attributes["class"]
                label = when {
                    !custom.isNullOrEmpty() -> custom
                    !language.isNullOrEmpty() -> language.removePrefix("language-")
                    else -> null
                }
            }
            var text = textContent(pre)
            if (text.endsWith("\n")) text = text.dropLast(1)
            return RichBlock.Code(text, label)
        }
    }

    fun blocks(nodes: List<HtmlNode>, style: RichStyle, depth: Int): List<RichBlock> {
        val result = mutableListOf<RichBlock>()
        val inline = mutableListOf<RichInline>()

        fun flush() {
            val cleaned = normalized(inline)
            if (cleaned.isNotEmpty()) result += RichBlock.Paragraph(cleaned)
            inline.clear()
        }

        for (node in nodes) {
            if (node.isText || node.name !in blockTags) {
                inline += inlines(listOf(node), style, depth)
                continue
            }
            flush()
            if (depth >= RichText.MAX_DEPTH) {
                val text = normalized(inlines(node.children, style, depth))
                if (text.isNotEmpty()) result += RichBlock.Paragraph(text)
                continue
            }
            when (node.name) {
                "h1", "h2", "h3", "h4", "h5", "h6" -> {
                    val level = node.name.drop(1).toIntOrNull() ?: 1
                    val text = normalized(inlines(node.children, style, depth + 1))
                    if (text.isNotEmpty()) result += RichBlock.Heading(level, text)
                }
                "pre" -> result += codeBlock(node)
                "blockquote" -> {
                    val inner = blocks(node.children, style, depth + 1)
                    if (inner.isNotEmpty()) result += RichBlock.Quote(inner)
                }
                "ul", "ol" -> {
                    val items = mutableListOf<MutableList<RichBlock>>()
                    for (child in node.children) {
                        if (child.name == "li") {
                            items += blocks(child.children, style, depth + 1).toMutableList()
                        } else if (child.isText && child.text.all { it.isWhitespace() }) {
                            continue
                        } else {
                            val extra = blocks(listOf(child), style, depth + 1)
                            if (extra.isEmpty()) continue
                            if (items.isEmpty()) items += extra.toMutableList() else items.last().addAll(extra)
                        }
                    }
                    val start = if (node.name == "ol") node.attributes["start"]?.trim()?.toIntOrNull() ?: 1 else 1
                    if (items.isNotEmpty()) result += RichBlock.ListBlock(node.name == "ol", start, items)
                }
                "hr" -> result += RichBlock.Rule
                "tr" -> {
                    val cells = mutableListOf<RichInline>()
                    val header = style.copy(bold = true)
                    for (cell in node.children) {
                        if (cell.isText) continue
                        val text = normalized(inlines(cell.children, if (cell.name == "th") header else style, depth + 1))
                        if (text.isEmpty()) continue
                        if (cells.isNotEmpty()) cells += RichInline.Text(" | ", style)
                        cells += text
                    }
                    if (cells.isNotEmpty()) result += RichBlock.Paragraph(cells)
                }
                else -> result += blocks(node.children, style, depth + 1)
            }
        }
        flush()
        return result
    }

    fun inlines(nodes: List<HtmlNode>, style: RichStyle, depth: Int): List<RichInline> {
        val out = mutableListOf<RichInline>()
        for (node in nodes) {
            if (node.isText) {
                out += RichInline.Text(collapsed(node.text), style)
                continue
            }
            if (depth >= RichText.MAX_DEPTH * 2) {
                out += RichInline.Text(collapsed(textContent(node)), style)
                continue
            }
            var inner = style
            when (node.name) {
                "br" -> {
                    out += RichInline.Text("\n", style)
                    continue
                }
                "img" -> {
                    val src = node.attributes["src"] ?: ""
                    val alt = node.attributes["alt"] ?: node.attributes["title"] ?: ""
                    if (src.startsWith("mxc://")) {
                        out += RichInline.Emoji(src, alt.ifEmpty { ":emoji:" }, style)
                    } else if (src.isNotEmpty()) {
                        // Desktop shows an outside image as a link to it.
                        out += RichInline.Text(alt.ifEmpty { src }, style.copy(link = src))
                    }
                    continue
                }
                "strong", "b" -> inner = inner.copy(bold = true)
                "em", "i", "cite", "dfn" -> inner = inner.copy(italic = true)
                "u", "ins" -> inner = inner.copy(underline = true)
                "del", "s", "strike" -> inner = inner.copy(strike = true)
                "code", "kbd", "samp", "tt" -> inner = inner.copy(code = true)
                "a" -> node.attributes["href"]?.takeIf { it.isNotEmpty() }?.let { inner = inner.copy(link = it) }
                "span" -> if (node.attributes.containsKey("data-mx-spoiler")) {
                    inner = inner.copy(spoiler = spoilers)
                    spoilers += 1
                }
            }
            if (node.name in blockTags) {
                out += RichInline.Text("\n", style)
                out += inlines(node.children, inner, depth + 1)
                out += RichInline.Text("\n", style)
            } else {
                out += inlines(node.children, inner, depth + 1)
            }
        }
        return out
    }
}

// MARK: - Markdown

/** Diddy's Markdown, as the desktop composer reads it (`plugins/markdown`). */
class MarkdownParser {
    var spoilers = 0
        private set

    private data class ListLine(val indent: Int, val ordered: Boolean, val number: Int?, val content: String)

    fun blocks(lines: List<String>, depth: Int): List<RichBlock> {
        val result = mutableListOf<RichBlock>()
        val paragraph = mutableListOf<String>()

        fun flush() {
            val kept = paragraph.toMutableList()
            while (kept.isNotEmpty() && kept.first().isBlank()) kept.removeAt(0)
            while (kept.isNotEmpty() && kept.last().isBlank()) kept.removeAt(kept.size - 1)
            paragraph.clear()
            if (kept.isEmpty()) return
            val inlines = RichText.merged(inlines(kept.joinToString("\n"), RichStyle()))
            if (inlines.isNotEmpty()) result += RichBlock.Paragraph(inlines)
        }

        val unclosed = mutableSetOf<String>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val fence = if (depth < RichText.MAX_DEPTH) fence(line) else null
            if (fence != null && fence.first !in unclosed) {
                val close = closingFence(lines, fence.first, i + 1)
                if (close == null) {
                    unclosed += fence.first
                    paragraph += line
                    i += 1
                    continue
                }
                flush()
                val code = lines.subList(i + 1, close).joinToString("\n")
                result += RichBlock.Code(code, fence.second.ifEmpty { null })
                i = close + 1
                continue
            }
            val heading = heading(line)
            if (heading != null) {
                flush()
                result += RichBlock.Heading(heading.first, RichText.merged(inlines(heading.second, RichStyle())))
                i += 1
                continue
            }
            if (line.startsWith(">") && depth < RichText.MAX_DEPTH) {
                flush()
                val quoted = mutableListOf<String>()
                while (i < lines.size && lines[i].startsWith(">")) {
                    quoted += lines[i].drop(1).trimStart(' ')
                    i += 1
                }
                val inner = blocks(quoted, depth + 1)
                if (inner.isNotEmpty()) result += RichBlock.Quote(inner)
                continue
            }
            if (listLine(line) != null && depth < RichText.MAX_DEPTH) {
                flush()
                val items = mutableListOf<ListLine>()
                while (i < lines.size) {
                    val item = listLine(lines[i]) ?: break
                    items += item
                    i += 1
                }
                result += list(items, depth)
                continue
            }
            paragraph += line
            i += 1
        }
        flush()
        return result
    }

    private fun list(lines: List<ListLine>, depth: Int): List<RichBlock> {
        val result = mutableListOf<RichBlock>()
        var i = 0
        while (i < lines.size) {
            val first = lines[i]
            val items = mutableListOf<List<RichBlock>>()
            while (i < lines.size && lines[i].indent <= first.indent && lines[i].ordered == first.ordered) {
                val line = lines[i]
                val item = mutableListOf<RichBlock>()
                val text = RichText.merged(inlines(line.content, RichStyle()))
                if (text.isNotEmpty()) item += RichBlock.Paragraph(text)
                i += 1
                val nested = mutableListOf<ListLine>()
                while (i < lines.size && lines[i].indent > line.indent) {
                    nested += lines[i]
                    i += 1
                }
                if (nested.isNotEmpty()) {
                    if (depth + 1 < RichText.MAX_DEPTH) item += list(nested, depth + 1)
                    else nested.forEach { item += RichBlock.Paragraph(listOf(RichInline.Text(it.content, RichStyle()))) }
                }
                items += item
            }
            if (items.isEmpty()) {
                items += listOf(RichBlock.Paragraph(RichText.merged(inlines(first.content, RichStyle()))))
                i += 1
            }
            result += RichBlock.ListBlock(first.ordered, first.number ?: 1, items)
        }
        return result
    }

    private fun fence(line: String): Pair<String, String>? {
        if (!line.startsWith("```")) return null
        val ticks = line.takeWhile { it == '`' }
        val rest = line.drop(ticks.length)
        if (rest.any { it == '`' || it.isWhitespace() }) return null
        return ticks to rest
    }

    private fun closingFence(lines: List<String>, fence: String, start: Int): Int? {
        for (index in start until lines.size) {
            val line = lines[index]
            if (line.startsWith(fence) && line.drop(fence.length).all { it == ' ' }) return index
        }
        return null
    }

    private fun heading(line: String): Pair<Int, String>? {
        val hashes = line.takeWhile { it == '#' }.length
        if (hashes !in 1..6) return null
        val rest = line.drop(hashes)
        if (!rest.startsWith(" ")) return null
        val text = rest.trimStart(' ')
        if (text.isEmpty()) return null
        return hashes to text
    }

    private fun listLine(line: String): ListLine? {
        val indent = line.takeWhile { it == ' ' }.length
        val rest = line.drop(indent)
        var ordered = false
        var number: Int? = null
        var afterMarker: String
        if (rest.startsWith("- ") || rest.startsWith("* ")) {
            afterMarker = rest.drop(1)
        } else {
            val digits = rest.takeWhile { it in '0'..'9' }
            if (digits.isEmpty() || digits.length > 9) return null
            val after = rest.drop(digits.length)
            if (!after.startsWith(". ")) return null
            ordered = true
            number = digits.toIntOrNull()
            afterMarker = after.drop(1)
        }
        if (!afterMarker.startsWith(" ")) return null
        afterMarker = afterMarker.trimStart(' ')
        if (afterMarker.isEmpty()) return null
        return ListLine(indent, ordered, number, afterMarker)
    }

    fun inlines(text: String, style: RichStyle, depth: Int = 0): List<RichInline> {
        if (depth >= MAX_INLINE_DEPTH) return if (text.isEmpty()) emptyList() else listOf(RichInline.Text(text, style))
        val chars = text
        val out = mutableListOf<RichInline>()
        val buffer = StringBuilder()
        var i = 0

        fun flushBuffer() {
            if (buffer.isNotEmpty()) out += RichInline.Text(buffer.toString(), style)
            buffer.clear()
        }

        while (i < chars.length) {
            val c = chars[i]
            val next = chars.getOrNull(i + 1)
            if (c == 'h') {
                val end = urlEnd(chars, i)
                if (end != null) {
                    buffer.append(chars, i, end)
                    i = end
                    continue
                }
            }
            if (c == '\\' && next != null && next in ESCAPABLE) {
                buffer.append(next)
                i += 2
                continue
            }
            if (c == '`') {
                val close = closing(chars, "`", i + 1)
                if (close != null) {
                    flushBuffer()
                    out += RichInline.Text(chars.substring(i + 1, close), style.copy(code = true))
                    i = close + 1
                    continue
                }
            }
            if (c == '[') {
                val link = link(chars, i)
                if (link != null) {
                    flushBuffer()
                    out += inlines(link.first, style.copy(link = link.second), depth + 1)
                    i = link.third
                    continue
                }
            }
            val found = delimiter(chars, i)
            if (found != null) {
                val delimiter = found.first
                val close = closing(chars, delimiter, i + delimiter.length)
                if (close != null) {
                    val wordBefore = i > 0 && chars[i - 1].isLetterOrDigit()
                    val wordAfter = close + 1 < chars.length && chars[close + 1].isLetterOrDigit()
                    if (!(delimiter == "_" && (wordBefore || wordAfter))) {
                        flushBuffer()
                        val inner = if (delimiter == "||") style.copy(spoiler = spoilers).also { spoilers += 1 } else found.second(style)
                        out += inlines(chars.substring(i + delimiter.length, close), inner, depth + 1)
                        i = close + delimiter.length
                        continue
                    }
                }
            }
            buffer.append(c)
            i += 1
        }
        flushBuffer()
        return out
    }

    private fun delimiter(chars: String, i: Int): Pair<String, (RichStyle) -> RichStyle>? {
        val c = chars[i]
        val double = i + 1 < chars.length && chars[i + 1] == c
        return when {
            c == '|' && double -> "||" to { s: RichStyle -> s }
            c == '*' && double -> "**" to { s: RichStyle -> s.copy(bold = true) }
            c == '_' && double -> "__" to { s: RichStyle -> s.copy(underline = true) }
            c == '~' && double -> "~~" to { s: RichStyle -> s.copy(strike = true) }
            c == '*' -> "*" to { s: RichStyle -> s.copy(italic = true) }
            c == '_' -> "_" to { s: RichStyle -> s.copy(italic = true) }
            else -> null
        }
    }

    /** The start of the closing delimiter: same line, not escaped, something between, not doubled. */
    private fun closing(chars: String, delimiter: String, start: Int): Int? {
        var j = start + 1
        val limit = minOf(chars.length, start + 1 + MAX_SPAN)
        while (j + delimiter.length <= chars.length && j < limit) {
            if (chars[j - 1] == '\n' || chars[j] == '\n') return null
            if (chars.startsWith(delimiter, j) && chars[j - 1] != '\\') {
                val after = j + delimiter.length
                if (after < chars.length && chars[after] == delimiter[0]) {
                    j += 1
                    continue
                }
                return j
            }
            j += 1
        }
        return null
    }

    /** `[label](https://…)`: label, url and the index after it. */
    private fun link(chars: String, start: Int): Triple<String, String, Int>? {
        var j = start + 1
        var depth = 0
        while (j < chars.length && j - start <= MAX_LINK_LENGTH) {
            val c = chars[j]
            if (c == '\n') return null
            if (c == '\\') { j += 2; continue }
            if (c == '[') depth += 1
            if (c == ']') {
                if (depth == 0) break
                depth -= 1
            }
            j += 1
        }
        if (j >= chars.length || chars[j] != ']' || j <= start + 1 || j + 1 >= chars.length || chars[j + 1] != '(') return null
        val label = chars.substring(start + 1, j)
        var k = j + 2
        val url = StringBuilder()
        while (k < chars.length && k - j <= MAX_LINK_LENGTH && chars[k] != ')') {
            if (chars[k].isWhitespace()) return null
            url.append(chars[k])
            k += 1
        }
        val address = url.toString()
        if (k >= chars.length || chars[k] != ')' || !(address.startsWith("https://") || address.startsWith("http://"))) return null
        return Triple(label, address, k + 1)
    }

    private fun urlEnd(chars: String, start: Int): Int? {
        val prefix = listOf("https://", "http://").firstOrNull { chars.startsWith(it, start) } ?: return null
        if (start > 0 && chars[start - 1].isLetterOrDigit()) return null
        var j = start + prefix.length
        while (j < chars.length && !chars[j].isWhitespace() && chars[j] != ')') j += 1
        return if (j > start + prefix.length) j else null
    }

    companion object {
        private const val ESCAPABLE = "\\`*_{}[]()<>#+-.!|~"
        private const val MAX_INLINE_DEPTH = 10
        private const val MAX_SPAN = 600
        private const val MAX_LINK_LENGTH = 2000
    }
}

/** Parsed messages are kept, so scrolling the chat does not parse the same text again. */
object RichDocumentCache {
    private val cache = LruCache<String, RichDocument>(500)

    fun document(source: RichSource): RichDocument {
        val key = when (source) {
            is RichSource.Html -> "h" + source.html
            is RichSource.Markdown -> "m" + source.text
        }
        cache.get(key)?.let { return it }
        val document = source.document
        cache.put(key, document)
        return document
    }
}
