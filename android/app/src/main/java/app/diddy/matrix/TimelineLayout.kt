package app.diddy.matrix

import java.util.Calendar
import java.util.Date

/**
 * How the chat lays out its rows: which messages start a new group (avatar, name and time) and
 * which membership changes are left out (ios TimelineLayout.swift).
 */
object TimelineLayout {
    /** Discord groups messages of one sender that follow within this time. */
    const val GROUP_WINDOW_MS = 7 * 60 * 1000L
    /** How long after a direct message was created its joins and invites count as setup. */
    const val DIRECT_SETUP_WINDOW_MS = 10 * 60 * 1000L

    enum class Kind { MESSAGE, NOTICE }

    data class Entry(
        val sender: String,
        val date: Date,
        val kind: Kind,
        val isReply: Boolean = false,
        val hasDayDivider: Boolean = false,
    )

    /** Whether `current` joins the group of the row above it, which hides its avatar and name. */
    fun continuesGroup(current: Entry, previous: Entry?): Boolean {
        if (previous == null) return false
        if (current.kind != Kind.MESSAGE || previous.kind != Kind.MESSAGE) return false
        if (current.hasDayDivider || current.isReply || previous.sender != current.sender) return false
        return current.date.time - previous.date.time < GROUP_WINDOW_MS
    }

    /** Whether a call line is folded into the call line right above it ("3 calls"). */
    fun joinsCallRun(isCall: Boolean, previousIsCall: Boolean, hasDayDivider: Boolean): Boolean =
        isCall && previousIsCall && !hasDayDivider

    fun callText(starter: String, count: Int): String = if (count > 1) "$count calls" else "$starter started a call"

    enum class Day { TODAY, YESTERDAY, EARLIER }

    fun day(date: Date, now: Date = Date()): Day {
        if (sameDay(date, now)) return Day.TODAY
        val yesterday = Calendar.getInstance().apply { time = now; add(Calendar.DAY_OF_YEAR, -1) }.time
        if (sameDay(date, yesterday)) return Day.YESTERDAY
        return Day.EARLIER
    }

    fun sameDay(a: Date, b: Date): Boolean {
        val ca = Calendar.getInstance().apply { time = a }
        val cb = Calendar.getInstance().apply { time = b }
        return ca.get(Calendar.YEAR) == cb.get(Calendar.YEAR) && ca.get(Calendar.DAY_OF_YEAR) == cb.get(Calendar.DAY_OF_YEAR)
    }

    /** The changes the chat writes a line for (others, like profile edits, are left out). */
    enum class Membership {
        JOINED, INVITED, LEFT, REMOVED, BANNED, UNBANNED, DECLINED;

        fun text(name: String): String = when (this) {
            JOINED -> "$name joined"
            INVITED -> "$name was invited"
            LEFT -> "$name left"
            REMOVED -> "$name was removed"
            BANNED -> "$name was banned"
            UNBANNED -> "$name was unbanned"
            DECLINED -> "$name declined the invite"
        }

        val isDeparture: Boolean get() = this == LEFT || this == REMOVED || this == BANNED || this == DECLINED
    }

    sealed class Item {
        data class Message(val date: Date) : Item()
        data class MembershipChange(val change: Membership, val date: Date) : Item()
        data class Other(val date: Date) : Item()
    }

    /**
     * Indices of the membership lines that only set up a direct message. Hidden are joins and
     * invites before anyone left, made before the first message or within the setup window of the
     * creation. Without `createdAt` nothing is hidden.
     */
    fun hiddenSetupLines(items: List<Item>, isDirect: Boolean, createdAt: Date?): Set<Int> {
        if (!isDirect || createdAt == null) return emptySet()
        val hidden = mutableSetOf<Int>()
        var seenMessage = false
        var someoneLeft = false
        items.forEachIndexed { index, item ->
            when (item) {
                is Item.Message -> seenMessage = true
                is Item.MembershipChange -> {
                    if (item.change.isDeparture) {
                        someoneLeft = true
                        return@forEachIndexed
                    }
                    if (someoneLeft || (item.change != Membership.JOINED && item.change != Membership.INVITED)) return@forEachIndexed
                    if (!seenMessage || item.date.time - createdAt.time <= DIRECT_SETUP_WINDOW_MS) hidden += index
                }
                is Item.Other -> {}
            }
        }
        return hidden
    }
}
