package app.diddy.call

import app.diddy.util.Json
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest

/**
 * Watch Together, the pure part (a port of ios WatchTogetherLogic.swift, itself from the desktop's
 * watchTogether.ts): YouTube links, the player's postMessage protocol, the to-device sync
 * messages, SponsorBlock and the controller that keeps the local player on the shared state.
 */
object WatchYouTube {
    const val MAX_START = 24.0 * 3600
    const val EMBED_ORIGIN = "https://www.youtube-nocookie.com"
    val playerOrigins = listOf(EMBED_ORIGIN, "https://www.youtube.com", "https://youtube.com")

    fun isVideoId(value: String?): Boolean =
        value != null && value.length == 11 && value.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '_' || it == '-' }

    private fun digits(s: String) = s.isNotEmpty() && s.all { it in '0'..'9' }

    fun parseStartTime(value: String?): Double {
        if (value.isNullOrEmpty()) return 0.0
        val text = value.trim().lowercase()
        val seconds = plainSeconds(text) ?: hmsSeconds(text) ?: return 0.0
        if (!seconds.isFinite() || seconds < 0) return 0.0
        return minOf(seconds, MAX_START)
    }

    private fun plainSeconds(text: String): Double? {
        val body = text.removeSuffix("s")
        val parts = body.split(".")
        if (parts.size !in 1..2 || !parts.all(::digits)) return null
        return body.toDoubleOrNull()?.let { Math.floor(it) }
    }

    private fun hmsSeconds(text: String): Double? {
        if (text.isEmpty()) return null
        val match = Regex("^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$").matchEntire(text) ?: return null
        if (match.groupValues.drop(1).all { it.isEmpty() }) return null
        return listOf(3600.0, 60.0, 1.0).mapIndexed { i, f -> (match.groupValues[i + 1].toDoubleOrNull() ?: 0.0) * f }.sum()
    }

    private val youtubeHosts = setOf("youtube.com", "youtube-nocookie.com")
    private val pathIdPrefixes = setOf("shorts", "embed", "live", "v", "e")

    /** A YouTube video link (watch, youtu.be, shorts, embed, live) or a bare id, with its start time. */
    fun parseUrl(input: String): Pair<String, Double>? {
        val text = input.trim()
        if (text.isEmpty() || text.length > 2048) return null
        if (isVideoId(text)) return text to 0.0
        val withScheme = if (Regex("^[A-Za-z][A-Za-z0-9+.-]*://").containsMatchIn(text)) text else "https://$text"
        val uri = runCatching { URI(withScheme) }.getOrNull() ?: runCatching { URI(withScheme.replace(" ", "%20")) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase()
        if (scheme != "https" && scheme != "http") return null
        var host = uri.host?.lowercase() ?: return null
        for (prefix in listOf("www.", "m.", "music.")) if (host.startsWith(prefix)) { host = host.removePrefix(prefix); break }
        val parts = (uri.rawPath ?: "").split("/").filter { it.isNotEmpty() }
        val query = query(uri.rawQuery)
        val id = when {
            host == "youtu.be" -> parts.firstOrNull()
            host in youtubeHosts && parts.firstOrNull() == "watch" -> query["v"]
            host in youtubeHosts && parts.size >= 2 && parts[0] in pathIdPrefixes -> parts[1]
            else -> null
        }
        if (!isVideoId(id)) return null
        return id!! to parseStartTime(query["t"] ?: query["start"] ?: hashTime(uri.rawFragment))
    }

    private fun query(raw: String?): Map<String, String> = (raw ?: "").split("&").filter { it.isNotEmpty() }.associate { pair ->
        val parts = pair.split("=", limit = 2)
        val value = parts.getOrElse(1) { "" }
        parts[0] to runCatching { URLDecoder.decode(value, "UTF-8") }.getOrDefault(value)
    }.let { map -> map }

    private fun hashTime(fragment: String?): String? {
        fragment ?: return null
        for (piece in fragment.split("&")) {
            val p = piece.trimStart('#')
            if (p.startsWith("t=") && p.length > 2) return p.drop(2)
        }
        return null
    }

    fun formEncode(value: String): String {
        val out = StringBuilder()
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val b = byte.toInt() and 0xFF
            val c = b.toChar()
            when {
                c in '0'..'9' || c in 'A'..'Z' || c in 'a'..'z' || c == '*' || c == '-' || c == '.' || c == '_' -> out.append(c)
                c == ' ' -> out.append('+')
                else -> out.append("%%%02X".format(b))
            }
        }
        return out.toString()
    }

    fun embedUrl(videoId: String, origin: String, start: Double = 0.0): String? {
        if (!isVideoId(videoId)) return null
        val params = mutableListOf("enablejsapi" to "1", "playsinline" to "1", "rel" to "0", "iv_load_policy" to "3")
        if (origin.isNotEmpty() && origin != "null") {
            params += "origin" to origin
            params += "widget_referrer" to origin
        }
        if (start.isFinite()) {
            val from = Math.floor(start)
            if (from > 0 && from <= MAX_START) params += "start" to from.toLong().toString()
        }
        return "$EMBED_ORIGIN/embed/$videoId?" + params.joinToString("&") { "${formEncode(it.first)}=${formEncode(it.second)}" }
    }

    fun watchUrl(videoId: String) = "https://www.youtube.com/watch?v=$videoId"

    fun errorText(code: Int) = when (code) {
        2 -> "This link does not point to a valid video."
        5 -> "The player cannot play this video here."
        100 -> "The video was removed or is private."
        101, 150 -> "The owner of this video does not allow playing it outside YouTube."
        152, 153 -> "YouTube refused to play the video inside the app (embed configuration)."
        else -> "YouTube could not play the video (error $code)."
    }

    val qualityChoices = listOf("auto", "small", "medium", "large", "hd720", "hd1080", "highres")
    val qualityLabels = mapOf(
        "auto" to "Auto", "tiny" to "144p", "small" to "240p", "medium" to "360p", "large" to "480p",
        "hd720" to "720p", "hd1080" to "1080p", "hd1440" to "1440p", "hd2160" to "2160p", "highres" to "Highest",
    )

    fun playerCommand(function: String, args: List<Any?> = emptyList()): String =
        Json.encode(linkedMapOf("event" to "command", "func" to function, "args" to args, "id" to 1, "channel" to "widget"))
}

