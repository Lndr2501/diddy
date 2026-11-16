package app.diddy.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.util.ClientApiError
import app.diddy.util.DiddyError
import app.diddy.util.Http
import app.diddy.util.Json
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.matrix.rustcomponents.sdk.Client
import org.matrix.rustcomponents.sdk.CreateRoomParameters
import org.matrix.rustcomponents.sdk.LatestEventValue
import org.matrix.rustcomponents.sdk.Membership
import org.matrix.rustcomponents.sdk.ProfileDetails
import org.matrix.rustcomponents.sdk.RecoveryState
import org.matrix.rustcomponents.sdk.RecoveryStateListener
import org.matrix.rustcomponents.sdk.Room
import org.matrix.rustcomponents.sdk.RoomInfo
import org.matrix.rustcomponents.sdk.RoomInfoListener
import org.matrix.rustcomponents.sdk.RoomListDynamicEntriesController
import org.matrix.rustcomponents.sdk.RoomListEntriesDynamicFilterKind
import org.matrix.rustcomponents.sdk.RoomListEntriesListener
import org.matrix.rustcomponents.sdk.RoomListEntriesUpdate
import org.matrix.rustcomponents.sdk.RoomPreset
import org.matrix.rustcomponents.sdk.RoomType
import org.matrix.rustcomponents.sdk.RoomVisibility
import org.matrix.rustcomponents.sdk.SpaceListUpdate
import org.matrix.rustcomponents.sdk.SpaceRoom
import org.matrix.rustcomponents.sdk.SpaceService
import org.matrix.rustcomponents.sdk.SpaceServiceJoinedSpacesListener
import org.matrix.rustcomponents.sdk.SyncService
import org.matrix.rustcomponents.sdk.SyncServiceState
import org.matrix.rustcomponents.sdk.SyncServiceStateObserver
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.UserProfile
import org.matrix.rustcomponents.sdk.VerificationState
import org.matrix.rustcomponents.sdk.VerificationStateListener
import uniffi.matrix_sdk_base.EncryptionState
import uniffi.matrix_sdk_ui.SpaceRoomListPaginationState
import java.net.URLEncoder
import java.util.Date

/** A room as the channel list and server rail need it (ios MatrixAccount.swift). */
data class RoomSummary(
    val id: String,
    val name: String,
    val avatarUrl: String?,
    val isDirect: Boolean,
    val isSpace: Boolean,
    val unread: Long,
    val mentions: Long,
    /** Unread messages your notification settings say should alert you. */
    val notifications: Long,
    val hasCall: Boolean,
    val callParticipants: List<String>,
    val isEncrypted: Boolean,
    val membership: Membership,
    val topic: String?,
    val canonicalAlias: String?,
    val memberCount: Long,
    val inviterName: String?,
    val lastMessage: String?,
    /** When the newest message was sent, for the time in the chat list. */
    val lastActivity: Date?,
    val isVoiceRoom: Boolean = false,
    /** The other person of a direct message, when the room has exactly one other member. */
    val dmUserId: String? = null,
    /** Tagged `m.favourite`, shown first in the chat list. */
    val isFavourite: Boolean = false,
) {
    val isJoined: Boolean get() = membership == Membership.JOINED
    val isInvite: Boolean get() = membership == Membership.INVITED
    /** The number on the room's badge. A DM counts whichever of unread and mentions is higher. */
    val badge: Long get() = if (isDirect) maxOf(unread, mentions) else mentions
}

/** Name and avatar of a user, as the call roster, member list and profile sheet show them. */
data class UserSummary(val name: String, val avatarUrl: String?)

/** Discord-style category: a sub-space of a server, or the server's own top-level rooms. */
data class ChannelCategory(val id: String, val name: String, val channels: List<SpaceRoom>)

/** What the chat area shows. */
sealed class Destination {
    abstract val roomId: String
    data class Text(override val roomId: String) : Destination()
    data class Voice(override val roomId: String) : Destination()
}

val SpaceRoom.isSubspace: Boolean get() = roomType == RoomType.Space
val SpaceRoom.isJoinedState: Boolean get() = state == Membership.JOINED

/**
 * One signed-in account: its sync, rooms, servers and people (ios MatrixAccount.swift). The
 * observed values are Compose state; the screens redraw when they change.
 */
