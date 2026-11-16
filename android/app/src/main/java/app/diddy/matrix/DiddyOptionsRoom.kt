package app.diddy.matrix

import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.util.DiddyError
import app.diddy.util.Http
import app.diddy.util.Json
import app.diddy.util.friendlyMessage
import app.diddy.util.int
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import app.diddy.util.strings
import kotlinx.coroutines.delay
import java.net.URLEncoder

/**
 * How the hidden "Diddy Options" room is set up, as desktop does it (`optionsRoom.ts`,
 * `badgePower.ts`, `discover.ts`; ios DiddyOptionsRoomLogic.swift).
 */
object DiddyOptionsRoomLogic {
    const val ROOM_NAME = "Diddy Options"
    const val BADGE_STATE_LEVEL = 100
    val badgeEventTypes = listOf(DiddyEvents.BADGE, DiddyEvents.AWARD)

    val roomTopic: String get() = "Used by Diddy clients to share profiles and badges. Please do not rename or delete. ${DiddyEvents.TOPIC_TAG}"

    fun createPowerLevels(): Map<String, Any?> = mapOf(
        "events" to mapOf(
            DiddyEvents.PROFILE to 0,
            DiddyEvents.BADGE to BADGE_STATE_LEVEL,
            DiddyEvents.AWARD to BADGE_STATE_LEVEL,
            DiddyEvents.MARKER to 100,
            "m.room.name" to 100,
        ),
    )

    fun createRoomBody(name: String, spaceId: String?, serverName: String): Map<String, Any?> {
        val trimmed = name.trim()
        val state = mutableListOf<Map<String, Any?>>(mapOf("type" to DiddyEvents.MARKER, "state_key" to "", "content" to mapOf("v" to 1)))
        if (!spaceId.isNullOrEmpty()) {
            state += mapOf("type" to "m.space.parent", "state_key" to spaceId, "content" to mapOf("via" to listOf(serverName), "canonical" to true))
            state += mapOf(
                "type" to "m.room.join_rules", "state_key" to "",
                "content" to mapOf("join_rule" to "restricted", "allow" to listOf(mapOf("type" to "m.room_membership", "room_id" to spaceId))),
            )
        }
        return mapOf(
            "name" to trimmed.ifEmpty { ROOM_NAME },
            "topic" to roomTopic,
            "visibility" to "private",
            "preset" to "private_chat",
            "initial_state" to state,
            "power_level_content_override" to createPowerLevels(),
        )
    }

    fun spaceChildContent(serverName: String): Map<String, Any?> = mapOf("via" to listOf(serverName), "suggested" to false)

    private fun number(value: Any?): Int? {
        val d = (value as? Number)?.toDouble() ?: return null
        return if (d.isFinite()) d.coerceIn(-1e9, 1e9).toInt() else null
    }

    fun stateLevel(type: String, powerLevels: Map<String, Any?>): Int =
        number(powerLevels["events"].obj()?.get(type)) ?: number(powerLevels["state_default"]) ?: 50

    fun badgeStateOpenToMembers(powerLevels: Map<String, Any?>): Boolean {
        val member = number(powerLevels["users_default"]) ?: 0
        return badgeEventTypes.any { stateLevel(it, powerLevels) <= member }
    }

    fun hardenedPowerLevels(powerLevels: Map<String, Any?>): Map<String, Any?>? {
        if (badgeEventTypes.all { stateLevel(it, powerLevels) >= BADGE_STATE_LEVEL }) return null
        val events = (powerLevels["events"].obj() ?: emptyMap()).toMutableMap()
        for (type in badgeEventTypes) events[type] = maxOf(stateLevel(type, powerLevels), BADGE_STATE_LEVEL)
        return powerLevels + ("events" to events)
    }

    fun adoptedPowerLevels(powerLevels: Map<String, Any?>): Map<String, Any?> {
        val events = (powerLevels["events"].obj() ?: emptyMap()).toMutableMap()
        events[DiddyEvents.PROFILE] = 0
        events[DiddyEvents.BADGE] = BADGE_STATE_LEVEL
        events[DiddyEvents.AWARD] = BADGE_STATE_LEVEL
        return powerLevels + ("events" to events)
    }

