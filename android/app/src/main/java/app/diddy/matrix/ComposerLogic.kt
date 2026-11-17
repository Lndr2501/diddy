package app.diddy.matrix

import android.content.Context
import app.diddy.app.Prefs
import app.diddy.util.Json
import app.diddy.util.int
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.str
import app.diddy.util.strings
import java.net.URLEncoder
import java.util.Date
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow

// The message composer's rules, taken from the desktop (ios ComposerLogic.swift).

// MARK: - Matrix ids (desktop utils/matrix.ts)

object MatrixIdRules {
    private fun matchMxId(id: String) = DesktopMarkdown.firstMatch("""^([@$+#])([^\s:]+):(\S+)$""", id)

    fun isUserId(id: String) = id.startsWith("@") && matchMxId(id) != null
    fun isRoomId(id: String) = id.startsWith("!")
    fun isRoomAlias(id: String) = id.startsWith("#") && matchMxId(id) != null
    fun isServerName(name: String) = DesktopMarkdown.firstMatch("""\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b""", name) != null

    fun server(id: String): String? = id.substringAfter(':', "").ifEmpty { null }

    /** The desktop's `splitWithSpace`: trimmed, split at single spaces. */
    fun splitWithSpace(text: String): List<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        return trimmed.split(" ")
    }

    /** `https://matrix.to/#/<id>` with `via` servers, encoded like the desktop's `encodeURI`. */
    fun matrixTo(id: String, via: List<String> = emptyList()): String {
        var fragment = id
        if (via.isNotEmpty()) fragment += "?" + via.joinToString("&") { "via=$it" }
        return encodeURI("https://matrix.to/#/$fragment")
    }

    /** JavaScript's `encodeURI`. */
    fun encodeURI(text: String): String {
        val allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789;,/?:@&=+$-_.!~*'()#"
        val out = StringBuilder()
        for (byte in text.toByteArray(Charsets.UTF_8)) {
            val c = (byte.toInt() and 0xFF)
            if (c < 0x80 && c.toChar() in allowed) out.append(c.toChar()) else out.append("%%%02X".format(c))
        }
        return out.toString()
    }
}

// MARK: - Slash commands (desktop hooks/useCommands.ts)

enum class SlashCommand(val raw: String) {
    ME("me"), NOTICE("notice"), SHRUG("shrug"), TABLEFLIP("tableflip"), UNFLIP("unflip"), STARTDM("startdm"),
    JOIN("join"), LEAVE("leave"), INVITE("invite"), DISINVITE("disinvite"), KICK("kick"), BAN("ban"),
    UNBAN("unban"), IGNORE("ignore"), UNIGNORE("unignore"), MYROOMNICK("myroomnick"), MYROOMAVATAR("myroomavatar"),
    CONVERTTODM("converttodm"), CONVERTTOROOM("converttoroom"), DELETE("delete"), ACL("acl");

    val description: String
        get() = when (this) {
            ME -> "Send action message"
            NOTICE -> "Send notice message"
            SHRUG -> "Send ¯\\_(ツ)_/¯ as message"
            TABLEFLIP -> "Send $TABLEFLIP_TEXT as message"
            UNFLIP -> "Send $UNFLIP_TEXT as message"
            STARTDM -> "Start direct message with user. Example: /startdm userId1"
            JOIN -> "Join room with address. Example: /join address1 address2"
            LEAVE -> "Leave current room."
            INVITE -> "Invite user to room. Example: /invite userId1 userId2 [-r reason]"
            DISINVITE -> "Disinvite user to room. Example: /disinvite userId1 userId2 [-r reason]"
            KICK -> "Kick user from room. Example: /kick userId1 userId2 servername [-r reason]"
            BAN -> "Ban user from room. Example: /ban userId1 userId2 servername [-r reason]"
            UNBAN -> "Unban user from room. Example: /unban userId1 userId2"
            IGNORE -> "Ignore user. Example: /ignore userId1 userId2"
            UNIGNORE -> "Unignore user. Example: /unignore userId1 userId2"
            MYROOMNICK -> "Change nick in current room."
            MYROOMAVATAR -> "Change profile picture in current room. Example /myroomavatar mxc://xyzabc"
            CONVERTTODM -> "Convert room to direct message"
            CONVERTTOROOM -> "Convert direct message to room"
            DELETE -> "Delete messages from users. Example: /delete userId1 servername -past 1d|2h|5m|30s [-t m.room.message] [-r spam]"
            ACL -> "Manage server access control list. Example /acl [-a servername1] [-d servername2] [-ra servername1] [-rd servername2]"
        }

    val messagePrefix: String?
        get() = when (this) {
            SHRUG -> SHRUG_TEXT
            TABLEFLIP -> TABLEFLIP_TEXT
            UNFLIP -> UNFLIP_TEXT
            else -> null
        }

