package app.diddy.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.util.Json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.matrix.rustcomponents.sdk.EmbeddedEventDetails
import org.matrix.rustcomponents.sdk.EventOrTransactionId
import org.matrix.rustcomponents.sdk.ProfileDetails
import org.matrix.rustcomponents.sdk.Room
import org.matrix.rustcomponents.sdk.RoomInfo
import org.matrix.rustcomponents.sdk.RoomInfoListener
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.ThreadSummary
import org.matrix.rustcomponents.sdk.TimelineItem
import org.matrix.rustcomponents.sdk.TimelineItemContent
import java.util.Date
import java.util.IdentityHashMap

/**
 * The rules behind moving around the chat and the extra message actions, the same as the
 * desktop's (ios TimelineNavLogic.swift).
 */
object TimelineNav {
    data class Entry(
        val eventId: String?,
        val rowId: String?,
        val sender: String,
        val readers: List<String> = emptyList(),
        val threadRoot: String? = null,
        val replyTo: String? = null,
    )

    /** "New Messages" goes above the first message shown after the event you had read up to. */
    fun newDividerRowId(entries: List<Entry>, readUpTo: String?, me: String): String? {
        if (readUpTo.isNullOrEmpty()) return null
        var passed = false
        for (entry in entries) {
            if (passed && entry.rowId != null && entry.sender != me) return entry.rowId
            if (entry.eventId == readUpTo) passed = true
        }
        return null
    }

    /** Everyone who has read up to the event or past it, the latest readers first. */
    fun readers(eventId: String, entries: List<Entry>): List<String> {
        if (!eventId.startsWith("$")) return emptyList()
        val index = entries.indexOfLast { it.eventId == eventId }
        if (index < 0) return emptyList()
        val seen = mutableSetOf<String>()
        val result = mutableListOf<String>()
        for (entry in entries.subList(index, entries.size).asReversed()) {
            for (user in entry.readers) if (seen.add(user)) result += user
        }
        return result
    }

    fun latestShownEventId(entries: List<Entry>): String? =
        entries.lastOrNull { it.rowId != null && it.eventId?.startsWith("$") == true }?.eventId

    /** The line under the composer (RoomViewFollowing.tsx), as pieces with the names in bold. */
    fun following(names: List<String>): List<Pair<String, Boolean>> {
        val tail = " are following the conversation." to false
        return when (names.size) {
            0 -> emptyList()
            1 -> listOf(names[0] to true, " is following the conversation." to false)
            2 -> listOf(names[0] to true, " and " to false, names[1] to true, tail)
            3 -> listOf(names[0] to true, ", " to false, names[1] to true, " and " to false, names[2] to true, tail)
            else -> listOf(
                names[0] to true, ", " to false, names[1] to true, ", " to false, names[2] to true,
                " and " to false, "${names.size - 3} others" to true, tail,
            )
        }
    }

    fun seenBy(names: List<String>): String = when (names.size) {
        0 -> ""
        1 -> "Seen by ${names[0]}"
        else -> "Seen by ${names.size}"
    }

    /** The row to show for an event: its own, or the next one shown after it. */
    fun rowId(eventId: String, entries: List<Entry>): String? {
        val index = entries.indexOfFirst { it.eventId == eventId }
        if (index < 0) return null
        entries.subList(index, entries.size).firstOrNull { it.rowId != null }?.rowId?.let { return it }
        return entries.subList(0, index).lastOrNull { it.rowId != null }?.rowId
    }

    fun timestampToEventPath(roomId: String, date: Date): String =
        "/_matrix/client/v1/rooms/${MatrixAccount.pathComponent(roomId)}/timestamp_to_event?ts=${date.time}&dir=f"

    /** What "Reply in Thread" sends next to the message (RoomInput.tsx `getReplyContent`). */
    fun threadRelation(root: String, replyTo: String, fallback: Boolean = false): Map<String, Any?> = mapOf(
        "m.relates_to" to mapOf(
            "m.in_reply_to" to mapOf("event_id" to replyTo),
            "event_id" to root,
            "rel_type" to "m.thread",
            "is_falling_back" to fallback,
        ),
    )

    fun threadRelationJson(root: String, replyTo: String, fallback: Boolean = false) = Json.encode(threadRelation(root, replyTo, fallback))

    fun reportPath(roomId: String, eventId: String) =
        "/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}/report/${MatrixAccount.pathComponent(eventId)}"

    fun reportBody(reason: String): Map<String, Any?> {
        val trimmed = reason.trim()
        return mapOf("score" to if (trimmed.isEmpty()) -50 else -100, "reason" to trimmed.ifEmpty { "No reason provided" })
    }

    fun canDelete(isOwn: Boolean, isRedacted: Boolean, canRedactOwn: Boolean, canRedactOther: Boolean): Boolean {
        if (isRedacted) return false
        return canRedactOther || (isOwn && canRedactOwn)
    }

    /** The "View Source" text: the event, or the event and its latest replacement. */
    fun sourceText(original: String?, latestEdit: String?): String {
        if (original == null) return "{}"
        if (latestEdit == null || latestEdit == original) return pretty(original)
        return try {
            JSONObject().put("<== MAIN_EVENT ==>", JSONObject(original)).put("<== REPLACEMENT_EVENT_1 ==>", JSONObject(latestEdit)).toString(2)
        } catch (_: Exception) {
            original
        }
    }

    fun pretty(json: String): String = try { JSONObject(json).toString(2) } catch (_: Exception) { json }
}

/** How many replies a thread has and what was said last, shown under the root message. */
data class ThreadInfo(val replies: Int, val latestSender: String, val latestText: String)

