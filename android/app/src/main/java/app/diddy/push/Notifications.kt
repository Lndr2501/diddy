package app.diddy.push

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import app.diddy.IntentRouter
import app.diddy.MainActivity
import app.diddy.R
import app.diddy.app.Prefs
import app.diddy.app.Sound
import app.diddy.matrix.DoNotDisturb
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PresenceStore
import app.diddy.matrix.RoomSummary
import kotlinx.coroutines.launch

/** Whether Diddy keeps running in the background to notify (Settings > Notifications). */
object PushSettings {
    const val ENABLED_KEY = "diddy.backgroundNotifications"

    val enabled: Boolean get() = Prefs.bool(ENABLED_KEY)

    fun setEnabled(context: Context, on: Boolean) {
        Prefs.setBool(ENABLED_KEY, on)
        if (on) KeepAliveService.start(context) else {
            KeepAliveService.stop(context)
            Notifications.clearAll()
        }
    }
}

/**
 * New messages, mentions, invites and calls as Android notifications while Diddy is not on
 * screen (ios LocalNotifications). They come from the room list of the running sync.
 */
@SuppressLint("StaticFieldLeak") // the application context
object Notifications {
    const val CHANNEL_MESSAGES = "messages"
    const val CHANNEL_MENTIONS = "mentions"
    const val CHANNEL_CALLS = "calls"
    const val CHANNEL_BACKGROUND = "background"

    private lateinit var context: Context

    fun init(context: Context) {
        this.context = context.applicationContext
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "New messages in your chats and channels."
                },
                NotificationChannel(CHANNEL_MENTIONS, "Mentions and invites", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Someone mentions you or invites you."
                },
                NotificationChannel(CHANNEL_CALLS, "Calls", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Someone calls you."
                },
                NotificationChannel(CHANNEL_BACKGROUND, "Running in the background", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Shown while Diddy keeps its connection open for notifications."
                    setShowBadge(false)
                },
            ),
        )
    }

    private val inForeground: Boolean
        get() = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

    val inForegroundNow: Boolean get() = inForeground

    private val permitted: Boolean
        get() = Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** The open connection notifies only when push does not already do it. */
    private val canPost: Boolean
        get() = PushSettings.enabled && !UnifiedPushing.enabled && !inForeground && permitted

    /** A message that came in by push (UnifiedPush). */
    fun postPush(account: MatrixAccount, roomId: String, title: String, body: String, mention: Boolean, noisy: Boolean) {
        if (!::context.isInitialized || !permitted || inForeground) return
        if (DoNotDisturb.silencesNotification(PresenceStore.of(account).ownStatus)) return
        val sound = noisy && (if (mention) Sound.MENTION else Sound.MESSAGE).isEnabled
        post(account, roomId, title, body, if (mention) CHANNEL_MENTIONS else CHANNEL_MESSAGES, sound, tag(account, roomId))
    }

    private fun tag(account: MatrixAccount, roomId: String) = "${account.id}|$roomId"

    fun openIntent(accountId: String, roomId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction("app.diddy.OPEN.$accountId.$roomId")
            .putExtra(IntentRouter.EXTRA_ACCOUNT, accountId)
            .putExtra(IntentRouter.EXTRA_ROOM, roomId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, (accountId + roomId).hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** The room list changed: notify what is new, remove what was read elsewhere. */
    fun roomsChanged(account: MatrixAccount, old: Map<String, RoomSummary>, new: List<RoomSummary>) {
        if (!::context.isInitialized) return
        val manager = NotificationManagerCompat.from(context)
        for (room in new) {
            val before = old[room.id] ?: continue
            if (room.notifications == 0L && room.mentions == 0L && (before.notifications > 0 || before.mentions > 0)) {
                manager.cancel(tag(account, room.id), 0)
            }
        }
        val silenced = DoNotDisturb.silencesNotification(PresenceStore.of(account).ownStatus)
        if (!canPost || !account.canRing || silenced) return
        for (room in new) {
            if (room.isSpace || (room.isDirect && room.callParticipants.isNotEmpty())) continue
            val before = old[room.id]
            if (before == null) {
                if (room.isInvite) postInvite(account, room)
                continue
            }
            if (room.isInvite && !before.isInvite) postInvite(account, room)
            else if (room.isJoined && (room.mentions > before.mentions || room.notifications > before.notifications)) {
                val mention = room.mentions > before.mentions
                account.scope.launch { postMessage(account, room, mention) }
            }
        }
    }

    private suspend fun postMessage(account: MatrixAccount, room: RoomSummary, mention: Boolean) {
        val preview = account.notificationPreview(room.id)
        val body = preview?.let { (sender, text) -> if (room.isDirect) text else "$sender: $text" } ?: if (mention) "You were mentioned" else "New message"
        val sound = if (mention) Sound.MENTION else Sound.MESSAGE
        post(account, room.id, room.name, body, if (mention || room.isDirect) CHANNEL_MENTIONS else CHANNEL_MESSAGES, sound.isEnabled, tag(account, room.id))
    }

    private fun postInvite(account: MatrixAccount, room: RoomSummary) {
        val body = room.inviterName?.let { "$it invited you" } ?: "You were invited"
        post(account, room.id, room.name, body, CHANNEL_MENTIONS, Sound.INVITE.isEnabled, tag(account, room.id))
    }

    /** Someone calls you while Diddy is in the background; false when it is on screen. */
    fun announceCall(account: MatrixAccount, roomId: String, name: String): Boolean {
        if (!::context.isInitialized || inForeground) return false
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        val notification = NotificationCompat.Builder(context, CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(name)
            .setContentText("Incoming call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setAutoCancel(true)
            .setTimeoutAfter(60_000)
            .setContentIntent(openIntent(account.id, roomId))
            .setFullScreenIntent(openIntent(account.id, roomId), true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify("call|" + tag(account, roomId), 0, notification) }
        return true
    }

    fun removeCall(account: MatrixAccount, roomId: String) {
        if (!::context.isInitialized) return
        NotificationManagerCompat.from(context).cancel("call|" + tag(account, roomId), 0)
    }

    /** The chat is open now: its notification is read. */
    fun clearRoom(account: MatrixAccount, roomId: String) {
        if (!::context.isInitialized) return
        NotificationManagerCompat.from(context).cancel(tag(account, roomId), 0)
    }

    fun clearAll() {
        if (!::context.isInitialized) return
        val manager = NotificationManagerCompat.from(context)
        manager.activeNotifications.filter { it.id == 0 && it.tag != null }.forEach { manager.cancel(it.tag, it.id) }
    }

    @SuppressLint("MissingPermission") // checked in canPost
    private fun post(account: MatrixAccount, roomId: String, title: String, body: String, channel: String, sound: Boolean, tag: String) {
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setGroup(account.id)
            .setAutoCancel(true)
            .setContentIntent(openIntent(account.id, roomId))
            .setOnlyAlertOnce(false)
        if (!sound) builder.setSilent(true)
        runCatching { NotificationManagerCompat.from(context).notify(tag, 0, builder.build()) }
    }
}
