package app.diddy.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.util.Json
import app.diddy.util.obj
import app.diddy.util.str
import org.matrix.rustcomponents.sdk.EventTimelineItem
import org.matrix.rustcomponents.sdk.MessageContent
import org.matrix.rustcomponents.sdk.MessageType
import org.matrix.rustcomponents.sdk.Room
import java.net.URI
import java.util.Date
import kotlin.math.floor

/**
 * Bot cards (ios BotCard.swift, desktop plugins/botCard.ts): a bot sends a normal message plus
 * structured data in `content["dev.diddy.card"]`, drawn as a card. Everything is untrusted input:
 * only known kinds, strings are cut, numbers must be finite, images only mxc://, links only http(s).
 * Protocol: docs/bot-cards.md
 */
object BotCardKeys {
    const val CARD = "dev.diddy.card"
    const val ACTION = "dev.diddy.card_action"
    const val COMMANDS_EVENT = "dev.diddy.commands"
}

data class BotCardAction(val label: String, val send: String)
data class BotCardQueueItem(val title: String, val artist: String?, val duration: Double?)
data class BotCardHelpItem(val usage: String, val desc: String)
data class BotCardHelpGroup(val title: String, val items: List<BotCardHelpItem>)
data class BotCardChartItem(val label: String, val value: Double, val sub: String?)
data class BotCardChart(val title: String, val unit: String?, val items: List<BotCardChartItem>)
data class BotCardControls(val prev: String?, val toggle: String?, val skip: String?, val volume: String?, val dashboard: String?)
data class BotCardUpNext(val title: String, val artist: String?)

enum class BotCardTrackState(val raw: String) {
    SEARCHING("searching"), DOWNLOADING("downloading"), PLAYING("playing"), PAUSED("paused"), STOPPED("stopped"), ERROR("error");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }
    }
}

enum class BotCardTone(val raw: String) {
    INFO("info"), SUCCESS("success"), WARNING("warning"), ERROR("error");

    companion object {
        fun of(raw: String?) = entries.firstOrNull { it.raw == raw }
    }
}

data class BotCardTrack(
    val state: BotCardTrackState,
    val title: String,
    val artist: String?,
    val duration: Double?,
    val position: Double?,
    val startedAt: Double?,
    val thumbnail: String?,
    val url: String?,
    val source: String?,
    val note: String?,
    val seek: String?,
    val volume: Double?,
    val actions: List<BotCardAction>,
    val room: String? = null,
    val requestedBy: String? = null,
    val upNext: List<BotCardUpNext> = emptyList(),
    val controls: BotCardControls? = null,
    val volumeMax: Double? = null,
    val more: List<BotCardAction> = emptyList(),
)

sealed class BotCard {
    data class Track(val track: BotCardTrack) : BotCard()
    data class Queue(val now: BotCardQueueItem?, val items: List<BotCardQueueItem>, val total: Int, val actions: List<BotCardAction>) : BotCard()
    data class Help(val groups: List<BotCardHelpGroup>, val note: String?) : BotCard()
    data class ListCard(val title: String, val items: List<BotCardQueueItem>, val total: Int, val empty: String?, val actions: List<BotCardAction>) : BotCard()
    data class Stats(val title: String, val charts: List<BotCardChart>, val actions: List<BotCardAction>) : BotCard()
    data class Note(val text: String, val tone: BotCardTone, val icon: String?, val url: String? = null, val linkLabel: String? = null) : BotCard()
}

object BotCardParser {
    fun card(originalJson: String?, latestEditJson: String?): BotCard? {
        val content = effectiveContent(originalJson, latestEditJson) ?: return null
        return parse(content)
    }

    fun isAction(originalJson: String?): Boolean {
        val content = effectiveContent(originalJson, null) ?: return false
        return isActionMessage(content)
    }

    fun mightHaveCard(json: String?): Boolean = json?.contains(BotCardKeys.CARD) == true

    fun effectiveContent(originalJson: String?, latestEditJson: String?): Map<String, Any?>? {
        fun content(json: String?) = Json.obj(json)?.get("content").obj()
        content(latestEditJson)?.get("m.new_content").obj()?.let { return it }
        return content(originalJson)
    }

    /** Printable text, one piece, cut to `max` characters. */
    fun text(value: Any?, max: Int): String? {
        val string = value as? String ?: return null
        val cleaned = string.filter { c ->
            val v = c.code
            !(v <= 0x08 || v == 0x0B || v == 0x0C || (v in 0x0E..0x1F) || v == 0x7F)
        }
        val trimmed = cleaned.trim()
        if (trimmed.isEmpty()) return null
        val count = trimmed.codePointCount(0, trimmed.length)
        if (count <= max) return trimmed
        val end = trimmed.offsetByCodePoints(0, max - 1)
        return trimmed.substring(0, end) + "…"
    }

