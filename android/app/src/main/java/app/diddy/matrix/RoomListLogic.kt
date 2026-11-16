package app.diddy.matrix

import app.diddy.util.int
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import app.diddy.util.strings
import java.net.URLEncoder
import java.util.Calendar
import java.util.Date

// Pure logic of the room list, the server rail and the creation sheets, mirroring the desktop app
// (ios/Diddy/Matrix/RoomListLogic.swift). Checked by the unit tests in app/src/test.

/** The choices of desktop's RoomNotificationModeSwitcher. */
enum class RoomNotifyLevel(val title: String) {
    DEFAULT("Default"),
    ALL_MESSAGES("All Messages"),
    MENTIONS_AND_KEYWORDS("Mention & Keywords"),
    MUTE("Mute"),
}

/** A folder of servers on the rail, as desktop's `ISidebarFolder`. */
data class RailFolder(val id: String, val name: String?, val content: List<String>)

/** One rail item: a server (space id) or a folder of servers. */
sealed class RailEntry {
    data class Space(val spaceId: String) : RailEntry()
    data class Folder(val folder: RailFolder) : RailEntry()

    val spaceIds: List<String>
        get() = when (this) {
            is Space -> listOf(spaceId)
            is Folder -> folder.content
        }

    val id: String
        get() = when (this) {
            is Space -> spaceId
            is Folder -> "folder-" + folder.id
        }
}

/** Reads and writes the rail layout desktop keeps in the account data `in.cinny.spaces`. */
object ServerRailLayout {
    const val EVENT_TYPE = "in.cinny.spaces"

    /**
     * Desktop's `parseSidebar`: entries in the stored order, only joined spaces, no duplicates;
     * top-level spaces the layout does not mention yet are appended at the end.
     */
    fun parse(content: Map<String, Any?>?, orphanSpaces: List<String>, isJoinedSpace: (String) -> Boolean): List<RailEntry> {
        val stored = (content?.get("sidebar") as? List<*>) ?: (content?.get("shortcut") as? List<*>) ?: emptyList<Any?>()
        val orphans = orphanSpaces.toMutableList()
        val result = mutableListOf<RailEntry>()
        val seenSpaces = mutableSetOf<String>()
        val seenFolders = mutableSetOf<String>()
        for (item in stored) {
            if (item is String) {
                if (isJoinedSpace(item) && item !in seenSpaces) {
                    seenSpaces += item
                    orphans.removeAll { it == item }
                    result += RailEntry.Space(item)
                }
                continue
            }
            val obj = item.obj() ?: continue
            val id = obj["id"].str() ?: continue
            val folderContent = obj["content"] as? List<*> ?: continue
            if (id in seenFolders) continue
            seenFolders += id
            val safe = mutableListOf<String>()
            for (spaceId in folderContent) {
                if (spaceId is String && isJoinedSpace(spaceId) && spaceId !in safe) safe += spaceId
            }
            orphans.removeAll { it in safe }
            result += RailEntry.Folder(RailFolder(id, obj["name"].str(), safe))
        }
        for (spaceId in orphans) {
            if (result.none { spaceId in it.spaceIds }) result += RailEntry.Space(spaceId)
        }
        return result
    }

    /** The `sidebar` array as desktop writes it. */
    fun json(entries: List<RailEntry>): List<Any?> = entries.map { entry ->
        when (entry) {
            is RailEntry.Space -> entry.spaceId
            is RailEntry.Folder -> buildMap<String, Any?> {
                put("id", entry.folder.id)
                put("content", entry.folder.content)
                entry.folder.name?.let { put("name", it) }
            }
        }
    }

    /** Desktop's `makeCinnySpacesContent`: keeps whatever else the event holds. */
    fun content(entries: List<RailEntry>, current: Map<String, Any?>): Map<String, Any?> =
        current.toMutableMap().also { it["sidebar"] = json(entries) }

    /** Desktop's `randomStr`: 12 capital letters. */
    fun newFolderId(): String = (0 until 12).map { ('A'..'Z').random() }.joinToString("")

    /** Compose's equivalent of SwiftUI's `onMove`. */
    fun <T> moved(items: List<T>, source: Set<Int>, destination: Int): List<T> {
        val moving = source.filter { it >= 0 && it < items.size }.sorted().map { items[it] }
        val rest = items.filterIndexed { index, _ -> index !in source }.toMutableList()
        val shift = source.count { it < destination }
        val target = (destination - shift).coerceIn(0, rest.size)
        rest.addAll(target, moving)
        return rest
    }