class MatrixAccount(val record: AccountRecord, val client: Client) {
    val id: String get() = record.id
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    var userId by mutableStateOf(runCatching { client.userId() }.getOrDefault(record.userId))
        private set
    var displayName by mutableStateOf(record.displayName)
        private set
    var avatarUrl by mutableStateOf<String?>(null)
        private set
    var rooms by mutableStateOf<List<RoomSummary>>(emptyList())
        private set
    var profiles by mutableStateOf<Map<String, UserSummary>>(emptyMap())
        private set
    /** Servers whose channel list finished loading, so an empty server is not an endless spinner. */
    var loadedServers by mutableStateOf<Set<String>>(emptySet())
        private set
    /** Cinny/Diddy voice channels: rooms of the MSC3417 call room type, read from the hierarchy. */
    var voiceRoomIds by mutableStateOf<Set<String>>(emptySet())
        private set
    var spaces by mutableStateOf<List<SpaceRoom>>(emptyList())
        private set
    var categories by mutableStateOf<Map<String, List<ChannelCategory>>>(emptyMap())
        private set
    /** Rooms with their own notification setting; the others follow the default. */
    var roomNotifyLevels by mutableStateOf<Map<String, RoomNotifyLevel>>(emptyMap())
    /** The server rail in the order of the account data `in.cinny.spaces`. */
    var railEntries by mutableStateOf<List<RailEntry>>(emptyList())
    /** That account data as stored, so writing keeps what only desktop knows. */
    var railContent: Map<String, Any?> = emptyMap()
    var syncState by mutableStateOf(SyncServiceState.IDLE)
        private set
    var syncEverRan by mutableStateOf(false)
        private set
    var recoveryState by mutableStateOf(RecoveryState.UNKNOWN)
        private set
    var verificationState by mutableStateOf(VerificationState.UNKNOWN)
        private set
    var started by mutableStateOf(false)
        private set
    /** Bumped when names, pictures, Diddy profiles, badges or notification levels change. */
    var detailsVersion by mutableIntStateOf(0)
        private set

    // Diddy profile extras (DiddyProfiles.kt).
    var diddyProfiles by mutableStateOf<Map<String, DiddyProfile>>(emptyMap())
    var diddyBadges by mutableStateOf<Map<String, List<DiddyBadge>>>(emptyMap())
    var diddyOwnBadges by mutableStateOf<List<DiddyBadge>>(emptyList())
    var diddyBadgeLibrary by mutableStateOf<List<DiddyBadge>>(emptyList())
    var diddyOptionsRooms: MutableSet<String> = mutableSetOf()
    var diddyCheckedRooms: MutableSet<String> = mutableSetOf()
    var diddyMarkerChecksLoaded = false
    var diddyPrimaryRoom: Pair<String, Boolean>? = null
    var diddyOwnProfileRaw: Map<String, Any?>? = null
    var diddyLoading = false
    var diddyLoadedAt: Date? = null
    var diddyLastSummary = ""
    val diddyFeeds: MutableMap<String, DiddyOptionsFeed> = mutableMapOf()

    private var channelsJob: Job? = null
    private var channelsRequested = 0
    private var channelsDone = 0
    private var channelsLoadedAt: Date? = null
    private var channelIdsCache = mutableMapOf<String, Set<String>>()
    private var serverRoomIdsCache: Set<String>? = null

    private var syncService: SyncService? = null
    private var roomListController: RoomListDynamicEntriesController? = null
    private var spaceService: SpaceService? = null
    private val handles = mutableListOf<TaskHandle>()
    private val roomObjects = mutableListOf<Room>()
    private var summaryJob: Job? = null
    private var summarizedRooms: Map<String, Room> = emptyMap()
    private val dirtySummaryIds = mutableSetOf<String>()
    private var lastFullSummary: Date? = null
    private var roomsById: Map<String, RoomSummary> = emptyMap()
    private val roomInfoHandles = mutableMapOf<String, TaskHandle>()
    private val resolvingProfiles = mutableSetOf<String>()
    private var knownJoinedRooms: Set<String> = emptySet()
    private var restartJob: Job? = null
    /** Set once sync has had time to catch up, so old calls and messages are not announced. */
    private var alertsFrom: Date? = null

    var onRoomsChanged: ((Map<String, RoomSummary>, List<RoomSummary>) -> Unit)? = null
    val canRing: Boolean get() = alertsFrom?.let { Date() >= it } ?: false

    val deviceId: String get() = runCatching { client.deviceId() }.getOrDefault("")
    val title: String get() = displayName ?: userId

    fun detailsChanged() { detailsVersion++ }

    private fun setRooms(value: List<RoomSummary>) {
        val previous = roomsById
        rooms = value
        roomsById = value.associateBy { it.id }
        onRoomsChanged?.invoke(previous, value)
    }

