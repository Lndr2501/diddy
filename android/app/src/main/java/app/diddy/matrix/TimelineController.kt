package app.diddy.matrix

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.ChatSettings
import app.diddy.app.VoiceRecording
import app.diddy.app.VoiceWaveform
import app.diddy.media.AudioAttachment
import app.diddy.util.Http
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.matrix.rustcomponents.sdk.AttachmentKind
import org.matrix.rustcomponents.sdk.AudioInfo
import org.matrix.rustcomponents.sdk.Client
import org.matrix.rustcomponents.sdk.DateDividerMode
import org.matrix.rustcomponents.sdk.EditedContent
import org.matrix.rustcomponents.sdk.EmbeddedEventDetails
import org.matrix.rustcomponents.sdk.EmoteMessageContent
import org.matrix.rustcomponents.sdk.EventOrTransactionId
import org.matrix.rustcomponents.sdk.EventTimelineItem
import org.matrix.rustcomponents.sdk.FileInfo
import org.matrix.rustcomponents.sdk.FormattedBody
import org.matrix.rustcomponents.sdk.ImageInfo
import org.matrix.rustcomponents.sdk.MediaSource
import org.matrix.rustcomponents.sdk.MembershipChange
import org.matrix.rustcomponents.sdk.Mentions
import org.matrix.rustcomponents.sdk.MessageContent
import org.matrix.rustcomponents.sdk.MessageFormat
import org.matrix.rustcomponents.sdk.MessageType
import org.matrix.rustcomponents.sdk.MsgLikeKind
import org.matrix.rustcomponents.sdk.NoticeMessageContent
import org.matrix.rustcomponents.sdk.OtherState
import org.matrix.rustcomponents.sdk.ProfileDetails
import org.matrix.rustcomponents.sdk.ReceiptType
import org.matrix.rustcomponents.sdk.Room
import org.matrix.rustcomponents.sdk.RoomMessageEventContentWithoutRelation
import org.matrix.rustcomponents.sdk.SendAttachmentJoinHandle
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.TextMessageContent
import org.matrix.rustcomponents.sdk.ThumbnailInfo
import org.matrix.rustcomponents.sdk.Timeline
import org.matrix.rustcomponents.sdk.TimelineConfiguration
import org.matrix.rustcomponents.sdk.TimelineDiff
import org.matrix.rustcomponents.sdk.TimelineFilter
import org.matrix.rustcomponents.sdk.TimelineFocus
import org.matrix.rustcomponents.sdk.TimelineItem
import org.matrix.rustcomponents.sdk.TimelineItemContent
import org.matrix.rustcomponents.sdk.TimelineListener
import org.matrix.rustcomponents.sdk.TypingNotificationsListener
import org.matrix.rustcomponents.sdk.UploadParameters
import org.matrix.rustcomponents.sdk.UploadSource
import org.matrix.rustcomponents.sdk.VideoInfo
import org.matrix.rustcomponents.sdk.messageEventContentFromHtml
import org.matrix.rustcomponents.sdk.messageEventContentFromMarkdown
import org.matrix.rustcomponents.sdk.messageEventContentNew
import uniffi.matrix_sdk_ui.TimelineReadReceiptTracking
import java.time.Duration
import java.util.Date
import java.util.IdentityHashMap

data class ReactionChip(val key: String, val count: Int, val mine: Boolean)

/** A video message the chat plays inline (desktop `MVideo`). */
class VideoAttachment(content: org.matrix.rustcomponents.sdk.VideoMessageContent) {
    val source: MediaSource = content.source
    val filename: String = content.filename
    val mimeType: String? = content.info?.mimetype
    val width: Double? = content.info?.width?.toDouble()
    val height: Double? = content.info?.height?.toDouble()
    val duration: Double? = content.info?.duration?.let { it.toMillis() / 1000.0 }?.takeIf { it.isFinite() && it >= 0 }?.coerceAtMost(24 * 3600.0)
    val thumbnail: MediaSource? = content.info?.thumbnailSource
    val caption: String? = content.caption?.trim()?.ifEmpty { null }
}

/** An `m.location` message (desktop `MLocation`). */
class LocationAttachment(val geoUri: String, val location: GeoLocation, val label: String?) {
    companion object {
        fun of(content: org.matrix.rustcomponents.sdk.LocationContent): LocationAttachment? {
            val parsed = GeoLocation.parse(content.geoUri) ?: return null
            val text = (content.description ?: content.body).trim()
            return LocationAttachment(content.geoUri, parsed, text.ifEmpty { null })
        }
    }
}