    fun number(value: Any?, max: Double = 1e9): Double? {
        if (value !is Number) return null
        val d = value.toDouble()
        return if (d.isFinite() && d >= 0 && d <= max) d else null
    }

    fun httpUrl(value: Any?): String? {
        val string = value as? String ?: return null
        if (string.length > 2000) return null
        val uri = try { URI(string) } catch (_: Exception) { return null }
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "http" && scheme != "https") return null
        if (uri.host.isNullOrEmpty()) return null
        return string
    }

    /** `mxc://server/media`, nothing else. */
    fun mxcUrl(value: Any?): String? {
        val string = value as? String ?: return null
        if (!string.startsWith("mxc://")) return null
        val parts = string.removePrefix("mxc://").split("/")
        if (parts.size != 2) return null
        if (parts.any { it.isEmpty() || it.length > 255 || it.any(Char::isWhitespace) }) return null
        return string
    }

    private fun noWhitespace(s: String) = s.none { it.isWhitespace() }

    private fun looksLikeCommand(s: String, tail: IntRange): Boolean {
        val first = s.firstOrNull() ?: return false
        if (first != '!' && first != '/') return false
        val rest = s.drop(1)
        return rest.length in tail && noWhitespace(rest)
    }

    const val MORE_MAX = 16

    fun actions(value: Any?, max: Int = 10): List<BotCardAction> {
        val list = value as? List<*> ?: return emptyList()
        return list.take(max).mapNotNull { item ->
            val o = item.obj() ?: return@mapNotNull null
            val label = text(o["label"], 24) ?: return@mapNotNull null
            val send = text(o["send"], 120) ?: return@mapNotNull null
            if (looksLikeCommand(send, 1..Int.MAX_VALUE)) BotCardAction(label, send) else null
        }
    }

    fun playerCommand(value: Any?): String? {
        val string = value as? String ?: return null
        if (string.length > 60) return null
        val parts = string.split(" ")
        if (parts.size !in 1..2 || !looksLikeCommand(parts[0], 1..30)) return null
        if (parts.size == 2 && !(parts[1].length in 1..20 && noWhitespace(parts[1]))) return null
        return string
    }

    fun controls(value: Any?): BotCardControls? {
        val o = value.obj() ?: return null
        return BotCardControls(playerCommand(o["prev"]), playerCommand(o["toggle"]), playerCommand(o["skip"]), playerCommand(o["volume"]), playerCommand(o["dashboard"]))
    }

    fun upNext(value: Any?): List<BotCardUpNext> {
        val list = value as? List<*> ?: return emptyList()
        val out = mutableListOf<BotCardUpNext>()
        for (item in list.take(20)) {
            if (out.size >= 3) break
            val o = item.obj() ?: continue
            text(o["title"], 160)?.let { out += BotCardUpNext(it, text(o["artist"], 120)) }
        }
        return out
    }

    private fun queueItem(value: Any?): BotCardQueueItem? {
        val o = value.obj() ?: return null
        val title = text(o["title"], 160) ?: return null
        return BotCardQueueItem(title, text(o["artist"], 120), number(o["duration"], 86400.0 * 7))
    }

    fun parse(content: Map<String, Any?>): BotCard? {
        val raw = content[BotCardKeys.CARD].obj() ?: return null
        val version = raw["v"] as? Number ?: return null
        if (version.toDouble() != 1.0) return null
        val kind = raw["kind"].str() ?: return null
        return when (kind) {
            "track" -> {
                val title = text(raw["title"], 200) ?: return null
                val state = BotCardTrackState.of(raw["state"].str()) ?: return null
                val seek = raw["seek"].str()?.takeIf { looksLikeCommand(it, 1..30) }
                BotCard.Track(
                    BotCardTrack(
                        state = state,
                        title = title,
                        artist = text(raw["artist"], 120),
                        duration = number(raw["duration"], 86400.0 * 7),
                        position = number(raw["position"], 86400.0 * 7),
                        startedAt = number(raw["startedAt"], 4e12),
                        thumbnail = mxcUrl(raw["thumbnail"]),
                        url = httpUrl(raw["url"]),
                        source = text(raw["source"], 30),
                        note = text(raw["note"], 200),
                        seek = seek,
                        volume = number(raw["volume"], 1000.0),
                        actions = actions(raw["actions"]),
                        room = text(raw["room"], 80),
                        requestedBy = text(raw["requestedBy"], 80),
                        upNext = upNext(raw["upNext"]),
                        controls = controls(raw["controls"]),
                        volumeMax = number(raw["volumeMax"], 1000.0)?.takeIf { it > 0 },
                        more = actions(raw["more"], MORE_MAX),
                    )
                )
            }
            "queue" -> {
                val items = ((raw["items"] as? List<*>) ?: emptyList<Any?>()).take(50).mapNotNull(::queueItem)
                val total = number(raw["total"], 1e6)?.toInt() ?: items.size
                BotCard.Queue(queueItem(raw["now"]), items, total, actions(raw["actions"]))
            }
            "help" -> {
                val groups = mutableListOf<BotCardHelpGroup>()
                for (group in ((raw["groups"] as? List<*>) ?: emptyList<Any?>()).take(12)) {
                    val g = group.obj() ?: continue
                    val title = text(g["title"], 60) ?: continue
                    val items = ((g["items"] as? List<*>) ?: emptyList<Any?>()).take(20).mapNotNull { item ->
                        val o = item.obj() ?: return@mapNotNull null
                        val usage = text(o["usage"], 120) ?: return@mapNotNull null
                        val desc = text(o["desc"], 200) ?: return@mapNotNull null
                        BotCardHelpItem(usage, desc)
                    }
                    if (items.isNotEmpty()) groups += BotCardHelpGroup(title, items)
                }
                if (groups.isEmpty()) null else BotCard.Help(groups, text(raw["note"], 400))
            }
            "list" -> {
                val title = text(raw["title"], 100) ?: return null
                val items = ((raw["items"] as? List<*>) ?: emptyList<Any?>()).take(50).mapNotNull { entry ->
                    val o = entry.obj() ?: return@mapNotNull null
                    val t = text(o["title"], 160) ?: return@mapNotNull null
                    BotCardQueueItem(t, text(o["subtitle"], 120), number(o["duration"], 86400.0 * 7))
                }
                val total = number(raw["total"], 1e6)?.toInt() ?: items.size
                BotCard.ListCard(title, items, total, text(raw["empty"], 200), actions(raw["actions"]))
            }
            "stats" -> {
                val charts = mutableListOf<BotCardChart>()
                for (chart in ((raw["charts"] as? List<*>) ?: emptyList<Any?>()).take(6)) {
                    val c = chart.obj() ?: continue
                    val chartTitle = text(c["title"], 80) ?: continue
                    val items = ((c["items"] as? List<*>) ?: emptyList<Any?>()).take(15).mapNotNull { item ->
                        val o = item.obj() ?: return@mapNotNull null
                        val label = text(o["label"], 120) ?: return@mapNotNull null
                        val value = number(o["value"], 1e12) ?: return@mapNotNull null
                        BotCardChartItem(label, value, text(o["sub"], 60))
                    }
                    if (items.isNotEmpty()) charts += BotCardChart(chartTitle, text(c["unit"], 12), items)
                }
                val title = text(raw["title"], 100)
                if (title == null || charts.isEmpty()) null else BotCard.Stats(title, charts, actions(raw["actions"]))
            }
            "note" -> {
                val body = text(raw["text"], 300) ?: return null
                val tone = BotCardTone.of(raw["tone"].str()) ?: BotCardTone.INFO
                val url = httpUrl(raw["url"])
                BotCard.Note(body, tone, text(raw["icon"], 8), url, if (url == null) null else text(raw["linkLabel"], 40))
            }
            else -> null
        }
    }

    /** A command a card button sent for you: hidden in the timeline, the card changes instead. */
    fun isActionMessage(content: Map<String, Any?>): Boolean {
        if (content[BotCardKeys.ACTION] != true) return false
        if (content["msgtype"].str() != "m.text") return false
        val body = content["body"].str() ?: return false
        if (body.length > 60) return false
        val parts = body.split(" ")
        if (parts.size !in 1..3 || !looksLikeCommand(parts[0], 1..30)) return false
        return parts.drop(1).all { it.length in 1..20 && noWhitespace(it) }
    }

    fun looksLikeActionBody(body: String) = body.length <= 60 && (body.startsWith("!") || body.startsWith("/"))

    /** The wire format of a card button or the seek bar, the same as the desktop sends. */
    fun actionContent(command: String): String = Json.encode(mapOf("msgtype" to "m.text", "body" to command, BotCardKeys.ACTION to true))

    /** 3:17 or 1:02:03 */
    fun formatTime(seconds: Double): String {
        val s = floor(maxOf(0.0, seconds)).toInt()
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        return if (h > 0) String.format(java.util.Locale.US, "%d:%02d:%02d", h, m, sec) else String.format(java.util.Locale.US, "%d:%02d", m, sec)
    }

    /** Playback position of a "playing" track now, in seconds (clamped to the length). */
    fun livePosition(track: BotCardTrack, now: Date): Double? {
        val position = track.position ?: return null
        var elapsed = 0.0
        if (track.state == BotCardTrackState.PLAYING && track.startedAt != null) {
            elapsed = maxOf(0.0, now.time / 1000.0 - track.startedAt / 1000)
        }
        val live = position + elapsed
        return track.duration?.let { minOf(live, it) } ?: live
    }
}