object WatchPlayerState {
    const val UNSTARTED = -1
    const val ENDED = 0
    const val PLAYING = 1
    const val PAUSED = 2
    const val BUFFERING = 3
    const val CUED = 5
}

data class WatchPlayerInfo(
    val currentTime: Double? = null,
    val duration: Double? = null,
    val playerState: Int? = null,
    val playbackRate: Double? = null,
    val playbackQuality: String? = null,
    val availableQualityLevels: List<String>? = null,
)

sealed class WatchPlayerMessage {
    data object Ready : WatchPlayerMessage()
    data class State(val state: Int) : WatchPlayerMessage()
    data class Error(val code: Int) : WatchPlayerMessage()
    data class Rate(val rate: Double) : WatchPlayerMessage()
    data class Quality(val quality: String) : WatchPlayerMessage()
    data class Info(val info: WatchPlayerInfo) : WatchPlayerMessage()
}

private fun number(value: Any?): Double? = (value as? Number)?.toDouble()?.takeIf { it.isFinite() }

object WatchPlayerMessages {
    fun isQuality(value: String) = value.length in 1..16 && value.all { it in 'a'..'z' || it in '0'..'9' || it == '_' }

    private fun readInfo(raw: Any?): WatchPlayerInfo {
        val r = raw as? Map<*, *> ?: return WatchPlayerInfo()
        return WatchPlayerInfo(
            currentTime = number(r["currentTime"])?.takeIf { it >= 0 },
            duration = number(r["duration"])?.takeIf { it >= 0 },
            playerState = number(r["playerState"])?.let { if (it == Math.rint(it)) it.toInt() else Int.MIN_VALUE },
            playbackRate = number(r["playbackRate"])?.takeIf { it > 0 },
            playbackQuality = (r["playbackQuality"] as? String)?.takeIf(::isQuality),
            availableQualityLevels = (r["availableQualityLevels"] as? List<*>)?.mapNotNull { it as? String }?.filter(::isQuality)?.take(16),
        )
    }

