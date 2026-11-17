package app.diddy.matrix

import kotlin.math.floor

/**
 * Automatic message deletion per room (#245): the standard `m.room.retention` state event
 * (MSC1763). The homeserver purges expired messages; the app hides them right away, because the
 * server only purges every few minutes. Same rules and cases as desktop `utils/retention.ts` and
 * iOS `RoomRetention.swift` (docs/fixtures/retention.json).
 */
object RoomRetention {
    const val EVENT_TYPE = "m.room.retention"

    private const val MINUTE = 60_000L
    private const val HOUR = 60 * MINUTE
    private const val DAY = 24 * HOUR

    /** The lifetimes the room settings offer; the server allows 1 hour to 365 days. */
    val choices: List<Long> = listOf(HOUR, DAY, 7 * DAY, 30 * DAY)

    /** How long messages stay in the room (ms), or null when the room keeps its history. */
    fun lifetime(content: Map<String, Any?>?): Long? {
        val value = content?.get("max_lifetime") as? Number ?: return null
        val number = value.toDouble()
        if (number.isNaN() || number.isInfinite()) return null
        val lifetime = floor(number).toLong()
        return if (lifetime > 0) lifetime else null
    }

    /** The state event content for a choice; an empty content turns automatic deletion off. */
    fun content(lifetime: Long?): Map<String, Any?> = if (lifetime != null) mapOf("max_lifetime" to lifetime) else emptyMap()

    /** Whether a message sent at [ts] (ms) is past the lifetime. Unknown times never expire. */
    fun isExpired(ts: Long, lifetime: Long?, now: Long): Boolean = lifetime != null && ts > 0 && now - ts >= lifetime

    enum class Unit(val raw: String) { DAYS("days"), HOURS("hours"), MINUTES("minutes") }

    /** A lifetime in whole days or hours where possible, otherwise in (rounded up) minutes. */
    fun label(lifetime: Long): Pair<Unit, Long> = when {
        lifetime % DAY == 0L -> Unit.DAYS to lifetime / DAY
        lifetime % HOUR == 0L -> Unit.HOURS to lifetime / HOUR
        else -> Unit.MINUTES to (lifetime + MINUTE - 1) / MINUTE
    }

    /** "1 hour", "7 days" ... (the Android app is in English). */
    fun duration(lifetime: Long): String {
        val (unit, count) = label(lifetime)
        val word = when (unit) {
            Unit.DAYS -> "day"
            Unit.HOURS -> "hour"
            Unit.MINUTES -> "minute"
        }
        return "$count $word" + if (count == 1L) "" else "s"
    }
}