// MARK: - Bot commands

/** One argument of a command: its name, an optional hint and fixed answers to suggest. */
data class BotOption(val name: String, val required: Boolean, val desc: String?, val choices: List<String>)

data class BotCommand(val name: String, val usage: String, val desc: String, val prefix: String, val options: List<BotOption> = emptyList()) {
    val id: String get() = prefix + name
}

/** What to suggest for the argument being typed (`!mode o` suggests "on" and "off"). */
data class BotArgumentMatch(
    val command: BotCommand,
    val option: BotOption,
    /** Which argument is being typed (0 = the first after the command). */
    val index: Int,
    /** What of it is typed so far. */
    val partial: String,
    /** Fixed answers that fit [partial]. */
    val choices: List<String>,
)

data class BotCommandList(val prefix: String, val commands: List<BotCommand>)

object BotCommandParser {
    private const val PREFIX_CHARS = "!%$.,;~?+*-"

    private fun short(value: Any?, max: Int): String? {
        val string = value as? String ?: return null
        val cleaned = string.filter { it.code > 0x1F && it.code != 0x7F }.trim()
        if (cleaned.isEmpty()) return null
        return if (cleaned.length > max) cleaned.take(max - 1) + "…" else cleaned
    }

    private fun isNamePart(cp: Int): Boolean {
        if (cp == '_'.code || cp == '/'.code || cp == '-'.code) return true
        return when (Character.getType(cp).toByte()) {
            Character.UPPERCASE_LETTER, Character.LOWERCASE_LETTER, Character.TITLECASE_LETTER, Character.MODIFIER_LETTER,
            Character.OTHER_LETTER, Character.DECIMAL_DIGIT_NUMBER, Character.LETTER_NUMBER, Character.OTHER_NUMBER -> true
            else -> false
        }
    }