    fun parse(data: String): WatchPlayerMessage? {
        if (data.length > 100_000) return null
        val msg = Json.obj(data) ?: return null
        return when (msg["event"] as? String) {
            "onReady" -> WatchPlayerMessage.Ready
            "onStateChange" -> number(msg["info"])?.let { WatchPlayerMessage.State(it.toInt()) }
            "onError" -> number(msg["info"])?.let { WatchPlayerMessage.Error(it.toInt()) }
            "onPlaybackRateChange" -> number(msg["info"])?.takeIf { it > 0 }?.let { WatchPlayerMessage.Rate(it) }
            "onPlaybackQualityChange" -> (msg["info"] as? String)?.takeIf(::isQuality)?.let { WatchPlayerMessage.Quality(it) }
            "initialDelivery", "infoDelivery" -> WatchPlayerMessage.Info(readInfo(msg["info"]))
            else -> null
        }
    }
}

enum class WatchPlayback(val raw: String) { PLAYING("playing"), PAUSED("paused"), STOPPED("stopped") }

data class SharedWatch(
    val session: String,
    val videoId: String,
    val state: WatchPlayback,
    val position: Double,
    val rate: Double,
    val ts: Double,
    val seq: Long,
    val sender: String,
)

data class WatchStateMessage(
    val room: String,
    val session: String,
    val videoId: String,
    val state: WatchPlayback,
    val position: Double,
    val rate: Double,
    val ts: Double,
    val seq: Long,
)

sealed class WatchMessage {
    data class State(val state: WatchStateMessage) : WatchMessage()
    data class Request(val room: String) : WatchMessage()
}

data class WatchPatch(val state: WatchPlayback? = null, val position: Double? = null, val rate: Double? = null)

data class WatchDevice(val userId: String, val deviceId: String)

object WatchProtocol {
    const val EVENT_TYPE = "app.diddy.watch_together"
    const val VERSION = 1
    const val MIN_RATE = 0.25
    const val MAX_RATE = 2.0
    const val MAX_SEQ = 1_000_000_000_000L
    const val MAX_CLOCK_SKEW_MS = 60_000.0

    fun isSession(value: String) = value.length in 8..32 && value.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' }

    fun isRoomId(value: String): Boolean {
        if (!value.startsWith("!")) return false
        val rest = value.drop(1)
        return rest.length in 1..254 && rest.none { it.isWhitespace() || it == '\uFEFF' }
    }

    fun parse(content: Any?): WatchMessage? {
        val c = content as? Map<*, *> ?: return null
        if (number(c["v"]) != VERSION.toDouble()) return null
        val room = (c["room_id"] as? String)?.takeIf(::isRoomId) ?: return null
        val kind = c["kind"] as? String
        if (kind == "request") return WatchMessage.Request(room)
        if (kind != "state") return null
        val session = (c["session"] as? String)?.takeIf(::isSession) ?: return null
        val videoId = (c["video_id"] as? String)?.takeIf(WatchYouTube::isVideoId) ?: return null
        val state = WatchPlayback.entries.firstOrNull { it.raw == c["state"] } ?: return null
        val position = number(c["position"])?.takeIf { it >= 0 && it <= WatchYouTube.MAX_START } ?: return null
        val rate = number(c["rate"])?.takeIf { it in MIN_RATE..MAX_RATE } ?: return null
        val ts = number(c["ts"])?.takeIf { it > 0 && it <= 1e14 } ?: return null
        val seq = number(c["seq"])?.takeIf { it == Math.rint(it) && it >= 0 && it <= MAX_SEQ } ?: return null
        return WatchMessage.State(WatchStateMessage(room, session, videoId, state, position, rate, ts, seq.toLong()))
    }

    fun parse(json: String): WatchMessage? = if (json.length > 65_536) null else parse(Json.obj(json))

    fun stateContent(room: String, s: SharedWatch): Map<String, Any?> = sortedMapOf(
        "v" to VERSION, "kind" to "state", "room_id" to room, "session" to s.session, "video_id" to s.videoId,
        "state" to s.state.raw, "position" to Math.round(s.position * 1000) / 1000.0, "rate" to s.rate,
        "ts" to Math.round(s.ts), "seq" to s.seq,
    )