    val sendsMessage: Boolean get() = this == ME || this == NOTICE || this == SHRUG || this == TABLEFLIP || this == UNFLIP

    companion object {
        const val SHRUG_TEXT = "¯\\_(ツ)_/¯"
        const val TABLEFLIP_TEXT = "(╯°□°)╯︵ ┻━┻"
        const val UNFLIP_TEXT = "┬─┬ノ( º_ºノ)"

        fun of(name: String): SlashCommand? = entries.firstOrNull { it.raw == name }

        /** The command the draft starts with: `/name` at the very beginning. */
        fun command(draft: String): SlashCommand? {
            val text = draft.trimStart(' ', '\t')
            if (!text.startsWith("/")) return null
            return of(text.drop(1).takeWhile { !it.isWhitespace() })
        }

        /** `trimCommand`: removes `/name` and the spaces after it from the start of the text. */
        fun trim(command: SlashCommand, text: String): String {
            val match = DesktopMarkdown.firstMatch("""^(\s+)?(/""" + Regex.escape(command.raw) + """)([^\S\n]+)?""", text) ?: return text
            return text.substring(match.end)
        }

        fun suggestions(draft: String): List<SlashCommand> {
            if (!draft.startsWith("/") || draft.any { it.isWhitespace() }) return emptyList()
            val query = draft.drop(1).lowercase()
            if (query.isEmpty()) return entries
            return entries.filter { it.raw.contains(query) }
        }

        fun splitFlags(payload: String): Pair<String, String?> {
            val match = DesktopMarkdown.firstMatch("""(?:^|\s)-(\w+)\b""", payload) ?: return payload to null
            return payload.substring(0, match.start) to payload.substring(match.start)
        }

        fun parseFlags(flags: String?): Map<String, String> {
            if (flags == null) return emptyMap()
            val matcher = DesktopMarkdown.regex("""(?:^|\s)-(\w+)\b""").matcher(flags)
            val matches = mutableListOf<Triple<Int, Int, String>>()
            while (matcher.find()) matches += Triple(matcher.start(), matcher.end(), matcher.group(1) ?: "")
            val result = mutableMapOf<String, String>()
            matches.forEachIndexed { index, (_, end, key) ->
                val next = matches.getOrNull(index + 1)?.first ?: flags.length
                result[key] = flags.substring(end, maxOf(end, next)).trim()
            }
            return result
        }

        fun users(payload: String) = MatrixIdRules.splitWithSpace(payload).filter(MatrixIdRules::isUserId)
        fun servers(payload: String) = MatrixIdRules.splitWithSpace(payload).filter(MatrixIdRules::isServerName)

        /** `parseTimestampFlag`: `1.5d`, `2h`, `5m`, `30s` before now. */
        fun pastDate(input: String, now: Date = Date()): Date? {
            val match = DesktopMarkdown.firstMatch("""^(\d+(?:\.\d+)?)([dhms])$""", input) ?: return null
            val value = match.group(1).toDoubleOrNull() ?: return null
            val seconds = when (match.group(2)) {
                "d" -> value * 86_400
                "h" -> value * 3_600
                "m" -> value * 60
                "s" -> value
                else -> return null
            }
            return Date(now.time - (seconds * 1000).toLong())
        }

        fun updatedAcl(current: Map<String, Any?>, flags: Map<String, String>): Map<String, Any?> {
            fun list(key: String) = flags[key]?.let(MatrixIdRules::splitWithSpace) ?: emptyList()
            val allow = (current["allow"].strings() ?: emptyList()).toMutableList()
            val deny = (current["deny"].strings() ?: emptyList()).toMutableList()
            list("a").forEach { if (it !in allow) allow += it }
            list("d").forEach { if (it !in deny) deny += it }
            val removeAllow = list("ra")
            val removeDeny = list("rd")
            val result = linkedMapOf<String, Any?>(
                "allow" to allow.filter { it !in removeAllow }.sorted(),
                "deny" to deny.filter { it !in removeDeny }.sorted(),
            )
            if (current.containsKey("allow_ip_literals")) result["allow_ip_literals"] = current["allow_ip_literals"]
            return result
        }

        fun addingDirect(content: Map<String, List<String>>, roomId: String, userId: String): Map<String, List<String>> {
            val result = content.mapValues { (target, rooms) -> if (target != userId) rooms.filter { it != roomId } else rooms }.toMutableMap()
            val rooms = (result[userId] ?: emptyList()).toMutableList()
            if (roomId !in rooms) rooms += roomId
            result[userId] = rooms
            return result
        }

        fun removingDirect(content: Map<String, List<String>>, roomId: String) = content.mapValues { (_, v) -> v.filter { it != roomId } }
    }
}

// MARK: - Autocomplete