    private fun options(value: Any?): List<BotOption> =
        ((value as? List<*>) ?: emptyList<Any?>()).take(10).mapNotNull { entry ->
            val e = entry.obj() ?: return@mapNotNull null
            val name = short(e["name"], 30) ?: return@mapNotNull null
            val required = (e["required"] as? Boolean) != false
            val choices = ((e["choices"] as? List<*>) ?: emptyList<Any?>()).take(25).mapNotNull { short(it, 40) }
            BotOption(name, required, short(e["desc"], 80), choices)
        }

    fun parse(content: Map<String, Any?>): BotCommandList? {
        val version = content["v"] as? Number ?: return null
        if (version.toDouble() != 1.0) return null
        val prefix = content["prefix"].str() ?: return null
        if (prefix.length !in 1..2 || !prefix.all { it in PREFIX_CHARS }) return null
        val commands = ((content["commands"] as? List<*>) ?: emptyList<Any?>()).take(100).mapNotNull { entry ->
            val e = entry.obj() ?: return@mapNotNull null
            val name = short(e["name"], 30) ?: return@mapNotNull null
            if (!name.codePoints().allMatch(::isNamePart)) return@mapNotNull null
            BotCommand(name, short(e["usage"], 120) ?: "$prefix$name", short(e["desc"], 160) ?: "", prefix, options(e["options"]))
        }
        return if (commands.isEmpty()) null else BotCommandList(prefix, commands)
    }

    fun match(lists: List<BotCommandList>, typed: String, max: Int = 8): List<BotCommand> {
        val out = mutableListOf<BotCommand>()
        for (list in lists) {
            if (!typed.startsWith(list.prefix)) continue
            val word = typed.drop(list.prefix.length).lowercase()
            list.commands.filter { it.name.lowercase().startsWith(word) }.forEach { out += it }
        }
        if (out.size == 1 && typed.drop(out[0].prefix.length).lowercase() == out[0].name.lowercase()) return emptyList()
        return out.take(max)
    }