    fun requestContent(room: String): Map<String, Any?> = sortedMapOf("v" to VERSION, "kind" to "request", "room_id" to room)

    fun fromMessage(msg: WatchStateMessage, sender: String, now: Double) = SharedWatch(
        msg.session, msg.videoId, msg.state, msg.position, msg.rate,
        if (msg.ts > now || now - msg.ts > MAX_CLOCK_SKEW_MS) now else msg.ts, msg.seq, sender,
    )

    /** JavaScript's string comparison (UTF-16 code units). */
    fun jsGreater(a: String, b: String) = a > b

    fun isNewer(next: SharedWatch, current: SharedWatch?): Boolean {
        if (current == null) return true
        if (next.seq != current.seq) return next.seq > current.seq
        if (next.sender != current.sender) return jsGreater(next.sender, current.sender)
        return false
    }

    fun expectedPosition(s: SharedWatch, now: Double): Double {
        if (s.state != WatchPlayback.PLAYING) return s.position
        val elapsed = maxOf(0.0, now - s.ts) / 1000
        return minOf(WatchYouTube.MAX_START, s.position + elapsed * s.rate)
    }

    fun rebase(s: SharedWatch, now: Double) = s.copy(position = expectedPosition(s, now), ts = now)

    fun nextChange(current: SharedWatch, patch: WatchPatch, sender: String, now: Double): SharedWatch {
        val base = rebase(current, now)
        return base.copy(
            state = patch.state ?: base.state,
            position = patch.position ?: base.position,
            rate = (patch.rate ?: current.rate).coerceIn(MIN_RATE, MAX_RATE),
            ts = now, seq = current.seq + 1, sender = sender,
        )
    }

    fun newSessionId(random: () -> Double = { Math.random() }): String {
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        return (0 until 16).map { chars[(random() * chars.length).toInt().coerceIn(0, chars.length - 1)] }.joinToString("")
    }

    fun startWatch(videoId: String, start: Double, previous: SharedWatch?, sender: String, now: Double, random: () -> Double = { Math.random() }) =
        SharedWatch(newSessionId(random), videoId, WatchPlayback.PLAYING, start.coerceIn(0.0, WatchYouTube.MAX_START), 1.0, now, (previous?.seq ?: 0) + 1, sender)

    fun recipients(devices: List<WatchDevice>, ownUserId: String, onlyUser: String? = null): Map<String, List<String>> {
        val map = linkedMapOf<String, MutableList<String>>()
        for (device in devices) {
            if (device.userId == ownUserId || device.deviceId.isEmpty()) continue
            if (onlyUser != null && device.userId != onlyUser) continue
            val list = map.getOrPut(device.userId) { mutableListOf() }
            if (device.deviceId !in list) list += device.deviceId
        }
        return map
    }

    fun plainMessages(recipients: Map<String, List<String>>, content: Map<String, Any?>): Map<String, Any?> =
        recipients.filterValues { it.isNotEmpty() }.mapValues { (_, devices) -> devices.associateWith { content } }

    fun deviceCount(recipients: Map<String, List<String>>) = recipients.values.sumOf { it.size }
}

data class WatchSkipSegment(val start: Double, val end: Double, val category: String, val uuid: String)

object WatchSponsorBlock {
    const val API = "https://sponsor.ajay.app"
    val categories = listOf("sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic", "filler")
    val defaultCategories = listOf("sponsor", "selfpromo", "interaction")
    val labels = mapOf(
        "sponsor" to "Sponsor", "selfpromo" to "Self promotion", "interaction" to "Interaction reminder (subscribe, like)",
        "intro" to "Intro animation", "outro" to "Endcards and credits", "preview" to "Preview and recap",
        "music_offtopic" to "Non-music part in music videos", "filler" to "Filler tangent",
    )

    fun isCategory(value: String) = value in categories

    fun hashPrefix(videoId: String): String =
        MessageDigest.getInstance("SHA-256").digest(videoId.toByteArray()).take(2).joinToString("") { "%02x".format(it) }

