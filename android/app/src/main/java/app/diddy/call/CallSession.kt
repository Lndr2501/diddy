package app.diddy.call

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.app.Sound
import app.diddy.app.Sounds
import app.diddy.matrix.MatrixAccount
import app.diddy.push.CallPush
import app.diddy.util.DiddyError
import app.diddy.util.Http
import app.diddy.util.Json
import app.diddy.util.friendlyMessage
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.str
import com.twilio.audioswitch.AudioDevice
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.e2ee.BaseKeyProvider
import io.livekit.android.e2ee.E2EEOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalAudioTrackOptions
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.RemoteAudioTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import livekit.org.webrtc.FrameCryptorKeyDerivationAlgorithm
import org.matrix.rustcomponents.sdk.CallDeclineListener
import org.matrix.rustcomponents.sdk.RtcTransport
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.ToDeviceMessage
import org.matrix.rustcomponents.sdk.ToDeviceMessageListener
import java.security.SecureRandom

/** Someone in the call, shaped for the UI (ios CallMember). */
data class CallMember(
    val id: String,
    val userId: String,
    val name: String,
    val avatarUrl: String?,
    val isLocal: Boolean,
    val isSpeaking: Boolean,
    val microphoneOn: Boolean,
    val camera: VideoTrack? = null,
    val screenShare: VideoTrack? = null,
    /** In the call according to Matrix, but not connected to the media server (yet). */
    val isConnecting: Boolean = false,
)

/**
 * A voice channel or call connection (ios CallSession): MatrixRTC membership, LiveKit media and
 * Element Call's per-participant media keys over encrypted to-device messages.
 */
class CallSession(private val context: Context, val account: MatrixAccount, private val matrixRoom: org.matrix.rustcomponents.sdk.Room, val roomName: String) {
    val roomId: String = matrixRoom.id()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    var members by mutableStateOf<List<CallMember>>(emptyList())
        private set
    var state by mutableStateOf("Connecting…")
        private set
    var connected by mutableStateOf(false)
        private set
    var microphoneOn by mutableStateOf(true)
        private set
    var deafened by mutableStateOf(false)
        private set
    var cameraOn by mutableStateOf(false)
        private set
    var screenSharing by mutableStateOf(false)
        private set
    var speakerOn by mutableStateOf(Prefs.bool(SPEAKER_KEY, true))
        private set
    var outgoing by mutableStateOf(OutgoingRing.NONE)
        private set
    var lastError by mutableStateOf<String?>(null)
    /** People whose screen share this device shows big. */
    var watchedShare by mutableStateOf<String?>(null)

    enum class OutgoingRing { NONE, RINGING, NO_ANSWER }

    var onDropped: (() -> Unit)? = null
    var onDeclined: ((String) -> Unit)? = null

    private val keyProvider = BaseKeyProvider(
        ratchetWindowSize = 10,
        enableSharedKey = false,
        keyRingSize = 256,
        keyDerivationAlgorithm = FrameCryptorKeyDerivationAlgorithm.HKDF,
    )
    val liveKitRoom: Room = LiveKit.create(context.applicationContext)
    private var encrypted = false
    private var closed = false
    private var leaving = false
    private var ownKey = ByteArray(0)
    private val ownKeyIndex = 0
    private var toDeviceHandle: TaskHandle? = null
    private var declineHandle: TaskHandle? = null
    private var transport: CallLogic.Transport? = null
    private var membershipCreatedTs: Long? = null
    private var membershipEventId: String? = null
    private var eventsJob: Job? = null
    private var refreshJob: Job? = null
    private var ringTimeout: Job? = null
    private var mutedBeforeDeafen = false

    private val ownUserId get() = account.userId
    private val ownDeviceId get() = account.deviceId
    private val ownIdentity get() = CallLogic.identity(ownUserId, ownDeviceId)
    private val stateKey get() = CallLogic.stateKey(ownUserId, ownDeviceId)