    fun taggedTopic(topic: String): String? =
        if (topic.contains(DiddyEvents.TOPIC_TAG)) null else "$topic ${DiddyEvents.TOPIC_TAG}".trim()

    fun looksLikeDiddyRoom(name: String?, topic: String?): Boolean =
        (name ?: "").trim() == ROOM_NAME || (topic ?: "").contains(DiddyEvents.TOPIC_TAG)

    data class HierarchyRoom(val roomId: String, val name: String?, val topic: String?)

    fun joinCandidate(rooms: List<HierarchyRoom>, spaceId: String, membership: (String) -> String?, leftOnPurpose: (String) -> Boolean): HierarchyRoom? =
        rooms.firstOrNull { room ->
            if (room.roomId == spaceId || !looksLikeDiddyRoom(room.name, room.topic)) return@firstOrNull false
            val state = membership(room.roomId)
            if (state == "join" || state == "ban") return@firstOrNull false
            !leftOnPurpose(room.roomId)
        }

    /** Desktop's order (`a.roomId.localeCompare(b.roomId)`), so the same room wins and gets your writes. */
    fun sortedLikeDesktop(roomIds: Iterable<String>): List<String> = roomIds.sortedWith { a, b ->
        when {
            isOrderedLikeDesktop(a, b) -> -1
            isOrderedLikeDesktop(b, a) -> 1
            else -> 0
        }
    }

    /** `a.localeCompare(b) < 0` of the ICU root collation for the characters of room ids. */
    fun isOrderedLikeDesktop(a: String, b: String): Boolean {
        for (i in 0 until minOf(a.length, b.length)) {
            val x = primaryWeight(a[i])
            val y = primaryWeight(b[i])
            if (x != y) return x < y
        }
        if (a.length != b.length) return a.length < b.length
        for (i in a.indices) if (a[i] != b[i]) return b[i] in 'A'..'Z'
        return false
    }

    private val asciiOrder: Map<Char, Int> = run {
        val punctuation = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"
        val order = HashMap<Char, Int>()
        (punctuation + "0123456789").forEachIndexed { index, c -> order[c] = index }
        val letters = punctuation.length + 10
        "abcdefghijklmnopqrstuvwxyz".forEachIndexed { index, c ->
            order[c] = letters + index
            order[c.uppercaseChar()] = letters + index
        }
        order
    }

    private fun primaryWeight(c: Char): Int = asciiOrder[c] ?: (1000 + c.code)

    fun viaServers(roomId: String, childVia: List<String>?): List<String> {
        if (!childVia.isNullOrEmpty()) return childVia
        val parts = roomId.split(":", limit = 2)
        return if (parts.size == 2 && parts[1].isNotEmpty()) listOf(parts[1]) else emptyList()
    }
}

/** A room that can become, or already is, the Diddy Options room. */
data class DiddyRoomChoice(
    val id: String,
    val name: String,
    val joined: Boolean,
    val spaceName: String?,
    val looksLikeDiddy: Boolean,
    val via: List<String>,
)

/** Rooms used as options room in message mode (desktop's `diddyLightRooms`), per account. */
object DiddyLightRooms {
    private fun key(accountId: String) = "diddy.lightOptionsRooms.$accountId"

    fun ids(accountId: String): Set<String> = Json.arr(Prefs.string(key(accountId)))?.mapNotNull { it as? String }?.toSet() ?: emptySet()

    fun add(roomId: String, accountId: String) = Prefs.setString(key(accountId), Json.encode((ids(accountId) + roomId).sorted()))

    fun remove(roomId: String, accountId: String) = Prefs.setString(key(accountId), Json.encode((ids(accountId) - roomId).sorted()))
}

val MatrixAccount.diddyLightRoomIds: Set<String> get() = DiddyLightRooms.ids(id)

private val MatrixAccount.homeServerName: String get() = runCatching { client.userIdServerName() }.getOrDefault(record.serverName)