    fun requestUrl(prefix: String, chosen: List<String>): String {
        val json = "[" + chosen.filter(::isCategory).joinToString(",") { "\"$it\"" } + "]"
        return "$API/api/skipSegments/$prefix?categories=${WatchYouTube.formEncode(json)}&actionTypes=${WatchYouTube.formEncode("[\"skip\"]")}"
    }

    fun selectSegments(body: Any?, videoId: String, chosen: List<String>): List<WatchSkipSegment> {
        val list = body as? List<*> ?: return emptyList()
        val entry = list.firstOrNull { (it as? Map<*, *>)?.get("videoID") == videoId } as? Map<*, *>
        val raw = entry?.get("segments") as? List<*> ?: return emptyList()
        val found = mutableListOf<Pair<Int, WatchSkipSegment>>()
        raw.take(200).forEachIndexed { index, item ->
            val s = item as? Map<*, *> ?: return@forEachIndexed
            val category = (s["category"] as? String)?.takeIf { isCategory(it) && it in chosen } ?: return@forEachIndexed
            s["actionType"]?.let { if (it != "skip") return@forEachIndexed }
            val pair = s["segment"] as? List<*> ?: return@forEachIndexed
            if (pair.size != 2) return@forEachIndexed
            val start = number(pair[0]) ?: return@forEachIndexed
            val end = number(pair[1]) ?: return@forEachIndexed
            if (start < 0 || end > WatchYouTube.MAX_START || end - start < 1) return@forEachIndexed
            fun text(v: Double) = if (v == Math.rint(v) && Math.abs(v) < 1e15) v.toLong().toString() else v.toString()
            val uuid = (s["UUID"] as? String)?.take(128) ?: "${text(start)}-${text(end)}"
            found += index to WatchSkipSegment(start, end, category, uuid)
        }
        return found.sortedWith(compareBy({ it.second.start }, { it.first })).map { it.second }
    }

    const val END_MARGIN = 0.5

    fun segmentToSkip(segments: List<WatchSkipSegment>, position: Double, skipped: MutableSet<String>): WatchSkipSegment? {
        for (s in segments) if (position < s.start - 1) skipped.remove(s.uuid)
        return segments.firstOrNull { position >= it.start && position < it.end - END_MARGIN && it.uuid !in skipped }
    }
}

data class WatchPlayerSample(val position: Double, val state: Int, val rate: Double, val duration: Double?, val at: Double)

sealed class WatchPlayerCommand {
    data object Play : WatchPlayerCommand()
    data object Pause : WatchPlayerCommand()
    data class Seek(val to: Double) : WatchPlayerCommand()
    data class Rate(val rate: Double) : WatchPlayerCommand()
}

data class WatchTickResult(val commands: List<WatchPlayerCommand> = emptyList(), val change: WatchPatch? = null, val skipped: WatchSkipSegment? = null)

/** Keeps the local player on the shared state, and notices what the user did in the player. */
class WatchController(private val driftLimit: Double = 1.5, private val suppressMs: Double = 1200.0, private val playRetryMs: Double = 2500.0) {
    private var shared: SharedWatch? = null
    private var suppressUntil = 0.0
    private var lastSample: WatchPlayerSample? = null
    private var lastPlayCommand = Double.NEGATIVE_INFINITY
    private var synced = false
    val skipped = mutableSetOf<String>()

    private fun isRunning(state: Int) = state == WatchPlayerState.PLAYING || state == WatchPlayerState.BUFFERING

    fun setShared(next: SharedWatch?) {
        if (next?.session != shared?.session) {
            skipped.clear()
            lastSample = null
            synced = false
        }
        shared = next
    }

    fun isSuppressed(now: Double) = now < suppressUntil

    private fun commanded(now: Double) {
        suppressUntil = now + suppressMs
        lastSample = null
        synced = false
    }

    fun onPlayerState(state: Int, position: Double, now: Double): WatchPatch? {
        val shared = shared ?: return null
        if (shared.state == WatchPlayback.STOPPED || isSuppressed(now)) return null
        if (state == WatchPlayerState.PLAYING && shared.state == WatchPlayback.PAUSED) return WatchPatch(WatchPlayback.PLAYING, position)
        if (state == WatchPlayerState.PAUSED && shared.state == WatchPlayback.PLAYING) return WatchPatch(WatchPlayback.PAUSED, position)
        return null
    }

