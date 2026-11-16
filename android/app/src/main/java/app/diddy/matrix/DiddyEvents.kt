package app.diddy.matrix

import app.diddy.app.Prefs
import app.diddy.util.Json
import app.diddy.util.bool
import app.diddy.util.double
import app.diddy.util.obj
import java.math.BigDecimal

/** The event types and limits of the Diddy options room (desktop `plugins/diddy/types.ts`). */
object DiddyEvents {
    const val MARKER = "app.diddy.options"
    const val PROFILE = "app.diddy.profile"
    const val BADGE = "app.diddy.badge"
    const val AWARD = "app.diddy.badge_award"
    const val KEY_FIELD = "app.diddy.key"
    /** Desktop adds this to the topic of the options room so clients can find it in a server. */
    const val TOPIC_TAG = "[diddy-options]"
    const val MAX_CONTENT_BYTES = 4096

    /** `JSON.stringify(content).length` like desktop (UTF-16 units). */
    fun jsonLength(content: Map<String, Any?>): Int? = DiddyJsonSize.length(content)
}

/** A badge as it is shown: built-in or custom (`BadgeDef` of types.ts). */
data class DiddyBadge(
    val id: String,
    val name: String,
    val emoji: String? = null,
    val imageMxc: String? = null,
    val color: String? = null,
    /** The user id of the creator (custom badges only), the real sender of the definition. */
    val createdBy: String? = null,
) {
    val isGlobal: Boolean get() = createdBy == null && id.startsWith("g.")

    companion object {
        /** The badges that ship with Diddy and exist on every server (`GLOBAL_BADGES`). */
        val global: List<DiddyBadge> = listOf(
            Triple("g.star", "Star", "⭐") to "#F0C060", Triple("g.heart", "Heart", "💖") to "#E5517C", Triple("g.fire", "On fire", "🔥") to "#F08A3C",
            Triple("g.crown", "Crown", "👑") to "#F0C060", Triple("g.dev", "Developer", "🛠️") to "#7AA2F7", Triple("g.og", "OG", "🧬") to "#85E0BA",
            Triple("g.mod", "Moderator", "🛡️") to "#BDB6EC", Triple("g.gamer", "Gamer", "🎮") to "#9B7BFF", Triple("g.music", "Music", "🎧") to "#4FD1C5",
            Triple("g.night", "Night owl", "🦉") to "#8A8FD6", Triple("g.founder", "Founder", "🏛️") to "#E8B04A", Triple("g.admin", "Admin", "⚔️") to "#E5604D",
            Triple("g.helper", "Helper", "🤝") to "#5DC9A0", Triple("g.vip", "VIP", "💎") to "#C58AF9", Triple("g.supporter", "Supporter", "🎗️") to "#F27BA6",
            Triple("g.early", "Early bird", "🐣") to "#F5D547", Triple("g.designer", "Designer", "🎨") to "#F28DB2", Triple("g.translator", "Translator", "🌍") to "#5BB6E8",
            Triple("g.artist", "Artist", "🖌️") to "#E58A5B", Triple("g.streamer", "Streamer", "📺") to "#9146FF", Triple("g.reader", "Reader", "📚") to "#B68D5E",
            Triple("g.coder", "Coder", "💻") to "#5CC8A8", Triple("g.photo", "Photographer", "📷") to "#8FB4D9", Triple("g.coffee", "Coffee", "☕") to "#A9784F",
            Triple("g.early_riser", "Early riser", "🌅") to "#F5A25D", Triple("g.diamond", "Diamond", "💠") to "#5BD1F0", Triple("g.rocket", "Rocket", "🚀") to "#7AA2F7",
            Triple("g.clover", "Clover", "🍀") to "#5CC46A", Triple("g.skull", "Skull", "💀") to "#C9CDD6", Triple("g.ghost", "Ghost", "👻") to "#B8A9E8",
            Triple("g.cat", "Cat", "🐱") to "#F2B36B", Triple("g.dog", "Dog", "🐶") to "#C99A6B", Triple("g.pizza", "Pizza", "🍕") to "#E8744F",
            Triple("g.rainbow", "Rainbow", "🌈") to "#F28DB2", Triple("g.sparkles", "Sparkles", "✨") to "#F5DC7A", Triple("g.lightning", "Lightning", "⚡") to "#F5D547",
            Triple("g.trophy", "Trophy", "🏆") to "#E8B04A", Triple("g.matrix", "Matrix", "🟩") to "#2FBF71", Triple("g.linux", "Linux", "🐧") to "#E8E8E8",
            Triple("g.apple", "Apple", "🍎") to "#E5604D", Triple("g.opensource", "Open source", "🔓") to "#6FCF97",
        ).map { (t, color) -> DiddyBadge(t.first, t.second, t.third, null, color.lowercase()) }

        /** `sanitizeBadgeDef` of desktop. */
        fun fromContent(id: String, content: Map<String, Any?>): DiddyBadge? {
            val name = DiddyProfile.text(content["name"], 32) ?: return null
            return DiddyBadge(id, name, DiddyProfile.text(content["emoji"], 8), DiddyProfile.mxc(content["imageMxc"]), DiddyProfile.color(content["color"]))
        }
    }
}

