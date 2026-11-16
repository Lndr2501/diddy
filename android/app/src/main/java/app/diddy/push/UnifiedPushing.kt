package app.diddy.push

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.AppModel
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.matrix.MatrixAccount
import app.diddy.util.Http
import app.diddy.util.Json
import app.diddy.util.friendlyMessage
import app.diddy.util.obj
import app.diddy.util.str
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.MessageLikeEventContent
import org.matrix.rustcomponents.sdk.MessageType
import org.matrix.rustcomponents.sdk.NotificationEvent
import org.matrix.rustcomponents.sdk.NotificationProcessSetup
import org.matrix.rustcomponents.sdk.NotificationStatus
import org.matrix.rustcomponents.sdk.TimelineEventContent
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.UnifiedPush
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage
import java.net.URI

/** The pure rules of UnifiedPush for Matrix: the pusher, the gateway and the push payload. */
object UnifiedPushLogic {
    const val APP_ID = "app.diddy.android"
    const val FALLBACK_GATEWAY = "https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify"

    /** The gateway path on the endpoint's own server (ntfy and others offer one). */
    fun gatewayCandidate(endpoint: String): String? {
        val uri = runCatching { URI(endpoint) }.getOrNull() ?: return null
        if (uri.scheme != "https" || uri.host.isNullOrEmpty()) return null
        val port = if (uri.port > 0) ":${uri.port}" else ""
        return "https://${uri.host}$port/_matrix/push/v1/notify"
    }

    /** The answer of a gateway to GET: `{"unifiedpush":{"gateway":"matrix"}}`. */
    fun isMatrixGateway(json: Map<String, Any?>?): Boolean = json?.get("unifiedpush").obj()?.get("gateway").str() == "matrix"

    fun pusherBody(endpoint: String, gateway: String, device: String): Map<String, Any?> = mapOf(
        "kind" to "http",
        "app_id" to APP_ID,
        "pushkey" to endpoint,
        "app_display_name" to "Diddy",
        "device_display_name" to device,
        "lang" to "en",
        "data" to mapOf("url" to gateway, "format" to "event_id_only"),
        "append" to false,
    )

    fun removePusherBody(endpoint: String): Map<String, Any?> = mapOf("kind" to null, "app_id" to APP_ID, "pushkey" to endpoint)

    /** Room and event of a push (the body the homeserver sent to the gateway). */
    fun parse(content: ByteArray): Pair<String, String>? {
        val notification = Json.obj(String(content))?.get("notification").obj() ?: return null
        val room = notification["room_id"].str() ?: return null
        val event = notification["event_id"].str() ?: return null
        return room to event
    }
}

/**
 * Real push through a UnifiedPush distributor (ntfy and others): the homeserver wakes Diddy for
 * each message, no connection has to stay open. One registration per account (the instance is
 * the account id).
 */
@SuppressLint("StaticFieldLeak") // the application context
object UnifiedPushing {
    const val ENABLED_KEY = "diddy.unifiedPush"
    private fun endpointKey(accountId: String) = "diddy.unifiedPush.endpoint.$accountId"

    private lateinit var context: Context
    var enabled by mutableStateOf(false)
        private set
    var status by mutableStateOf<String?>(null)

    fun init(context: Context) {
        this.context = context.applicationContext
        enabled = Prefs.bool(ENABLED_KEY)
    }

    fun distributors(): List<String> = runCatching { UnifiedPush.getDistributors(context) }.getOrDefault(emptyList())

    val savedDistributor: String? get() = runCatching { UnifiedPush.getSavedDistributor(context) }.getOrNull()

    /** Turns push on with the chosen (or the only) distributor and registers every account. */
    fun enable(activityOrContext: Context, onDone: (Boolean) -> Unit) {
        UnifiedPush.tryUseCurrentOrDefaultDistributor(activityOrContext) { success ->
            if (!success) {
                status = "No push app chosen. Install ntfy (or another UnifiedPush app) and try again."
                onDone(false)
                return@tryUseCurrentOrDefaultDistributor
            }
            Prefs.setBool(ENABLED_KEY, true)
            enabled = true
            status = "Registering…"
            AppModel.accounts.forEach { register(it.id) }
            onDone(true)
        }
    }

    /** Picks another distributor when there are several. */
    fun pick(activityOrContext: Context) {
        UnifiedPush.tryPickDistributor(activityOrContext) { success ->
            if (success) AppModel.accounts.forEach { register(it.id) }
        }
    }

    fun disable() {
        Prefs.setBool(ENABLED_KEY, false)
        enabled = false
        for (account in AppModel.accounts) {
            val endpoint = Prefs.string(endpointKey(account.id))
            if (endpoint != null) account.scope.launch { runCatching { account.clientRequest("/_matrix/client/v3/pushers/set", UnifiedPushLogic.removePusherBody(endpoint)) } }
            Prefs.remove(endpointKey(account.id))
            runCatching { UnifiedPush.unregister(context, account.id) }
        }
        status = null
    }

    fun register(accountId: String) {
        if (!enabled) return
        runCatching { UnifiedPush.register(context, accountId, "Diddy", null) }
            .onFailure { DiagLog.write("unifiedpush: register failed (${it.message})") }
    }