    private fun setCategories(value: Map<String, List<ChannelCategory>>) {
        categories = value
        channelIdsCache = mutableMapOf()
        serverRoomIdsCache = null
    }

    private fun main(block: suspend CoroutineScope.() -> Unit) = scope.launch(block = block)

    // MARK: - Lifecycle

    suspend fun start() {
        if (started) return
        started = true
        try {
            val encryption = client.encryption()
            recoveryState = encryption.recoveryState()
            verificationState = encryption.verificationState()
            handles += encryption.recoveryStateListener(object : RecoveryStateListener {
                override fun onUpdate(status: RecoveryState) { main { recoveryState = status } }
            })
            handles += encryption.verificationStateListener(object : VerificationStateListener {
                override fun onUpdate(status: VerificationState) { main { verificationState = status } }
            })

            val sync = client.syncService().finish()
            syncService = sync
            handles += sync.state(object : SyncServiceStateObserver {
                override fun onUpdate(state: SyncServiceState) { main { syncStateChanged(state) } }
            })

            val list = sync.roomListService().allRooms()
            val entries = list.entriesWithDynamicAdapters(1000u, object : RoomListEntriesListener {
                override fun onUpdate(roomEntriesUpdate: List<RoomListEntriesUpdate>) { main { apply(roomEntriesUpdate) } }
            })
            handles += entries.entriesStream()
            val controller = entries.controller()
            controller.setFilter(
                RoomListEntriesDynamicFilterKind.All(
                    listOf(RoomListEntriesDynamicFilterKind.NonLeft, RoomListEntriesDynamicFilterKind.DeduplicateVersions)
                )
            )
            roomListController = controller

            val spaceService = client.spaceService()
            this.spaceService = spaceService
            spaces = spaceService.topLevelJoinedSpaces()
            handles += spaceService.subscribeToTopLevelJoinedSpaces(object : SpaceServiceJoinedSpacesListener {
                override fun onUpdate(roomUpdates: List<SpaceListUpdate>) { main { reloadSpaces() } }
            })

            sync.start()
            // Name and picture come from the server; the app must not wait for them to open.
            main { refreshProfile() }
        } catch (e: Exception) {
            syncState = SyncServiceState.ERROR
        }
    }

    suspend fun stop() {
        restartJob?.cancel()
        try { syncService?.stop() } catch (_: Exception) {}
        handles.forEach { it.cancel() }
        handles.clear()
        roomInfoHandles.values.forEach { it.cancel() }
        roomInfoHandles.clear()
        started = false
    }

    /** Coming back to the app: Android may have stopped the network meanwhile. */
    suspend fun resume() {
        if (!started) return
        restartJob?.cancel()
        if (syncState != SyncServiceState.RUNNING) try { syncService?.start() } catch (_: Exception) {}
        reloadSpaces()
        // The channel lists only need a fresh look now and then.
        if (channelsLoadedAt?.let { Date().time - it.time > 120_000 } != false) loadAllChannels()
        refreshRail()
    }

    private fun syncStateChanged(state: SyncServiceState) {
        syncState = state
        if (state == SyncServiceState.RUNNING) syncEverRan = true
        if (state == SyncServiceState.RUNNING && alertsFrom == null) {
            alertsFrom = Date(System.currentTimeMillis() + 5_000)
            // Give the room list a moment to fill before looking for the Diddy Options room.
            main {
                delay(3_000)
                loadDiddyProfiles()
            }
        }
        if (state != SyncServiceState.ERROR || !started) return
        restartJob?.cancel()
        restartJob = main {
            delay(5_000)
            try { syncService?.start() } catch (_: Exception) {}
        }
    }

    suspend fun logout() {
        stop()
        try { client.logout() } catch (_: Exception) {}
        SessionStore.delete(record.id)
        record.removeDirectories(SessionStore.context)
    }

    suspend fun refreshProfile() {
        // A failed request (no connection yet) keeps what is known instead of wiping it.
        if (avatarUrl == null) runCatching { client.cachedAvatarUrl() }.getOrNull()?.let { avatarUrl = it }
        runCatching { client.displayName() }.getOrNull()?.let { displayName = it }
        try { avatarUrl = client.avatarUrl() } catch (_: Exception) {}
    }

    // MARK: - Rooms

    private fun apply(updates: List<RoomListEntriesUpdate>) {
        for (update in updates) ListDiff.of(update).apply(roomObjects)
        subscribeToRoomInfo()
        scheduleSummaryRebuild()
    }