/** One version of a key, from a state event or a message-mode event. `sender` is authenticated. */
class DiddyCandidate(val content: Map<String, Any?>, val ts: Long, val sender: String)

/**
 * The trust rules for Diddy badge data (desktop `trust.ts`): Matrix proves who SENT an event,
 * nothing else, so every rule is built on the sender.
 */
object DiddyTrust {
    const val MAX_CUSTOM_DEFS_PER_SENDER = 25
    const val MAX_AWARDS_PER_SENDER = 200
    const val MAX_CUSTOM_DEFS = 300
    const val MAX_MESSAGES_PER_ROOM = 2000
    const val MESSAGE_TRIM_TARGET = 1800
    const val MAX_MESSAGES_PER_SENDER = 300

    /** The 11 character creator tag of owner-bound badge ids (`ownerTag`, cyrb53 over UTF-16 units). */
    fun ownerTag(userId: String): String {
        var h1 = 0xDEADBEEFL.toInt()
        var h2 = 0x41C6CE57
        for (unit in userId) {
            h1 = (h1 xor unit.code) * -1640531535 // 2654435761 as Int
            h2 = (h2 xor unit.code) * 1597334677
        }
        h1 = ((h1 xor (h1 ushr 16)) * -2048144789) xor ((h2 xor (h2 ushr 13)) * -1028477387)
        h2 = ((h2 xor (h2 ushr 16)) * -2048144789) xor ((h1 xor (h1 ushr 13)) * -1028477387)
        val hash = 4_294_967_296L * (2_097_151L and (h2.toLong() and 0xFFFFFFFFL)) + (h1.toLong() and 0xFFFFFFFFL)
        return java.lang.Long.toString(hash, 36).padStart(11, '0')
    }

    private val ownerTagPattern = Regex("c\\.([0-9a-z]{11})\\.[0-9a-z]+")

    fun badgeIdOwnerTag(id: String): String? = ownerTagPattern.matchEntire(id)?.groupValues?.get(1)

    /** `badgeId|userId`. */
    fun parseAwardKey(key: String): Pair<String, String>? {
        val bar = key.indexOf('|')
        if (bar <= 0) return null
        return key.substring(0, bar) to key.substring(bar + 1)
    }

    data class Award(val by: String, val at: Long, val ts: Long)

    private fun isAward(candidate: DiddyCandidate) = (candidate.content["by"] as? String)?.isNotEmpty() == true

    /** `content.at` may only make an award OLDER than its event, never newer. */
    fun awardTime(candidate: DiddyCandidate): Long {
        val number = candidate.content["at"] as? Number ?: return candidate.ts
        val at = number.toDouble()
        if (!at.isFinite() || at < 0) return candidate.ts
        return if (at >= candidate.ts) candidate.ts else at.toLong()
    }

