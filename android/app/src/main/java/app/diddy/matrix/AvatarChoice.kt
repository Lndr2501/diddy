package app.diddy.matrix

/** Which picture a room or person shows (ios/Diddy/Matrix/AvatarChoice.swift). */
object AvatarChoice {
    /**
     * An avatar URL worth loading: `avatar_url: ""` (some clients write it to remove a picture)
     * and blanks count as no picture, so a fallback can still apply.
     */
    fun usable(url: String?): String? = url?.trim()?.ifEmpty { null }

    /**
     * The picture of a room in the room list, in the desktop's order: a direct message with exactly
     * one other person shows that person's avatar, everything else the room's own `m.room.avatar`.
     */
    fun room(roomAvatar: String?, isDirect: Boolean, otherPeople: List<String?>): String? {
        if (isDirect && otherPeople.size == 1) usable(otherPeople[0])?.let { return it }
        return usable(roomAvatar)
    }

    /** Seconds to wait before the next attempt after a failed avatar download, or null to give up. */
    fun retryDelay(afterAttempt: Int): Long? = when (afterAttempt) {
        1 -> 2
        2 -> 8
        else -> null
    }
}
