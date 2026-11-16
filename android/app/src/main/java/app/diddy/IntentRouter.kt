package app.diddy

import android.content.Context
import android.content.Intent
import app.diddy.app.AppModel
import kotlinx.coroutines.launch

/** Opens what another part of Android hands to Diddy: a tapped notification, a link, a share. */
object IntentRouter {
    const val EXTRA_ACCOUNT = "app.diddy.account"
    const val EXTRA_ROOM = "app.diddy.room"

    fun handle(context: Context, intent: Intent) {
        val account = intent.getStringExtra(EXTRA_ACCOUNT)
        val room = intent.getStringExtra(EXTRA_ROOM)
        if (account != null && room != null) {
            AppModel.scope.launch { AppModel.open(room, account) }
        }
    }
}
