package app.diddy.ui.sheets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GppBad
import androidx.compose.material.icons.filled.GppGood
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.VerificationCenter
import app.diddy.matrix.VerificationPhase
import app.diddy.ui.FilledButton
import app.diddy.ui.FullSheet
import app.diddy.ui.theme.Theme
import kotlinx.coroutines.launch

/**
 * Shows the verification over everything while one runs, started here or by another device
 * (ios verificationSheet). Placed once per account screen.
 */
@Composable
fun VerificationHost(account: MatrixAccount) {
    val center = remember(account.id) { VerificationCenter.of(account) }
    LaunchedEffect(account.id) { center.start() }
    if (center.phase.isActive) VerificationSheet(center)
}

@Composable
private fun VerificationSheet(center: VerificationCenter) {
    val scope = rememberCoroutineScope()
    val phase = center.phase
    val close = { scope.launch { center.dismiss() }; Unit }
    FullSheet("Verify", close, closeLabel = if (phase.isRunning) "Cancel" else "Close") {
        Column(
            Modifier.fillMaxSize().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            when (phase) {
                VerificationPhase.Idle -> {}
                is VerificationPhase.Incoming -> {
                    BigIcon(Icons.Filled.VerifiedUser)
                    Title("Verification request")
                    val request = phase.request
                    val device = request.deviceName?.let { "$it (${request.deviceId})" } ?: request.deviceId
                    Note("${request.name} (${request.userId}) asks to verify on $device. Only accept if you started this yourself.")
                    FilledButton("Accept") { scope.launch { center.accept() } }
                    TextButton(onClick = close) { Text("Decline", color = Theme.muted) }
                }
                is VerificationPhase.Requesting -> {
                    CircularProgressIndicator(color = Theme.accent)
                    Title("Waiting for the other side")
                    Note(phase.message)
                }
                VerificationPhase.Starting -> {
                    CircularProgressIndicator(color = Theme.accent)
                    Note("Setting up the comparison…")
                }
                is VerificationPhase.Emojis -> {
                    Title("Compare the emojis")
                    Note("Check that these emojis appear in the same order on the other device.")
                    LazyVerticalGrid(GridCells.Fixed(4), Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        items(phase.emojis) { emoji ->
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(emoji.symbol, fontSize = 38.sp)
                                Text(emoji.label, color = Theme.muted, fontSize = 11.sp, textAlign = TextAlign.Center)
                            }
                        }
                    }
                    MatchButtons(center)
                }
                is VerificationPhase.Decimals -> {
                    Title("Compare the numbers")
                    Note("Check that these numbers appear in the same order on the other device.")
                    Text(phase.values.joinToString("  "), color = Theme.text, fontSize = 28.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    MatchButtons(center)
                }
                VerificationPhase.Confirming -> {
                    CircularProgressIndicator(color = Theme.accent)
                    Note("Waiting for the other side to confirm…")
                }
                VerificationPhase.Done -> {
                    BigIcon(Icons.Filled.GppGood, Theme.online)
                    Title("Verified")
                    Note("The verification is complete.")
                    FilledButton("Done") { close() }
                }
                is VerificationPhase.Cancelled -> {
                    BigIcon(Icons.Filled.GppBad, Theme.danger)
                    Title("Verification cancelled")
                    Note(phase.reason)
                    TextButton(onClick = close) { Text("Close") }
                }
                is VerificationPhase.Failed -> {
                    BigIcon(Icons.Filled.Warning, Theme.danger)
                    Title("Verification failed")
                    Note(phase.reason)
                    TextButton(onClick = close) { Text("Close") }
                }
            }
        }
    }
}

@Composable
private fun MatchButtons(center: VerificationCenter) {
    val scope = rememberCoroutineScope()
    FilledButton("They match") { scope.launch { center.approve() } }
    TextButton(onClick = { scope.launch { center.decline() } }) { Text("They don't match", color = Theme.danger) }
}

@Composable
private fun BigIcon(icon: ImageVector, color: Color = Theme.accent) = Icon(icon, null, tint = color, modifier = Modifier.size(54.dp))

@Composable
private fun Title(text: String) = Text(text, color = Theme.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)

@Composable
private fun Note(text: String) = Text(text, color = Theme.muted, textAlign = TextAlign.Center)