data class TimelineNavSnapshot(
    val entries: List<TimelineNav.Entry> = emptyList(),
    val threads: Map<String, ThreadInfo> = emptyMap(),
    val replyTargets: Map<String, String> = emptyMap(),
    val reactionSenders: Map<String, Map<String, List<String>>> = emptyMap(),
    val eventIds: Map<String, String> = emptyMap(),
)

/** Read receipts, threads, pins and what you may do here, beside the chat rows (ios TimelineNavModel). */
class TimelineNavModel {
    var snapshot by mutableStateOf(TimelineNavSnapshot())
        private set
    /** The event you had read up to when the room opened (the `m.fully_read` marker). */
    var readUpTo by mutableStateOf<String?>(null)
        private set
    var pinned by mutableStateOf<List<String>>(emptyList())
        private set
    var canPin by mutableStateOf(false)
        private set
    var canRedactOther by mutableStateOf(false)
        private set
    var canRedactOwn by mutableStateOf(true)
        private set

    private var infoHandle: TaskHandle? = null
    private var started = false
    private val scope = CoroutineScope(Dispatchers.Main)

    suspend fun start(room: Room) {
        if (started) return
        started = true
        try {
            val info = room.roomInfo()
            readUpTo = info.fullyReadEventId
            pinned = info.pinnedEventIds
        } catch (_: Exception) {}
        try {
            val levels = room.getPowerLevels()
            canPin = levels.canOwnUserPinUnpin()
            canRedactOther = levels.canOwnUserRedactOther()
            canRedactOwn = levels.canOwnUserRedactOwn()
        } catch (_: Exception) {}
        infoHandle = room.subscribeToRoomInfoUpdates(object : RoomInfoListener {
            override fun call(roomInfo: RoomInfo) {
                val ids = roomInfo.pinnedEventIds
                scope.launch { if (pinned != ids) pinned = ids }
            }
        })
    }

    fun close() {
        infoHandle?.cancel()
        infoHandle = null
    }

    fun setPinned(eventId: String, on: Boolean) {
        pinned = pinned.filter { it != eventId } + if (on) listOf(eventId) else emptyList()
    }

    fun dividerRowId(me: String): String? = TimelineNav.newDividerRowId(snapshot.entries, readUpTo, me)
    fun readers(eventId: String): List<String> = TimelineNav.readers(eventId, snapshot.entries)
    val latestReaders: List<String> get() = latestShownEventId?.let { readers(it) } ?: emptyList()
    val latestShownEventId: String? get() = TimelineNav.latestShownEventId(snapshot.entries)
    fun isPinned(eventId: String?): Boolean = eventId != null && eventId in pinned

    private class ItemNav(
        val id: String,
        val eventId: String?,
        val sender: String,
        val readers: List<String>,
        val threadRoot: String?,
        val replyTo: String?,
        val thread: ThreadInfo?,
        val reactions: Map<String, List<String>>,
    )

    private var itemCache = IdentityHashMap<TimelineItem, ItemNav?>()

    private fun read(item: TimelineItem, me: String): ItemNav? {
        val event = item.asEvent() ?: return null
        val eventId = (event.eventOrTransactionId as? EventOrTransactionId.EventId)?.eventId
        var replyTo: String? = null
        var threadRoot: String? = null
        var thread: ThreadInfo? = null
        (event.content as? TimelineItemContent.MsgLike)?.content?.let { like ->
            replyTo = like.inReplyTo?.eventId()
            threadRoot = like.threadRoot
            like.threadSummary?.let { thread = info(it) }
        }
        val readers = event.readReceipts.entries.filter { it.key != me }
            .sortedByDescending { it.value.timestamp?.toLong() ?: 0 }.map { it.key }
        val reactions = event.reactions.associate { r -> r.key to r.senders.map { it.senderId } }
        return ItemNav(item.uniqueId().id, eventId, event.sender, readers, threadRoot, replyTo, thread, reactions)
    }

    fun update(items: List<TimelineItem>, rowIds: Set<String>, me: String) {
        val entries = ArrayList<TimelineNav.Entry>(items.size)
        val threads = HashMap<String, ThreadInfo>()
        val replyTargets = HashMap<String, String>()
        val reactionSenders = HashMap<String, Map<String, List<String>>>()
        val eventIds = HashMap<String, String>()
        val cache = IdentityHashMap<TimelineItem, ItemNav?>()
        for (item in items) {
            val nav = if (itemCache.containsKey(item)) itemCache[item] else read(item, me)
            cache[item] = nav
            if (nav == null) continue
            val id = nav.id
            nav.thread?.let { threads[id] = it }
            val shown = id in rowIds
            entries += TimelineNav.Entry(nav.eventId, if (shown) id else null, nav.sender, nav.readers, nav.threadRoot, nav.replyTo)
            if (!shown) continue
            nav.eventId?.let { eventIds[id] = it }
            nav.replyTo?.let { replyTargets[id] = it }
            if (nav.reactions.isNotEmpty()) reactionSenders[id] = nav.reactions
        }
        itemCache = cache
        val next = TimelineNavSnapshot(entries, threads, replyTargets, reactionSenders, eventIds)
        if (next != snapshot) snapshot = next
    }

    private fun info(summary: ThreadSummary): ThreadInfo {
        var sender = ""
        var text = ""
        val latest = summary.latestEvent()
        if (latest is EmbeddedEventDetails.Ready) {
            sender = latest.sender
            (latest.senderProfile as? ProfileDetails.Ready)?.displayName?.let { sender = it }
            text = MessagePreview.of(latest.content) ?: ""
        }
        return ThreadInfo(summary.numReplies().toInt(), sender, text)
    }
}