sealed class ComposerQuery {
    data class User(val query: String) : ComposerQuery()
    data class Room(val query: String) : ComposerQuery()
    data class Emoticon(val query: String) : ComposerQuery()
    data class Command(val query: String) : ComposerQuery()

    companion object {
        /** The word at the cursor (collapsed selection): what was typed of it and its whole range. */
        fun word(draft: String, selectionStart: Int, selectionEnd: Int): Pair<String, IntRange>? {
            if (selectionStart != selectionEnd) return null
            val cursor = selectionStart.coerceIn(0, draft.length)
            var start = cursor
            while (start > 0 && !draft[start - 1].isWhitespace()) start -= 1
            var end = cursor
            while (end < draft.length && !draft[end].isWhitespace()) end += 1
            return draft.substring(start, cursor) to (start until end)
        }

        fun current(draft: String, selectionStart: Int, selectionEnd: Int): ComposerQuery? {
            val (typed, range) = word(draft, selectionStart, selectionEnd) ?: return null
            if (typed.isEmpty()) return null
            val rest = typed.drop(1)
            return when (typed[0]) {
                '@' -> User(rest)
                '#' -> Room(rest)
                ':' -> if (rest.contains(':')) null else Emoticon(rest)
                '/' -> if (range.first == 0 && range.last + 1 == draft.length) Command(rest) else null
                else -> null
            }
        }

        /** The draft with the word at the cursor replaced; returns the text and the new cursor. */
        fun replacingWord(draft: String, selectionStart: Int, selectionEnd: Int, replacement: String): Pair<String, Int> {
            val word = word(draft, selectionStart, selectionEnd)
            val start: Int
            val end: Int
            if (word != null) {
                start = word.second.first
                end = word.second.last + 1
            } else {
                start = selectionStart.coerceIn(0, draft.length)
                end = selectionEnd.coerceIn(start, draft.length)
            }
            var inserted = replacement
            if (inserted.endsWith(" ") && end < draft.length && draft[end] == ' ') inserted = inserted.dropLast(1)
            val text = draft.substring(0, start) + inserted + draft.substring(end)
            val skip = if (inserted.length < replacement.length) 1 else 0
            return text to (start + inserted.length + skip)
        }
    }
}

// MARK: - Turning the draft into a message (desktop components/editor/output.ts)

/** Something picked from the suggestions that the plain draft only shows as text. */
sealed class ComposerToken {
    data class User(val id: String) : ComposerToken()
    data class Room(val id: String, val via: List<String>) : ComposerToken()
    data class Emoticon(val mxc: String, val shortcode: String) : ComposerToken()

    fun toJson(): Map<String, Any?> = when (this) {
        is User -> mapOf("user" to mapOf("id" to id))
        is Room -> mapOf("room" to mapOf("id" to id, "via" to via))
        is Emoticon -> mapOf("emoticon" to mapOf("mxc" to mxc, "shortcode" to shortcode))
    }

    companion object {
        fun fromJson(json: Map<String, Any?>): ComposerToken? {
            json["user"].obj()?.let { u -> return u["id"].str()?.let { User(it) } }
            json["room"].obj()?.let { r -> return r["id"].str()?.let { Room(it, r["via"].strings() ?: emptyList()) } }
            json["emoticon"].obj()?.let { e ->
                val mxc = e["mxc"].str() ?: return null
                return Emoticon(mxc, e["shortcode"].str() ?: "")
            }
            return null
        }
    }
}

data class ComposedMessage(val body: String, val html: String?, val mentionedUserIds: List<String>)

object ComposerFormatter {
    private sealed class Segment {
        data class Text(val text: String) : Segment()
        data class Token(val key: String, val token: ComposerToken) : Segment()
    }

    /** Splits a line at the tokens; longer keys first, so "@Lu" does not eat the start of "@Luis". */
    private fun segments(line: String, tokens: Map<String, ComposerToken>): List<Segment> {
        val keys = tokens.keys.filter { it.isNotEmpty() }.sortedByDescending { it.length }
        if (keys.isEmpty()) return listOf(Segment.Text(line))
        val result = mutableListOf<Segment>()
        val text = StringBuilder()
        var index = 0
        outer@ while (index < line.length) {
            for (key in keys) {
                if (line.startsWith(key, index)) {
                    if (text.isNotEmpty()) { result += Segment.Text(text.toString()); text.clear() }
                    tokens[key]?.let { result += Segment.Token(key, it) }
                    index += key.length
                    continue@outer
                }
            }
            text.append(line[index])
            index += 1
        }
        if (text.isNotEmpty()) result += Segment.Text(text.toString())
        return result
    }