/** The rooms to pick from: your own, and the ones inside your servers you have not joined yet. */
suspend fun MatrixAccount.diddyRoomChoices(): List<DiddyRoomChoice> {
    val out = mutableListOf<DiddyRoomChoice>()
    val seen = mutableSetOf<String>()
    for (room in rooms.filter { it.isJoined && !it.isSpace && !it.isDirect }) {
        val marked = room.id in diddyOptionsRooms || DiddyOptionsRoomLogic.looksLikeDiddyRoom(room.name, room.topic)
        out += DiddyRoomChoice(room.id, room.name, true, null, marked, emptyList())
        seen += room.id
    }
    val joinedIds = rooms.filter { it.isJoined }.map { it.id }.toSet()
    for (space in spaces) {
        for ((room, via) in hierarchyRooms(space.roomId)) {
            if (room.roomId in joinedIds || room.roomId in seen) continue
            seen += room.roomId
            out += DiddyRoomChoice(room.roomId, room.name ?: room.roomId, false, space.displayName,
                DiddyOptionsRoomLogic.looksLikeDiddyRoom(room.name, room.topic), via)
        }
    }
    return out.sortedBy { it.name.lowercase() }
}

private suspend fun MatrixAccount.hierarchyRooms(spaceId: String): List<Pair<DiddyOptionsRoomLogic.HierarchyRoom, List<String>>> {
    val out = mutableListOf<DiddyOptionsRoomLogic.HierarchyRoom>()
    val childVia = HashMap<String, List<String>>()
    var token: String? = null
    for (page in 0 until 3) {
        var path = "/_matrix/client/v1/rooms/${MatrixAccount.pathComponent(spaceId)}/hierarchy?limit=100&max_depth=1"
        token?.let { path += "&from=" + URLEncoder.encode(it, "UTF-8") }
        val json = try { clientRequest(path) } catch (_: Exception) { break }
        for (entry in json["rooms"].objectsLenient()) {
            val roomId = entry["room_id"].str() ?: continue
            if (roomId == spaceId) {
                for (child in entry["children_state"].objectsLenient()) {
                    val key = child["state_key"].str() ?: continue
                    val via = child["content"].obj()?.get("via").strings() ?: continue
                    if (via.isNotEmpty()) childVia[key] = via
                }
                continue
            }
            if (entry["room_type"].str() == "m.space") continue
            out += DiddyOptionsRoomLogic.HierarchyRoom(roomId, entry["name"].str() ?: entry["canonical_alias"].str(), entry["topic"].str())
        }
        token = json["next_batch"].str() ?: break
    }
    return out.map { it to DiddyOptionsRoomLogic.viaServers(it.roomId, childVia[it.roomId]) }
}

/** Creates the hidden room; with a space every member of the space can join it. */
suspend fun MatrixAccount.createDiddyOptionsRoom(name: String, spaceId: String?) {
    val domain = homeServerName
    val json = try {
        clientRequest("/_matrix/client/v3/createRoom", DiddyOptionsRoomLogic.createRoomBody(name, spaceId, domain))
    } catch (e: Exception) {
        throw DiddyError("Could not create the room: ${e.friendlyMessage}")
    }
    val roomId = json["room_id"].str() ?: throw DiddyError("The server could not create the room.")
    if (!spaceId.isNullOrEmpty()) {
        try {
            clientRequest(
                "/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(spaceId)}/state/m.space.child/${MatrixAccount.pathComponent(roomId)}",
                DiddyOptionsRoomLogic.spaceChildContent(domain), "PUT",
            )
        } catch (_: Exception) {}
    }
    registerDiddyRoom(roomId)
}