    /** The awards of one badge for one recipient that are in force, one per giver. */
    fun resolveAwards(recipient: String, candidates: List<DiddyCandidate>): List<Award> {
        val newest = HashMap<String, DiddyCandidate>()
        for (candidate in candidates) {
            val known = newest[candidate.sender]
            if (known == null || candidate.ts > known.ts || (candidate.ts == known.ts && isAward(known) && !isAward(candidate))) {
                newest[candidate.sender] = candidate
            }
        }
        val recipientRemoved = newest[recipient]?.let { if (isAward(it)) null else it.ts }
        val result = mutableListOf<Award>()
        for (candidate in newest.values) {
            if (!isAward(candidate)) continue
            val at = awardTime(candidate)
            if (recipientRemoved != null && recipientRemoved >= at) continue
            result += Award(candidate.sender, at, candidate.ts)
        }
        return result
    }

    /** `pickDefinition`: the owner's newest version counts; an invalid (empty) one deletes it. */
    fun pickDefinition(id: String, candidates: List<DiddyCandidate>, isValid: (DiddyCandidate) -> Boolean): DiddyCandidate? {
        val tag = badgeIdOwnerTag(id)
        val possible = candidates.filter { tag == null || ownerTag(it.sender) == tag }.sortedBy { it.ts }
        val owner = if (tag == null) possible.firstOrNull(isValid)?.sender else null
        val ofOwner = if (tag == null) possible.filter { it.sender == owner } else possible
        val newest = ofOwner.lastOrNull() ?: return null
        return if (isValid(newest)) newest else null
    }

    fun <T> capPerSender(items: List<T>, sender: (T) -> String, ts: (T) -> Long, max: Int): List<T> =
        items.groupBy(sender).values.flatMap { group -> group.sortedByDescending(ts).take(max) }

    /** Keeps the message-mode data of one room small like desktop's cache. */
    fun <T> trimMessages(items: List<T>, sender: (T) -> String, ts: (T) -> Long): List<T> {
        if (items.size <= MAX_MESSAGES_PER_ROOM) return items
        val perSender = HashMap<String, Int>()
        val kept = items.sortedByDescending(ts).filter { item ->
            val who = sender(item)
            val count = (perSender[who] ?: 0) + 1
            perSender[who] = count
            count <= MAX_MESSAGES_PER_SENDER
        }
        return if (kept.size > MAX_MESSAGES_PER_ROOM) kept.take(MESSAGE_TRIM_TARGET) else kept
    }
}

/** Which rooms carry the Diddy options marker, remembered on the device. A "no" for a week. */
object DiddyMarkerChecks {
    const val NO_LIFETIME_MS = 7L * 24 * 3600 * 1000
    const val MAX_ENTRIES = 2000

    private fun key(accountId: String) = "diddy.markerChecks.$accountId"

    fun load(accountId: String, now: Long = System.currentTimeMillis()): Pair<Set<String>, Set<String>> {
        val entries = Json.obj(Prefs.string(key(accountId))) ?: return emptySet<String>() to emptySet()
        val options = mutableSetOf<String>()
        val checked = mutableSetOf<String>()
        for ((roomId, raw) in entries) {
            val entry = raw.obj() ?: continue
            if (entry["options"].bool() == true) {
                options += roomId
                checked += roomId
            } else if (now - ((entry["at"].double() ?: 0.0) * 1000).toLong() < NO_LIFETIME_MS) {
                checked += roomId
            }
        }
        return options to checked
    }

    fun remember(answers: List<Pair<String, Boolean>>, accountId: String, now: Long = System.currentTimeMillis()) {
        val entries = (Json.obj(Prefs.string(key(accountId))) ?: emptyMap()).toMutableMap()
        for ((roomId, isOptions) in answers) entries[roomId] = mapOf("options" to isOptions, "at" to now / 1000.0)
        if (entries.size > MAX_ENTRIES) {
            val drop = entries.filter { it.value.obj()?.get("options").bool() != true }
                .entries.sortedBy { it.value.obj()?.get("at").double() ?: 0.0 }.take(entries.size - MAX_ENTRIES)
            drop.forEach { entries.remove(it.key) }
        }
        Prefs.setString(key(accountId), Json.encode(entries))
    }
}