    private fun html(key: String, token: ComposerToken): String = when (token) {
        is ComposerToken.User -> "<a href=\"${DesktopMarkdown.escapeHtml(MatrixIdRules.matrixTo(token.id))}\">${DesktopMarkdown.escapeHtml(key)}</a>"
        is ComposerToken.Room -> "<a href=\"${DesktopMarkdown.escapeHtml(MatrixIdRules.matrixTo(token.id, token.via))}\">${DesktopMarkdown.escapeHtml(key)}</a>"
        is ComposerToken.Emoticon -> {
            val name = DesktopMarkdown.escapeHtml(token.shortcode)
            "<img data-mx-emoticon src=\"${token.mxc}\" alt=\"$name\" title=\"$name\" height=\"32\" />"
        }
    }

    private fun plain(token: ComposerToken): String = when (token) {
        is ComposerToken.User -> token.id
        is ComposerToken.Room -> token.id
        is ComposerToken.Emoticon -> ":${token.shortcode}:"
    }

    /** `trimCustomHtml`. */
    fun trimHtml(html: String): String {
        var result = html
        while (result.startsWith("<br/>")) result = result.drop(5)
        while (result.endsWith("<br/>")) result = result.dropLast(5)
        return result.trim()
    }

    /** `customHtmlEqualsPlainText`. */
    fun htmlEqualsPlain(html: String, plain: String) = html.replace("<br/>", "\n") == DesktopMarkdown.escapeHtml(plain)

    /** The plain and HTML bodies of a draft, as the desktop makes them. */
    fun bodies(draft: String, tokens: Map<String, ComposerToken>, markdown: Boolean): Pair<String, String> {
        val plainText = StringBuilder()
        val htmlLines = mutableListOf<String>()
        for (line in draft.split("\n")) {
            val plainLine = StringBuilder()
            val htmlLine = StringBuilder()
            segments(line, tokens).forEachIndexed { index, segment ->
                when (segment) {
                    is Segment.Text -> {
                        plainLine.append(
                            if (markdown) (if (index == 0) DesktopMarkdown.unescapeBlock(segment.text) else DesktopMarkdown.unescapeInline(segment.text))
                            else segment.text
                        )
                        htmlLine.append(DesktopMarkdown.escapeHtml(segment.text))
                    }
                    is Segment.Token -> {
                        plainLine.append(plain(segment.token))
                        htmlLine.append(html(segment.key, segment.token))
                    }
                }
            }
            plainText.append(plainLine).append("\n")
            htmlLines += htmlLine.toString()
        }
        val html = if (markdown) {
            // A quote marker was escaped with the rest of the line; the desktop puts it back.
            val source = htmlLines.joinToString("") { line ->
                val match = DesktopMarkdown.firstMatch("""^(\\*)&gt;""", line)
                (if (match == null) line else match.group(1) + ">" + line.substring(match.end)) + "\n"
            }
            DesktopMarkdown.block(source)
        } else {
            htmlLines.joinToString("") { "$it<br/>" }
        }
        return plainText.toString().trim() to trimHtml(html)
    }

    /** The message the composer sends for `draft`, after any slash command is applied. */
    fun message(
        draft: String,
        tokens: Map<String, ComposerToken>,
        markdown: Boolean,
        command: SlashCommand?,
        isReply: Boolean,
        replyUserId: String?,
        ownUserId: String,
    ): ComposedMessage? {
        var (plain, html) = bodies(draft, tokens, markdown)
        if (command != null) {
            plain = SlashCommand.trim(command, plain)
            html = SlashCommand.trim(command, html)
            command.messagePrefix?.let {
                plain = "$it $plain"
                html = "$it $html"
            }
        }
        if (plain.isEmpty()) return null
        val mentioned = mutableListOf<String>()
        for (token in tokens.values) {
            if (token is ComposerToken.User && token.id !in mentioned && tokenUsed(token.id, draft, tokens)) mentioned += token.id
        }
        if (replyUserId != null && replyUserId != ownUserId && replyUserId !in mentioned) mentioned += replyUserId
        val needsHtml = isReply || !htmlEqualsPlain(html, plain)
        return ComposedMessage(plain, if (needsHtml) html else null, mentioned.sorted())
    }

    private fun tokenUsed(userId: String, draft: String, tokens: Map<String, ComposerToken>) =
        tokens.any { (key, token) -> token == ComposerToken.User(userId) && draft.contains(key) }

    /** Tokens whose text is no longer in the draft are dropped. */
    fun pruned(tokens: Map<String, ComposerToken>, draft: String) = tokens.filterKeys { draft.contains(it) }
}

// MARK: - Formatting toolbar

enum class ComposerFormat(val title: String) {
    BOLD("Bold"), ITALIC("Italic"), UNDERLINE("Underline"), STRIKE("Strike Through"), CODE("Inline Code"),
    SPOILER("Spoiler"), QUOTE("Block Quote"), CODE_BLOCK("Block Code"), ORDERED_LIST("Ordered List"),
    UNORDERED_LIST("Unordered List"), HEADING("Heading"), LINK("Link");