    private fun subscribeToRoomInfo() {
        val current = roomObjects.map { it.id() }.toSet()
        roomInfoHandles.keys.filter { it !in current }.forEach { id ->
            roomInfoHandles.remove(id)?.cancel()
        }
        for (room in roomObjects) {
            val id = room.id()
            if (id in roomInfoHandles) continue
            roomInfoHandles[id] = room.subscribeToRoomInfoUpdates(object : RoomInfoListener {
                override fun call(roomInfo: RoomInfo) { main { apply(roomInfo) } }
            })
        }
    }

    private fun apply(info: RoomInfo) {
        dirtySummaryIds += info.id
        val index = rooms.indexOfFirst { it.id == info.id }
        if (index < 0) return
        val summary = makeSummary(info, rooms[index].lastMessage, rooms[index].lastActivity)
        if (rooms[index] != summary) setRooms(rooms.toMutableList().also { it[index] = summary })
        resolveProfiles(summary.callParticipants, info.id)
    }

    private fun makeSummary(info: RoomInfo, lastMessage: String?, lastActivity: Date?): RoomSummary {
        val participants = info.activeRoomCallParticipants.distinct() // one entry per user
        // A direct message shows the other person's picture, from the room's heroes (an invite
        // has none yet, then the inviter is that person).
        var people: List<String?> = info.heroes.map { AvatarChoice.usable(it.avatarUrl) ?: profiles[it.userId]?.avatarUrl }
        if (people.isEmpty() && info.membership == Membership.INVITED) info.inviter?.let { people = listOf(it.avatarUrl) }
        return RoomSummary(
            id = info.id,
            name = info.displayName ?: info.rawName ?: info.canonicalAlias ?: info.id,
            avatarUrl = AvatarChoice.room(info.avatarUrl, info.isDirect, people),
            isDirect = info.isDirect,
            isSpace = info.isSpace,
            unread = info.numUnreadMessages.toLong(),
            mentions = info.numUnreadMentions.toLong(),
            notifications = info.numUnreadNotifications.toLong(),
            hasCall = info.hasRoomCall,
            callParticipants = participants,
            isEncrypted = info.encryptionState == EncryptionState.ENCRYPTED,
            membership = info.membership,
            topic = info.topic,
            canonicalAlias = info.canonicalAlias,
            memberCount = info.joinedMembersCount.toLong(),
            inviterName = info.inviter?.let { it.displayName ?: it.userId },
            lastMessage = lastMessage,
            lastActivity = lastActivity,
            isVoiceRoom = isVoiceChannel(info.id),
            dmUserId = if (info.isDirect && info.heroes.size == 1) info.heroes.first().userId else null,
            isFavourite = info.isFavourite,
        )
    }

    private fun scheduleSummaryRebuild() {
        summaryJob?.cancel()
        val snapshot = roomObjects.toList()
        summaryJob = main {
            delay(250)
            // Once a minute everything is read again (names and pictures of people in DMs).
            val full = lastFullSummary?.let { Date().time - it.time > 60_000 } ?: true
            val known = if (full) emptyMap() else summarizedRooms
            val dirty = dirtySummaryIds.toSet()
            val result = ArrayList<RoomSummary>(snapshot.size)
            for (room in snapshot) {
                val roomId = room.id()
                val previous = known[roomId]
                val existing = roomsById[roomId]
                if (previous === room && roomId !in dirty && existing != null) {
                    result += existing
                    continue
                }
                val info = try { room.roomInfo() } catch (_: Exception) { continue }
                // Spaces have no messages; every other room shows its newest one in the chat list.
                val latest = if (info.isSpace) null else try { room.latestEvent() } catch (_: Exception) { null }
                val last = latest?.let { preview(it, info.isDirect) }
                val date = latest?.let { date(it) }
                result += makeSummary(info, last, date)
            }
            if (!isActive) return@main
            summarizedRooms = snapshot.associateBy { it.id() }
            if (full) lastFullSummary = Date()
            dirtySummaryIds.removeAll(dirty)
            if (result != rooms) setRooms(result)
            for (summary in result) if (summary.callParticipants.isNotEmpty()) resolveProfiles(summary.callParticipants, summary.id)
            val joined = result.filter { it.isJoined }.map { it.id }.toSet()
            if (joined != knownJoinedRooms) {
                val first = knownJoinedRooms.isEmpty()
                knownJoinedRooms = joined
                if (!first) loadAllChannels()
            }
        }
    }