    // MARK: Connect / disconnect

    /** Left while joining: stop here, disconnect() has already cleaned up. */
    private fun ensureOpen() {
        if (closed) throw kotlinx.coroutines.CancellationException("left while joining")
    }

    suspend fun connect() {
        encrypted = runCatching { matrixRoom.isEncrypted() }.getOrDefault(false)
        val chosen = chooseTransport()
        ensureOpen()
        transport = chosen
        state = "Getting voice server access…"
        val token = account.client.requestOpenidToken()
        ensureOpen()
        val sfu = requestSfuConfig(chosen.serviceUrl, token)
        ensureOpen()
        if (encrypted) {
            ownKey = ByteArray(16).also { SecureRandom().nextBytes(it) }
            toDeviceHandle = account.client.subscribeToCustomToDeviceMessages(
                listOf(CallLogic.KEYS_EVENT_TYPE),
                object : ToDeviceMessageListener {
                    override fun onMessage(message: ToDeviceMessage) {
                        scope.launch { receiveKeys(message) }
                    }
                },
            )
        }
        liveKitRoom.setRoomOptions(
            RoomOptions(
                adaptiveStream = true,
                dynacast = true,
                e2eeOptions = if (encrypted) E2EEOptions(keyProvider = keyProvider) else null,
                audioTrackCaptureDefaults = LocalAudioTrackOptions(
                    noiseSuppression = CallPrefs.noiseSuppression,
                    echoCancellation = CallPrefs.voiceProcessing,
                    autoGainControl = CallPrefs.voiceProcessing,
                ),
            ),
        )
        eventsJob = scope.launch { liveKitRoom.events.collect { onEvent(it) } }
        state = "Connecting…"
        liveKitRoom.connect(sfu.first, sfu.second)
        ensureOpen()
        if (encrypted) {
            val identity = liveKitRoom.localParticipant.identity?.value ?: ownIdentity
            keyProvider.rtcKeyProvider.setKey(identity, ownKeyIndex, ownKey)
        }
        applySpeaker()
        refreshMembers()
        val present = liveKitRoom.remoteParticipants.values.toList()
        if (encrypted) distributeKey(present)
        ensureOpen()
        try {
            sendMembership()
        } catch (e: Exception) {
            throw DiddyError("You do not have permission to join a call in this room. An admin has to allow it.")
        }
        // Left during the membership write: take it back at once, nobody else will.
        if (closed) {
            runCatching { matrixRoom.sendStateEventRaw(CallLogic.MEMBER_EVENT_TYPE, stateKey, "{}") }
            ensureOpen()
        }
        // Read now, not at join time: the permission may have been granted meanwhile.
        startMicrophone(CallManager.microphoneAllowed)
        ensureOpen()
        connected = true
        state = "Voice connected"
        scheduleMembershipRefresh()
        refreshMembers()
    }

    suspend fun disconnect() {
        leaving = true
        stopOutgoingRing()
        if (closed) return
        closed = true
        val wasConnected = connected
        members = emptyList()
        connected = false
        microphoneOn = false
        cameraOn = false
        screenSharing = false
        state = "Disconnected"
        refreshJob?.cancel()
        toDeviceHandle?.cancel()
        toDeviceHandle = null
        if (wasConnected || membershipCreatedTs != null) {
            // An empty content ends our membership for everyone else.
            runCatching { matrixRoom.sendStateEventRaw(CallLogic.MEMBER_EVENT_TYPE, stateKey, "{}") }
        }
        runCatching { liveKitRoom.localParticipant.setScreenShareEnabled(false) }
        runCatching { liveKitRoom.localParticipant.setCameraEnabled(false) }
        eventsJob?.cancel()
        liveKitRoom.disconnect()
        liveKitRoom.release()
        scope.cancel()
    }

    // MARK: Controls