/** Turns a room into the options room. Needs permission to change the room's settings. */
suspend fun MatrixAccount.adoptRoomAsDiddyOptions(roomId: String, via: List<String> = emptyList(), tagTopic: Boolean) {
    joinForDiddy(roomId, via)
    val base = "/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}"
    var current: Map<String, Any?>? = null
    for (attempt in 0 until 10) {
        current = try { clientRequest("$base/state/m.room.power_levels") } catch (_: Exception) { null }
        if (current != null) break
        delay(500)
    }
    val levels = current ?: throw DiddyError("Could not read this room's permissions yet. Try again in a moment.")
    try {
        clientRequest("$base/state/m.room.power_levels", DiddyOptionsRoomLogic.adoptedPowerLevels(levels), "PUT")
        clientRequest("$base/state/${DiddyEvents.MARKER}", mapOf("v" to 1), "PUT")
    } catch (e: Exception) {
        throw DiddyError("Could not use this room: you need permission to change its settings. (${e.friendlyMessage})")
    }
    if (tagTopic) {
        val topic = try { clientRequest("$base/state/m.room.topic")["topic"].str() ?: "" } catch (_: Exception) { "" }
        DiddyOptionsRoomLogic.taggedTopic(topic)?.let { tagged ->
            try { clientRequest("$base/state/m.room.topic", mapOf("topic" to tagged), "PUT") } catch (_: Exception) {}
        }
    }
    DiddyLightRooms.remove(roomId, id)
    registerDiddyRoom(roomId)
}

/** Uses a room in message mode: no admin rights needed. */
suspend fun MatrixAccount.useDiddyRoomWithoutAdmin(roomId: String, via: List<String> = emptyList()) {
    joinForDiddy(roomId, via)
    DiddyLightRooms.add(roomId, id)
    registerDiddyRoom(roomId)
}

/** Joins an options room of a server and connects it (onboarding's `joinAndConnect`). */
suspend fun MatrixAccount.connectDiddyRoom(roomId: String, via: List<String>) {
    joinForDiddy(roomId, via)
    var marked = roomId in diddyOptionsRooms
    if (!marked) marked = hasDiddyMarker(roomId)
    if (marked) {
        diddyOptionsRooms += roomId
        registerDiddyRoom(roomId)
        return
    }
    try {
        adoptRoomAsDiddyOptions(roomId, emptyList(), false)
    } catch (_: Exception) {
        DiddyLightRooms.add(roomId, id)
        registerDiddyRoom(roomId)
    }
}

suspend fun MatrixAccount.findDiddyRoom(spaceId: String): DiddyRoomChoice? {
    val left = Json.arr(Prefs.string("diddyLeftOptionsRooms"))?.mapNotNull { it as? String }?.toSet() ?: emptySet()
    val found = hierarchyRooms(spaceId)
    val joined = rooms.filter { it.isJoined }.map { it.id }.toSet()
    val pick = DiddyOptionsRoomLogic.joinCandidate(found.map { it.first }, spaceId, { if (it in joined) "join" else null }, { it in left }) ?: return null
    val entry = found.firstOrNull { it.first.roomId == pick.roomId } ?: return null
    return DiddyRoomChoice(pick.roomId, pick.name ?: pick.roomId, false, spaces.firstOrNull { it.roomId == spaceId }?.displayName, true, entry.second)
}

/** Joins the options room of your servers when you have none yet, at most every ten minutes. */
suspend fun MatrixAccount.joinDiddyOptionsRoomAutomatically() {
    if (diddyPrimaryRoom != null || diddyOptionsRooms.isNotEmpty() || diddyLightRoomIds.isNotEmpty() || spaces.isEmpty()) return
    val key = "diddyAutoJoinAt.$userId"
    val last = Prefs.double(key, 0.0)
    val now = System.currentTimeMillis() / 1000.0
    if (last > 0 && now - last < 600) return
    Prefs.setDouble(key, now)
    for (space in spaces) {
        val choice = findDiddyRoom(space.roomId) ?: continue
        try {
            connectDiddyRoom(choice.id, choice.via)
            return
        } catch (e: Exception) {
            DiagLog.write("diddy: joining the options room of a server failed: ${e.friendlyMessage}")
        }
    }
}

private suspend fun MatrixAccount.hasDiddyMarker(roomId: String): Boolean = try {
    clientRequest("/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}/state/${DiddyEvents.MARKER}/")
    true
} catch (_: Exception) {
    false
}