    /** A new account signed in while push is on. */
    fun accountAdded(account: MatrixAccount) {
        if (enabled && Prefs.string(endpointKey(account.id)) == null) register(account.id)
    }

    private suspend fun accountFor(id: String): MatrixAccount? {
        AppModel.restore()
        repeat(60) {
            AppModel.accounts.firstOrNull { it.id == id }?.let { return it }
            delay(250)
        }
        return null
    }

    internal fun newEndpoint(endpoint: String, accountId: String) {
        AppModel.scope.launch {
            val account = accountFor(accountId) ?: return@launch
            try {
                val gateway = UnifiedPushLogic.gatewayCandidate(endpoint)?.takeIf { candidate ->
                    UnifiedPushLogic.isMatrixGateway(runCatching { Http.request(candidate).json }.getOrNull())
                } ?: UnifiedPushLogic.FALLBACK_GATEWAY
                val old = Prefs.string(endpointKey(accountId))
                if (old != null && old != endpoint) runCatching { account.clientRequest("/_matrix/client/v3/pushers/set", UnifiedPushLogic.removePusherBody(old)) }
                account.clientRequest("/_matrix/client/v3/pushers/set", UnifiedPushLogic.pusherBody(endpoint, gateway, "Diddy on ${Build.MODEL}"))
                Prefs.setString(endpointKey(accountId), endpoint)
                status = "Push is on (${savedDistributor ?: "push app"})."
                DiagLog.write("unifiedpush: pusher set for an account")
            } catch (e: Exception) {
                status = "The server did not accept the push setup: ${e.friendlyMessage}"
                DiagLog.write("unifiedpush: pusher failed (${e.friendlyMessage})")
            }
        }
    }

    internal fun unregistered(accountId: String) {
        Prefs.remove(endpointKey(accountId))
    }

    /** A push arrived: read the event with the notification client and show it. */
    internal fun message(content: ByteArray, accountId: String) {
        val (roomId, eventId) = UnifiedPushLogic.parse(content) ?: return
        AppModel.scope.launch {
            val account = accountFor(accountId) ?: return@launch
            if (Notifications.inForegroundNow) return@launch // the running sync shows it
            try {
                val setup = account.runningSyncService?.let { NotificationProcessSetup.SingleProcess(it) } ?: NotificationProcessSetup.MultipleProcesses
                val client = account.client.notificationClient(setup)
                val status = client.getNotification(roomId, eventId)
                val item = (status as? NotificationStatus.Event)?.item ?: return@launch
                val roomName = item.roomInfo.displayName
                val sender = item.senderInfo.displayName ?: "Someone"
                when (val event = item.event) {
                    is NotificationEvent.Invite -> Notifications.postPush(account, roomId, roomName, "$sender invited you", mention = true, noisy = true)
                    is NotificationEvent.Timeline -> {
                        if (event.event.senderId() == account.userId) return@launch
                        val messageLike = (runCatching { event.event.content() }.getOrNull() as? TimelineEventContent.MessageLike)?.content
                        if (messageLike is MessageLikeEventContent.RtcNotification) {
                            Notifications.announceCall(account, roomId, roomName)
                            return@launch
                        }
                        val text = preview(messageLike) ?: return@launch
                        val body = if (item.roomInfo.isDm) text else "$sender: $text"
                        Notifications.postPush(account, roomId, roomName, body, mention = item.hasMention == true, noisy = item.isNoisy != false)
                    }
                }
            } catch (e: Exception) {
                DiagLog.write("unifiedpush: could not read the event (${e.friendlyMessage})")
                Notifications.postPush(account, roomId, "Diddy", "New message", mention = false, noisy = true)
            }
        }
    }

    private fun preview(content: MessageLikeEventContent?): String? = when (content) {
        is MessageLikeEventContent.RoomMessage -> when (val type = content.messageType) {
            is MessageType.Text -> type.content.body
            is MessageType.Notice -> type.content.body
            is MessageType.Emote -> "* ${type.content.body}"
            is MessageType.Image -> "sent a picture"
            is MessageType.Video -> "sent a video"
            is MessageType.Audio -> "sent a voice message"
            is MessageType.File -> "sent a file"
            is MessageType.Gallery -> "sent pictures"
            is MessageType.Location -> "shared a location"
            else -> "New message"
        }
        is MessageLikeEventContent.Sticker -> "sent a sticker"
        is MessageLikeEventContent.Poll -> "started a poll"
        is MessageLikeEventContent.RoomEncrypted -> "New message"
        else -> null
    }
}

/** Receives what the distributor delivers. */
class DiddyPushService : PushService() {
    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) = UnifiedPushing.newEndpoint(endpoint.url, instance)
    override fun onMessage(message: PushMessage, instance: String) = UnifiedPushing.message(message.content, instance)
    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        UnifiedPushing.status = "The push app refused the registration ($reason)."
        DiagLog.write("unifiedpush: registration failed ($reason)")
    }
    override fun onUnregistered(instance: String) = UnifiedPushing.unregistered(instance)
}