    /** The newest message for the chat list: "You: …", "Mia: …" in a group, the text in a DM. */
    private fun preview(event: LatestEventValue, isDirect: Boolean): String? = when (event) {
        is LatestEventValue.Remote -> {
            MessagePreview.of(event.content)?.let { text ->
                var name = event.sender
                (event.profile as? ProfileDetails.Ready)?.displayName?.let { name = it }
                ChatListLogic.preview(text, event.isOwn, isDirect, name)
            }
        }
        is LatestEventValue.Local -> MessagePreview.of(event.content)?.let { ChatListLogic.preview(it, true, isDirect, "") }
        else -> null
    }

    private fun date(event: LatestEventValue): Date? = when (event) {
        is LatestEventValue.Remote -> Date(event.timestamp.toLong())
        is LatestEventValue.Local -> Date(event.timestamp.toLong())
        is LatestEventValue.RemoteInvite -> Date(event.timestamp.toLong())
        else -> null
    }

    fun summary(roomId: String): RoomSummary? = roomsById[roomId]

    /** Sender and text of a room's newest message from someone else, for a notification. */
    suspend fun notificationPreview(roomId: String): Pair<String, String>? {
        val room = room(roomId) ?: return null
        val latest = try { room.latestEvent() } catch (_: Exception) { return null }
        if (latest !is LatestEventValue.Remote || latest.isOwn) return null
        val text = MessagePreview.of(latest.content) ?: return null
        val name = (latest.profile as? ProfileDetails.Ready)?.displayName ?: name(latest.sender)
        return name to text
    }

    fun room(roomId: String): Room? = try { client.getRoom(roomId) } catch (_: Exception) { null }

    val invites: List<RoomSummary> get() = rooms.filter { it.isInvite }

    val directMessages: List<RoomSummary> get() = rooms.filter { it.isDirect && !it.isSpace && it.isJoined }

    /** Group rooms that are not part of any loaded server, shown under Chats like Discord's DMs. */
    val roomsOutsideServers: List<RoomSummary>
        get() {
            val inServers = serverRoomIdsCache ?: categories.values.flatMap { list -> list.flatMap { c -> c.channels.map { it.roomId } } }.toSet()
            serverRoomIdsCache = inServers
            return rooms.filter { !it.isDirect && !it.isSpace && it.isJoined && it.id !in inServers && !isDiddyOptionsRoom(it.id, it.topic) }
        }

    private fun channelIds(spaceId: String): Set<String> =
        channelIdsCache.getOrPut(spaceId) { (categories[spaceId] ?: emptyList()).flatMap { c -> c.channels.map { it.roomId } }.toSet() }

    fun unreadCount(spaceId: String): Long = channelIds(spaceId).sumOf { roomsById[it]?.unread ?: 0 }
    fun mentionCount(spaceId: String): Long = channelIds(spaceId).sumOf { roomsById[it]?.mentions ?: 0 }

    fun isJoined(channel: SpaceRoom): Boolean = roomsById[channel.roomId]?.isJoined ?: channel.isJoinedState
    fun isJoinedRoom(roomId: String): Boolean = roomsById[roomId]?.isJoined ?: false

    fun isVoiceChannel(roomId: String): Boolean = roomId in voiceRoomIds
    fun markVoiceRoom(roomId: String) { voiceRoomIds = voiceRoomIds + roomId }

    fun destination(roomId: String): Destination = if (isVoiceChannel(roomId)) Destination.Voice(roomId) else Destination.Text(roomId)

    /** The server a channel belongs to, if any. */
    fun server(roomId: String): String? =
        categories.entries.firstOrNull { (_, list) -> list.any { c -> c.channels.any { it.roomId == roomId } } }?.key

    // MARK: - People

    fun name(userId: String): String = profiles[userId]?.name ?: localpart(userId)

    /** Fills in display names and avatars for ids the UI only knows as `@user:server`. */
    fun resolveProfiles(userIds: List<String>, roomId: String?) {
        val missing = userIds.filter { it !in profiles && it !in resolvingProfiles }.distinct()
        if (missing.isEmpty()) return
        resolvingProfiles += missing
        val room = roomId?.let { room(it) }
        main {
            // Four at a time, and one change of `profiles` per batch.
            for (batch in missing.chunked(4)) {
                val found = coroutineScope {
                    batch.map { userId ->
                        async {
                            try {
                                val member = room?.member(userId)
                                if (member != null) return@async Triple(userId, member.displayName, member.avatarUrl)
                            } catch (_: Exception) {}
                            try {
                                val profile = client.getProfile(userId)
                                Triple(userId, profile.displayName, profile.avatarUrl)
                            } catch (_: Exception) {
                                null
                            }
                        }
                    }.awaitAll().filterNotNull()
                }
                remember(found)
                resolvingProfiles.removeAll(batch.toSet())
            }
        }
    }

