package app.diddy.call

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.diddy.MainActivity
import app.diddy.R
import app.diddy.app.AppModel
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.app.Sound
import app.diddy.app.Sounds
import app.diddy.matrix.DoNotDisturb
import app.diddy.matrix.ListDiff
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PresenceStore
import app.diddy.matrix.RoomSummary
import app.diddy.push.Notifications
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.EventOrTransactionId
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.Timeline
import org.matrix.rustcomponents.sdk.TimelineDiff
import org.matrix.rustcomponents.sdk.TimelineItem
import org.matrix.rustcomponents.sdk.TimelineItemContent
import org.matrix.rustcomponents.sdk.TimelineListener

/** Call options kept on this device (ios CallPrefs). */
object CallPrefs {
    const val NOISE_SUPPRESSION_KEY = "call.noiseSuppression"
    const val VOICE_PROCESSING_KEY = "call.voiceProcessing"
    private const val VOLUMES_KEY = "call.volumes"

    val noiseSuppression: Boolean get() = Prefs.bool(NOISE_SUPPRESSION_KEY, true)
    val voiceProcessing: Boolean get() = Prefs.bool(VOICE_PROCESSING_KEY, true)

    private fun volumes(): Map<String, Any?> = app.diddy.util.Json.obj(Prefs.string(VOLUMES_KEY)) ?: emptyMap()

    fun volume(userId: String): Double = (volumes()[userId] as? Number)?.toDouble() ?: 1.0

    fun setVolume(userId: String, volume: Double) {
        val all = volumes().toMutableMap()
        if (volume == 1.0) all.remove(userId) else all[userId] = volume.coerceIn(0.0, 2.0)
        Prefs.setString(VOLUMES_KEY, app.diddy.util.Json.encode(all))
    }

    fun resetVolumes() = Prefs.remove(VOLUMES_KEY)
}

/** Someone calls you in a DM (ios IncomingCall). Watches the chat for the ring to end or be declined. */
class IncomingCall(val account: MatrixAccount, val roomId: String, val callerId: String) {
    var notificationEventId: String? = null
        private set
    var onCancelled: (() -> Unit)? = null
    private var timeline: Timeline? = null
    private var listener: TaskHandle? = null
    private val items = mutableListOf<TimelineItem>()

    val name: String get() = account.summary(roomId)?.name ?: account.name(callerId)
    val avatarUrl: String? get() = account.profiles[callerId]?.avatarUrl ?: account.summary(roomId)?.avatarUrl

    suspend fun watchTimeline() {
        val room = account.room(roomId) ?: return
        val made = runCatching { room.timeline() }.getOrNull() ?: return
        timeline = made
        listener = made.addListener(object : TimelineListener {
            override fun onUpdate(diff: List<TimelineDiff>) {
                account.scope.launch { apply(diff) }
            }
        })
    }

    fun stopWatching() {
        listener?.cancel()
        listener = null
        timeline = null
    }

    private fun apply(diffs: List<TimelineDiff>) {
        diffs.forEach { ListDiff.of(it).apply(items) }
        for (item in items.asReversed()) {
            val event = item.asEvent() ?: continue
            if (event.isOwn) continue
            val content = event.content as? TimelineItemContent.RtcNotification ?: continue
            val eventId = (event.eventOrTransactionId as? EventOrTransactionId.EventId)?.eventId ?: continue
            val age = System.currentTimeMillis() - event.timestamp.toLong()
            // An older notification is from an earlier call (the new one may not be decrypted yet):
            // keep ringing, the ring ends by itself after 30 seconds.
            if (age > 120_000) return
            if (account.userId in content.declinedBy) onCancelled?.invoke() else notificationEventId = eventId
            return
        }
    }

    suspend fun decline() {
        val id = notificationEventId ?: return
        runCatching { account.room(roomId)?.declineCall(id) }
    }
}

/** A join that waits for "Leave your current call?". */
data class CallSwitchRequest(val account: MatrixAccount, val roomId: String, val roomName: String, val currentName: String, val showCallScreen: Boolean)

/** The one running call, ringing and switching between calls (ios CallManager). */
@SuppressLint("StaticFieldLeak") // the application context
object CallManager {
    private lateinit var context: Context
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    var current by mutableStateOf<CallSession?>(null)
        private set
    var incoming by mutableStateOf<IncomingCall?>(null)
        private set
    var switchRequest by mutableStateOf<CallSwitchRequest?>(null)
    var error by mutableStateOf<String?>(null)
    /** Shows the call full screen, set when a call starts somewhere without its own call screen. */
    var showCallScreen by mutableStateOf(false)
    /** Switches to the account a call came in on. */
    var onAnswer: (suspend (MatrixAccount) -> Unit)? = null

    private var ringTimeout: Job? = null
    private val rungRooms = mutableSetOf<String>()
    private const val RING_SECONDS = 30L

    fun init(context: Context) {
        this.context = context.applicationContext
    }

