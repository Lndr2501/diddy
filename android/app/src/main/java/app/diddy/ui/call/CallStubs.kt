package app.diddy.ui.call

import androidx.compose.runtime.Composable
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.Navigator

@Composable
fun CallHomeCard(account: MatrixAccount, navigator: Navigator) {}

@Composable
fun VoiceStatusBar(account: MatrixAccount, navigator: Navigator, rounded: Boolean = false) {}

@Composable
fun VoiceRoster(account: MatrixAccount, roomId: String, participants: List<String>) {}

@Composable
fun ChatCallBanner(account: MatrixAccount, roomId: String, title: String, navigator: Navigator) {}

suspend fun startCall(account: MatrixAccount, roomId: String, title: String, navigator: Navigator) {}

@Composable
fun VoiceChannelScreen(account: MatrixAccount, roomId: String, navigator: Navigator, onBack: () -> Unit) {
    app.diddy.ui.chat.ChatScreen(account, roomId, navigator, onBack)
}

@Composable
fun CallSettingsPage() {}

@Composable
fun WatchTogetherSettingsPage() {}
