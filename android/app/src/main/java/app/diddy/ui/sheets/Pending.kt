package app.diddy.ui.sheets

import androidx.compose.runtime.Composable
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.FullSheet
import app.diddy.ui.Navigator

@Composable fun ArrangeServersSheet(account: MatrixAccount, navigator: Navigator, onClose: () -> Unit) = FullSheet("Arrange", onClose) {}
@Composable fun ManageServerSheet(account: MatrixAccount, serverId: String, navigator: Navigator, onClose: () -> Unit) = FullSheet("Manage", onClose) {}
@Composable fun RoomSettingsSheet(account: MatrixAccount, roomId: String, navigator: Navigator, onClose: () -> Unit) = FullSheet("Settings", onClose) {}
