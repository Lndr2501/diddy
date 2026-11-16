package app.diddy.matrix

import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Matcher
import java.util.regex.Pattern

/**
 * The desktop's Markdown dialect (cinny `plugins/markdown`), so a message typed on Android gets
 * the same `formatted_body` as on desktop (ios DesktopMarkdown.swift). Java strings are UTF-16 like
 * JavaScript, so offsets match the desktop exactly. The input of `block` is HTML-escaped text.
 */
object DesktopMarkdown {
    class Match(val start: Int, val end: Int, val groups: List<String?>) {
        fun group(index: Int): String = groups.getOrNull(index) ?: ""
    }

    private val cache = ConcurrentHashMap<String, Pattern>()

    fun regex(pattern: String, multiline: Boolean = false): Pattern =
        cache.getOrPut((if (multiline) "m:" else "s:") + pattern) {
            Pattern.compile(pattern, if (multiline) Pattern.MULTILINE else 0)
        }

    private fun makeMatch(m: Matcher): Match = Match(m.start(), m.end(), (0..m.groupCount()).map { m.group(it) })

    /** No match may start inside a URL (the desktop's variable-length look-behind, checked by hand). */
    private fun insideUrl(text: String, before: Int): Boolean {
        if (before <= 0) return false
        return regex("""(https?|ftp|mailto|magnet)://\S*$""").matcher(text.substring(0, before)).find()
    }

    fun firstMatch(pattern: String, text: String, multiline: Boolean = false, notInUrl: Boolean = false): Match? {
        val matcher = regex(pattern, multiline).matcher(text)
        var start = 0
        while (start <= text.length) {
            if (!matcher.find(start)) return null
            if (notInUrl && insideUrl(text, matcher.start())) {
                start = matcher.start() + 1
                continue
            }
            return makeMatch(matcher)
        }
        return null
    }

    private fun before(text: String, match: Match) = text.substring(0, match.start)
    private fun after(text: String, match: Match) = text.substring(match.end)

    private class InlineRule(val pattern: String, val notInUrl: Boolean, val html: (Match) -> String)

    private const val ESCAPE_CHARS = """[*_~`|\[\]]"""

    private val inlineRules: List<InlineRule> = listOf(
        InlineRule("""(?<!\\)`(.+?)(?<!\\)`(?!`)""", true) { "<code data-md=\"`\">${it.group(1)}</code>" },
        InlineRule("""(?<!\\)\*{2}(.+?)(?<!\\)\*{2}(?!\*)""", true) { "<strong data-md=\"**\">${inline(it.group(1))}</strong>" },
        InlineRule("""(?<!\\)\*(.+?)(?<!\\)\*(?!\*)""", true) { "<i data-md=\"*\">${inline(it.group(1))}</i>" },
        InlineRule("""(?<!\\)_{2}(.+?)(?<!\\)_{2}(?!_)""", true) { "<u data-md=\"__\">${inline(it.group(1))}</u>" },
        InlineRule("""(?<!\\)_(.+?)(?<!\\)_(?!_)""", true) { "<i data-md=\"_\">${inline(it.group(1))}</i>" },
        InlineRule("""(?<!\\)~{2}(.+?)(?<!\\)~{2}(?!~)""", true) { "<s data-md=\"~~\">${inline(it.group(1))}</s>" },
        InlineRule("""(?<!\\)\|{2}(.+?)(?<!\\)\|{2}(?!\|)""", true) { "<span data-md=\"||\" data-mx-spoiler>${inline(it.group(1))}</span>" },
        InlineRule("""\[(.+?)\]\((https?://.+?)\)""", false) { "<a data-md href=\"${it.group(2)}\">${inline(it.group(1))}</a>" },
        InlineRule("""\\($ESCAPE_CHARS)""", true) { it.group(1) },
    )