    fun remember(userId: String, name: String?, avatarUrl: String?) {
        val summary = UserSummary(name ?: localpart(userId), avatarUrl)
        if (profiles[userId] != summary) {
            profiles = profiles + (userId to summary)
            detailsChanged()
        }
    }

    /** Many people at once (a member list): one change of `profiles` instead of one per person. */
    fun remember(people: List<Triple<String, String?, String?>>) {
        val changed = profiles.toMutableMap()
        var any = false
        for ((userId, name, avatar) in people) {
            val summary = UserSummary(name ?: localpart(userId), avatar)
            if (changed[userId] != summary) {
                changed[userId] = summary
                any = true
            }
        }
        if (any) {
            profiles = changed
            detailsChanged()
        }
    }

    /** Opens the existing direct message with someone or starts a new one. */
    suspend fun directMessage(userId: String): String {
        try { client.getDmRoom(userId)?.let { return it.id() } } catch (_: Exception) {}
        return client.createRoom(
            CreateRoomParameters(
                name = null,
                topic = null,
                isEncrypted = true,
                isDirect = true,
                visibility = RoomVisibility.Private,
                preset = RoomPreset.TRUSTED_PRIVATE_CHAT,
                invite = listOf(userId),
                avatar = null,
                powerLevelContentOverride = null,
                joinRuleOverride = null,
                historyVisibilityOverride = null,
                canonicalAlias = null,
                isSpace = false,
            )
        )
    }

    suspend fun searchUsers(term: String): List<UserProfile> =
        client.searchUsers(term, 25uL).results.filter { it.userId != userId }

    suspend fun acceptInvite(roomId: String) {
        room(roomId)?.join()
        reloadSpaces()
        loadAllChannels()
    }

    suspend fun declineInvite(roomId: String) {
        room(roomId)?.leave()
    }

    suspend fun leave(roomId: String) {
        room(roomId)?.leave()
        loadAllChannels()
    }

    // MARK: - Spaces ("servers")

    suspend fun reloadSpaces() {
        val service = spaceService ?: return
        try { spaces = service.topLevelJoinedSpaces() } catch (_: Exception) {}
    }

    /** Loads the channels of a server: its rooms, and the rooms of each sub-space as a category. */
    suspend fun loadChannels(spaceId: String) {
        val service = spaceService ?: return
        val voice = fetchVoiceRooms(spaceId)
        if (!voiceRoomIds.containsAll(voice)) voiceRoomIds = voiceRoomIds + voice
        val top = children(spaceId, service)
        val result = mutableListOf<ChannelCategory>()
        val direct = top.filter { !it.isSubspace }
        if (direct.isNotEmpty()) result += ChannelCategory(spaceId, "Channels", direct)
        for (subspace in top.filter { it.isSubspace }) {
            result += ChannelCategory(subspace.roomId, subspace.displayName, channelsInCategory(subspace.roomId, service, 0))
        }
        setCategories(categories + (spaceId to result))
        loadedServers = loadedServers + spaceId
    }

    private suspend fun fetchVoiceRooms(spaceId: String): Set<String> {
        val result = mutableSetOf<String>()
        var next: String? = null
        repeat(10) {
            var path = "/_matrix/client/v1/rooms/${pathComponent(spaceId)}/hierarchy?limit=200"
            next?.let { path += "&from=" + URLEncoder.encode(it, "UTF-8") }
            val json = try { clientRequest(path) } catch (_: Exception) { return result }
            for (room in json["rooms"].objectsLenient()) {
                if (room["room_type"].str() == NewRoomRequest.VOICE_ROOM_TYPE) room["room_id"].str()?.let { result += it }
            }
            next = json["next_batch"].str()
            if (next == null) return result
        }
        return result
    }

    /** Categories are flat like Discord's, so spaces nested deeper fold into their category. */
    private suspend fun channelsInCategory(spaceId: String, service: SpaceService, depth: Int): List<SpaceRoom> {
        val result = mutableListOf<SpaceRoom>()
        for (child in children(spaceId, service)) {
            if (!child.isSubspace) result += child
            else if (depth < 3) result += channelsInCategory(child.roomId, service, depth + 1)
        }
        return result
    }