    /**
     * Desktop's "make-child" drop: a server put onto another server makes a folder of both, put
     * onto a folder joins it.
     */
    fun put(spaceId: String, targetIndex: Int, entries: List<RailEntry>): List<RailEntry> {
        if (targetIndex !in entries.indices) return entries
        val target = entries[targetIndex]
        if (target is RailEntry.Space && target.spaceId == spaceId) return entries
        val result = mutableListOf<RailEntry>()
        entries.forEachIndexed { index, entry ->
            if (index == targetIndex) {
                when (entry) {
                    is RailEntry.Space -> result += RailEntry.Folder(RailFolder(newFolderId(), null, listOf(entry.spaceId, spaceId)))
                    is RailEntry.Folder -> result += RailEntry.Folder(entry.folder.copy(content = entry.folder.content.filter { it != spaceId } + spaceId))
                }
                return@forEachIndexed
            }
            removing(spaceId, entry)?.let { result += it }
        }
        return result
    }

    /** Takes a server out of its folder and places it right after the folder. */
    fun takeOut(spaceId: String, entries: List<RailEntry>): List<RailEntry> {
        val result = mutableListOf<RailEntry>()
        for (entry in entries) {
            if (entry !is RailEntry.Folder || spaceId !in entry.folder.content) {
                result += entry
                continue
            }
            val content = entry.folder.content.filter { it != spaceId }
            if (content.isNotEmpty()) result += RailEntry.Folder(entry.folder.copy(content = content))
            result += RailEntry.Space(spaceId)
        }
        return result
    }

    /** Reorders the servers inside one folder. */
    fun moveInFolder(folderId: String, source: Set<Int>, destination: Int, entries: List<RailEntry>): List<RailEntry> =
        entries.map { entry ->
            if (entry is RailEntry.Folder && entry.folder.id == folderId) {
                RailEntry.Folder(entry.folder.copy(content = moved(entry.folder.content, source, destination)))
            } else entry
        }

    /** Renames a folder; an empty name removes the name, as desktop does. */
    fun renamed(folderId: String, name: String, entries: List<RailEntry>): List<RailEntry> {
        val trimmed = name.trim()
        return entries.map { entry ->
            if (entry is RailEntry.Folder && entry.folder.id == folderId) {
                RailEntry.Folder(entry.folder.copy(name = trimmed.ifEmpty { null }))
            } else entry
        }
    }

    /** Replaces a folder by its servers, in place. */
    fun dissolved(folderId: String, entries: List<RailEntry>): List<RailEntry> = entries.flatMap { entry ->
        if (entry is RailEntry.Folder && entry.folder.id == folderId) entry.folder.content.map { RailEntry.Space(it) } else listOf(entry)
    }

    /** A new folder holding one server, put where that server was. */
    fun foldered(spaceId: String, entries: List<RailEntry>): List<RailEntry> {
        val result = mutableListOf<RailEntry>()
        for (entry in entries) {
            when (entry) {
                is RailEntry.Space ->
                    result += if (entry.spaceId == spaceId) RailEntry.Folder(RailFolder(newFolderId(), null, listOf(spaceId))) else entry
                is RailEntry.Folder -> {
                    if (spaceId in entry.folder.content) {
                        val content = entry.folder.content.filter { it != spaceId }
                        if (content.isNotEmpty()) result += RailEntry.Folder(entry.folder.copy(content = content))
                        result += RailEntry.Folder(RailFolder(newFolderId(), null, listOf(spaceId)))
                    } else {
                        result += entry
                    }
                }
            }
        }
        return result
    }

    /** Puts a server into an existing folder (by id), out of wherever it was. */
    fun putIntoFolder(spaceId: String, folderId: String, entries: List<RailEntry>): List<RailEntry> {
        val index = entries.indexOfFirst { it is RailEntry.Folder && it.folder.id == folderId }
        if (index < 0) return entries
        return put(spaceId, index, entries)
    }

    /** Desktop's `sidebarItemWithout`. */
    fun without(spaceId: String, entries: List<RailEntry>): List<RailEntry> = entries.mapNotNull { removing(spaceId, it) }

    private fun removing(spaceId: String, entry: RailEntry): RailEntry? = when (entry) {
        is RailEntry.Space -> if (entry.spaceId == spaceId) null else entry
        is RailEntry.Folder -> {
            if (spaceId !in entry.folder.content) entry
            else entry.folder.content.filter { it != spaceId }.let { if (it.isEmpty()) null else RailEntry.Folder(entry.folder.copy(content = it)) }
        }
    }
}

