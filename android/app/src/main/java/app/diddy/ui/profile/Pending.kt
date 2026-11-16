package app.diddy.ui.profile

import androidx.compose.runtime.Composable
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.FullSheet

@Composable fun ProfileEditorSheet(account: MatrixAccount, onClose: () -> Unit) = FullSheet("Profile", onClose) {}