private suspend fun MatrixAccount.joinForDiddy(roomId: String, via: List<String>) {
    if (rooms.any { it.id == roomId && it.isJoined }) return
    try {
        client.joinRoomByIdOrAlias(roomId, via)
    } catch (e: Exception) {
        throw DiddyError("Could not join the room. ${e.friendlyMessage}")
    }
    repeat(40) {
        if (rooms.any { it.id == roomId && it.isJoined }) return
        delay(500)
    }
    throw DiddyError("Joining the room takes too long. Try again in a moment.")
}

private suspend fun MatrixAccount.registerDiddyRoom(roomId: String) {
    for (attempt in 0 until 40) {
        if (rooms.any { it.id == roomId && it.isJoined }) break
        delay(250)
    }
    if (roomId !in DiddyLightRooms.ids(id)) diddyOptionsRooms += roomId
    diddyCheckedRooms += roomId
    reloadDiddyProfilesForWrite()
}

// MARK: - Badges (ios DiddyBadges.swift, DiddyBadgeLogic.swift)

object DiddyBadgeLogic {
    const val DEFAULT_COLOR = "#7AA2F7"
    const val MAX_EMOJI_CODE_POINTS = 6
    const val MAX_NAME_LENGTH = 32
    const val MAX_SHOWN = 4

    fun makeBadgeId(userId: String, now: Long, random: String): String =
        "c.${DiddyTrust.ownerTag(userId)}.${java.lang.Long.toString(maxOf(0, now), 36)}$random"

    fun randomSuffix(): String = Integer.toString((0 until 36 * 36 * 36 * 36).random(), 36).padStart(4, '0')

    fun awardKey(badgeId: String, userId: String) = "$badgeId|$userId"

    fun definitionContent(name: String, emoji: String, imageMxc: String?, color: String, createdBy: String): Map<String, Any?> {
        val out = linkedMapOf<String, Any?>("name" to name, "color" to color, "createdBy" to createdBy)
        if (imageMxc != null) out["imageMxc"] = imageMxc else out["emoji"] = emoji
        return out
    }

    fun awardContent(by: String, at: Long): Map<String, Any?> = mapOf("by" to by, "at" to at)

    fun emojiTooLong(emoji: String): Boolean = emoji.trim().codePointCount(0, emoji.trim().length) > MAX_EMOJI_CODE_POINTS

    fun normalizedColor(color: String?) = (color ?: "").trim().lowercase()

    fun canCreate(name: String, emoji: String, hasImage: Boolean, busy: Boolean): Boolean =
        name.isNotBlank() && (hasImage || (emoji.isNotBlank() && !emojiTooLong(emoji))) && !busy

    fun duplicate(name: String, emoji: String, hasImage: Boolean, color: String, library: List<DiddyBadge>): DiddyBadge? {
        val trimmedName = name.trim()
        val trimmedEmoji = emoji.trim()
        return library.firstOrNull { badge ->
            if (trimmedName.isNotEmpty() && badge.name.trim().lowercase() == trimmedName.lowercase()) return@firstOrNull true
            !hasImage && trimmedEmoji.isNotEmpty() && badge.emoji == trimmedEmoji && normalizedColor(badge.color) == normalizedColor(color)
        }
    }

    fun canDelete(badge: DiddyBadge, me: String) = !badge.isGlobal && badge.createdBy == me

    fun filtered(library: List<DiddyBadge>, query: String): List<DiddyBadge> {
        val needle = query.trim().lowercase()
        return if (needle.isEmpty()) library else library.filter { it.name.lowercase().contains(needle) }
    }

    fun authorLabel(badge: DiddyBadge, displayName: String?): String {
        if (badge.isGlobal) return "Built-in"
        val creator = badge.createdBy ?: return "by unknown"
        if (!displayName.isNullOrEmpty()) return "by $displayName"
        val local = creator.trimStart('@').split(":").firstOrNull() ?: ""
        return "by ${local.ifEmpty { creator }}"
    }
}