// MARK: - Creating rooms and servers

/** Desktop's `CreateRoomAccess`, in the order its selector shows them. */
enum class NewRoomAccess(val title: String, val detail: String) {
    RESTRICTED("Restricted", "Only member of parent space can join."),
    PRIVATE("Private", "Only people with invite can join."),
    PUBLIC("Public", "Anyone with the address can join."),
}

/** Which join rules a room version allows. An unknown version counts as new. */
object NewRoomVersionSupport {
    private fun atLeast(version: String?, minimum: Int): Boolean {
        if (version == null) return true
        val value = version.toIntOrNull() ?: return true
        return value >= minimum
    }

    fun restricted(version: String?) = atLeast(version, 8)
    fun knock(version: String?) = atLeast(version, 7)
    fun knockRestricted(version: String?) = atLeast(version, 10)

    /** The versions the server lists as available, newest number first. */
    fun availableVersions(capabilities: Map<String, Any?>): List<String> {
        val versions = capabilities["capabilities"].obj()?.get("m.room_versions").obj()
        val available = versions?.get("available").obj()?.keys?.toList() ?: emptyList()
        return available.sortedWith { lhs, rhs ->
            val x = lhs.toIntOrNull()
            val y = rhs.toIntOrNull()
            when {
                x != null && y != null -> y.compareTo(x)
                x != null -> -1
                y != null -> 1
                else -> lhs.compareTo(rhs)
            }
        }
    }

    fun defaultVersion(capabilities: Map<String, Any?>): String? =
        capabilities["capabilities"].obj()?.get("m.room_versions").obj()?.get("default").str()
}

/** The createRoom request desktop sends (components/create-room/utils.ts `createRoom`). */
data class NewRoomRequest(
    val name: String,
    val topic: String = "",
    val isSpace: Boolean = false,
    val isVoice: Boolean = false,
    val parentId: String? = null,
    val parentVia: List<String> = emptyList(),
    val access: NewRoomAccess = NewRoomAccess.PRIVATE,
    val aliasLocalPart: String = "",
    val encryption: Boolean = false,
    val knock: Boolean = false,
    val allowFederation: Boolean = true,
    val roomVersion: String? = null,
) {
    val effectiveAccess: NewRoomAccess
        get() = if (access == NewRoomAccess.RESTRICTED && (parentId == null || !NewRoomVersionSupport.restricted(roomVersion))) NewRoomAccess.PRIVATE else access

    val effectiveKnock: Boolean
        get() = when (effectiveAccess) {
            NewRoomAccess.PRIVATE -> knock && NewRoomVersionSupport.knock(roomVersion)
            NewRoomAccess.RESTRICTED -> knock && NewRoomVersionSupport.knockRestricted(roomVersion)
            NewRoomAccess.PUBLIC -> false
        }

    val effectiveEncryption: Boolean get() = !isSpace && effectiveAccess != NewRoomAccess.PUBLIC && encryption

    /** Desktop's `replaceSpaceWithDash`, only for public rooms. */
    val effectiveAlias: String?
        get() {
            if (effectiveAccess != NewRoomAccess.PUBLIC) return null
            val trimmed = aliasLocalPart.trim()
            return if (trimmed.isEmpty()) null else trimmed.replace(" ", "-")
        }

    fun body(): Map<String, Any?> {
        val state = mutableListOf<Map<String, Any?>>()
        if (effectiveEncryption) {
            state += mapOf("type" to "m.room.encryption", "state_key" to "", "content" to mapOf("algorithm" to "m.megolm.v1.aes-sha2"))
        }
        if (parentId != null) {
            state += mapOf("type" to "m.space.parent", "state_key" to parentId, "content" to mapOf("canonical" to true, "via" to parentVia))
        }
        if (isVoice && !isSpace) {
            state += mapOf("type" to "org.matrix.msc3401.call", "state_key" to "", "content" to emptyMap<String, Any?>())
        }
        state += mapOf("type" to "m.room.join_rules", "state_key" to "", "content" to joinRuleContent())

        val body = linkedMapOf<String, Any?>("name" to name, "initial_state" to state)
        roomVersion?.let { body["room_version"] = it }
        if (topic.isNotEmpty()) body["topic"] = topic
        effectiveAlias?.let { body["room_alias_name"] = it }
        val creation = linkedMapOf<String, Any?>()
        if (isSpace) creation["type"] = SPACE_ROOM_TYPE else if (isVoice) creation["type"] = VOICE_ROOM_TYPE
        if (!allowFederation) creation["m.federate"] = false
        body["creation_content"] = creation
        if (isSpace) {
            body["power_level_content_override"] = mapOf("events_default" to 50)
        } else if (isVoice) {
            body["power_level_content_override"] = mapOf("events" to mapOf("org.matrix.msc3401.call.member" to 0))
        }
        return body
    }

    fun joinRuleContent(): Map<String, Any?> = when (effectiveAccess) {
        NewRoomAccess.PUBLIC -> mapOf("join_rule" to "public")
        NewRoomAccess.RESTRICTED -> mapOf(
            "join_rule" to if (effectiveKnock) "knock_restricted" else "restricted",
            "allow" to listOf(mapOf("type" to "m.room_membership", "room_id" to (parentId ?: ""))),
        )
        NewRoomAccess.PRIVATE -> mapOf("join_rule" to if (effectiveKnock) "knock" else "invite")
    }

    companion object {
        const val VOICE_ROOM_TYPE = "org.matrix.msc3417.call"
        const val SPACE_ROOM_TYPE = "m.space"

        /** The `m.space.child` content desktop writes into the parent after creating. */
        fun childContent(via: List<String>): Map<String, Any?> = mapOf("auto_join" to false, "suggested" to false, "via" to via)
    }
}