    suspend fun toggleMicrophone(allowed: Boolean) {
        // While joining, connect() turns the microphone on itself once it can.
        if (!connected) return
        val enable = !microphoneOn
        if (enable && !allowed) {
            lastError = "Microphone access is off. Allow it for Diddy in Android's settings."
            return
        }
        if (enable && deafened) {
            deafened = false
            applyVolumes()
        }
        try {
            liveKitRoom.localParticipant.setMicrophoneEnabled(enable)
            microphoneOn = enable
            if (enable) attachSoundboard()
            Sounds.play(if (enable) Sound.UNMUTE else Sound.MUTE)
        } catch (e: Exception) {
            lastError = e.friendlyMessage
        }
        refreshMembers()
    }

    suspend fun toggleDeafen() {
        if (!deafened) mutedBeforeDeafen = !microphoneOn
        deafened = !deafened
        applyVolumes()
        Sounds.play(if (deafened) Sound.DEAFEN else Sound.UNDEAFEN)
        val enable = !deafened && !mutedBeforeDeafen
        try {
            liveKitRoom.localParticipant.setMicrophoneEnabled(enable)
            microphoneOn = enable
        } catch (e: Exception) {
            lastError = e.friendlyMessage
        }
        refreshMembers()
    }

    fun toggleSpeaker() {
        speakerOn = !speakerOn
        Prefs.setBool(SPEAKER_KEY, speakerOn)
        applySpeaker()
    }

    /** Speaker or earpiece; a headset or Bluetooth device always wins. */
    private fun applySpeaker() {
        val handler = liveKitRoom.audioSwitchHandler ?: return
        val devices = handler.availableAudioDevices
        val external = devices.firstOrNull { it is AudioDevice.BluetoothHeadset || it is AudioDevice.WiredHeadset }
        val wanted = external ?: if (speakerOn) devices.firstOrNull { it is AudioDevice.Speakerphone } else devices.firstOrNull { it is AudioDevice.Earpiece }
        handler.selectDevice(wanted)
    }

    suspend fun toggleCamera(allowed: Boolean) {
        if (!cameraOn && !allowed) {
            lastError = "Camera access is off. Allow it for Diddy in Android's settings."
            return
        }
        try {
            liveKitRoom.localParticipant.setCameraEnabled(!cameraOn)
            cameraOn = !cameraOn
            Sounds.play(if (cameraOn) Sound.CAMERA_ON else Sound.CAMERA_OFF)
        } catch (e: Exception) {
            lastError = "The camera could not be started."
        }
        refreshMembers()
    }

    private var front = true

    fun flipCamera() {
        val track = liveKitRoom.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack ?: return
        front = !front
        runCatching { track.switchCamera(position = if (front) CameraPosition.FRONT else CameraPosition.BACK) }
    }

    /** Starts sharing the screen with the permission Android gave (MediaProjection). */
    suspend fun startScreenShare(permission: Intent) {
        try {
            val started = liveKitRoom.localParticipant.setScreenShareEnabled(true, ScreenCaptureParams(permission, onStop = {
                scope.launch { stopScreenShare() }
            }))
            screenSharing = started
            if (started) Sounds.play(Sound.SCREEN_SHARE_STARTED) else lastError = "Screen sharing did not start."
        } catch (e: Exception) {
            lastError = "Screen sharing did not start: ${e.friendlyMessage}"
        }
        refreshMembers()
    }

    suspend fun stopScreenShare() {
        if (!screenSharing) return
        runCatching { liveKitRoom.localParticipant.setScreenShareEnabled(false) }
        screenSharing = false
        Sounds.play(Sound.SCREEN_SHARE_STOPPED)
        refreshMembers()
    }

    /** Volume of one person, 0 to 2 (remembered per user like on desktop). */
    fun setVolume(userId: String, volume: Double) {
        CallPrefs.setVolume(userId, volume)
        applyVolumes()
    }