    /**
     * The channels of every server. Only one run goes at a time: a request during a run gets one
     * more run afterwards instead of a second one alongside.
     */
    suspend fun loadAllChannels() {
        channelsRequested += 1
        val wanted = channelsRequested
        while (channelsDone < wanted) {
            val running = channelsJob
            if (running != null) {
                running.join()
                continue
            }
            val generation = channelsRequested
            val job = main {
                loadEveryServersChannels()
                channelsDone = maxOf(channelsDone, generation)
                channelsLoadedAt = Date()
            }
            channelsJob = job
            job.join()
            channelsJob = null
        }
    }

    private suspend fun loadEveryServersChannels() {
        val ids = spaces.map { it.roomId }
        val limit = Semaphore(4)
        coroutineScope {
            ids.map { id -> async { limit.withPermit { loadChannels(id) } } }.awaitAll()
        }
    }

    private suspend fun children(spaceId: String, service: SpaceService): List<SpaceRoom> {
        val list = try { service.spaceRoomList(spaceId) } catch (_: Exception) { return emptyList() }
        repeat(20) {
            val state = list.paginationState()
            if (state is SpaceRoomListPaginationState.Idle && state.endReached) return@repeat
            try { list.paginate() } catch (_: Exception) { return@repeat }
        }
        // A joined Diddy Options room is plumbing, not a channel; desktop hides it too.
        return list.rooms().filter { !(isDiddyOptionsRoom(it.roomId, it.topic) && isJoined(it)) }
    }

    suspend fun join(channel: SpaceRoom) {
        client.joinRoomByIdOrAlias(channel.roomId, channel.via)
        server(channel.roomId)?.let { loadChannels(it) }
    }

    fun unjoinedChannels(spaceId: String): List<SpaceRoom> =
        (categories[spaceId] ?: emptyList()).flatMap { it.channels }.filter { !isJoined(it) }

    /** The desktop app's "Join All Rooms". Returns how many failed. */
    suspend fun joinAllChannels(spaceId: String): Int {
        var failed = 0
        for (channel in unjoinedChannels(spaceId)) {
            try { client.joinRoomByIdOrAlias(channel.roomId, channel.via) } catch (_: Exception) { failed += 1 }
        }
        loadChannels(spaceId)
        return failed
    }

    /** Joins a server or room from an alias, room id or matrix.to link. Returns its room id. */
    suspend fun joinServer(input: String): String {
        var text = input.trim()
        var via = emptyList<String>()
        val marker = text.indexOf("matrix.to/#/")
        if (marker >= 0) {
            text = text.substring(marker + "matrix.to/#/".length)
            val query = text.indexOf('?')
            if (query >= 0) {
                via = app.diddy.app.MatrixToLink.viaServers(text.substring(query))
                text = text.substring(0, query)
            }
            text = try { java.net.URLDecoder.decode(text, "UTF-8") } catch (_: Exception) { text }
        }
        if (!text.startsWith("#") && !text.startsWith("!")) {
            throw DiddyError("Enter an address like #community:matrix.org or a matrix.to link.")
        }
        val room = client.joinRoomByIdOrAlias(text, via)
        reloadSpaces()
        loadAllChannels()
        return room.id()
    }

    /** A server is a Matrix space, joinable by invite or, if public, by anyone with the address. */
    suspend fun createServer(name: String, topic: String, isPublic: Boolean): String {
        val id = client.createRoom(
            CreateRoomParameters(
                name = name,
                topic = topic.ifEmpty { null },
                isEncrypted = false,
                isDirect = false,
                visibility = RoomVisibility.Private,
                preset = if (isPublic) RoomPreset.PUBLIC_CHAT else RoomPreset.PRIVATE_CHAT,
                invite = null,
                avatar = null,
                powerLevelContentOverride = null,
                joinRuleOverride = null,
                historyVisibilityOverride = null,
                canonicalAlias = null,
                isSpace = true,
            )
        )
        try { waitForRoom(id) } catch (_: Exception) {}
        reloadSpaces()
        // Every server starts with a place to talk, like on Discord. A failure here must not read
        // as "try again": that would make a duplicate server.
        try { createChannel(id, "general", "", isVoice = false, encrypted = !isPublic) } catch (_: Exception) {}
        try { createChannel(id, "General", "", isVoice = true, encrypted = !isPublic) } catch (_: Exception) {}
        loadChannels(id)
        return id
    }

