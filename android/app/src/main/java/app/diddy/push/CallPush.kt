package app.diddy.push

import app.diddy.app.AppModel
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.matrix.MatrixAccount
import app.diddy.util.Http
import app.diddy.util.Json
import app.diddy.util.friendlyMessage
import app.diddy.util.str
import kotlinx.coroutines.launch

/** Ring through ntfy while Diddy is closed: where this device wants call alerts (ios CallPushSettings). */
object CallPushSettings {
    const val ENABLED_KEY = "diddy.callPush.enabled"
    const val SERVER_KEY = "diddy.callPush.server"
    private const val TOPIC_KEY = "diddy.callPush.topic"
    const val DEFAULT_SERVER = "https://ntfy.sh"

    val isEnabled: Boolean get() = Prefs.bool(ENABLED_KEY)

    val server: String get() = Prefs.string(SERVER_KEY)?.trim()?.ifEmpty { null } ?: DEFAULT_SERVER

    val topic: String
        get() {
            Prefs.string(TOPIC_KEY)?.let { return it }
            val characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            val topic = "diddy_" + (1..32).map { characters.random() }.joinToString("")
            Prefs.setString(TOPIC_KEY, topic)
            return topic
        }
}

/** The ntfy server and topic someone wants call alerts on, from their state event in a DM. */
data class CallPushTarget(val server: String, val topic: String) {
    val content: Map<String, Any?> get() = mapOf("server" to server, "topic" to topic)

    companion object {
        const val EVENT_TYPE = "app.diddy.call_push"
        private val topicPattern = Regex("^[-_A-Za-z0-9]{1,64}$")

        fun parse(content: Map<String, Any?>): CallPushTarget? {
            val server = content["server"].str() ?: return null
            val topic = content["topic"].str() ?: return null
            if (!isAllowed(server) || !topicPattern.matches(topic)) return null
            return CallPushTarget(server, topic)
        }

        /** Only https servers, without a query. */
        fun isAllowed(server: String): Boolean {
            val uri = runCatching { java.net.URI(server) }.getOrNull() ?: return false
            return uri.scheme == "https" && !uri.host.isNullOrEmpty() && uri.query == null
        }
    }
}

/**
 * Writes this device's ntfy target into every DM (a state event under your user id) and sends
 * "Name is calling you" to the other person's target when you call them (ios CallPush).
 */
object CallPush {
    private val writing = mutableSetOf<String>()

    private val wanted: CallPushTarget?
        get() = if (CallPushSettings.isEnabled && CallPushTarget.isAllowed(CallPushSettings.server)) CallPushTarget(CallPushSettings.server, CallPushSettings.topic) else null

    /** The setting changed: publish it for every signed-in account. */
    fun publishSoon() {
        AppModel.accounts.forEach { publish(it) }
    }

    fun publish(account: MatrixAccount) {
        val key = "diddy.callPush.published.${account.userId}"
        val published = Json.obj(Prefs.string(key)) ?: emptyMap()
        val target = wanted
        val marker = target?.let { "${it.server}/${it.topic}" } ?: ""
        for (room in account.directMessages) {
            if ((published[room.id].str() ?: "") == marker) continue
            if (room.id in writing) continue
            val matrixRoom = account.room(room.id) ?: continue
            writing += room.id
            account.scope.launch {
                try {
                    matrixRoom.sendStateEventRaw(CallPushTarget.EVENT_TYPE, account.userId, Json.encode(target?.content ?: emptyMap<String, Any?>()))
                    val current = (Json.obj(Prefs.string(key)) ?: emptyMap()).toMutableMap()
                    current[room.id] = marker
                    Prefs.setString(key, Json.encode(current))
                } catch (e: Exception) {
                    DiagLog.write("callpush: could not write the target: ${e.friendlyMessage}")
                }
                writing -= room.id
            }
        }
    }

    /** You started a call in a DM: alert the others that want it. */
    suspend fun notify(account: MatrixAccount, roomId: String) {
        val members = runCatching { account.joinedMembers(roomId) }.getOrNull() ?: return
        for (userId in members) {
            if (userId == account.userId) continue
            val content = runCatching { account.stateContent(roomId, CallPushTarget.EVENT_TYPE, userId) }.getOrNull() ?: continue
            val target = CallPushTarget.parse(content) ?: continue
            send(target, "${account.title} is calling you", "Open Diddy to answer.")
        }
    }

    suspend fun sendTest(): Boolean {
        if (!CallPushTarget.isAllowed(CallPushSettings.server)) return false
        return send(CallPushTarget(CallPushSettings.server, CallPushSettings.topic), "Diddy", "Call alerts are working.")
    }

    private suspend fun send(target: CallPushTarget, title: String, message: String): Boolean = try {
        val answer = Http.request(
            target.server.trimEnd('/') + "/",
            method = "POST",
            json = mapOf("topic" to target.topic, "title" to title, "message" to message, "priority" to 5, "tags" to listOf("telephone_receiver")),
        )
        answer.status == 200
    } catch (e: Exception) {
        DiagLog.write("callpush: could not send: ${e.friendlyMessage}")
        false
    }
}