// MARK: - Server structure (m.space.child)

data class SpaceChildLink(val parentId: String, val childId: String, val suggested: Boolean, val via: List<String>)

object SpaceChildLinks {
    /** Links by child id from the `rooms` of `/hierarchy` pages. Only children with `via` count. */
    fun parse(hierarchyRooms: List<Map<String, Any?>>): Map<String, List<SpaceChildLink>> {
        val result = linkedMapOf<String, MutableList<SpaceChildLink>>()
        for (room in hierarchyRooms) {
            val parentId = room["room_id"].str() ?: continue
            for (event in room["children_state"].objectsLenient()) {
                if (event["type"].str() != "m.space.child") continue
                val childId = event["state_key"].str() ?: continue
                val content = event["content"].obj() ?: continue
                val via = content["via"].strings() ?: continue
                if (via.isEmpty()) continue
                val link = SpaceChildLink(parentId, childId, content["suggested"] as? Boolean ?: false, via)
                result.getOrPut(childId) { mutableListOf() } += link
            }
        }
        return result
    }

    /** Desktop's "Set Suggested" / "Unset Suggested": the same content with `suggested` flipped. */
    fun toggledSuggested(content: Map<String, Any?>): Map<String, Any?> =
        content.toMutableMap().also { it["suggested"] = !((content["suggested"] as? Boolean) ?: false) }

    fun addedChildContent(via: List<String>): Map<String, Any?> = NewRoomRequest.childContent(via)

    /** The server part of a user id or alias, for `via`. */
    fun serverName(id: String): String? {
        val colon = id.indexOf(':')
        if (colon < 0) return null
        return id.substring(colon + 1).ifEmpty { null }
    }
}

// MARK: - Explore (public room directory)

enum class PublicRoomTypeFilter(val title: String) {
    ALL("All"),
    SPACES("Spaces"),
    ROOMS("Rooms"),
}

data class PublicRoomEntry(
    val roomId: String,
    val name: String?,
    val topic: String?,
    val canonicalAlias: String?,
    val avatarUrl: String?,
    val memberCount: Int,
    val roomType: String?,
    val joinRule: String?,
) {
    val id: String get() = roomId
    val isSpace: Boolean get() = roomType == "m.space"
    val displayName: String get() = name ?: canonicalAlias ?: roomId
    /** What to join with: the alias where there is one, as desktop does. */
    val joinTarget: String get() = canonicalAlias ?: roomId
}

data class PublicRoomsPage(val rooms: List<PublicRoomEntry>, val nextBatch: String?, val prevBatch: String?, val total: Int?)

object RoomDirectory {
    const val PAGE_SIZE = 24

    val featuredSpaces = listOf(
        "#cinny:matrix.org",
        "#community:matrix.org",
        "#space:unredacted.org",
        "#librewolf-community:matrix.org",
        "#stickers-and-emojis:tastytea.de",
        "#videogames:waywardinn.com",
        "#science-space:matrix.org",
        "#libregaming-games:tchncs.de",
        "#mathematics-on:matrix.org",
    )
    val featuredRooms = listOf("#tuwunel:grin.hu", "#freesoftware:matrix.org", "#gentoo:matrix.org")
    val featuredServers = listOf("matrixrooms.info", "matrix.org", "mozilla.org", "unredacted.org")