    /**
     * What to suggest for the argument being typed (the same rules as `matchBotArguments` in
     * `botCommands.ts`): [typed] is the whole message; one line without quotes is looked at, an
     * argument typed in full needs no suggestion any more.
     */
    fun matchArguments(lists: List<BotCommandList>, typed: String): BotArgumentMatch? {
        if (typed.contains('\n')) return null
        for (list in lists) {
            if (!typed.startsWith(list.prefix)) continue
            val rest = typed.drop(list.prefix.length)
            val split = rest.indexOfFirst { it.isWhitespace() }
            if (split <= 0) continue
            val name = rest.substring(0, split)
            val argText = rest.substring(split).trimStart()
            if (argText.contains('"') || argText.contains('\'')) continue
            val command = list.commands.firstOrNull { it.name.lowercase() == name.lowercase() } ?: continue
            if (command.options.isEmpty()) continue
            val words = argText.split(Regex("\\s+")).filter { it.isNotEmpty() }
            val startsNew = words.isEmpty() || argText.last().isWhitespace()
            val index = if (startsNew) words.size else words.size - 1
            val partial = if (startsNew) "" else words.last()
            if (index >= command.options.size) continue
            val option = command.options[index]
            var choices = option.choices.filter { it.lowercase().startsWith(partial.lowercase()) }
            if (choices.size == 1 && choices[0].lowercase() == partial.lowercase()) choices = emptyList()
            return BotArgumentMatch(command, option, index, partial, choices)
        }
        return null
    }
}

/** What the raw event of one message says: it carries a card, or it is a hidden card command. */
data class BotCardInspection(val card: BotCard? = null, val hidden: Boolean = false, val music: MusicCard? = null)

object BotCardLookup {
    private val cache = HashMap<String, BotCardInspection>()

    /** The SDK gives the raw JSON only through the debug info, so the answer is remembered per message. */
    fun inspect(event: EventTimelineItem, id: String, message: MessageContent): BotCardInspection {
        val (body, isText) = when (val type = message.msgType) {
            is MessageType.Text -> type.content.body to true
            is MessageType.Notice -> type.content.body to false
            else -> return BotCardInspection()
        }
        if (!event.isRemote) return BotCardInspection()
        val key = "$id|$body"
        if (!message.isEdited) synchronized(cache) { cache[key] }?.let { return it }
        val info = event.lazyProvider.debugInfo()
        var result = BotCardInspection()
        if (isText && BotCardParser.looksLikeActionBody(body) && BotCardParser.isAction(info.originalJson)) {
            result = result.copy(hidden = true)
        } else if (BotCardParser.mightHaveCard(info.originalJson) || BotCardParser.mightHaveCard(info.latestEditJson)) {
            result = result.copy(card = BotCardParser.card(info.originalJson, info.latestEditJson))
        }
        if (isText && result.card == null && (MusicCard.mightHaveCard(info.originalJson) || MusicCard.mightHaveCard(info.latestEditJson))) {
            result = result.copy(music = MusicCard.card(info.originalJson, info.latestEditJson))
        }
        if (!message.isEdited) synchronized(cache) {
            if (cache.size > 3000) cache.clear()
            cache[key] = result
        }
        return result
    }
}

/** The commands bots registered in one room (state event `dev.diddy.commands`, one per bot). */
class BotCommandStore {
    var lists by mutableStateOf<List<BotCommandList>>(emptyList())
        private set
    private var loadedFromServer: Date? = null
    private var loading = false

    suspend fun refreshFromServer(room: Room, account: MatrixAccount) {
        if (loading) return
        loadedFromServer?.let { if (Date().time - it.time < 60_000) return }
        loading = true
        try {
            val state = account.clientRequestArray("/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(room.id())}/state")
            loadedFromServer = Date()
            lists = state.filter { it["type"].str() == BotCardKeys.COMMANDS_EVENT }.mapNotNull { it["content"].obj()?.let(BotCommandParser::parse) }
        } catch (_: Exception) {
        } finally {
            loading = false
        }
    }

    fun suggestions(draft: String): List<BotCommand> {
        if (lists.isEmpty() || draft.isEmpty() || draft.any { it.isWhitespace() }) return emptyList()
        return BotCommandParser.match(lists, draft)
    }

    /** The argument being typed after a command ("!mode o"): fixed answers to suggest or a hint. */
    fun argumentMatch(draft: String): BotArgumentMatch? {
        if (lists.isEmpty() || draft.isEmpty() || !mayBeCommand(draft.takeWhile { !it.isWhitespace() })) return null
        return BotCommandParser.matchArguments(lists, draft)
    }

    companion object {
        fun mayBeCommand(draft: String): Boolean {
            val first = draft.firstOrNull() ?: return false
            if (draft.any { it.isWhitespace() }) return false
            return first in "!%$.,;~?+*-"
        }
    }
}