/** `JSON.stringify(value).length` of desktop, from the parsed content. */
object DiddyJsonSize {
    fun length(value: Any?): Int? = when (value) {
        null -> 4
        is String -> quotedLength(value)
        is Boolean -> if (value) 4 else 5
        is Number -> javaScriptNumber(value.toDouble())?.length
        is Map<*, *> -> {
            var total = 2 + maxOf(0, value.size - 1)
            for ((key, item) in value) {
                val size = length(item) ?: return null
                total += quotedLength(key.toString()) + 1 + size
            }
            total
        }
        is List<*> -> {
            var total = 2 + maxOf(0, value.size - 1)
            for (item in value) total += length(item) ?: return null
            total
        }
        else -> null
    }

    fun quotedLength(text: String): Int {
        var total = 2
        for (unit in text) {
            total += when (unit.code) {
                0x22, 0x5C, 0x08, 0x0C, 0x0A, 0x0D, 0x09 -> 2
                in 0 until 0x20 -> 6
                else -> 1
            }
        }
        return total
    }

    /** `String(n)` of JavaScript: shortest round-trip digits, plain from 1e-6 up to below 1e21. */
    fun javaScriptNumber(value: Double): String? {
        if (!value.isFinite()) return null
        if (value == 0.0) return "0"
        val sign = if (value < 0) "-" else ""
        val plain = BigDecimal(Math.abs(value).toString()).stripTrailingZeros()
        var digits = plain.unscaledValue().toString()
        // value = 0.digits * 10^point
        var point = digits.length - plain.scale()
        digits = digits.trimEnd('0').ifEmpty { "0" }
        val k = digits.length
        val body = when {
            point in k..21 -> digits + "0".repeat(point - k)
            point in 1..21 -> digits.substring(0, point) + "." + digits.substring(point)
            point in -5..0 -> "0." + "0".repeat(-point) + digits
            else -> {
                val e = point - 1
                val head = if (k == 1) digits else digits.substring(0, 1) + "." + digits.substring(1)
                head + "e" + (if (e < 0) "-" else "+") + Math.abs(e)
            }
        }
        return sign + body
    }
}

/** Values checked exactly like desktop's `sanitize.ts`. */
object DiddySanitize {
    fun number(value: Any?): Double? {
        if (value !is Number) return null
        val d = value.toDouble()
        return if (d.isFinite()) d else null
    }

    fun clamp(value: Double, low: Double, high: Double) = value.coerceIn(low, high)

    fun mxc(value: Any?): String? {
        val raw = value as? String ?: return null
        if (raw.length > 512 || !raw.startsWith("mxc://")) return null
        val rest = raw.substring(6)
        val slash = rest.indexOf('/')
        if (slash <= 0 || slash == rest.length - 1) return null
        val server = rest.substring(0, slash)
        val media = rest.substring(slash + 1)
        if (!server.all { it.isAsciiAlnum() || it in ".-:[]" }) return null
        if (!media.all { it.isAsciiAlnum() || it == '_' || it == '-' }) return null
        return raw
    }

    private fun Char.isAsciiAlnum() = this in '0'..'9' || this in 'A'..'Z' || this in 'a'..'z'

    /** `safeVersion`: `1.5.4` or `1.5.4-beta.1`. */
    fun version(value: Any?): String? {
        val raw = value as? String ?: return null
        if (raw.length > 40) return null
        return if (Regex("""^\d{1,4}\.\d{1,4}\.\d{1,4}(-[0-9A-Za-z.]{1,24})?$""").matches(raw)) raw else null
    }
}

/** Which part of a picture shows: focal point in percent and a zoom of 1 (cover) to 3. */
data class DiddyImagePos(val x: Double = 50.0, val y: Double = 50.0, val zoom: Double = 1.0) {
    fun toJson(): Map<String, Any?> = mapOf("x" to x, "y" to y, "zoom" to zoom)

    companion object {
        fun parse(raw: Any?): DiddyImagePos? {
            val dict = raw.obj() ?: return null
            val x = DiddySanitize.number(dict["x"]) ?: return null
            val y = DiddySanitize.number(dict["y"]) ?: return null
            val zoom = DiddySanitize.number(dict["zoom"]) ?: return null
            return DiddyImagePos(x.coerceIn(0.0, 100.0), y.coerceIn(0.0, 100.0), zoom.coerceIn(1.0, 3.0))
        }
    }
}
