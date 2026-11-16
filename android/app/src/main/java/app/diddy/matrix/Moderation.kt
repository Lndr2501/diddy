package app.diddy.matrix

import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.str

/**
 * Who may do what to whom in a room, from its `m.room.power_levels` content (the rules of the
 * desktop's member menu and ios RoomModerationViews). Room creators (v12 rooms) count as above everyone.
 */
data class PowerLevels(val content: Map<String, Any?>, val creators: Set<String> = emptySet()) {
    private val users: Map<String, Any?> get() = content["users"].obj() ?: emptyMap()

    fun user(userId: String): Long =
        if (userId in creators) Long.MAX_VALUE else users[userId].long() ?: content["users_default"].long() ?: 0

    private fun level(key: String, fallback: Long): Long = content[key].long() ?: fallback

    val kick: Long get() = level("kick", 50)
    val ban: Long get() = level("ban", 50)
    val invite: Long get() = level("invite", 0)
    val redact: Long get() = level("redact", 50)

    fun state(type: String): Long = content["events"].obj()?.get(type).long() ?: level("state_default", 50)

    fun canInvite(me: String) = user(me) >= invite

    /** Kick and ban need the action's level and more power than the target. */
    fun canKick(me: String, target: String) = me != target && user(me) >= kick && user(me) > user(target)
    fun canBan(me: String, target: String) = me != target && user(me) >= ban && user(me) > user(target)
    fun canUnban(me: String) = user(me) >= ban && user(me) >= kick

    /** A role can be changed by someone allowed to send power levels with more power than the target (or yourself). */
    fun canChangeRole(me: String, target: String): Boolean {
        if (target in creators) return false
        val mine = user(me)
        if (mine < state("m.room.power_levels")) return false
        return me == target || mine > user(target)
    }

    /** The levels someone may hand out: never more than their own. */
    fun assignable(me: String): List<Long> = ROLES.map { it.first }.filter { it <= user(me) }

    /** The new content with one user's level set (and removed again when it is the default). */
    fun withUser(userId: String, power: Long): Map<String, Any?> {
        val updated = users.toMutableMap()
        if (power == (content["users_default"].long() ?: 0)) updated.remove(userId) else updated[userId] = power
        return content.toMutableMap().also { it["users"] = updated }
    }

    companion object {
        /** The roles desktop offers, with their levels. */
        val ROLES = listOf(0L to "Member", 50L to "Moderator", 100L to "Admin")

        fun roleName(power: Long): String = when {
            power == Long.MAX_VALUE -> "Owner"
            power >= 100 -> "Admin"
            power >= 50 -> "Moderator"
            power > 0 -> "Custom ($power)"
            else -> "Member"
        }

        /** v12 rooms: the creator and `additional_creators` from the create event. */
        fun creators(createEvent: Map<String, Any?>?, roomVersion: String?): Set<String> {
            val version = roomVersion?.toIntOrNull() ?: return emptySet()
            if (version < 12 || createEvent == null) return emptySet()
            val result = mutableSetOf<String>()
            createEvent["sender"].str()?.let { result += it }
            (createEvent["content"].obj()?.get("additional_creators") as? List<*>)?.forEach { (it as? String)?.let(result::add) }
            return result
        }
    }
}

/** Loads a room's power levels with the creators of v12 rooms. */
suspend fun MatrixAccount.powerLevels(roomId: String): PowerLevels {
    val content = stateContent(roomId, "m.room.power_levels", "")
    val create = runCatching { stateContent(roomId, "m.room.create", "") }.getOrNull()
    val version = create?.get("room_version").str() ?: "1"
    // The single-event endpoint returns only the content; the creator is the create event's sender.
    val creators = if ((version.toIntOrNull() ?: 0) >= 12) {
        val events = runCatching { clientRequestArray("/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}/state") }.getOrNull()
        PowerLevels.creators(events?.firstOrNull { it["type"].str() == "m.room.create" }, version)
    } else emptySet()
    return PowerLevels(content, creators)
}

suspend fun MatrixAccount.setPowerLevel(roomId: String, userId: String, power: Long) {
    val levels = powerLevels(roomId)
    clientRequest(
        "/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}/state/m.room.power_levels/",
        levels.withUser(userId, power),
        "PUT",
    )
}