    fun onPlayerRate(rate: Double, now: Double): WatchPatch? {
        val shared = shared ?: return null
        if (shared.state == WatchPlayback.STOPPED || isSuppressed(now)) return null
        if (rate < WatchProtocol.MIN_RATE || rate > WatchProtocol.MAX_RATE || Math.abs(rate - shared.rate) < 0.01) return null
        return WatchPatch(rate = rate)
    }

    fun tick(sample: WatchPlayerSample, now: Double, segments: List<WatchSkipSegment> = emptyList()): WatchTickResult {
        val shared = shared ?: return WatchTickResult()
        if (shared.state == WatchPlayback.STOPPED) return WatchTickResult()
        val suppressed = isSuppressed(now)
        val last = lastSample
        lastSample = sample
        val loaded = sample.state != WatchPlayerState.UNSTARTED && sample.state != WatchPlayerState.CUED
        if (!suppressed && synced && loaded && last != null) {
            val elapsed = maxOf(0.0, sample.at - last.at) / 1000
            val moved = sample.position - last.position
            val allowed = if (isRunning(last.state)) elapsed * maxOf(last.rate, shared.rate) else 0.0
            if (moved < -driftLimit || moved > allowed + driftLimit) return WatchTickResult(change = WatchPatch(position = sample.position))
        }
        if (!suppressed && shared.state == WatchPlayback.PLAYING && sample.state == WatchPlayerState.PLAYING) {
            WatchSponsorBlock.segmentToSkip(segments, sample.position, skipped)?.let { segment ->
                skipped += segment.uuid
                commanded(now)
                return WatchTickResult(listOf(WatchPlayerCommand.Seek(segment.end)), WatchPatch(position = segment.end), segment)
            }
        }
        val commands = mutableListOf<WatchPlayerCommand>()
        var expected = WatchProtocol.expectedPosition(shared, now)
        var atEnd = false
        val duration = sample.duration
        if (duration != null && duration > 0) {
            atEnd = expected >= duration - driftLimit
            expected = minOf(expected, duration)
        }
        val ended = sample.state == WatchPlayerState.ENDED
        if (!(ended && atEnd) && Math.abs(sample.position - expected) > driftLimit) commands += WatchPlayerCommand.Seek(expected)
        if (shared.state == WatchPlayback.PLAYING && !isRunning(sample.state) && !(ended && atEnd)) {
            if (now - lastPlayCommand >= playRetryMs) {
                commands += WatchPlayerCommand.Play
                lastPlayCommand = now
            }
        } else if (shared.state == WatchPlayback.PAUSED && isRunning(sample.state)) {
            commands += WatchPlayerCommand.Pause
        }
        if (loaded && Math.abs(sample.rate - shared.rate) >= 0.01) commands += WatchPlayerCommand.Rate(shared.rate)
        if (commands.isNotEmpty()) commanded(now) else if (!suppressed && loaded) synced = true
        return WatchTickResult(commands)
    }
}

/** Watch Together options kept on this device (same JSON as iOS and desktop). */
data class WatchPrefs(
    val enabled: Boolean = true,
    val categories: List<String> = WatchSponsorBlock.defaultCategories,
    val volume: Int = 80,
    val muted: Boolean = false,
    val quality: String = "auto",
) {
    fun encode(): String = Json.encode(sortedMapOf("enabled" to enabled, "categories" to categories, "volume" to volume, "muted" to muted, "quality" to quality))

    companion object {
        const val STORAGE_KEY = "diddyWatchTogether"

        fun decode(text: String?): WatchPrefs {
            val s = Json.obj(text) ?: return WatchPrefs()
            var prefs = WatchPrefs()
            (s["enabled"] as? Boolean)?.let { prefs = prefs.copy(enabled = it) }
            (s["categories"] as? List<*>)?.let { list ->
                prefs = prefs.copy(categories = list.mapNotNull { it as? String }.filter(WatchSponsorBlock::isCategory).distinct())
            }
            number(s["volume"])?.let { prefs = prefs.copy(volume = Math.round(it).toInt().coerceIn(0, 100)) }
            (s["muted"] as? Boolean)?.let { prefs = prefs.copy(muted = it) }
            (s["quality"] as? String)?.takeIf { it in WatchYouTube.qualityChoices }?.let { prefs = prefs.copy(quality = it) }
            return prefs
        }
    }
}