/** One row of the chat, already shaped for the Discord-style message list (ios MessageRow). */
data class MessageRow(
    val id: String,
    val eventId: EventOrTransactionId?,
    val sender: String,
    val senderName: String,
    val senderAvatar: String?,
    val date: Date,
    val body: Body,
    val isOwn: Boolean,
    val isEdited: Boolean,
    val reply: Reply?,
    val reactions: List<ReactionChip>,
    var showsHeader: Boolean = true,
    var dayDivider: Date? = null,
    val isPending: Boolean = false,
    val card: BotCard? = null,
    val music: MusicCard? = null,
    val imageThumbnail: MediaSource? = null,
    var revision: Int = 0,
    val membership: TimelineLayout.Membership? = null,
    val rich: RichSource? = null,
    val richItalic: Boolean = false,
    val previewUrls: List<String> = emptyList(),
    val previewsLocal: Boolean = false,
    val video: VideoAttachment? = null,
    val location: LocationAttachment? = null,
    val caption: String? = null,
    val captionRich: RichSource? = null,
    val isSticker: Boolean = false,
    var callCount: Int = 0,
    var lastCallDate: Date? = null,
    val sendFailed: Boolean = false,
) {
    sealed class Body {
        data class Text(val text: String) : Body()
        class Image(val source: MediaSource, val filename: String, val width: Double?, val height: Double?) : Body()
        class File(val label: String, val source: MediaSource, val mimeType: String?, val filename: String) : Body()
        class Audio(val audio: AudioAttachment) : Body()
        data class Notice(val text: String) : Body()
        data object Undecryptable : Body()
        data object Redacted : Body()
    }

    data class Reply(val sender: String, val senderId: String, val text: String, val avatar: String?)

    val layoutKind: TimelineLayout.Kind get() = if (body is Body.Notice) TimelineLayout.Kind.NOTICE else TimelineLayout.Kind.MESSAGE
    val remoteEventId: String? get() = (eventId as? EventOrTransactionId.EventId)?.eventId
    val isRedactedMessage: Boolean get() = body is Body.Redacted
    /** Whether the message menu offers the extra actions. */
    val hasServerEvent: Boolean get() = body !is Body.Notice && remoteEventId != null
}

/** One earlier version of an edited message. */
data class MessageEditVersion(val id: Int, val text: String, val date: Date?)

/** One line for reply previews and the chat list (ios TimelineController.preview). */
object MessagePreview {
    fun of(content: TimelineItemContent): String? {
        val like = (content as? TimelineItemContent.MsgLike)?.content ?: return null
        return when (val kind = like.kind) {
            is MsgLikeKind.Message -> when (val type = kind.content.msgType) {
                is MessageType.Image -> "📷 Photo"
                is MessageType.Video -> "🎬 Video"
                is MessageType.Audio -> if (type.content.voice != null) "🎤 Voice message" else "🔊 Audio"
                is MessageType.File -> "📎 ${type.content.filename}"
                else -> kind.content.body
            }
            is MsgLikeKind.Sticker -> "Sticker"
            is MsgLikeKind.Redacted -> "Message deleted"
            is MsgLikeKind.UnableToDecrypt -> "🔒 Encrypted message"
            else -> null
        }
    }
}

/** What the timeline adds to a row beyond its plain `Body`: rich text, video and location. */
private class MessageExtras {
    var rich: RichSource? = null
    var italic = false
    var video: VideoAttachment? = null
    var location: LocationAttachment? = null
    var previewText: String? = null
    var caption: String? = null
    var captionRich: RichSource? = null

    fun setCaption(text: String?, formatted: FormattedBody?) {
        val trimmed = text?.trim()?.ifEmpty { null } ?: return
        caption = trimmed
        captionRich = source(trimmed, formatted)
        previewText = trimmed
    }

    companion object {
        fun source(body: String, formatted: FormattedBody?): RichSource? {
            val html = formatted?.takeIf { it.format is MessageFormat.Html }?.body
            return RichSource.choose(body, html)
        }

        fun of(message: MessageContent): MessageExtras {
            val extras = MessageExtras()
            when (val type = message.msgType) {
                is MessageType.Text -> {
                    extras.rich = source(type.content.body, type.content.formatted)
                    extras.previewText = type.content.body
                }
                is MessageType.Notice -> {
                    extras.rich = source(type.content.body, type.content.formatted)
                    extras.previewText = type.content.body
                }
                is MessageType.Emote -> {
                    extras.rich = source(type.content.body, type.content.formatted)
                    extras.italic = true
                    extras.previewText = type.content.body
                }
                is MessageType.Image -> extras.setCaption(type.content.caption, type.content.formattedCaption)
                is MessageType.File -> extras.setCaption(type.content.caption, type.content.formattedCaption)
                is MessageType.Audio -> extras.setCaption(type.content.caption, type.content.formattedCaption)
                is MessageType.Video -> extras.video = VideoAttachment(type.content)
                is MessageType.Location -> extras.location = LocationAttachment.of(type.content)
                else -> {}
            }
            return extras
        }
    }
}