    /** `parseInlineMD`: the rule matching earliest wins (the first listed on a tie). */
    fun inline(text: String): String {
        if (text.isEmpty()) return text
        var best: Pair<InlineRule, Match>? = null
        for (rule in inlineRules) {
            val match = firstMatch(rule.pattern, text, notInUrl = rule.notInUrl) ?: continue
            if (best == null || match.start < best.second.start) best = rule to match
        }
        val found = best ?: return text
        return inline(before(text, found.second)) + found.first.html(found.second) + inline(after(text, found.second))
    }

    /** `ignoreHTMLParseInlineMD`: tags already in the text (mentions, custom emoji) stay as they are. */
    fun inlineIgnoringHtml(text: String): String {
        val tag = regex("""<([\w-]+)(?: [^>]*)?(?:(?:/>)|(?:>.*?</\1>))""").matcher(text)
        val result = StringBuilder()
        var last = 0
        while (tag.find()) {
            result.append(inline(text.substring(last, tag.start())))
            result.append(tag.group())
            last = tag.end()
        }
        result.append(inline(text.substring(last)))
        return result.toString()
    }

    const val ESCAPED_BLOCK_SEQUENCE = """^\\(\\*(#{1,6} +|```|>|(-|\d+\.|[aAiI]\.) +|\* +))"""
    const val UNESCAPED_BLOCK_SEQUENCE = """^\\*(#{1,6} +|```|>|(-|\d+\.|[aAiI]\.) +|\* +)"""

    /** `parseBlockMD`: code blocks, then quotes, lists and headings; plain lines joined with `<br/>`. */
    fun block(text: String, parseInline: (String) -> String = ::inlineIgnoringHtml): String {
        if (text.isEmpty()) return text
        firstMatch("""^(`{3,})(?!`)(\S*)\n((?:.*\n)+?)\1 *(?!.)\n?""", text, multiline = true)?.let { match ->
            val info = match.group(2)
            val lang: String? = if (info.isEmpty()) null else info.substringAfterLast('.', info)
            val filename: String? = if (info != lang) info.ifEmpty { null } else null
            val classAttr = lang?.let { " class=\"language-$it\"" } ?: ""
            val labelAttr = filename?.let { " data-label=\"$it\"" } ?: ""
            val html = "<pre data-md=\"${match.group(1)}\"><code$classAttr$labelAttr>${match.group(3)}</code></pre>"
            return block(before(text, match), parseInline) + html + block(after(text, match), parseInline)
        }
        firstMatch("""(^>.*\n?)+""", text, multiline = true)?.let { match ->
            var quoted = match.group(0)
            if (quoted.endsWith("\n")) quoted = quoted.dropLast(1)
            val lines = quoted.split("\n").joinToString("\n") { line ->
                val prefix = firstMatch("^> *", line) ?: return@joinToString line
                line.substring(prefix.end)
            }
            val html = "<blockquote data-md=\">\">${block(lines, parseInline)}</blockquote>"
            return block(before(text, match), parseInline) + html + block(after(text, match), parseInline)
        }
        firstMatch("""^(?: *(?:[-*]|\d+\.|[aAiI]\.) +.+\n?)+""", text, multiline = true)?.let { match ->
            val html = list(match.group(0), parseInline)
            return block(before(text, match), parseInline) + html + block(after(text, match), parseInline)
        }
        firstMatch("""^(#{1,6}) +(.+)\n?""", text, multiline = true)?.let { match ->
            val level = match.group(1).length
            val html = "<h$level data-md=\"${match.group(1)}\">${parseInline(match.group(2))}</h$level>"
            return block(before(text, match), parseInline) + html + block(after(text, match), parseInline)
        }
        return text.split("\n").joinToString("<br/>") { line ->
            val match = firstMatch(ESCAPED_BLOCK_SEQUENCE, line) ?: return@joinToString parseInline(line)
            parseInline(before(line, match)) + match.group(1) + parseInline(after(line, match))
        }
    }