    private val wrapper: Pair<String, String>?
        get() = when (this) {
            BOLD -> "**" to "**"
            ITALIC -> "*" to "*"
            UNDERLINE -> "__" to "__"
            STRIKE -> "~~" to "~~"
            CODE -> "`" to "`"
            SPOILER -> "||" to "||"
            LINK -> "[" to "](https://)"
            else -> null
        }

    private val linePrefix: String?
        get() = when (this) {
            QUOTE -> "> "
            ORDERED_LIST -> "1. "
            UNORDERED_LIST -> "- "
            HEADING -> "# "
            else -> null
        }

    /** Applies the format to the selection; returns the new text and selection (start, end). */
    fun apply(text: String, start: Int, end: Int): Triple<String, Int, Int> {
        val location = start.coerceIn(0, text.length)
        val stop = end.coerceIn(location, text.length)
        val selected = text.substring(location, stop)
        wrapper?.let { (open, close) ->
            val replaced = text.substring(0, location) + open + selected + close + text.substring(stop)
            if (this == LINK && selected.isNotEmpty()) {
                val urlStart = location + open.length + selected.length + 2
                return Triple(replaced, urlStart, urlStart + "https://".length)
            }
            return Triple(replaced, location + open.length, location + open.length + selected.length)
        }
        val lineStart = text.lastIndexOf('\n', location - 1).let { if (it < 0) 0 else it + 1 }
        var lineEnd = text.indexOf('\n', maxOf(stop - (if (stop > location && text.getOrNull(stop - 1) == '\n') 1 else 0), location))
        lineEnd = if (lineEnd < 0) text.length else lineEnd + 1
        var lines = text.substring(lineStart, lineEnd)
        val trailingNewline = lines.endsWith("\n")
        if (trailingNewline) lines = lines.dropLast(1)
        val newBlock = if (this == CODE_BLOCK) "```\n$lines\n```" else lines.split("\n").joinToString("\n") { (linePrefix ?: "") + it }
        val replaced = text.substring(0, lineStart) + newBlock + (if (trailingNewline) "\n" else "") + text.substring(lineEnd)
        val cursor = if (this == CODE_BLOCK) lineStart + 4 + lines.length else lineStart + newBlock.length
        return Triple(replaced, cursor, cursor)
    }
}

// MARK: - Drafts (desktop state/room/roomInputDrafts.ts)

data class ComposerDraft(
    val text: String,
    val tokens: Map<String, ComposerToken> = emptyMap(),
    /** The message being replied to, restored once it is in the loaded timeline. */
    val replyEventId: String? = null,
) {
    val isEmpty: Boolean get() = text.isBlank() && replyEventId == null
}

object ComposerDraftStore {
    fun key(accountId: String, roomId: String) = "composer.draft.$accountId.$roomId"

    fun load(accountId: String, roomId: String): ComposerDraft? {
        val json = Json.obj(Prefs.string(key(accountId, roomId))) ?: return null
        val tokens = json["tokens"].obj()?.mapNotNull { (k, v) -> v.obj()?.let(ComposerToken::fromJson)?.let { k to it } }?.toMap() ?: emptyMap()
        val draft = ComposerDraft(json["text"].str() ?: "", tokens, json["replyEventId"].str())
        return if (draft.isEmpty) null else draft
    }

    fun save(draft: ComposerDraft?, accountId: String, roomId: String) {
        val key = key(accountId, roomId)
        if (draft == null || draft.isEmpty) {
            Prefs.remove(key)
            return
        }
        Prefs.setString(key, Json.encode(buildMap {
            put("text", draft.text)
            put("tokens", draft.tokens.mapValues { it.value.toJson() })
            draft.replyEventId?.let { put("replyEventId", it) }
        }))
    }
}

// MARK: - Emoji (desktop plugins/emoji.ts, recent-emoji.ts)

data class EmojiEntry(val group: Int, val unicode: String, val shortcodes: List<String>, val label: String) {
    val id: String get() = unicode
    val shortcode: String get() = shortcodes.firstOrNull() ?: label
}

object EmojiCatalog {
    val groupNames = listOf(
        "Smileys & People", "Animals & Nature", "Food & Drinks", "Activity",
        "Travel & Places", "Objects", "Symbols", "Flags",
    )

    @Volatile
    private var loaded: List<EmojiEntry>? = null

    /** The table from the APK's assets (emoji.tsv, the same as iOS's EmojiData). */
    fun load(context: Context) {
        if (loaded != null) return
        val text = try { context.assets.open("emoji.tsv").bufferedReader().readText() } catch (_: Exception) { "" }
        loaded = parse(text)
    }

    fun parse(text: String): List<EmojiEntry> = text.split("\n").mapNotNull { line ->
        val fields = line.split("\t")
        if (fields.size != 4) return@mapNotNull null
        val group = fields[0].toIntOrNull() ?: return@mapNotNull null
        if (fields[1].isEmpty()) return@mapNotNull null
        EmojiEntry(group, fields[1], fields[2].split(",").filter { it.isNotEmpty() }, fields[3])
    }

