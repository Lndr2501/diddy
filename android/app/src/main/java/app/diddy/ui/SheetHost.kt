package app.diddy.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import app.diddy.matrix.MatrixAccount

/** Shows the sheets the navigator holds, the top one last (iOS sheets). */
@Composable
fun SheetHost(account: MatrixAccount, navigator: Navigator) {
    for (sheet in navigator.sheets) {
        val close = { navigator.close(sheet) }
        FullSheet(sheet.javaClass.simpleName, close) { Text("…") }
    }
}
