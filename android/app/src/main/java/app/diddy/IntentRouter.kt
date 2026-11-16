package app.diddy

import android.content.Context
import android.content.Intent
import app.diddy.app.AppModel
import app.diddy.app.ShareInbox
import kotlinx.coroutines.launch

/** Opens what another part of Android hands to Diddy: a tapped notification, a link, a share. */
object IntentRouter {
    const val EXTRA_ACCOUNT = "app.diddy.account"
    const val EXTRA_ROOM = "app.diddy.room"
    const val EXTRA_ANSWER = "app.diddy.answer"

    fun handle(context: Context, intent: Intent) {
        val account = intent.getStringExtra(EXTRA_ACCOUNT)
        val room = intent.getStringExtra(EXTRA_ROOM)
        if (account != null && room != null && intent.getBooleanExtra(EXTRA_ANSWER, false)) {
            AppModel.scope.launch { app.diddy.call.CallManager.answerFromNotification(account, room) }
            return
        }
        if (account != null && room != null) {
            AppModel.scope.launch { AppModel.open(room, account) }
            return
        }
        if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) {
            AppModel.scope.launch { ShareInbox.handle(context, intent) }
            return
        }
        // matrix.to and matrix: links: the account on screen shows them.
        val data = intent.data ?: return
        if (intent.action == Intent.ACTION_VIEW && (data.scheme == "matrix" || data.host == "matrix.to")) {
            ShareInbox.link = data.toString()
        }
    }
}