    private class ListLine(val indent: Int, val marker: String, val content: String) {
        val isUnordered: Boolean get() = marker == "*" || marker == "-"
    }

    private fun openList(line: ListLine): String {
        if (line.isUnordered) return "<ul data-md=\"*\">"
        val start = firstMatch("""^(\d+)\.""", line.marker)?.group(1)
        val type = firstMatch("""^([aAiI])\.""", line.marker)?.group(1)
        val dataMd = "data-md=\"${type ?: start ?: "1."}\""
        return "<ol $dataMd${start?.let { " start=\"$it\"" } ?: ""}${type?.let { " type=\"$it\"" } ?: ""}>"
    }

    private fun closeList(unordered: Boolean) = if (unordered) "</ul>" else "</ol>"

    /** `buildList` of the desktop, nesting by indentation. */
    private fun list(text: String, parseInline: (String) -> String): String {
        val source = text.removeSuffix("\n")
        val lines = source.split("\n").mapNotNull { line ->
            val match = firstMatch("""^( *)([-*]|\d+\.|[aAiI]\.) +(.+)$""", line) ?: return@mapNotNull null
            ListLine(match.group(1).length, match.group(2), match.group(3))
        }
        val html = StringBuilder()
        val stack = mutableListOf<Pair<Boolean, Int>>()
        lines.forEachIndexed { index, line ->
            val prev = lines.getOrNull(index - 1)
            val isLast = index == lines.size - 1
            val content = parseInline(line.content)
            if (prev != null) {
                if (line.indent > prev.indent) {
                    html.append(openList(line))
                    stack += line.isUnordered to line.indent
                } else if (line.indent == prev.indent) {
                    html.append("</li>")
                    if (line.isUnordered != prev.isUnordered) {
                        stack.removeLastOrNull()?.let { html.append(closeList(it.first)) }
                        html.append(openList(line))
                        stack += line.isUnordered to line.indent
                    }
                } else {
                    html.append("</li>")
                    while (stack.size > 1 && stack.last().second > line.indent) {
                        val top = stack.removeAt(stack.size - 1)
                        html.append(closeList(top.first))
                        if (stack.isNotEmpty()) html.append("</li>")
                    }
                    val top = stack.lastOrNull()
                    if (top != null && line.isUnordered != top.first) {
                        stack.removeAt(stack.size - 1)
                        html.append(closeList(top.first))
                        html.append(openList(line))
                        stack += line.isUnordered to line.indent
                    }
                }
            } else {
                html.append(openList(line))
                stack += line.isUnordered to line.indent
            }
            html.append("<li><p>$content</p>")
            if (isLast) {
                html.append("</li>")
                while (stack.isNotEmpty()) {
                    val top = stack.removeAt(stack.size - 1)
                    html.append(closeList(top.first))
                    if (stack.isNotEmpty()) html.append("</li>")
                }
            }
        }
        return html.toString()
    }

    /** `unescapeMarkdownInlineSequences`: `\*` becomes `*` (not inside URLs). */
    fun unescapeInline(text: String): String {
        val match = firstMatch("""\\($ESCAPE_CHARS)""", text, notInUrl = true) ?: return text
        return unescapeInline(before(text, match)) + match.group(1) + unescapeInline(after(text, match))
    }

    fun unescapeBlock(text: String): String {
        val match = firstMatch(ESCAPED_BLOCK_SEQUENCE, text) ?: return unescapeInline(text)
        return unescapeInline(before(text, match)) + match.group(1) + unescapeInline(after(text, match))
    }

    /** The desktop's `sanitizeText`. */
    fun escapeHtml(text: String): String {
        val result = StringBuilder(text.length)
        for (c in text) {
            when (c) {
                '&' -> result.append("&amp;")
                '<' -> result.append("&lt;")
                '>' -> result.append("&gt;")
                '"' -> result.append("&quot;")
                '\'' -> result.append("&#39;")
                else -> result.append(c)
            }
        }
        return result.toString()
    }
}