suspend fun MatrixAccount.createDiddyBadge(name: String, emoji: String, imageMxc: String?, color: String): String {
    requireDiddyRoom()
    val badgeId = DiddyBadgeLogic.makeBadgeId(userId, System.currentTimeMillis(), DiddyBadgeLogic.randomSuffix())
    writeDiddyData(DiddyEvents.BADGE, badgeId, DiddyBadgeLogic.definitionContent(name.trim(), emoji.trim(), imageMxc, color, userId))
    loadDiddyProfiles(force = true)
    return badgeId
}

suspend fun MatrixAccount.awardDiddyBadge(badgeId: String, recipient: String) {
    requireDiddyRoom()
    writeDiddyData(DiddyEvents.AWARD, DiddyBadgeLogic.awardKey(badgeId, recipient), DiddyBadgeLogic.awardContent(userId, System.currentTimeMillis()))
    loadDiddyProfiles(force = true)
}

suspend fun MatrixAccount.revokeDiddyBadge(badgeId: String, recipient: String) {
    requireDiddyRoom()
    writeDiddyData(DiddyEvents.AWARD, DiddyBadgeLogic.awardKey(badgeId, recipient), emptyMap())
    loadDiddyProfiles(force = true)
}

suspend fun MatrixAccount.deleteDiddyBadge(badge: DiddyBadge) {
    requireDiddyRoom()
    if (!DiddyBadgeLogic.canDelete(badge, userId)) throw DiddyError("Only the creator can delete this badge.")
    writeDiddyData(DiddyEvents.BADGE, badge.id, emptyMap())
    loadDiddyProfiles(force = true)
}

private fun MatrixAccount.requireDiddyRoom() {
    if (diddyPrimaryRoom == null) throw DiddyError("No Diddy Options room found.")
}

private val badgePowerChecked = mutableSetOf<String>()

/** Older options rooms let every member write badge state (#168); admins limit it once per room. */
suspend fun MatrixAccount.hardenDiddyBadgePower() {
    val joined = rooms.filter { it.isJoined }.map { it.id }.toSet()
    for (roomId in diddyOptionsRooms.filter { it in joined }.sorted()) {
        if (roomId in badgePowerChecked) continue
        badgePowerChecked += roomId
        val path = "/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}/state/m.room.power_levels"
        val levels = try { clientRequest(path) } catch (_: Exception) { continue }
        val next = DiddyOptionsRoomLogic.hardenedPowerLevels(levels) ?: continue
        try {
            clientRequest(path, next, "PUT")
            DiagLog.write("diddy: badge state limited to admins room=$roomId")
        } catch (e: Exception) {
            DiagLog.write("diddy: could not limit badge state room=$roomId: ${e.friendlyMessage}")
        }
    }
}

// MARK: - Profile media (ios DiddyProfileMedia.swift)

const val DIDDY_MEDIA_MAX_BYTES = 8 * 1024 * 1024

suspend fun MatrixAccount.diddyUploadLimit(): Int {
    for (path in listOf("/_matrix/client/v1/media/config", "/_matrix/media/v3/config")) {
        val json = try { clientRequest(path) } catch (_: Exception) { continue }
        val max = json["m.upload.size"].int()
        return if (max != null && max > 0) minOf(DIDDY_MEDIA_MAX_BYTES, max) else DIDDY_MEDIA_MAX_BYTES
    }
    return DIDDY_MEDIA_MAX_BYTES
}

/** Uploads profile media (public like avatars, not encrypted) and returns its mxc:// URI. */
suspend fun MatrixAccount.uploadDiddyMedia(data: ByteArray, mimeType: String, filename: String): String {
    val session = client.session()
    val base = session.homeserverUrl.trimEnd('/')
    val answer = Http.request(
        "$base/_matrix/media/v3/upload?filename=" + URLEncoder.encode(filename, "UTF-8"),
        method = "POST",
        body = data,
        contentType = mimeType,
        headers = mapOf("Authorization" to "Bearer ${session.accessToken}"),
    )
    val json = answer.json ?: emptyMap()
    val uri = json["content_uri"].str()
    if (answer.status != 200 || uri == null || DiddySanitize.mxc(uri) == null) throw DiddyError(json["error"].str() ?: "The upload failed.")
    return uri
}