    private fun granted(permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    val microphoneAllowed: Boolean get() = granted(android.Manifest.permission.RECORD_AUDIO)
    val cameraAllowed: Boolean get() = granted(android.Manifest.permission.CAMERA)

    /** Joins, but asks first when another call is running. */
    suspend fun requestJoin(account: MatrixAccount, roomId: String, roomName: String, showCallScreen: Boolean = false) {
        val running = current
        if (running == null || running.roomId == roomId) {
            join(account, roomId, roomName, showCallScreen)
            return
        }
        switchRequest = CallSwitchRequest(account, roomId, roomName, running.roomName, showCallScreen)
    }

    suspend fun confirmSwitch(request: CallSwitchRequest) {
        switchRequest = null
        join(request.account, request.roomId, request.roomName, request.showCallScreen)
    }

    suspend fun join(account: MatrixAccount, roomId: String, roomName: String, present: Boolean = false, companion: CompanionRole? = null) {
        if (current?.roomId == roomId && companion == null) {
            if (present) showCallScreen = true
            return
        }
        if (incoming?.roomId == roomId) endRinging()
        leave(silently = true)
        val room = account.room(roomId) ?: run {
            error = "Join the channel first."
            return
        }
        val session = CallSession(context, account, room, roomName)
        session.companion = companion
        session.onCompanionComputerGone = {
            if (current === session) {
                error = "Your computer is no longer in the call, so this phone left too."
                scope.launch { leave() }
            }
        }
        session.onDropped = {
            if (current === session) {
                error = "The connection to the voice server was lost."
                Sounds.play(Sound.CONNECTION_LOST)
                scope.launch { leave(silently = true) }
            }
        }
        session.onDeclined = { userId ->
            if (current === session) {
                error = "${account.name(userId)} declined the call."
                Sounds.play(Sound.CALL_DECLINED)
                scope.launch { leave(silently = true) }
            }
        }
        current = session
        Sounds.inCall = true
        if (present) showCallScreen = true
        CallService.start(context, session.roomName)
        DiagLog.write("call: joining")
        try {
            session.connect()
            DiagLog.write("call: connected")
            Sounds.play(Sound.CALL_JOINED)
            // As the computer's camera, nobody needs to be rung: the computer is in the call already.
            if (companion != null) session.startCompanion() else session.notifyRoom()
        } catch (e: Exception) {
            DiagLog.write("call: join failed: ${e.friendlyMessage}")
            if (e !is kotlinx.coroutines.CancellationException) error = e.friendlyMessage
            session.disconnect()
            if (current === session) {
                current = null
                showCallScreen = false
                Sounds.inCall = false
                CallService.stop(context)
            }
        }
    }

    suspend fun leave(silently: Boolean = false) {
        val session = current ?: return
        current = null
        showCallScreen = false
        Sounds.inCall = false
        DiagLog.write("call: leaving")
        Soundboard.stopAll()
        session.disconnect()
        CallService.stop(context)
        if (!silently) Sounds.play(Sound.CALL_LEFT)
    }

    // MARK: Ringing

    /** Rings when someone starts a call in a DM; reads room state, so undecryptable events do not matter. */
    fun roomsChanged(account: MatrixAccount, old: Map<String, RoomSummary>, new: List<RoomSummary>) {
        for (room in new) {
            if (!room.isDirect || room.isSpace || !room.isJoined) continue
            val others = room.callParticipants.filter { it != account.userId }
            if (others.isEmpty()) rungRooms -= room.id
            val ringing = incoming
            if (ringing != null && ringing.roomId == room.id) {
                if (others.isEmpty() || account.userId in room.callParticipants) endRinging()
                continue
            }
            val hadOthers = old[room.id]?.callParticipants?.any { it != account.userId } ?: false
            val caller = others.firstOrNull() ?: continue
            if (hadOthers || !account.canRing || incoming != null || current?.roomId == room.id || room.id in rungRooms || account.userId in room.callParticipants) continue
            startRinging(account, room.id, caller)
        }
    }

    private fun startRinging(account: MatrixAccount, roomId: String, callerId: String) {
        rungRooms += roomId
        account.resolveProfiles(listOf(callerId), roomId)
        val call = IncomingCall(account, roomId, callerId)
        call.onCancelled = { if (incoming === call) endRinging() }
        incoming = call
        val announced = Notifications.announceCall(account, roomId, call.name)
        if (!announced && !DoNotDisturb.silencesSound("incomingCall", PresenceStore.of(account).ownStatus)) Sounds.startRinging()
        scope.launch { call.watchTimeline() }
        ringTimeout = scope.launch {
            delay(RING_SECONDS * 1000)
            if (incoming === call) endRinging()
        }
    }

    private fun endRinging() {
        ringTimeout?.cancel()
        Sounds.stopLoop()
        incoming?.let { Notifications.removeCall(it.account, it.roomId) }
        incoming?.stopWatching()
        incoming = null
    }

    /** Answer in the call notification: Diddy has just opened, maybe from scratch. */
    suspend fun answerFromNotification(accountId: String, roomId: String) {
        Notifications.removeCall(accountId, roomId)
        val ringing = incoming
        if (ringing != null && ringing.account.id == accountId && ringing.roomId == roomId) {
            answerIncoming()
            return
        }
        // Rung by push while Diddy was closed: wait for the login to come back.
        var waited = 0
        while ((AppModel.restoring || AppModel.accounts.none { it.id == accountId }) && waited < 20_000) {
            delay(250)
            waited += 250
        }
        val account = AppModel.accounts.firstOrNull { it.id == accountId } ?: run {
            error = "The call could not be answered: the account is not available."
            return
        }
        onAnswer?.invoke(account)
        join(account, roomId, account.summary(roomId)?.name ?: "Call", present = true)
    }

    /** Decline in the call notification. */
    suspend fun declineFromNotification(accountId: String, roomId: String) {
        Notifications.removeCall(accountId, roomId)
        val ringing = incoming
        if (ringing != null && ringing.account.id == accountId && ringing.roomId == roomId) declineIncoming()
    }

    fun answerIncoming() {
        val call = incoming ?: return
        endRinging()
        scope.launch {
            onAnswer?.invoke(call.account)
            join(call.account, call.roomId, call.name, present = true)
        }
    }

    suspend fun declineIncoming() {
        val call = incoming ?: return
        endRinging()
        call.decline()
    }
}

/** Keeps the call running while Diddy is in the background, with a notification to go back. */
class CallService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Call"
        val open = android.app.PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), android.app.PendingIntent.FLAG_IMMUTABLE)
        val hangUp = android.app.PendingIntent.getBroadcast(
            this, 3,
            Intent(this, CallActionReceiver::class.java).setAction(CallActionReceiver.ACTION_HANG_UP),
            android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        val room = androidx.core.app.Person.Builder().setName(title).setImportant(true).build()
        val notification = NotificationCompat.Builder(this, Notifications.CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(title)
            .setContentText("Voice connected. Tap to go back to the call.")
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(open)
            .setStyle(NotificationCompat.CallStyle.forOngoingCall(room, hangUp))
            .setUsesChronometer(true)
            .build()
        // A call (MANAGE_OWN_CALLS), plus microphone and camera once they are allowed.
        var type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL else 0
        if (Build.VERSION.SDK_INT >= 30) {
            if (CallManager.microphoneAllowed) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (CallManager.cameraAllowed) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        }
        try {
            ServiceCompat.startForeground(this, 2, notification, type)
        } catch (e: Exception) {
            DiagLog.write("call service: ${e.message}")
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping Diddy away ends the call like closing the desktop app.
        AppModel.scope.launch { CallManager.leave() }
        super.onTaskRemoved(rootIntent)
    }

    companion object {
        private const val EXTRA_TITLE = "title"

        fun start(context: Context, title: String) {
            runCatching { ContextCompat.startForegroundService(context, Intent(context, CallService::class.java).putExtra(EXTRA_TITLE, title)) }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CallService::class.java))
        }
    }
}