    private fun applyVolumes() {
        for (participant in liveKitRoom.remoteParticipants.values) {
            val userId = participant.identity?.value?.let { CallLogic.split(it)?.first } ?: continue
            val volume = if (deafened) 0.0 else CallPrefs.volume(userId)
            for (publication in participant.audioTrackPublications) {
                (publication.second as? RemoteAudioTrack)?.setVolume(volume)
            }
        }
    }

    // MARK: MatrixRTC

    private suspend fun chooseTransport(): CallLogic.Transport {
        state = "Finding voice server…"
        // The room state from the server carries origin_server_ts, which memberships without
        // created_ts need; the SDK's copy is the fallback.
        val parsed = runCatching {
            account.clientRequestArray("/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}/state")
                .filter { it["type"].str() == CallLogic.MEMBER_EVENT_TYPE }
                .mapNotNull { event ->
                    val key = event["state_key"].str() ?: return@mapNotNull null
                    val content = event["content"].obj() ?: return@mapNotNull null
                    CallLogic.MemberEvent(key, content, event["origin_server_ts"].long())
                }
        }.getOrNull() ?: runCatching { matrixRoom.stateEvents(uniffi.ruma_events.StateEventType.CallMember) }.getOrDefault(emptyList())
            .mapNotNull { event -> Json.obj(event.contentJson)?.let { CallLogic.MemberEvent(event.stateKey, it) } }
        CallLogic.oldestTransport(parsed, stateKey, roomId, System.currentTimeMillis())?.let { return it }
        val transports = runCatching { account.client.discoverRtcTransports() }.getOrNull() ?: emptyList()
        for (transport in transports) {
            if (transport is RtcTransport.LiveKit) {
                val url = transport.serviceUrl ?: transport.url ?: continue
                return CallLogic.Transport(url, roomId)
            }
        }
        throw DiddyError("Your homeserver does not offer a MatrixRTC voice server (MSC4143 rtc_foci / LiveKit). Voice channels need one, like on the desktop app.")
    }

    private suspend fun requestSfuConfig(serviceUrl: String, token: org.matrix.rustcomponents.sdk.OpenIdToken): Pair<String, String> {
        val body = mapOf(
            "room" to roomId,
            "openid_token" to mapOf(
                "access_token" to token.accessToken,
                "token_type" to token.tokenType,
                "matrix_server_name" to token.matrixServerName,
                "expires_in" to token.expiresInSeconds.toLong(),
            ),
            "device_id" to ownDeviceId,
        )
        val answer = Http.request(serviceUrl.trimEnd('/') + "/sfu/get", method = "POST", json = body)
        if (answer.status !in 200..299) throw DiddyError("The voice server refused access (${answer.status}). ${answer.text.take(200)}")
        val json = answer.json ?: throw DiddyError("The voice server answered something unexpected.")
        val url = json["url"].str() ?: throw DiddyError("The voice server sent no address.")
        val jwt = json["jwt"].str() ?: throw DiddyError("The voice server sent no access token.")
        return url to jwt
    }

    private suspend fun sendMembership() {
        val transport = transport ?: return
        val now = System.currentTimeMillis()
        val content = CallLogic.membershipContent(ownUserId, ownDeviceId, transport, now, membershipCreatedTs)
        membershipEventId = matrixRoom.sendStateEventRaw(CallLogic.MEMBER_EVENT_TYPE, stateKey, Json.encode(content))
        if (membershipCreatedTs == null) membershipCreatedTs = now
    }

    private fun scheduleMembershipRefresh() {
        refreshJob?.cancel()
        refreshJob = scope.launch {
            while (true) {
                delay(3L * 60 * 60 * 1000)
                runCatching { sendMembership() }
            }
        }
    }

    private suspend fun startMicrophone(allowed: Boolean) {
        if (!allowed) {
            microphoneOn = false
            lastError = "Microphone access is off. You can listen, and allow it in Android's settings."
            return
        }
        try {
            liveKitRoom.localParticipant.setMicrophoneEnabled(true)
            microphoneOn = true
            attachSoundboard()
        } catch (e: Exception) {
            microphoneOn = false
            lastError = "The microphone could not be started: ${e.friendlyMessage}"
        }
    }