    /** Creates a channel any server member can join (voice channels need a room type). */
    suspend fun createChannel(spaceId: String, name: String, topic: String, isVoice: Boolean, encrypted: Boolean): String {
        val space = room(spaceId) ?: throw DiddyError("This server is not available yet.")
        val via = listOf(runCatching { client.userIdServerName() }.getOrDefault(record.serverName))
        val state = mutableListOf<Map<String, Any?>>(
            mapOf(
                "type" to "m.room.join_rules", "state_key" to "",
                "content" to mapOf(
                    "join_rule" to "restricted",
                    "allow" to listOf(mapOf("type" to "m.room_membership", "room_id" to spaceId, "via" to via)),
                ),
            ),
            mapOf("type" to "m.space.parent", "state_key" to spaceId, "content" to mapOf("via" to via, "canonical" to true)),
        )
        if (encrypted) state += mapOf("type" to "m.room.encryption", "state_key" to "", "content" to mapOf("algorithm" to "m.megolm.v1.aes-sha2"))
        val body = linkedMapOf<String, Any?>("name" to name, "preset" to "private_chat", "visibility" to "private", "initial_state" to state)
        if (topic.isNotEmpty()) body["topic"] = topic
        if (isVoice) {
            body["creation_content"] = mapOf("type" to NewRoomRequest.VOICE_ROOM_TYPE)
            // Joining a call writes a state event; members must be allowed to.
            body["power_level_content_override"] = mapOf("events" to mapOf("org.matrix.msc3401.call.member" to 0))
        }
        val id = clientRequest("/_matrix/client/v3/createRoom", body)["room_id"].str()
            ?: throw DiddyError("The server could not create the channel.")
        if (isVoice) markVoiceRoom(id)
        // Written directly: the SDK's addChildToSpace fails until the new room has synced.
        space.sendStateEventRaw("m.space.child", id, Json.encode(mapOf("via" to via, "suggested" to true)), null)
        try { waitForRoom(id) } catch (_: Exception) {}
        loadChannels(spaceId)
        return id
    }

    /** For the few client API calls the SDK has no way to make. A body is sent with POST. */
    suspend fun clientRequest(path: String, body: Any? = null, method: String? = null): Map<String, Any?> =
        Json.obj(clientRequestData(path, body, method).text) ?: emptyMap()

    suspend fun clientRequestArray(path: String): List<Map<String, Any?>> =
        Json.arr(clientRequestData(path, null, null).text)?.mapNotNull { it.obj() } ?: emptyList()

    suspend fun clientRequestData(path: String, body: Any?, method: String?): app.diddy.util.HttpAnswer {
        val session = client.session()
        val base = session.homeserverUrl.trimEnd('/')
        val verb = method ?: if (body != null) "POST" else "GET"
        val answer = Http.request(
            base + path,
            method = verb,
            json = body,
            headers = mapOf("Authorization" to "Bearer ${session.accessToken}"),
        )
        if (answer.status != 200) {
            val json = answer.json ?: emptyMap()
            throw ClientApiError(json["errcode"].str(), json["error"].str() ?: "The server refused the request.", answer.status)
        }
        return answer
    }

    suspend fun joinedMembers(roomId: String): List<String> =
        clientRequest("/_matrix/client/v3/rooms/${pathComponent(roomId)}/joined_members")["joined"].obj()?.keys?.toList() ?: emptyList()

    /** The content of one state event, read from the server. Throws when the room has none. */
    suspend fun stateContent(roomId: String, type: String, stateKey: String): Map<String, Any?> =
        clientRequest("/_matrix/client/v3/rooms/${pathComponent(roomId)}/state/${pathComponent(type)}/${pathComponent(stateKey)}")

    /** A room created or joined a moment ago reaches the client with the next sync. */
    suspend fun waitForRoom(roomId: String) {
        repeat(40) {
            if (room(roomId) != null) return
            delay(250)
        }
        throw DiddyError("The room did not arrive from the server in time.")
    }

    /** Leaves a server, and its channels too as on Discord unless `withChannels` is off. */
    suspend fun leaveServer(spaceId: String, withChannels: Boolean = true) {
        val service = spaceService ?: return
        val handle = service.leaveSpace(spaceId)
        val everything = handle.rooms().map { it.spaceRoom.roomId }
        val ids = if (withChannels) (if (spaceId in everything) everything else everything + spaceId) else listOf(spaceId)
        handle.leave(ids)
        setCategories(categories - spaceId)
        loadedServers = loadedServers - spaceId
        reloadSpaces()
    }

    // MARK: - Encryption

    val needsRecovery: Boolean
        get() = verificationState == VerificationState.UNVERIFIED || recoveryState == RecoveryState.INCOMPLETE

    suspend fun recover(key: String) = client.encryption().recover(key.trim())

    companion object {
        fun localpart(userId: String): String {
            val trimmed = userId.removePrefix("@")
            return trimmed.split(":").firstOrNull()?.ifEmpty { null } ?: userId
        }

        fun pathComponent(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}