    fun otherServers(own: String?): List<String> = featuredServers.filter { it != own }

    /** The path of the `/publicRooms` POST; your own server needs no `server` parameter. */
    fun path(server: String?, own: String?): String {
        var path = "/_matrix/client/v3/publicRooms"
        if (!server.isNullOrEmpty() && server != own) path += "?server=" + URLEncoder.encode(server, "UTF-8")
        return path
    }

    fun body(term: String, filter: PublicRoomTypeFilter, since: String?, limit: Int = PAGE_SIZE): Map<String, Any?> {
        val body = linkedMapOf<String, Any?>("limit" to limit)
        since?.let { body["since"] = it }
        val search = linkedMapOf<String, Any?>()
        val trimmed = term.trim()
        if (trimmed.isNotEmpty()) search["generic_search_term"] = trimmed
        when (filter) {
            PublicRoomTypeFilter.ALL -> {}
            PublicRoomTypeFilter.SPACES -> search["room_types"] = listOf("m.space")
            PublicRoomTypeFilter.ROOMS -> search["room_types"] = listOf(null)
        }
        if (search.isNotEmpty()) body["filter"] = search
        return body
    }

    fun parse(json: Map<String, Any?>): PublicRoomsPage {
        val rooms = mutableListOf<PublicRoomEntry>()
        for (chunk in json["chunk"].objectsLenient()) {
            val roomId = chunk["room_id"].str() ?: continue
            rooms += PublicRoomEntry(
                roomId = roomId,
                name = chunk["name"].str()?.ifEmpty { null },
                topic = chunk["topic"].str()?.ifEmpty { null },
                canonicalAlias = chunk["canonical_alias"].str()?.ifEmpty { null },
                avatarUrl = chunk["avatar_url"].str()?.ifEmpty { null },
                memberCount = chunk["num_joined_members"].int() ?: 0,
                roomType = chunk["room_type"].str(),
                joinRule = chunk["join_rule"].str(),
            )
        }
        return PublicRoomsPage(
            rooms = rooms,
            nextBatch = json["next_batch"].str()?.ifEmpty { null },
            prevBatch = json["prev_batch"].str()?.ifEmpty { null },
            total = json["total_room_count_estimate"].int(),
        )
    }

    /** A server name as typed: no scheme, no slashes, no spaces. */
    fun cleanServerName(input: String): String? {
        var text = input.trim().lowercase()
        for (prefix in listOf("https://", "http://")) if (text.startsWith(prefix)) text = text.removePrefix(prefix)
        text = text.trimEnd('/')
        if (text.isEmpty() || text.contains('/') || text.contains(' ')) return null
        return text
    }
}

// MARK: - Via servers and the server tree

object ViaServers {
    /** Desktop's `getViaServers`: the servers most of the members are on, at most three. */
    fun pick(memberIds: List<String>, fallback: List<String>): List<String> {
        val population = linkedMapOf<String, Int>()
        val firstSeen = mutableMapOf<String, Int>()
        memberIds.forEachIndexed { index, member ->
            val server = SpaceChildLinks.serverName(member) ?: return@forEachIndexed
            population[server] = (population[server] ?: 0) + 1
            if (server !in firstSeen) firstSeen[server] = index
        }
        val sorted = population.keys.sortedWith { lhs, rhs ->
            val a = population[lhs] ?: 0
            val b = population[rhs] ?: 0
            if (a != b) b.compareTo(a) else (firstSeen[lhs] ?: 0).compareTo(firstSeen[rhs] ?: 0)
        }
        val result = sorted.take(3).toMutableList()
        for (server in fallback) if (result.size < 3 && server !in result) result += server
        return result
    }
}

/** One row of a server's tree as the manage screen lists it. */
data class HierarchyRow(
    val roomId: String,
    val parentId: String,
    val depth: Int,
    val name: String,
    val isSpace: Boolean,
    val isVoice: Boolean,
    val suggested: Boolean,
    val via: List<String>,
    val memberCount: Int,
    /** The `m.space.child` content as stored, so toggling `suggested` keeps `order` and the rest. */
    val childContent: Map<String, Any?>,
) {
    val id: String get() = "$parentId|$roomId"
}

object ServerHierarchy {
    const val VOICE_ROOM_TYPE = "org.matrix.msc3417.call"