    /** Soundboard clips are mixed into the microphone track. */
    private fun attachSoundboard() {
        val track = liveKitRoom.localParticipant.getTrackPublication(Track.Source.MICROPHONE)?.track as? io.livekit.android.room.track.LocalAudioTrack
        track?.setAudioBufferCallback(ClipMixer)
    }

    // MARK: Ringing others

    private val someoneElseIsHere: Boolean
        get() = liveKitRoom.remoteParticipants.isNotEmpty() || (account.summary(roomId)?.callParticipants?.any { it != ownUserId } ?: false)

    /** Rings the other person in a DM (or notifies a group) when you are the first one here. */
    suspend fun notifyRoom() {
        val eventId = membershipEventId ?: return
        if (account.isVoiceChannel(roomId) || someoneElseIsHere) return
        val summary = account.summary(roomId) ?: return
        val content = CallLogic.notificationContent(eventId, summary.isDirect, System.currentTimeMillis())
        val notificationId = runCatching { matrixRoom.sendRaw(CallLogic.NOTIFICATION_EVENT_TYPE, Json.encode(content)) }.getOrNull() ?: return
        if (!summary.isDirect || leaving) return
        outgoing = OutgoingRing.RINGING
        Sounds.startRingback()
        scope.launch { CallPush.notify(account, roomId) }
        val me = ownUserId
        declineHandle = runCatching {
            matrixRoom.subscribeToCallDeclineEvents(notificationId, object : CallDeclineListener {
                override fun call(declinerUserId: String) {
                    if (declinerUserId == me) return
                    scope.launch {
                        if (outgoing == OutgoingRing.NONE) return@launch
                        stopOutgoingRing()
                        onDeclined?.invoke(declinerUserId)
                    }
                }
            })
        }.getOrNull()
        ringTimeout = scope.launch {
            delay(CallLogic.RING_LIFETIME_MS)
            if (outgoing != OutgoingRing.RINGING) return@launch
            stopOutgoingRing()
            outgoing = OutgoingRing.NO_ANSWER
            Sounds.play(Sound.NO_ANSWER)
        }
    }

    private fun stopOutgoingRing() {
        ringTimeout?.cancel()
        declineHandle?.cancel()
        declineHandle = null
        if (outgoing == OutgoingRing.RINGING) Sounds.stopLoop()
        outgoing = OutgoingRing.NONE
    }

    // MARK: Media keys

    private suspend fun distributeKey(participants: List<RemoteParticipant>) {
        if (!encrypted || ownKey.isEmpty()) return
        val recipients = CallLogic.recipients(participants.mapNotNull { it.identity?.value })
        if (recipients.isEmpty()) return
        val content = CallLogic.keysContent(roomId, ownUserId, ownDeviceId, ownKey, ownKeyIndex, System.currentTimeMillis())
        try {
            account.client.sendEncryptedToDeviceMessage(CallLogic.KEYS_EVENT_TYPE, recipients, Json.encode(content))
        } catch (e: Exception) {
            lastError = "Could not share the call key: ${e.friendlyMessage}"
        }
    }

    private fun receiveKeys(message: ToDeviceMessage) {
        if (closed || message.eventType != CallLogic.KEYS_EVENT_TYPE) return
        val received = CallLogic.parseKeys(message.content, message.senderId, roomId) ?: return
        keyProvider.rtcKeyProvider.setKey(received.participantId, received.index, received.key)
    }

    // MARK: Events and members

