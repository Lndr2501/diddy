package app.diddy.matrix

import app.diddy.util.DiddyError
import app.diddy.util.Json
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import org.matrix.rustcomponents.sdk.NotificationSettingsDelegate
import org.matrix.rustcomponents.sdk.ReceiptType
import org.matrix.rustcomponents.sdk.RoomNotificationMode
import kotlinx.coroutines.launch
import java.net.URLEncoder

// What the desktop app does with servers (spaces) beyond joining them (ios ServerManagement.swift)
// and the per-room menu actions (ios RoomPrefs.swift).

val MatrixAccount.ownServerName: String get() = runCatching { client.userIdServerName() }.getOrDefault(record.serverName)

private fun MatrixAccount.isKnownJoinedSpace(roomId: String): Boolean {
    if (spaces.any { it.roomId == roomId }) return true
    val summary = summary(roomId) ?: return false
    return summary.isSpace && summary.isJoined
}

/** Reads the layout desktop keeps and applies it to the servers you are in. */
suspend fun MatrixAccount.refreshRail() {
    val stored = runCatching { client.accountData(ServerRailLayout.EVENT_TYPE) }.getOrNull()?.let { Json.obj(it) }
    railContent = stored ?: emptyMap()
    val entries = ServerRailLayout.parse(stored, spaces.map { it.roomId }) { isKnownJoinedSpace(it) }
    if (entries != railEntries) railEntries = entries
}

/** Shows the new order at once and writes it to the account data, which desktop shows too. */
suspend fun MatrixAccount.saveRail(entries: List<RailEntry>) {
    val previous = railEntries
    railEntries = entries
    try {
        val content = ServerRailLayout.content(entries, railContent)
        client.setAccountData(ServerRailLayout.EVENT_TYPE, Json.encode(content))
        railContent = content
    } catch (e: Exception) {
        railEntries = previous
        throw e
    }
}

/** A server's name and picture, also for those nested deeper than the top level. */
fun MatrixAccount.serverInfo(spaceId: String): Pair<String, String?> {
    spaces.firstOrNull { it.roomId == spaceId }?.let { return it.displayName to it.avatarUrl }
    summary(spaceId)?.let { return it.name to it.avatarUrl }
    return spaceId to null
}

suspend fun MatrixAccount.viaServers(roomId: String): List<String> {
    val members = runCatching { joinedMembers(roomId) }.getOrDefault(emptyList())
    val fallback = mutableListOf<String>()
    SpaceChildLinks.serverName(roomId)?.let { fallback += it }
    fallback += ownServerName
    return ViaServers.pick(members, fallback)
}

private suspend fun MatrixAccount.putSpaceChild(parent: String, child: String, content: Map<String, Any?>) {
    clientRequest("/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(parent)}/state/m.space.child/${MatrixAccount.pathComponent(child)}", content, "PUT")
}

/** The tree of a server with the data of every link, as the manage screen shows it. */
suspend fun MatrixAccount.serverTree(spaceId: String): List<HierarchyRow> {
    val rooms = mutableListOf<Map<String, Any?>>()
    var next: String? = null
    repeat(10) {
        var path = "/_matrix/client/v1/rooms/${MatrixAccount.pathComponent(spaceId)}/hierarchy?limit=200"
        next?.let { path += "&from=" + URLEncoder.encode(it, "UTF-8") }
        val json = clientRequest(path)
        rooms += json["rooms"].objectsLenient()
        next = json["next_batch"].str()
        if (next == null) return ServerHierarchy.flatten(rooms, spaceId)
    }
    return ServerHierarchy.flatten(rooms, spaceId)
}

suspend fun MatrixAccount.addExistingRooms(roomIds: List<String>, spaceId: String): Int {
    var failed = 0
    for (roomId in roomIds) {
        try {
            putSpaceChild(spaceId, roomId, SpaceChildLinks.addedChildContent(viaServers(roomId)))
        } catch (_: Exception) {
            failed += 1
        }
    }
    refreshAfterStructureChange()
    return failed
}

