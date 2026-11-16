package app.diddy.matrix

import android.util.LruCache
import java.net.URLDecoder

/**
 * User mentions as the different clients send them, turned into the one form the chat renders:
 * a Markdown link to `https://matrix.to/#/@user:server` (ios MentionText.swift).
 */
object MentionText {
    const val LINK_PREFIX = "https://matrix.to/#/"

    private val bareUserId = Regex("""(?<![\w/\[(#@])@[a-z0-9._=\-/+]+:[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*(?::[0-9]{1,5})?""")

    private fun replacingBareIds(text: String, replacement: (String) -> String): String =
        bareUserId.replace(text) { replacement(it.value) }

    private fun decode(text: String): String = try { URLDecoder.decode(text.replace("+", "%2B"), "UTF-8") } catch (_: Exception) { text }

    /** The user a matrix.to link points at, if it is a user and not a room or event. */
    fun userId(url: String): String? {
        if (!url.startsWith(LINK_PREFIX)) return null
        var id = decode(url.removePrefix(LINK_PREFIX))
        val end = id.indexOfFirst { it == '?' || it == '/' }
        if (end >= 0) id = id.substring(0, end)
        if (!id.startsWith("@") || !id.contains(":") || id.length > 255) return null
        return id
    }

    fun link(userId: String): String = LINK_PREFIX + userId

    /** Text that Markdown shows as it is, for a display name inside `[...]`. */
    fun escaped(name: String): String = buildString {
        for (c in name) {
            if (c in "\\[]()*_`~<>") append('\\')
            append(c)
        }
    }

    /** Every user mentioned in a message, as a link or a bare id. */
    fun userIds(text: String): List<String> {
        val found = mutableListOf<String>()
        for (match in Regex("""https://matrix\.to/#/(@[^)\s?/]+|%40[^)\s?/]+)""").findAll(text)) {
            val id = decode(match.groupValues[1])
            if (id !in found) found += id
        }
        replacingBareIds(text) { id ->
            if (id !in found) found += id
            id
        }
        return found
    }

    /** Bare user ids become links named after the person, so they read like a mention. */
    fun linkingBareIds(text: String, name: (String) -> String): String =
        replacingBareIds(text) { id -> "[${escaped("@" + name(id))}](${link(id)})" }

    private val markdownCache = LruCache<String, Any>(1000)
    private val none = Any()

    /** The HTML body as Markdown, only when it carries a mention the plain body may lack (Element). */
    fun markdownFromHtml(html: String): String? {
        if (!html.contains("matrix.to/#/@") && !html.contains("matrix.to/#/%40")) return null
        markdownCache.get(html)?.let { return if (it === none) null else it as String }
        val result = convertToMarkdown(html)
        markdownCache.put(html, result ?: none)
        return result
    }

    private fun convertToMarkdown(html: String): String? {
        var text = html
        text = text.replace(Regex("(?s)<mx-reply>.*?</mx-reply>"), "")
        text = text.replace(Regex("(?i)<br\\s*/?>"), "\n")
        text = text.replace(Regex("(?i)</p>\\s*<p>"), "\n\n")
        text = text.replace(Regex("(?i)<li>"), "• ")
        text = text.replace(Regex("(?i)</(li|p|blockquote|pre|h[1-6])>"), "\n")
        text = text.replace(Regex("(?i)</?(strong|b)>"), "**")
        text = text.replace(Regex("(?i)</?(em|i)>"), "_")
        text = text.replace(Regex("(?i)</?(del|s|strike)>"), "~~")
        text = text.replace(Regex("(?i)</?code>"), "`")
        text = Regex("(?is)<a\\s[^>]*href=\"([^\"]*)\"[^>]*>(.*?)</a>").replace(text) { match ->
            val label = match.groupValues[2].replace(Regex("<[^>]+>"), "")
            "[$label](${match.groupValues[1]})"
        }
        text = text.replace(Regex("<[^>]+>"), "")
        for ((entity, c) in listOf("&lt;" to "<", "&gt;" to ">", "&quot;" to "\"", "&#39;" to "'", "&#x27;" to "'", "&nbsp;" to " ", "&amp;" to "&")) {
            text = text.replace(entity, c)
        }
        text = text.replace(Regex("\n{3,}"), "\n\n")
        return text.trim().ifEmpty { null }
    }

    /** For one-line previews: `@lndr:server` and Markdown mention links read as `@Lndr`. */
    fun readable(text: String, name: (String) -> String): String {
        val links = Regex("""\[([^\]]+)\]\(https://matrix\.to/#/@[^)\s]+\)""").replace(text) { match ->
            val label = match.groupValues[1].replace("\\", "")
            if (label.startsWith("@")) label else "@$label"
        }
        return replacingBareIds(links) { "@" + name(it) }
    }
}