    /** The rows below `rootId` in the order the spec gives children. Loops stop at the first repeat. */
    fun flatten(hierarchyRooms: List<Map<String, Any?>>, rootId: String): List<HierarchyRow> {
        val byId = hierarchyRooms.mapNotNull { room -> room["room_id"].str()?.let { it to room } }.toMap()
        val rows = mutableListOf<HierarchyRow>()
        fun visit(spaceId: String, depth: Int, path: Set<String>) {
            val space = byId[spaceId] ?: return
            val events = space["children_state"].objectsLenient().filter { event ->
                event["type"].str() == "m.space.child" && (event["content"].obj()?.get("via").strings()?.isNotEmpty() == true)
            }
            for (event in events.sortedWith(::childOrder)) {
                val childId = event["state_key"].str() ?: continue
                val child = byId[childId] ?: continue
                val content = event["content"].obj() ?: continue
                if (childId in path) continue
                val type = child["room_type"].str()
                val isSpace = type == "m.space"
                rows += HierarchyRow(
                    roomId = childId,
                    parentId = spaceId,
                    depth = depth,
                    name = child["name"].str()?.ifEmpty { null } ?: child["canonical_alias"].str() ?: childId,
                    isSpace = isSpace,
                    isVoice = type == VOICE_ROOM_TYPE,
                    suggested = content["suggested"] as? Boolean ?: false,
                    via = content["via"].strings() ?: emptyList(),
                    memberCount = child["num_joined_members"].int() ?: 0,
                    childContent = content,
                )
                if (isSpace) visit(childId, depth + 1, path + childId)
            }
        }
        visit(rootId, 0, setOf(rootId))
        return rows
    }

    private fun childOrder(a: Map<String, Any?>, b: Map<String, Any?>): Int {
        fun order(event: Map<String, Any?>): String? {
            val order = event["content"].obj()?.get("order").str() ?: return null
            if (order.isEmpty() || order.length > 50 || order.any { it.code < 0x20 || it.code > 0x7E }) return null
            return order
        }
        fun timestamp(event: Map<String, Any?>): Long = event["origin_server_ts"].long() ?: 0
        val oa = order(a)
        val ob = order(b)
        if (oa != null && ob != null && oa != ob) return oa.compareTo(ob)
        if (oa != null && ob == null) return -1
        if (oa == null && ob != null) return 1
        if (timestamp(a) != timestamp(b)) return timestamp(a).compareTo(timestamp(b))
        return (a["state_key"].str() ?: "").compareTo(b["state_key"].str() ?: "")
    }

    /** Rooms of a list that are not yet below the server, for "Add Existing". */
    fun addable(candidates: List<String>, alreadyInside: Set<String>, serverId: String): List<String> =
        candidates.filter { it != serverId && it !in alreadyInside }
}

// MARK: - Chat list

/** The rows of the chat list: what the preview says and the time on the right. */
object ChatListLogic {
    /** "You: …" for your own message, "Mia: …" in a group, the bare text in a direct message. */
    fun preview(text: String, isOwn: Boolean, isDirect: Boolean, senderName: String): String {
        if (isOwn) return "You: $text"
        if (isDirect || senderName.isEmpty()) return text
        return "$senderName: $text"
    }

    /**
     * The time on the right of a row: the clock time today, "Yesterday", the weekday within the
     * last week, the date before that.
     */
    fun timeLabel(
        date: Date,
        now: Date = Date(),
        clock: (Date) -> String,
        weekday: (Date) -> String,
        short: (Date) -> String,
    ): String {
        val cal = Calendar.getInstance()
        cal.time = now
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0)
        val startOfToday = cal.time
        val startOfTomorrow = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1) }.time
        if (!date.before(startOfToday) && date.before(startOfTomorrow)) return clock(date)
        val startOfYesterday = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }.time
        val weekAgo = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -6) }.time
        if (!date.before(startOfYesterday) && date.before(startOfToday)) return "Yesterday"
        if (!date.before(weekAgo) && date.before(startOfToday)) return weekday(date)
        return short(date)
    }

    /** Newest first; rooms without a known message go to the end in their old order. */
    fun <T> sortedByActivity(items: List<T>, date: (T) -> Date?): List<T> =
        items.withIndex().sortedWith { a, b ->
            val x = date(a.value)
            val y = date(b.value)
            when {
                x != null && y != null -> if (x != y) y.compareTo(x) else a.index.compareTo(b.index)
                x != null -> -1
                y != null -> 1
                else -> a.index.compareTo(b.index)
            }
        }.map { it.value }
}
