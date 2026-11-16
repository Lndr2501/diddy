package app.diddy.matrix

import app.diddy.app.DiagLog
import app.diddy.util.Json
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.str
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.DateDividerMode
import org.matrix.rustcomponents.sdk.EventTimelineItem
import org.matrix.rustcomponents.sdk.MsgLikeKind
import org.matrix.rustcomponents.sdk.Room
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.Timeline
import org.matrix.rustcomponents.sdk.TimelineConfiguration
import org.matrix.rustcomponents.sdk.TimelineDiff
import org.matrix.rustcomponents.sdk.TimelineFilter
import org.matrix.rustcomponents.sdk.TimelineFocus
import org.matrix.rustcomponents.sdk.TimelineItem
import org.matrix.rustcomponents.sdk.TimelineItemContent
import org.matrix.rustcomponents.sdk.TimelineListener
import uniffi.matrix_sdk_ui.TimelineReadReceiptTracking

/** One Diddy event of an options room as it was sent in "message mode". Content is untrusted. */
class DiddyMessageEvent(val type: String, val sender: String, val ts: Long, val content: Map<String, Any?>)

/**
 * Reads the message-mode events of an encrypted options room through a decrypting timeline
 * (ios DiddyOptionsFeed.swift). New events arrive live and `onChange` fires (debounced).
 */
class DiddyOptionsFeed(private val roomId: String) {
    companion object {
        val types = setOf(DiddyEvents.PROFILE, DiddyEvents.BADGE, DiddyEvents.AWARD)
        private const val PAGE_SIZE: Int = 100
        private const val MAX_PAGES = 4
        private const val MAX_LOCAL = 24
    }

    private val scope = CoroutineScope(Dispatchers.Main.immediate)
    private var timeline: Timeline? = null
    private var listener: TaskHandle? = null
    private val items = mutableListOf<TimelineItem>()
    private var parsed: Map<String, DiddyMessageEvent> = emptyMap()
    private var starting = false
    private val local = mutableListOf<DiddyMessageEvent>()
    private var reloadJob: Job? = null
    var failed = false
        private set
    var ready = false
        private set
    var onChange: (() -> Unit)? = null
    private var undecryptableSenders: Set<String> = emptySet()

    suspend fun start(room: Room) {
        if (timeline != null || starting) return
        starting = true
        try {
            val timeline = try {
                room.timelineWithConfiguration(
                    TimelineConfiguration(
                        focus = TimelineFocus.Live(false),
                        filter = TimelineFilter.All,
                        internalIdPrefix = "diddy-options",
                        dateDividerMode = DateDividerMode.DAILY,
                        trackReadReceipts = TimelineReadReceiptTracking.DISABLED,
                        reportUtds = false,
                    )
                )
            } catch (e: Exception) {
                failed = true
                DiagLog.write("diddy: options room timeline failed room=$roomId")
                return
            }
            this.timeline = timeline
            failed = false
            listener = timeline.addListener(object : TimelineListener {
                override fun onUpdate(diff: List<TimelineDiff>) { scope.launch { apply(diff) } }
            })
            var paging = "more"
            for (page in 0 until MAX_PAGES) {
                try {
                    if (timeline.paginateBackwards(PAGE_SIZE.toUShort())) { paging = "start"; break }
                } catch (e: Exception) {
                    paging = "error ${e.friendlyMessage}"
                    break
                }
            }
            delay(400)
            ready = true
            DiagLog.write("diddy: options room read room=$roomId events=${events.size} undecryptable=${undecryptableSenders.size} paging=$paging items=${items.size}")
        } finally {
            starting = false
        }
    }

    /** Everything Diddy-related read so far, plus what this device sent and has not seen back. */
    val events: List<DiddyMessageEvent> get() = parsed.values.toList() + local

    /** True when nothing is known to be missing for this sender. */
    fun isCompleteFor(sender: String): Boolean = ready && !failed && sender !in undecryptableSenders

    fun addLocal(type: String, sender: String, content: Map<String, Any?>) {
        local += DiddyMessageEvent(type, sender, System.currentTimeMillis(), content)
        while (local.size > MAX_LOCAL) local.removeAt(0)
    }

    private fun apply(diffs: List<TimelineDiff>) {
        for (diff in diffs) ListDiff.of(diff).apply(items)
        val before = signature
        rebuild()
        if (ready && signature != before) scheduleChange()
    }

    private val signature: Int get() = parsed.size + undecryptableSenders.size * 1000

    private fun rebuild() {
        val next = HashMap<String, DiddyMessageEvent>()
        val utd = HashSet<String>()
        for (item in items) {
            val event = item.asEvent() ?: continue
            val id = item.uniqueId().id
            val content = event.content
            if (content is TimelineItemContent.MsgLike && content.content.kind is MsgLikeKind.UnableToDecrypt) {
                utd += event.sender
                continue
            }
            val type = event.eventTypeRaw ?: continue
            if (type !in types) continue
            val known = parsed[id]
            if (known != null) next[id] = known else parse(event, type)?.let { next[id] = it }
        }
        parsed = next
        undecryptableSenders = utd
    }

    private fun parse(event: EventTimelineItem, type: String): DiddyMessageEvent? {
        if (!event.isRemote) return null
        val json = event.lazyProvider.debugInfo().originalJson ?: return null
        val obj = Json.obj(json) ?: return null
        if (obj["type"].str() != type) return null
        val content = obj["content"].obj() ?: return null
        val ts = obj["origin_server_ts"].long() ?: event.timestamp.toLong()
        return DiddyMessageEvent(type, obj["sender"].str() ?: event.sender, ts, content)
    }

    private fun scheduleChange() {
        reloadJob?.cancel()
        reloadJob = scope.launch {
            delay(2_000)
            onChange?.invoke()
        }
    }
}
