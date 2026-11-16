package app.diddy.push

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.diddy.MainActivity
import app.diddy.R
import app.diddy.app.AppModel
import app.diddy.app.DiagLog

/**
 * Keeps Diddy's process and its sync running while the app is closed, so messages and calls
 * arrive as notifications (the Android side of ios BackgroundKeepAlive). Android shows a quiet
 * permanent notification for it; a tap opens Diddy.
 */
class KeepAliveService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!PushSettings.enabled) {
            stopSelf()
            return START_NOT_STICKY
        }
        val open = android.app.PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, Notifications.CHANNEL_BACKGROUND)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("Diddy is ready for messages")
            .setContentText("Tap to open. Turn this off in Settings > Notifications.")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(open)
            .build()
        try {
            ServiceCompat.startForeground(
                this, 1, notification,
                if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0,
            )
        } catch (e: Exception) {
            DiagLog.write("keepalive: could not start (${e.message})")
            stopSelf()
            return START_NOT_STICKY
        }
        // Started from boot or after Android ended the process: sign the accounts back in.
        AppModel.restore()
        AppModel.resumeAll()
        return START_STICKY
    }

    companion object {
        fun start(context: Context) {
            if (!PushSettings.enabled) return
            try {
                ContextCompat.startForegroundService(context, Intent(context, KeepAliveService::class.java))
            } catch (e: Exception) {
                // Android 12+ refuses to start it from the background; it starts with the app next time.
                DiagLog.write("keepalive: start refused (${e.message})")
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, KeepAliveService::class.java))
        }
    }
}

/** Starts the background connection again after the phone restarts or Diddy is updated. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            KeepAliveService.start(context)
        }
    }
}