/** Hang up and Decline from the call notifications. */
class CallActionReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        AppModel.scope.launch {
            try {
                when (intent.action) {
                    ACTION_HANG_UP -> CallManager.leave()
                    ACTION_DECLINE -> {
                        val account = intent.getStringExtra(app.diddy.IntentRouter.EXTRA_ACCOUNT) ?: return@launch
                        val room = intent.getStringExtra(app.diddy.IntentRouter.EXTRA_ROOM) ?: return@launch
                        CallManager.declineFromNotification(account, room)
                    }
                }
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION_HANG_UP = "app.diddy.call.HANG_UP"
        const val ACTION_DECLINE = "app.diddy.call.DECLINE"
    }
}

/** Plugs calls into the rest of the app (ringing from the room list, deafen for sounds). */
object CallWiring {
    fun install(context: Context) {
        CallManager.init(context)
        Soundboard.init(context)
        val previous = AppModel.Hooks.roomsChanged
        AppModel.Hooks.roomsChanged = { account, old, new ->
            previous(account, old, new)
            CallManager.roomsChanged(account, old, new)
        }
        AppModel.Hooks.isDeafened = { CallManager.current?.deafened == true }
        val beforeLogout = AppModel.Hooks.beforeLogout
        val added = AppModel.Hooks.accountAdded
        AppModel.Hooks.accountAdded = { account ->
            added(account)
            CompanionService.attach(account)
        }
        AppModel.Hooks.beforeLogout = { account ->
            CompanionService.detach(account.id)
            if (CallManager.current?.account === account) CallManager.leave(silently = true)
            beforeLogout(account)
        }
        CallManager.onAnswer = { account -> if (AppModel.activeAccount?.id != account.id) AppModel.switchTo(account) }
    }
}