/** The people typing in one room. */
class TypingStore {
    var userIds by mutableStateOf<List<String>>(emptyList())
}

/** The chat of one room (ios TimelineController.swift). */
class TimelineController(
    val room: Room,
    val ownUserId: String,
    /** A direct message leaves out the joins and invites that set it up. */
    val isDirect: Boolean = false,
    /** Not the live chat but one thread or the pinned messages, when set. */
    val focus: TimelineFocus? = null,
) {
    var rows by mutableStateOf<List<MessageRow>>(emptyList())
        private set
    var reachedStart by mutableStateOf(false)
        private set
    var loading by mutableStateOf(false)
        private set
    var sendError by mutableStateOf<String?>(null)
    var uploadingAttachment by mutableStateOf(false)
        private set
    /** Automatic message deletion (#245): messages older than this (ms) are hidden right away; the server purges them later. */
    var retentionLifetime by mutableStateOf<Long?>(null)
        private set
    val typing = TypingStore()
    val roomId: String = room.id()
    val nav = TimelineNavModel()
    var timeline: Timeline? = null
        private set
    var items: List<TimelineItem> = emptyList()
        private set

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val itemList = mutableListOf<TimelineItem>()
    private var rowRevisions = HashMap<String, Pair<TimelineItem, Int>>()
    private sealed class BuiltItem {
        data class Day(val date: Date) : BuiltItem()
        data object Skip : BuiltItem()
        class Event(val date: Date, val isCreate: Boolean, val row: MessageRow?) : BuiltItem()
    }
    private var builtItems = IdentityHashMap<TimelineItem, BuiltItem>()
    private var builtWith: Triple<Boolean, Boolean, Boolean>? = null
    private var listener: TaskHandle? = null
    private var typingListener: TaskHandle? = null
    private var isTyping = false
    private var roomEncrypted = false
    private var attachmentHandle: SendAttachmentJoinHandle? = null
    private var attachmentCancelled = false

    fun close() {
        listener?.cancel()
        typingListener?.cancel()
        nav.close()
        scope.cancel()
    }

    suspend fun start() {
        if (timeline != null) return
        try {
            val timeline = if (focus != null) {
                room.timelineWithConfiguration(
                    TimelineConfiguration(
                        focus = focus,
                        filter = TimelineFilter.All,
                        internalIdPrefix = "diddy-focus",
                        dateDividerMode = DateDividerMode.DAILY,
                        trackReadReceipts = TimelineReadReceiptTracking.DISABLED,
                        reportUtds = false,
                    )
                )
            } else room.timeline()
            this.timeline = timeline
            roomEncrypted = try { room.isEncrypted() } catch (_: Exception) { false }
            listener = timeline.addListener(object : TimelineListener {
                override fun onUpdate(diff: List<TimelineDiff>) { scope.launch { apply(diff) } }
            })
            if (focus == null) nav.start(room)
            val me = ownUserId
            typingListener = room.subscribeToTypingNotifications(object : TypingNotificationsListener {
                override fun call(typingUserIds: List<String>) {
                    scope.launch {
                        val shown = if (ChatSettings.shareActivity) typingUserIds.filter { it != me } else emptyList()
                        if (typing.userIds != shown) typing.userIds = shown
                    }
                }
            })
            // Sync only brings the members of recent senders; loading the member list fills in names
            // and avatars of older messages. Element X does the same on open.
            scope.launch { try { timeline.fetchMembers() } catch (_: Exception) {} }
            paginate()
            if (focus == null) try { timeline.markAsRead(receiptType) } catch (_: Exception) {}
        } catch (e: Exception) {
            sendError = e.friendlyMessage
        }
    }

    suspend fun paginate() {
        val timeline = timeline ?: return
        if (loading || reachedStart) return
        loading = true
        try {
            val end = timeline.paginateBackwards(40u)
            if (end != reachedStart) {
                reachedStart = end
                rebuild()
            }
        } catch (_: Exception) {
        } finally {
            loading = false
        }
    }

    /** A page can hold nothing the chat shows, so keep going until something new appears. */
    suspend fun loadOlderMessages() {
        val before = rows.size
        repeat(5) {
            if (reachedStart || rows.size != before) return
            paginate()
        }
    }

    fun setTyping(typing: Boolean) {
        if (typing == isTyping || (typing && !ChatSettings.shareActivity)) return
        isTyping = typing
        scope.launch { try { room.typingNotice(typing) } catch (_: Exception) {} }
    }

    fun markRead() {
        val timeline = timeline ?: return
        scope.launch { try { timeline.markAsRead(receiptType) } catch (_: Exception) {} }
    }

    /** A private receipt clears your unread count without showing others how far you have read. */
    private val receiptType: ReceiptType get() = if (ChatSettings.shareActivity) ReceiptType.READ else ReceiptType.READ_PRIVATE

    // MARK: Sending

    fun cancelAttachment() {
        attachmentCancelled = true
        attachmentHandle?.cancel()
    }

    /** Attachment APIs encrypt both the media and the event in encrypted rooms. */
    suspend fun sendAttachment(
        context: Context,
        data: ByteArray,
        filename: String,
        mime: String,
        caption: String,
        replyTo: EventOrTransactionId?,
        videoUri: Uri? = null,
    ): Boolean {
        val timeline = timeline ?: return false
        if (uploadingAttachment) return false
        uploadingAttachment = true
        attachmentCancelled = false
        try {
            val replyId = (replyTo as? EventOrTransactionId.EventId)?.eventId
            val params = UploadParameters(
                source = UploadSource.Data(data, filename),
                caption = caption.ifEmpty { null },
                formattedCaption = null,
                mentions = null,
                inReplyTo = replyId,
                extraContentJson = null,
            )
            val handle = when {
                mime.startsWith("image/") -> {
                    val picture = withContext(Dispatchers.Default) { SentMedia.picture(data, mime) }
                    if (picture != null) {
                        val thumbnailInfo = picture.thumbnail?.let {
                            ThumbnailInfo(picture.thumbnailHeight.toULong(), picture.thumbnailWidth.toULong(), "image/jpeg", it.size.toULong())
                        }
                        val info = ImageInfo(
                            height = picture.height.toULong(), width = picture.width.toULong(), mimetype = mime,
                            size = data.size.toULong(), thumbnailInfo = thumbnailInfo, thumbnailSource = null,
                            blurhash = null, isAnimated = mime == "image/gif",
                        )
                        timeline.sendImage(params, picture.thumbnail?.let { UploadSource.Data(it, "thumbnail.jpg") }, info)
                    } else {
                        timeline.sendFile(params, FileInfo(mime, data.size.toULong(), null, null))
                    }
                }
                mime.startsWith("video/") -> {
                    val video = withContext(Dispatchers.IO) {
                        if (videoUri != null) SentMedia.video(context, videoUri) else {
                            val temp = java.io.File(context.cacheDir, "send-${System.nanoTime()}")
                            temp.writeBytes(data)
                            SentMedia.video(temp).also { temp.delete() }
                        }
                    }
                    val thumbnailInfo = video.thumbnail?.let {
                        ThumbnailInfo(video.thumbnailHeight.toULong(), video.thumbnailWidth.toULong(), "image/jpeg", it.size.toULong())
                    }
                    val info = VideoInfo(
                        duration = video.durationMs?.let { Duration.ofMillis(it) },
                        height = video.height?.toULong(), width = video.width?.toULong(), mimetype = mime,
                        size = data.size.toULong(), thumbnailInfo = thumbnailInfo, thumbnailSource = null, blurhash = null,
                    )
                    timeline.sendVideo(params, video.thumbnail?.let { UploadSource.Data(it, "thumbnail.jpg") }, info)
                }
                mime.startsWith("audio/") -> timeline.sendAudio(params, AudioInfo(null, data.size.toULong(), mime))
                else -> timeline.sendFile(params, FileInfo(mime, data.size.toULong(), null, null))
            }
            attachmentHandle = handle
            handle.join()
            return !attachmentCancelled
        } catch (e: Exception) {
            if (!attachmentCancelled) sendError = e.friendlyMessage
            return false
        } finally {
            uploadingAttachment = false
            attachmentHandle = null
        }
    }

    suspend fun editComposed(row: MessageRow, message: ComposedMessage): Boolean {
        val timeline = timeline ?: return false
        val id = row.eventId ?: return false
        val content = messageEventContentFromHtml(message.body, message.html ?: DesktopMarkdown.escapeHtml(message.body))
            .withMentions(Mentions(message.mentionedUserIds, false))
        return try {
            timeline.edit(id, EditedContent.RoomMessage(content))
            true
        } catch (e: Exception) {
            sendError = e.friendlyMessage
            false
        }
    }

    suspend fun sendComposed(message: ComposedMessage, command: SlashCommand?, replyTo: EventOrTransactionId?): Boolean {
        val timeline = timeline ?: return false
        return try {
            val formatted = message.html?.let { FormattedBody(MessageFormat.Html, it) }
            var content: RoomMessageEventContentWithoutRelation = when (command) {
                SlashCommand.NOTICE -> messageEventContentNew(MessageType.Notice(NoticeMessageContent(message.body, formatted)))
                SlashCommand.ME -> messageEventContentNew(MessageType.Emote(EmoteMessageContent(message.body, formatted)))
                else -> messageEventContentNew(MessageType.Text(TextMessageContent(message.body, formatted)))
            }
            content = content.withMentions(Mentions(message.mentionedUserIds, false))
            setTyping(false)
            val replyId = (replyTo as? EventOrTransactionId.EventId)?.eventId
            if (replyId != null) timeline.sendReply(content, replyId) else timeline.send(content)
            true
        } catch (e: Exception) {
            sendError = e.friendlyMessage
            false
        }
    }

    /** Sends a recorded voice message the way the desktop does (MSC3245 voice, MSC1767 waveform). */
    suspend fun sendVoice(recording: VoiceRecording, inReplyTo: EventOrTransactionId?): Boolean {
        val timeline = timeline ?: return false
        val replyId = (inReplyTo as? EventOrTransactionId.EventId)?.eventId
        val params = UploadParameters(
            source = UploadSource.File(recording.file.absolutePath),
            caption = null,
            formattedCaption = null,
            mentions = null,
            inReplyTo = replyId,
            extraContentJson = VoiceWaveform.contentJson(recording.duration, recording.waveform),
        )
        val info = AudioInfo(Duration.ofMillis((recording.duration * 1000).toLong()), recording.size.toULong(), "audio/mp4")
        return try {
            val handle = timeline.sendAttachment(params, AttachmentKind.Audio(info))
            handle.join()
            recording.file.delete()
            true
        } catch (e: Exception) {
            sendError = e.friendlyMessage
            false
        }
    }

    suspend fun toggleReaction(key: String, row: MessageRow) {
        val timeline = timeline ?: return
        val id = row.eventId ?: return
        try { timeline.toggleReaction(id, key) } catch (e: Exception) { sendError = e.friendlyMessage }
    }

    /** Deletes a message with an optional reason, your own or, with the power for it, someone else's. */
    suspend fun redact(row: MessageRow, reason: String = ""): Boolean {
        val timeline = timeline ?: return false
        val id = row.eventId ?: return false
        return try {
            timeline.redactEvent(id, reason.trim().ifEmpty { null })
            true
        } catch (e: Exception) {
            sendError = e.friendlyMessage
            false
        }
    }

    /** A card button's command, flagged so Diddy hides it; the card changes instead. */
    suspend fun sendCardAction(command: String) {
        setTyping(false)
        try { room.sendRaw("m.room.message", BotCardParser.actionContent(command)) } catch (e: Exception) { sendError = e.friendlyMessage }
    }

    /** Sends a shared song as a music card; the cover is uploaded first. */
    suspend fun sendMusic(card: MusicCard, client: Client): Boolean {
        var music = card
        if (music.artwork == null && music.remoteArtwork != null) {
            try {
                val answer = Http.request(music.remoteArtwork!!)
                if (answer.status == 200 && answer.body.size <= 5 * 1024 * 1024) {
                    val mime = answer.contentType?.substringBefore(';') ?: "image/jpeg"
                    music = music.copy(artwork = client.uploadMedia(mime, answer.body, null))
                }
            } catch (_: Exception) {}
        }
        setTyping(false)
        return try {
            room.sendRaw("m.room.message", app.diddy.util.Json.encode(music.content()))
            true
        } catch (e: Exception) {
            sendError = e.friendlyMessage
            false
        }
    }

    // MARK: Navigation (ios TimelineController+Nav.swift)

    /** The chat row of an event, loading older messages first when needed. */
    suspend fun loadRowId(eventId: String, maxPages: Int = 60): String? {
        var stalls = 0
        repeat(maxPages) {
            TimelineNav.rowId(eventId, nav.snapshot.entries)?.let { return it }
            if (reachedStart) return null
            val before = nav.snapshot.entries.size
            while (loading) delay(100)
            paginate()
            delay(250)
            if (nav.snapshot.entries.size == before) {
                stalls += 1
                if (stalls >= 3) return TimelineNav.rowId(eventId, nav.snapshot.entries)
            } else stalls = 0
        }
        return TimelineNav.rowId(eventId, nav.snapshot.entries)
    }

    suspend fun setPinned(eventId: String, pinned: Boolean) {
        val timeline = timeline ?: return
        try {
            if (pinned) timeline.pinEvent(eventId) else timeline.unpinEvent(eventId)
            nav.setPinned(eventId, pinned)
        } catch (e: Exception) {
            sendError = e.friendlyMessage
        }
    }

    suspend fun permalink(eventId: String): String? = try { room.matrixToEventPermalink(eventId) } catch (_: Exception) { null }

    fun sourceText(row: MessageRow): String {
        val event = items.firstOrNull { it.uniqueId().id == row.id }?.asEvent() ?: return "{}"
        val info = event.lazyProvider.debugInfo()
        return TimelineNav.sourceText(info.originalJson, info.latestEditJson)
    }

    suspend fun editHistory(row: MessageRow): List<MessageEditVersion>? {
        val timeline = timeline ?: return null
        val id = row.remoteEventId ?: return null
        val revisions = try { timeline.editRevisions(id) } catch (_: Exception) { return null }
        return revisions.mapIndexed { index, revision ->
            MessageEditVersion(index, MessagePreview.of(revision.content) ?: "", revision.timestamp?.let { Date(it.toLong()) })
        }
    }

    /** Sends a message into the thread of this (thread focused) timeline. */
    suspend fun sendInThread(text: String, root: String): Boolean {
        val trimmed = text.trim()
        val timeline = timeline ?: return false
        if (trimmed.isEmpty()) return false
        val newest = nav.snapshot.entries.lastOrNull { it.eventId?.startsWith("$") == true }?.eventId ?: root
        val content = messageEventContentFromMarkdown(trimmed)
        setTyping(false)
        return try {
            timeline.sendWithExtraContent(content, TimelineNav.threadRelationJson(root, newest, true))
            true
        } catch (e: Exception) {
            sendError = e.friendlyMessage
            false
        }
    }

    // MARK: Diffs → rows

    private fun apply(diffs: List<TimelineDiff>) {
        for (diff in diffs) ListDiff.of(diff).apply(itemList)
        items = itemList.toList()
        rebuild()
    }

    /** Sets the room's message lifetime and drops messages that expired since the last call. */
    fun updateRetention(lifetime: Long?) {
        if (lifetime == null && retentionLifetime == null) return
        retentionLifetime = lifetime
        rebuild()
    }

    private fun rebuild() {
        val built = mutableListOf<MessageRow>()
        var pendingDay: Date? = null
        var createdAt: Date? = null
        var firstEventDate: Date? = null
        val previews = ChatSettings.urlPreviews(roomEncrypted)
        val membership = ChatSettings.showMembership
        val settings = Triple(previews, roomEncrypted, membership)
        if (builtWith != settings) builtItems = IdentityHashMap()
        builtWith = settings
        val now = System.currentTimeMillis()
        val revisions = HashMap<String, Pair<TimelineItem, Int>>()
        val nextBuilt = IdentityHashMap<TimelineItem, BuiltItem>(itemList.size)
        for (item in itemList) {
            val entry = builtItems[item] ?: buildItem(item, previews)
            nextBuilt[item] = entry
            when (entry) {
                is BuiltItem.Day -> pendingDay = entry.date
                BuiltItem.Skip -> {}
                is BuiltItem.Event -> {
                    if (firstEventDate == null) firstEventDate = entry.date
                    if (createdAt == null && entry.isCreate) createdAt = entry.date
                    val cached = entry.row ?: continue
                    if (cached.layoutKind == TimelineLayout.Kind.MESSAGE && RoomRetention.isExpired(cached.date.time, retentionLifetime, now)) continue
                    val known = rowRevisions[cached.id]
                    val revision = if (known != null && known.first === item) known.second else (known?.second ?: 0) + 1
                    revisions[cached.id] = item to revision
                    built += cached.copy(revision = revision, dayDivider = pendingDay)
                    pendingDay = null
                }
            }
        }
        builtItems = nextBuilt
        if (createdAt == null && reachedStart) createdAt = firstEventDate

        val hidden = TimelineLayout.hiddenSetupLines(
            built.map { row ->
                row.membership?.let { TimelineLayout.Item.MembershipChange(it, row.date) }
                    ?: if (row.layoutKind == TimelineLayout.Kind.MESSAGE) TimelineLayout.Item.Message(row.date) else TimelineLayout.Item.Other(row.date)
            },
            isDirect, createdAt,
        )
        val result = mutableListOf<MessageRow>()
        var carriedDay: Date? = null
        var previous: TimelineLayout.Entry? = null
        built.forEachIndexed { index, original ->
            if (index in hidden) {
                carriedDay = original.dayDivider ?: carriedDay
                return@forEachIndexed
            }
            var row = original.copy(dayDivider = original.dayDivider ?: carriedDay)
            carriedDay = null
            val last = result.lastOrNull()
            if (last != null && TimelineLayout.joinsCallRun(row.callCount > 0, last.callCount > 0, row.dayDivider != null)) {
                result[result.size - 1] = last.copy(callCount = last.callCount + row.callCount, lastCallDate = row.date, revision = last.revision + row.revision)
                return@forEachIndexed
            }
            val entry = TimelineLayout.Entry(row.sender, row.date, row.layoutKind, row.reply != null, row.dayDivider != null)
            row = row.copy(showsHeader = !TimelineLayout.continuesGroup(entry, previous))
            previous = entry
            result += row
        }
        rowRevisions = revisions
        rows = result
        nav.update(itemList, result.map { it.id }.toSet(), ownUserId)
    }

    private fun buildItem(item: TimelineItem, previews: Boolean): BuiltItem {
        item.asVirtual()?.let { virtual ->
            if (virtual is org.matrix.rustcomponents.sdk.VirtualTimelineItem.DateDivider) return BuiltItem.Day(Date(virtual.ts.toLong()))
            return BuiltItem.Skip
        }
        val event = item.asEvent() ?: return BuiltItem.Skip
        val date = Date(event.timestamp.toLong())
        val content = event.content
        val isCreate = content is TimelineItemContent.State && content.content is OtherState.RoomCreate
        val row = try { row(event, item.uniqueId().id, ownUserId, previews) } catch (_: Exception) { null }
        return BuiltItem.Event(date, isCreate, row?.copy(previewsLocal = roomEncrypted))
    }

    companion object {
        private fun row(event: EventTimelineItem, id: String, me: String, previews: Boolean): MessageRow? {
            val profile = event.senderProfile as? ProfileDetails.Ready
            val name = profile?.displayName ?: event.sender
            val avatar = profile?.avatarUrl
            val body: MessageRow.Body
            var edited = false
            var reply: MessageRow.Reply? = null
            var card: BotCard? = null
            var music: MusicCard? = null
            var imageThumbnail: MediaSource? = null
            var membership: TimelineLayout.Membership? = null
            var extras = MessageExtras()
            var isSticker = false
            var isCall = false
            when (val content = event.content) {
                is TimelineItemContent.MsgLike -> {
                    val like = content.content
                    val replied = like.inReplyTo?.event()
                    if (replied is EmbeddedEventDetails.Ready) {
                        val replyProfile = replied.senderProfile as? ProfileDetails.Ready
                        reply = MessageRow.Reply(
                            sender = replyProfile?.displayName ?: replied.sender,
                            senderId = replied.sender,
                            text = MessagePreview.of(replied.content) ?: "…",
                            avatar = replyProfile?.avatarUrl,
                        )
                    }
                    when (val kind = like.kind) {
                        is MsgLikeKind.Message -> {
                            val message = kind.content
                            edited = message.isEdited
                            body = body(message)
                            extras = MessageExtras.of(message)
                            val inspection = BotCardLookup.inspect(event, id, message)
                            if (inspection.hidden) return null
                            card = inspection.card
                            music = inspection.music
                            val type = message.msgType
                            if (type is MessageType.Image && type.content.info?.isAnimated != true &&
                                type.content.info?.mimetype?.lowercase()?.contains("gif") != true
                            ) {
                                val thumbInfo = type.content.info?.thumbnailInfo
                                val side = maxOf(thumbInfo?.width?.toLong() ?: 0, thumbInfo?.height?.toLong() ?: 0)
                                if (side >= 600) imageThumbnail = type.content.info?.thumbnailSource
                            }
                        }
                        is MsgLikeKind.Sticker -> {
                            isSticker = true
                            body = MessageRow.Body.Image(kind.source, kind.body, kind.info.width?.toDouble(), kind.info.height?.toDouble())
                        }
                        is MsgLikeKind.Redacted -> body = MessageRow.Body.Redacted
                        is MsgLikeKind.UnableToDecrypt -> body = MessageRow.Body.Undecryptable
                        is MsgLikeKind.Poll -> body = MessageRow.Body.Text("📊 ${kind.question}")
                        else -> return null
                    }
                }
                is TimelineItemContent.RoomMembership -> {
                    if (!ChatSettings.showMembership) return null
                    val kind = membership(content.change) ?: return null
                    membership = kind
                    body = MessageRow.Body.Notice(kind.text(content.userDisplayName ?: content.userId))
                }
                is TimelineItemContent.RtcNotification, is TimelineItemContent.CallInvite -> {
                    body = MessageRow.Body.Notice(TimelineLayout.callText(name, 1))
                    isCall = true
                }
                else -> return null
            }
            val reactions = event.reactions.map { reaction ->
                ReactionChip(reaction.key, reaction.senders.size, reaction.senders.any { it.senderId == me })
            }
            val failed = event.localSendState is org.matrix.rustcomponents.sdk.EventSendState.SendingFailed
            val plain = card == null && music == null
            return MessageRow(
                id = id,
                eventId = event.eventOrTransactionId,
                sender = event.sender,
                senderName = name,
                senderAvatar = avatar,
                date = Date(event.timestamp.toLong()),
                body = body,
                isOwn = event.isOwn,
                isEdited = edited,
                reply = reply,
                reactions = reactions,
                isPending = !event.isRemote,
                card = card,
                music = if (card == null) music else null,
                imageThumbnail = imageThumbnail,
                membership = membership,
                rich = if (plain) extras.rich else null,
                richItalic = plain && extras.italic,
                previewUrls = if (plain && previews) extras.previewText?.let { LinkPreviewUrls.find(it) } ?: emptyList() else emptyList(),
                video = if (plain) extras.video else null,
                location = if (plain) extras.location else null,
                caption = if (plain && !isSticker) extras.caption else null,
                captionRich = if (plain && !isSticker) extras.captionRich else null,
                isSticker = isSticker,
                callCount = if (isCall) 1 else 0,
                sendFailed = failed,
            )
        }

        private fun body(message: MessageContent): MessageRow.Body = when (val type = message.msgType) {
            is MessageType.Text -> MessageRow.Body.Text(text(type.content.body, type.content.formatted))
            is MessageType.Emote -> MessageRow.Body.Text("_${text(type.content.body, type.content.formatted)}_")
            is MessageType.Notice -> MessageRow.Body.Text(text(type.content.body, type.content.formatted))
            is MessageType.Image -> MessageRow.Body.Image(
                type.content.source, type.content.filename,
                type.content.info?.width?.toDouble(), type.content.info?.height?.toDouble(),
            )
            is MessageType.Video -> MessageRow.Body.File("🎬 ${type.content.filename}", type.content.source, type.content.info?.mimetype, type.content.filename)
            is MessageType.Audio -> MessageRow.Body.Audio(AudioAttachment(type.content))
            is MessageType.File -> MessageRow.Body.File("📎 ${type.content.filename}", type.content.source, type.content.info?.mimetype, type.content.filename)
            else -> MessageRow.Body.Text(message.body)
        }

        /** The plain body, unless the HTML body has mentions the plain body may only name in passing. */
        private fun text(body: String, formatted: FormattedBody?): String {
            if (formatted == null || formatted.format !is MessageFormat.Html) return body
            return MentionText.markdownFromHtml(formatted.body) ?: body
        }

        private fun membership(change: MembershipChange?): TimelineLayout.Membership? = when (change) {
            MembershipChange.JOINED, MembershipChange.INVITATION_ACCEPTED, MembershipChange.KNOCK_ACCEPTED -> TimelineLayout.Membership.JOINED
            MembershipChange.LEFT -> TimelineLayout.Membership.LEFT
            MembershipChange.INVITED -> TimelineLayout.Membership.INVITED
            MembershipChange.BANNED, MembershipChange.KICKED_AND_BANNED -> TimelineLayout.Membership.BANNED
            MembershipChange.UNBANNED -> TimelineLayout.Membership.UNBANNED
            MembershipChange.KICKED -> TimelineLayout.Membership.REMOVED
            MembershipChange.INVITATION_REJECTED -> TimelineLayout.Membership.DECLINED
            else -> null
        }
    }
}
