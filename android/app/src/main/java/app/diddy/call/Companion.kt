package app.diddy.call

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.AppModel
import app.diddy.app.DiagLog
import app.diddy.matrix.MatrixAccount
import app.diddy.push.Notifications
import app.diddy.util.Json
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.ToDeviceMessage
import org.matrix.rustcomponents.sdk.ToDeviceMessageListener

/**
 * "Use the phone as Camera & Mic": the computer (desktop app) asks your own phone to join its call
 * as a second device that sends camera, microphone and/or screen and plays no sound. Three
 * encrypted to-device messages between your own devices (ios CompanionProtocol, desktop
 * companion.ts). Pure.
 */
object CompanionProtocol {
    const val REQUEST_TYPE = "app.diddy.call.companion.request"
    const val STATE_TYPE = "app.diddy.call.companion.state"
    const val CONTROL_TYPE = "app.diddy.call.companion.control"
    /** LiveKit attribute of the phone's participant: the device it works for. */
    const val ATTRIBUTE = "diddy.companion_of"
    const val HEARTBEAT_SECONDS = 20

    data class Media(val camera: Boolean, val microphone: Boolean, val screen: Boolean)
    data class Request(val id: String, val roomId: String, val roomName: String, val deviceId: String, val media: Media)
    data class Control(val requestId: String, val microphone: Boolean?, val camera: Boolean?, val end: Boolean)

    private fun text(value: Any?, max: Int): String? = (value as? String)?.trim()?.takeIf { it.isNotEmpty() && it.length <= max }

    private fun version1(content: Map<String, Any?>) = (content["v"] as? Number)?.toInt() == 1

    fun parseRequest(json: String): Request? {
        val c = Json.obj(json) ?: return null
        if (!version1(c)) return null
        val id = text(c["request_id"], 64) ?: return null
        val roomId = text(c["room_id"], 255)?.takeIf { it.startsWith("!") } ?: return null
        val deviceId = text(c["device_id"], 255) ?: return null
        val media = Media(c["camera"] as? Boolean ?: false, c["microphone"] as? Boolean ?: false, c["screen"] as? Boolean ?: false)
        if (!media.camera && !media.microphone && !media.screen) return null
        return Request(id, roomId, text(c["room_name"], 200) ?: "", deviceId, media)
    }

    fun parseControl(json: String): Control? {
        val c = Json.obj(json) ?: return null
        if (!version1(c)) return null
        val id = text(c["request_id"], 64) ?: return null
        return Control(id, c["microphone"] as? Boolean, c["camera"] as? Boolean, c["end"] as? Boolean ?: false)
    }

    fun state(requestId: String, deviceId: String, joined: Boolean, media: Media, background: Boolean = false): String = Json.encode(
        sortedMapOf(
            "v" to 1, "request_id" to requestId, "device_id" to deviceId, "joined" to joined, "background" to background,
            "camera" to media.camera, "microphone" to media.microphone, "screen" to media.screen,
        ),
    )

    /** Only your own other devices may ask, and only encrypted (the sender is then attested). */
    fun accepts(sender: String, ownUserId: String, encrypted: Boolean, requestDevice: String, ownDeviceId: String) =
        encrypted && sender == ownUserId && requestDevice != ownDeviceId
}

/** What a call works for when the phone is the computer's camera and microphone. */
data class CompanionRole(val requestId: String, val deviceId: String, val media: CompanionProtocol.Media)

/**
 * The phone side (ios CompanionService): listens on every account for a request of your own
 * computer, offers it, and hands the computer's later commands to the running call.
 */
object CompanionService {
    data class Pending(val accountId: String, val request: CompanionProtocol.Request)

    var pending by mutableStateOf<Pending?>(null)
    private val handles = mutableMapOf<String, TaskHandle>()

    fun attach(account: MatrixAccount) {
        if (handles.containsKey(account.id)) return
        handles[account.id] = account.client.subscribeToCustomToDeviceMessages(
            listOf(CompanionProtocol.REQUEST_TYPE, CompanionProtocol.CONTROL_TYPE),
            object : ToDeviceMessageListener {
                override fun onMessage(message: ToDeviceMessage) {
                    account.scope.launch { receive(message, account) }
                }
            },
        )
    }

    fun detach(accountId: String) {
        handles.remove(accountId)?.cancel()
        if (pending?.accountId == accountId) pending = null
    }

    private fun receive(message: ToDeviceMessage, account: MatrixAccount) {
        when (message.eventType) {
            CompanionProtocol.REQUEST_TYPE -> {
                val request = CompanionProtocol.parseRequest(message.content)
                if (request == null || !CompanionProtocol.accepts(message.senderId, account.userId, message.encryptionInfo != null, request.deviceId, account.deviceId)) {
                    DiagLog.write("companion: ignored a request (not from an own device, or not encrypted)")
                    return
                }
                DiagLog.write("companion: request from another own device")
                pending = Pending(account.id, request)
                Notifications.announceCompanion(account, request.roomId, request.roomName)
            }
            CompanionProtocol.CONTROL_TYPE -> {
                if (message.senderId != account.userId || message.encryptionInfo == null) return
                val control = CompanionProtocol.parseControl(message.content) ?: return
                val session = CallManager.current ?: return
                if (session.companion?.requestId != control.requestId) return
                if (control.end) {
                    DiagLog.write("companion: the computer ended it")
                    AppModel.scope.launch { CallManager.leave() }
                    return
                }
                AppModel.scope.launch { session.applyCompanionControl(control) }
            }
        }
    }

    /** "Join": joins the call as camera, microphone and/or screen of the computer. */
    fun accept(media: CompanionProtocol.Media) {
        val current = pending ?: return
        val account = AppModel.accounts.firstOrNull { it.id == current.accountId } ?: return
        pending = null
        val role = CompanionRole(current.request.id, current.request.deviceId, media)
        val name = current.request.roomName.ifEmpty { account.summary(current.request.roomId)?.name ?: "Call" }
        AppModel.scope.launch { CallManager.join(account, current.request.roomId, name, present = true, companion = role) }
    }

    /** "Not now": tells the computer, so it stops waiting. */
    fun decline() {
        val current = pending ?: return
        val account = AppModel.accounts.firstOrNull { it.id == current.accountId } ?: return
        pending = null
        val content = CompanionProtocol.state(current.request.id, account.deviceId, false, CompanionProtocol.Media(false, false, false))
        account.scope.launch {
            runCatching { account.client.sendEncryptedToDeviceMessage(CompanionProtocol.STATE_TYPE, mapOf(account.userId to listOf(current.request.deviceId)), content) }
                .onFailure { DiagLog.write("companion: decline not sent (${it.friendlyMessage})") }
        }
    }
}