suspend fun MatrixAccount.removeChild(childId: String, spaceId: String) {
    putSpaceChild(spaceId, childId, emptyMap())
    refreshAfterStructureChange()
}

suspend fun MatrixAccount.toggleSuggested(row: HierarchyRow) {
    putSpaceChild(row.parentId, row.roomId, SpaceChildLinks.toggledSuggested(row.childContent))
    refreshAfterStructureChange()
}

suspend fun MatrixAccount.refreshAfterStructureChange() {
    reloadSpaces()
    loadAllChannels()
    refreshRail()
}

fun MatrixAccount.addableRooms(spaceId: String, spacesOnly: Boolean, alreadyInside: Set<String>): List<RoomSummary> {
    val allowed = ServerHierarchy.addable(rooms.map { it.id }, alreadyInside, spaceId).toSet()
    return rooms.filter { it.id in allowed && it.isJoined && it.isSpace == spacesOnly && !it.isDirect && !isDiddyOptionsRoom(it.id, it.topic) }
        .sortedBy { it.name.lowercase() }
}

suspend fun MatrixAccount.markServerAsRead(spaceId: String) {
    val ids = (categories[spaceId] ?: emptyList()).flatMap { c -> c.channels.map { it.roomId } }
    for (id in ids) if (isJoinedRoom(id)) markRoomAsRead(id)
}

suspend fun MatrixAccount.roomVersionChoices(): Pair<String?, List<String>> {
    val json = runCatching { clientRequest("/_matrix/client/v3/capabilities") }.getOrNull() ?: return null to emptyList()
    return NewRoomVersionSupport.defaultVersion(json) to NewRoomVersionSupport.availableVersions(json)
}

/** Creates a room or server like desktop's create dialogs; with a parent it is listed there too. */
suspend fun MatrixAccount.createRoom(request: NewRoomRequest): String {
    var req = request
    if (req.parentId != null && req.parentVia.isEmpty()) {
        val via = viaServers(req.parentId!!)
        req = req.copy(parentVia = via.ifEmpty { listOf(ownServerName) })
    }
    val id = clientRequest("/_matrix/client/v3/createRoom", req.body())["room_id"].str()
        ?: throw DiddyError("The server could not create the room.")
    if (req.isVoice) markVoiceRoom(id)
    req.parentId?.let { putSpaceChild(it, id, NewRoomRequest.childContent(req.parentVia)) }
    try { waitForRoom(id) } catch (_: Exception) {}
    refreshAfterStructureChange()
    return id
}

suspend fun MatrixAccount.publicRooms(server: String?, term: String, filter: PublicRoomTypeFilter, since: String?): PublicRoomsPage {
    val json = clientRequest(RoomDirectory.path(server, ownServerName), RoomDirectory.body(term, filter, since))
    return RoomDirectory.parse(json)
}

/** What a room or server shows before you join (desktop's RoomSummaryLoader). */
suspend fun MatrixAccount.roomPreview(idOrAlias: String, via: List<String> = emptyList()): PublicRoomEntry? {
    val query = if (via.isEmpty()) "" else "?" + via.joinToString("&") { "via=" + URLEncoder.encode(it, "UTF-8") }
    for (prefix in listOf("/_matrix/client/v1/room_summary/", "/_matrix/client/unstable/im.nheko.summary/summary/")) {
        val json = runCatching { clientRequest(prefix + MatrixAccount.pathComponent(idOrAlias) + query) }.getOrNull() ?: continue
        if (json["room_id"] !is String) continue
        return RoomDirectory.parse(mapOf("chunk" to listOf(json))).rooms.firstOrNull()
    }
    return null
}

suspend fun MatrixAccount.joinRoom(idOrAlias: String, via: List<String>): String {
    val room = client.joinRoomByIdOrAlias(idOrAlias, via)
    reloadSpaces()
    loadAllChannels()
    refreshRail()
    return room.id()
}

suspend fun MatrixAccount.knockOnRoom(idOrAlias: String, via: List<String>) {
    client.knock(idOrAlias, null, via)
}

// MARK: - Room menu (ios RoomPrefs.swift)