    val all: List<EmojiEntry> get() = loaded ?: emptyList()

    val groups: List<List<EmojiEntry>>
        get() {
            val result = List(groupNames.size) { mutableListOf<EmojiEntry>() }
            for (entry in all) if (entry.group in result.indices) result[entry.group] += entry
            return result
        }

    private val byUnicode: Map<String, EmojiEntry> by lazy { all.reversed().associateBy { it.unicode } }

    fun entry(unicode: String): EmojiEntry? = byUnicode[unicode]

    fun matches(entry: EmojiEntry, query: String): Boolean {
        val q = query.lowercase()
        if (":${entry.shortcode}:".lowercase().contains(q) || entry.label.lowercase().contains(q)) return true
        return entry.shortcodes.any { it.lowercase().contains(q) }
    }

    fun search(query: String, limit: Int = 20): List<EmojiEntry> {
        if (query.isEmpty()) return emptyList()
        return all.asSequence().filter { matches(it, query) }.take(limit).toList()
    }

    /** `io.element.recent_emoji`: most used first. */
    fun recent(content: Map<String, Any?>?, limit: Int): List<EmojiEntry> {
        val list = content?.get("recent_emoji") as? List<*> ?: return emptyList()
        val pairs = list.mapNotNull { item ->
            val pair = item as? List<*> ?: return@mapNotNull null
            if (pair.size < 2) return@mapNotNull null
            val unicode = pair[0] as? String ?: return@mapNotNull null
            unicode to (pair[1].int() ?: 0)
        }
        val sorted = pairs.withIndex().sortedWith { a, b ->
            if (a.value.second != b.value.second) b.value.second.compareTo(a.value.second) else a.index.compareTo(b.index)
        }.map { it.value }
        return sorted.mapNotNull { entry(it.first) }.take(limit)
    }

    /** `addRecentEmoji`: moves the emoji to the front with one more use, keeps 100. */
    fun addingRecent(unicode: String, content: Map<String, Any?>?): Map<String, Any?> {
        val list = ((content?.get("recent_emoji") as? List<*>)?.mapNotNull { it as? List<*> } ?: emptyList()).toMutableList()
        var entry: List<Any?> = listOf(unicode, 1)
        val index = list.indexOfFirst { it.firstOrNull() as? String == unicode }
        if (index >= 0) {
            val old = list.removeAt(index)
            val count = if (old.size >= 2) (old[1].int() ?: 0) else 0
            entry = listOf(unicode, count + 1)
        }
        list.add(0, entry)
        return mapOf("recent_emoji" to list.take(100))
    }
}

// MARK: - Custom emoji and sticker packs (desktop plugins/custom-emoji, MSC2545)

data class PackImage(
    val shortcode: String,
    val url: String,
    val body: String?,
    val usage: List<String>?,
    val width: Int?,
    val height: Int?,
    val mimetype: String?,
    val size: Int?,
) {
    val id: String get() = "$shortcode|$url"
}

data class ImagePack(val id: String, val name: String?, val avatarUrl: String?, val usage: List<String>, val images: List<PackImage>) {
    fun images(usage: String): List<PackImage> = images.filter { (it.usage ?: this.usage).contains(usage) }
    fun avatar(usage: String): String? = avatarUrl ?: images(usage).firstOrNull()?.url

    companion object {
        const val EMOTICON = "emoticon"
        const val STICKER = "sticker"

        private fun knownUsage(value: Any?): List<String>? {
            val list = value as? List<*> ?: return null
            val known = list.mapNotNull { it as? String }.filter { it == EMOTICON || it == STICKER }
            return known.ifEmpty { null }
        }

        /** Reads an `im.ponies.room_emotes` / `im.ponies.user_emotes` content. Null when empty. */
        fun parse(id: String, content: Map<String, Any?>): ImagePack? {
            val meta = content["pack"].obj()
            val rawImages = content["images"].obj()
            if (meta == null && rawImages == null) return null
            val images = mutableListOf<PackImage>()
            for ((shortcode, value) in rawImages ?: emptyMap()) {
                val image = value.obj() ?: continue
                val url = image["url"].str() ?: continue
                if (!url.startsWith("mxc://") || url.any { it.isWhitespace() || it == '"' || it == '<' || it == '>' }) continue
                val info = image["info"].obj()
                images += PackImage(
                    shortcode = shortcode,
                    url = url,
                    body = image["body"].str(),
                    usage = knownUsage(image["usage"]),
                    width = info?.get("w").int(),
                    height = info?.get("h").int(),
                    mimetype = info?.get("mimetype").str(),
                    size = info?.get("size").int(),
                )
            }
            images.sortBy { it.shortcode }
            return ImagePack(id, meta?.get("display_name").str(), meta?.get("avatar_url").str(), knownUsage(meta?.get("usage")) ?: listOf(EMOTICON, STICKER), images)
        }

        /** `im.ponies.emote_rooms`: room id → pack state keys the user enabled everywhere. */
        fun globalPacks(content: Map<String, Any?>?): Map<String, List<String>> {
            val rooms = content?.get("rooms").obj() ?: return emptyMap()
            return rooms.mapNotNull { (roomId, value) -> value.obj()?.let { roomId to it.keys.sorted() } }.toMap()
        }

        fun matches(image: PackImage, query: String): Boolean {
            val q = query.lowercase()
            return ":${image.shortcode}:".lowercase().contains(q) || (image.body?.lowercase()?.contains(q) ?: false)
        }
    }
}