    private fun onEvent(event: RoomEvent) {
        if (closed) return
        when (event) {
            is RoomEvent.ParticipantConnected -> {
                scope.launch { distributeKey(listOf(event.participant)) }
                if (connected && !deafened) Sounds.play(Sound.USER_JOINED)
                applyVolumes()
            }
            is RoomEvent.ParticipantDisconnected -> if (connected && !deafened && !leaving) Sounds.play(Sound.USER_LEFT)
            is RoomEvent.TrackSubscribed -> applyVolumes()
            is RoomEvent.Disconnected -> if (!leaving) {
                DiagLog.write("call: disconnected (${event.reason})")
                onDropped?.invoke()
            }
            is RoomEvent.Reconnecting -> state = "Reconnecting…"
            is RoomEvent.Reconnected -> state = "Voice connected"
            else -> {}
        }
        refreshMembers()
    }

    fun refreshMembers() {
        if (closed) return
        val result = mutableListOf<CallMember>()
        result += member(liveKitRoom.localParticipant, true)
        liveKitRoom.remoteParticipants.values.sortedBy { it.identity?.value ?: "" }.forEach { result += member(it, false) }
        // Whoever Matrix says is in the call but LiveKit has not delivered yet.
        val unreadable = liveKitRoom.remoteParticipants.values.any { p -> p.identity?.value?.let(CallLogic::split) == null }
        if (!unreadable) {
            val present = result.map { it.userId }.toSet()
            for (userId in account.summary(roomId)?.callParticipants ?: emptyList()) {
                if (userId in present) continue
                result += CallMember("matrix:$userId", userId, account.name(userId), account.profiles[userId]?.avatarUrl, false, false, true, isConnecting = true)
            }
        }
        val merged = onePerPerson(result)
        account.resolveProfiles(merged.map { it.userId }, roomId)
        if (merged != members) members = merged
        if (outgoing != OutgoingRing.NONE && someoneElseIsHere) stopOutgoingRing()
        if (watchedShare != null && merged.none { it.id == watchedShare && it.screenShare != null }) watchedShare = null
    }

    private fun member(participant: Participant, isLocal: Boolean): CallMember {
        val identity = participant.identity?.value ?: if (isLocal) ownIdentity else participant.sid.value
        val userId = CallLogic.split(identity)?.first ?: identity
        var camera: VideoTrack? = null
        var screen: VideoTrack? = null
        for ((publication, track) in participant.videoTrackPublications) {
            if (publication.muted) continue
            val video = track as? VideoTrack ?: continue
            when (publication.source) {
                Track.Source.SCREEN_SHARE -> screen = video
                Track.Source.CAMERA -> camera = video
                else -> {}
            }
        }
        val known = account.profiles[userId]
        return CallMember(
            id = identity,
            userId = userId,
            name = known?.name ?: participant.name?.ifEmpty { null } ?: account.name(userId),
            avatarUrl = known?.avatarUrl,
            isLocal = isLocal,
            isSpeaking = participant.isSpeaking,
            microphoneOn = if (isLocal) microphoneOn else participant.isMicrophoneEnabled,
            camera = camera,
            screenShare = screen,
        )
    }

    companion object {
        const val SPEAKER_KEY = "call.speakerOn"

        /** One tile per person: a second device of the same person adds its video. */
        fun onePerPerson(members: List<CallMember>): List<CallMember> {
            val order = mutableListOf<String>()
            val byUser = mutableMapOf<String, CallMember>()
            for (member in members) {
                val known = byUser[member.userId]
                if (known == null) {
                    order += member.userId
                    byUser[member.userId] = member
                    continue
                }
                val memberFirst = if ((known.screenShare == null) != (member.screenShare == null)) member.screenShare != null else member.isLocal && !known.isLocal
                val primary = if (memberFirst) member else known
                val other = if (memberFirst) known else member
                byUser[member.userId] = primary.copy(
                    camera = primary.camera ?: other.camera,
                    screenShare = primary.screenShare ?: other.screenShare,
                    isSpeaking = primary.isSpeaking || other.isSpeaking,
                    microphoneOn = primary.microphoneOn || other.microphoneOn,
                    isConnecting = primary.isConnecting && other.isConnecting,
                )
            }
            return order.mapNotNull { byUser[it] }
        }
    }
}