fun notifyLevelOf(mode: RoomNotificationMode?): RoomNotifyLevel = when (mode) {
    null -> RoomNotifyLevel.DEFAULT
    RoomNotificationMode.ALL_MESSAGES -> RoomNotifyLevel.ALL_MESSAGES
    RoomNotificationMode.MENTIONS_AND_KEYWORDS_ONLY -> RoomNotifyLevel.MENTIONS_AND_KEYWORDS
    RoomNotificationMode.MUTE -> RoomNotifyLevel.MUTE
}

suspend fun MatrixAccount.refreshNotifyLevels() {
    val settings = client.getNotificationSettings()
    val levels = mutableMapOf<String, RoomNotifyLevel>()
    for (room in rooms.filter { it.isJoined }) {
        runCatching { settings.getUserDefinedRoomNotificationMode(room.id) }.getOrNull()?.let { levels[room.id] = notifyLevelOf(it) }
    }
    if (levels != roomNotifyLevels) {
        roomNotifyLevels = levels
        detailsChanged()
    }
}

suspend fun MatrixAccount.refreshNotifyLevel(roomId: String) {
    val settings = client.getNotificationSettings()
    val level = runCatching { settings.getUserDefinedRoomNotificationMode(roomId) }.getOrNull()?.let(::notifyLevelOf)
    if (roomNotifyLevels[roomId] != level) {
        roomNotifyLevels = if (level == null) roomNotifyLevels - roomId else roomNotifyLevels + (roomId to level)
        detailsChanged()
    }
}

/** Reload when the push rules change elsewhere, such as in the desktop app. */
suspend fun MatrixAccount.watchNotificationSettings() {
    val settings = client.getNotificationSettings()
    settings.setDelegate(object : NotificationSettingsDelegate {
        override fun settingsDidChange() {
            scope.launch { refreshNotifyLevels() }
        }
    })
}

fun MatrixAccount.notifyLevel(roomId: String): RoomNotifyLevel = roomNotifyLevels[roomId] ?: RoomNotifyLevel.DEFAULT

suspend fun MatrixAccount.setNotifyLevel(level: RoomNotifyLevel, roomId: String) {
    val settings = client.getNotificationSettings()
    when (level) {
        RoomNotifyLevel.DEFAULT -> settings.restoreDefaultRoomNotificationMode(roomId)
        RoomNotifyLevel.ALL_MESSAGES -> settings.setRoomNotificationMode(roomId, RoomNotificationMode.ALL_MESSAGES)
        RoomNotifyLevel.MENTIONS_AND_KEYWORDS -> settings.setRoomNotificationMode(roomId, RoomNotificationMode.MENTIONS_AND_KEYWORDS_ONLY)
        RoomNotifyLevel.MUTE -> settings.setRoomNotificationMode(roomId, RoomNotificationMode.MUTE)
    }
    roomNotifyLevels = if (level == RoomNotifyLevel.DEFAULT) roomNotifyLevels - roomId else roomNotifyLevels + (roomId to level)
    detailsChanged()
}

/** Desktop's "Mark as Read": a read receipt on the newest message, and the unread mark off. */
suspend fun MatrixAccount.markRoomAsRead(roomId: String) {
    val room = room(roomId) ?: return
    val type = if (app.diddy.app.ChatSettings.shareActivity) ReceiptType.READ else ReceiptType.READ_PRIVATE
    try { room.markAsRead(type) } catch (_: Exception) {}
    try { room.setUnreadFlag(false) } catch (_: Exception) {}
}

suspend fun MatrixAccount.setFavourite(roomId: String, on: Boolean) {
    val room = room(roomId) ?: throw DiddyError("This room is not available yet.")
    room.setIsFavourite(on, null)
}

/** Desktop's "Copy Link": a matrix.to link, by alias where the room has one. */
suspend fun MatrixAccount.roomLink(roomId: String): String? {
    summary(roomId)?.canonicalAlias?.takeIf { it.isNotEmpty() }?.let { return "https://matrix.to/#/$it" }
    return runCatching { room(roomId)?.matrixToPermalink() }.getOrNull()
}
