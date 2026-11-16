package app.diddy

import android.content.Context
import app.diddy.app.AppModel
import app.diddy.push.CallPush
import app.diddy.push.KeepAliveService
import app.diddy.push.Notifications

/** Connects the parts that react to accounts and rooms (notifications, calls, push). */
object Wiring {
    fun install(context: Context) {
        Notifications.init(context)
        app.diddy.push.UnifiedPushing.init(context)
        val added = AppModel.Hooks.accountAdded
        AppModel.Hooks.accountAdded = { account ->
            added(account)
            app.diddy.push.UnifiedPushing.accountAdded(account)
        }
        val previous = AppModel.Hooks.roomsChanged
        AppModel.Hooks.roomsChanged = { account, old, new ->
            previous(account, old, new)
            Notifications.roomsChanged(account, old, new)
            // A new DM gets this device's call alert target too.
            val dms = new.filter { it.isDirect && it.isJoined }.map { it.id }.toSet()
            if (dms != old.values.filter { it.isDirect && it.isJoined }.map { it.id }.toSet()) CallPush.publish(account)
        }
        // Do Not Disturb mutes message, mention, invite and ringing sounds like on desktop.
        AppModel.Hooks.silencesSound = { account, sound ->
            app.diddy.matrix.DoNotDisturb.silencesSound(sound.alert, app.diddy.matrix.PresenceStore.of(account).ownStatus)
        }
        val beforeLogout = AppModel.Hooks.beforeLogout
        AppModel.Hooks.beforeLogout = { account ->
            app.diddy.push.UnifiedPushing.accountRemoved(account)
            beforeLogout(account)
        }
        app.diddy.call.CallWiring.install(context)
    }

    /** The app is on screen: the background connection may start now (Android refuses it from the background). */
    fun appStarted(context: Context) {
        KeepAliveService.start(context)
    }
}
