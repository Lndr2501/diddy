package app.diddy.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.diddy.R
import app.diddy.app.AppModel
import app.diddy.ui.theme.Theme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** What the app shows: the splash while logins come back, the account, the offline screen or login. */
@Composable
fun RootScreen() {
    val active = AppModel.activeAccount
    when {
        AppModel.restoring -> Box(Modifier.fillMaxSize().background(Theme.rail), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Image(painterResource(R.drawable.diddy_logo), contentDescription = null, modifier = Modifier.size(96.dp))
                CircularProgressIndicator(color = Theme.accent)
            }
        }
        active != null -> key(active.id) { MainScreen(active) }
        AppModel.unreachable.isNotEmpty() -> OfflineScreen()
        else -> LoginScreen(isAddingAccount = false)
    }
    AppModel.notice?.let { message ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { AppModel.notice = null },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { AppModel.notice = null }) { Text("OK") } },
        )
    }
    if (AppModel.addingAccount) {
        Dialog(onDismissRequest = { AppModel.addingAccount = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            LoginScreen(isAddingAccount = true, onClose = { AppModel.addingAccount = false })
        }
    }
    // Quietly keeps trying, for the offline screen and for a second account that is down.
    LaunchedEffect(AppModel.unreachable.isEmpty()) {
        while (AppModel.unreachable.isNotEmpty()) {
            delay(5_000)
            AppModel.retryUnreachable()
        }
    }
}

/** You are signed in, the server just cannot be reached. Comes back by itself. */
@Composable
private fun OfflineScreen() {
    val scope = rememberCoroutineScope()
    var retrying by remember { mutableStateOf(false) }
    Box(
        Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Theme.accent.copy(alpha = 0.35f), Theme.rail, Theme.rail))),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 480.dp).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Image(painterResource(R.drawable.diddy_logo), contentDescription = null, modifier = Modifier.size(88.dp))
            Text("Can't reach your server", color = Theme.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text(
                "You're still signed in as ${AppModel.unreachable.firstOrNull()?.userId ?: ""}. Diddy keeps trying and opens as soon as the server answers.",
                color = Theme.muted, textAlign = TextAlign.Center,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(16.dp), color = Theme.muted, strokeWidth = 2.dp)
                Spacer(Modifier.size(10.dp))
                Text("Trying to reconnect…", color = Theme.muted, fontSize = 13.sp)
            }
            FilledButton("Try Again", busy = retrying) {
                retrying = true
                scope.launch {
                    AppModel.retryUnreachable()
                    retrying = false
                }
            }
            TextButton(onClick = { AppModel.addingAccount = true }) { Text("Sign in to another account", fontSize = 13.sp) }
        }
    }
}