// MARK: - Sizes

object ComposerSize {
    /** The desktop's `bytesToSize`: decimal units, one digit, at least KB. */
    fun text(bytes: Long): String {
        if (bytes <= 0) return "0KB"
        val sizes = listOf("Bytes", "KB", "MB", "GB", "TB")
        var index = floor(ln(bytes.toDouble()) / ln(1000.0)).toInt()
        if (index == 0) index = 1
        index = minOf(index, sizes.size - 1)
        val value = bytes / 1000.0.pow(index)
        return String.format(java.util.Locale.US, "%.1f %s", value, sizes[index])
    }

    fun uploadLimit(config: Map<String, Any?>?): Long? = config?.get("m.upload.size").long()?.takeIf { it > 0 }

    fun exceeds(size: Long, limit: Long?): Boolean = limit != null && size >= limit
}

/** REST operations of the composer (ios ComposerServices.swift). */
object ComposerServices {
    fun path(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    suspend fun packs(account: MatrixAccount, roomId: String): List<ImagePack> {
        val userPath = "/_matrix/client/v3/user/${path(account.userId)}/account_data/"
        val packs = mutableListOf<ImagePack>()
        runCatching { account.clientRequest(userPath + "im.ponies.user_emotes") }.getOrNull()
            ?.let { ImagePack.parse("user", it) }?.let { packs += it }
        val global = runCatching { account.clientRequest(userPath + "im.ponies.emote_rooms") }.getOrNull()
        val rooms = ImagePack.globalPacks(global).toMutableMap()
        val localRooms = mutableListOf(roomId)
        runCatching { account.clientRequestArray("/_matrix/client/v3/rooms/${path(roomId)}/state") }.getOrNull()?.forEach { event ->
            if (event["type"].str() == "m.space.parent") event["state_key"].str()?.let { localRooms += it }
        }
        localRooms.forEach { rooms.remove(it) }
        for (id in (localRooms + rooms.keys).toSortedSet()) {
            val state = runCatching { account.clientRequestArray("/_matrix/client/v3/rooms/${path(id)}/state") }.getOrNull() ?: continue
            for (event in state) {
                if (event["type"].str() != "im.ponies.room_emotes") continue
                val key = event["state_key"].str() ?: continue
                if (!(id in localRooms || rooms[id]?.contains(key) == true)) continue
                val content = event["content"].obj() ?: continue
                ImagePack.parse("$id|$key", content)?.let { packs += it }
            }
        }
        return packs
    }

    suspend fun run(command: SlashCommand, draft: String, account: MatrixAccount, roomId: String) {
        val payload = SlashCommand.trim(command, draft)
        val (content, flagText) = SlashCommand.splitFlags(payload)
        val flags = SlashCommand.parseFlags(flagText)
        val users = SlashCommand.users(content).toMutableList()
        val base = "/_matrix/client/v3/rooms/${path(roomId)}"
        val userBase = "/_matrix/client/v3/user/${path(account.userId)}/account_data/"
        if (command == SlashCommand.KICK || command == SlashCommand.BAN || command == SlashCommand.DELETE) {
            val servers = SlashCommand.servers(content)
            if (servers.isNotEmpty()) {
                val response = account.clientRequest("$base/members")
                for (event in response["chunk"] as? List<*> ?: emptyList<Any?>()) {
                    val e = event.obj() ?: continue
                    val id = e["state_key"].str() ?: continue
                    if (servers.none { id.endsWith(":$it") } || id in users) continue
                    if (command == SlashCommand.KICK && e["content"].obj()?.get("membership").str() == "ban") continue
                    users += id
                }
            }
        }
        when (command) {
            SlashCommand.LEAVE -> {
                val rooms = if (payload.isBlank()) listOf(roomId) else MatrixIdRules.splitWithSpace(payload).filter(MatrixIdRules::isRoomId)
                rooms.forEach { account.leave(it) }
            }
            SlashCommand.JOIN -> {
                for (id in MatrixIdRules.splitWithSpace(payload)) {
                    if (MatrixIdRules.isRoomId(id) || MatrixIdRules.isRoomAlias(id)) account.clientRequest("/_matrix/client/v3/join/${path(id)}", emptyMap<String, Any?>())
                }
            }
            SlashCommand.STARTDM -> account.directMessage(users.firstOrNull() ?: throw app.diddy.util.DiddyError("Enter a user ID."))
            SlashCommand.INVITE, SlashCommand.KICK, SlashCommand.DISINVITE, SlashCommand.BAN, SlashCommand.UNBAN -> {
                if (users.isEmpty()) throw app.diddy.util.DiddyError("Enter a user ID.")
                val action = if (command == SlashCommand.DISINVITE) "kick" else command.raw
                for (user in users) {
                    val body = linkedMapOf<String, Any?>("user_id" to user)
                    flags["r"]?.let { body["reason"] = it }
                    account.clientRequest("$base/$action", body)
                }
            }
            SlashCommand.MYROOMNICK, SlashCommand.MYROOMAVATAR -> {
                val member = account.stateContent(roomId, "m.room.member", account.userId).toMutableMap()
                val key = if (command == SlashCommand.MYROOMNICK) "displayname" else "avatar_url"
                if (payload.isEmpty()) member.remove(key) else member[key] = payload
                account.clientRequest("$base/state/m.room.member/${path(account.userId)}", member, "PUT")
            }
            SlashCommand.IGNORE, SlashCommand.UNIGNORE -> {
                if (users.isEmpty()) throw app.diddy.util.DiddyError("Enter a user ID.")
                val current = runCatching { account.clientRequest(userBase + "m.ignored_user_list") }.getOrDefault(emptyMap()).toMutableMap()
                val ignored = (current["ignored_users"].obj() ?: emptyMap()).toMutableMap()
                for (user in users) if (command == SlashCommand.IGNORE) ignored[user] = emptyMap<String, Any?>() else ignored.remove(user)
                current["ignored_users"] = ignored
                account.clientRequest(userBase + "m.ignored_user_list", current, "PUT")
            }
            SlashCommand.CONVERTTODM, SlashCommand.CONVERTTOROOM -> {
                val raw = runCatching { account.clientRequest(userBase + "m.direct") }.getOrDefault(emptyMap())
                val current = raw.mapNotNull { (k, v) -> v.strings()?.let { k to it } }.toMap()
                var updated = SlashCommand.removingDirect(current, roomId)
                if (command == SlashCommand.CONVERTTODM) {
                    val members = account.joinedMembers(roomId)
                    val user = members.firstOrNull { it != account.userId } ?: throw app.diddy.util.DiddyError("No other member in this room.")
                    updated = SlashCommand.addingDirect(current, roomId, user)
                }
                account.clientRequest(userBase + "m.direct", updated, "PUT")
            }
            SlashCommand.DELETE -> {
                val date = SlashCommand.pastDate(flags["past"] ?: "")
                if (date == null || users.isEmpty()) throw app.diddy.util.DiddyError("Enter users or servers and -past 1d|2h|5m|30s.")
                val result = account.clientRequest("$base/timestamp_to_event?ts=${date.time}&dir=f")
                val eventId = result["event_id"].str() ?: return
                val context = account.clientRequest("$base/context/${path(eventId)}?limit=0")
                var token = context["start"].str()
                val types = MatrixIdRules.splitWithSpace(flags["t"] ?: "")
                val seen = mutableSetOf<String>()
                while (token != null && seen.add(token)) {
                    val response = account.clientRequest("$base/messages?dir=f&limit=20&from=" + URLEncoder.encode(token, "UTF-8"))
                    val events = response["chunk"] as? List<*> ?: emptyList<Any?>()
                    for (raw in events) {
                        val event = raw.obj() ?: continue
                        val sender = event["sender"].str() ?: continue
                        val id = event["event_id"].str() ?: continue
                        if (sender !in users) continue
                        if (types.isNotEmpty() && event["type"].str() !in types) continue
                        if (event["unsigned"].obj()?.get("redacted_because") != null) continue
                        val body = linkedMapOf<String, Any?>()
                        flags["r"]?.let { body["reason"] = it }
                        account.clientRequest("$base/redact/${path(id)}/${java.util.UUID.randomUUID()}", body, "PUT")
                        kotlinx.coroutines.delay(100)
                    }
                    token = if (events.isEmpty()) null else response["end"].str()
                }
            }
            SlashCommand.ACL -> {
                val current = runCatching { account.stateContent(roomId, "m.room.server_acl", "") }.getOrDefault(emptyMap())
                account.clientRequest("$base/state/m.room.server_acl/", SlashCommand.updatedAcl(current, flags), "PUT")
            }
            else -> throw app.diddy.util.DiddyError("This command is not available here yet.")
        }
    }
}
