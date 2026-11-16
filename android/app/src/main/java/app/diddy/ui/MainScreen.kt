package app.diddy.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import app.diddy.app.AppModel
import app.diddy.matrix.Destination
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PresenceStore
import app.diddy.matrix.loadDiddyProfiles
import app.diddy.ui.chat.ChatScreen
import app.diddy.ui.home.PhoneHome
import kotlinx.coroutines.launch

/** The account on screen (ios MainView, phone layout): the tabs, and the open chat over them. */
@Composable
fun MainScreen(account: MatrixAccount) {
    val navigator = remember(account.id) { Navigator() }
    LaunchedEffect(account.id) {
        account.start()
        account.loadAllChannels()
    }
    LaunchedEffect(account.rooms.isEmpty()) { account.loadDiddyProfiles() }
    LaunchedEffect(account.spaces.map { it.roomId }) {
        navigator.server?.let { server -> if (account.spaces.none { it.roomId == server } && account.spaces.isNotEmpty()) navigator.selectServer(null) }
        account.loadAllChannels()
    }
    // A matrix.to or matrix: link opened from another app.
    LaunchedEffect(app.diddy.app.ShareInbox.link) {
        val raw = app.diddy.app.ShareInbox.link ?: return@LaunchedEffect
        app.diddy.app.ShareInbox.link = null
        when (val link = app.diddy.app.MatrixToLink.parse(app.diddy.app.MatrixToLink.fromMatrixUri(raw))) {
            is app.diddy.app.MatrixToLink.User -> navigator.show(Sheet.Profile(link.userId, null))
            is app.diddy.app.MatrixToLink.Room -> navigator.show(Sheet.JoinLink(link.roomIdOrAlias, link.via))
            is app.diddy.app.MatrixToLink.Event -> navigator.show(Sheet.JoinLink(link.roomIdOrAlias, link.via, link.eventId))
            null -> {}
        }
    }
    LaunchedEffect(AppModel.openRequest) {
        val request = AppModel.openRequest ?: return@LaunchedEffect
        if (request.first != account.id) return@LaunchedEffect
        AppModel.openRequest = null
        navigator.open(request.second, account)
    }
    // Presence while the app is in front; "unavailable" when it goes away.
    LifecycleResumeEffect(account.id) {
        val store = PresenceStore.of(account)
        val job = account.scope.launch { store.runForeground() }
        account.scope.launch { account.loadDiddyProfiles(staleAfterSeconds = 15) }
        onPauseOrDispose {
            job.cancel()
            account.scope.launch { store.enterBackground() }
        }
    }
    Box(Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = navigator.destination,
            transitionSpec = {
                if (targetState != null) slideInHorizontally { it } togetherWith slideOutHorizontally { -it / 4 }
                else slideInHorizontally { -it / 4 } togetherWith slideOutHorizontally { it }
            },
            label = "chat",
        ) { destination ->
            when (destination) {
                null -> PhoneHome(account, navigator)
                is Destination.Text -> ChatScreen(account, destination.roomId, navigator) { navigator.destination = null }
                is Destination.Voice -> app.diddy.ui.call.VoiceChannelScreen(account, destination.roomId, navigator) { navigator.destination = null }
            }
        }
        app.diddy.ui.call.CallOverlay(account, navigator)
        app.diddy.app.ShareInbox.incoming?.let { app.diddy.ui.sheets.ShareTargetSheet(account, it, navigator) }
        SheetHost(account, navigator)
    }
}

