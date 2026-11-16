package app.diddy.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import app.diddy.matrix.MatrixAccount

@Composable
fun MainScreen(account: MatrixAccount) {
    LaunchedEffect(account.id) { account.start() }
    Box(Modifier.fillMaxSize()) { Text("${account.rooms.size} rooms") }
}
