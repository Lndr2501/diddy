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
