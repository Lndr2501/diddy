package app.diddy.ui.home

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.RoomNotifyLevel
import app.diddy.matrix.markRoomAsRead
import app.diddy.matrix.notifyLevel
import app.diddy.matrix.roomLink
import app.diddy.matrix.setFavourite
import app.diddy.matrix.setNotifyLevel
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch

/** Words for a room in menus and dialogs: a channel inside a server, a room outside, or a DM. */
object RoomMenuWording {
    fun noun(isDirect: Boolean, inServer: Boolean): String = if (isDirect) "Conversation" else if (inServer) "Channel" else "Room"
    fun leaveTitle(isDirect: Boolean, inServer: Boolean): String =
        if (isDirect) "Close Conversation" else "Leave ${noun(false, inServer)}"
}

val RoomNotifyLevel.icon: ImageVector
    get() = when (this) {
        RoomNotifyLevel.DEFAULT -> Icons.Outlined.NotificationsNone
        RoomNotifyLevel.ALL_MESSAGES -> Icons.Filled.NotificationsActive
        RoomNotifyLevel.MENTIONS_AND_KEYWORDS -> Icons.Filled.AlternateEmail
        RoomNotifyLevel.MUTE -> Icons.Filled.NotificationsOff
    }

fun copyToClipboard(context: Context, text: String, label: String = "Diddy") {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
}

/** Long press on a room in the list, like desktop's room menu (ios RoomContextMenu). */
@Composable
fun RoomContextMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    account: MatrixAccount,
    roomId: String,
    onInvite: (String) -> Unit,
    onSettings: (String) -> Unit,
    onLeave: (String) -> Unit,
    onError: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var notifyOpen by remember { mutableStateOf(false) }
    val summary = account.summary(roomId)
    val favourite = summary?.isFavourite ?: false
    val isDirect = summary?.isDirect == true
    val inServer = account.server(roomId) != null
    DropdownMenu(expanded = expanded && !notifyOpen, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text("Mark as Read") },
            leadingIcon = { Icon(Icons.Filled.CheckCircle, null) },
            enabled = (summary?.unread ?: 0) > 0 || (summary?.mentions ?: 0) > 0,
            onClick = { onDismiss(); scope.launch { account.markRoomAsRead(roomId) } },
        )
        DropdownMenuItem(
            text = { Text(if (favourite) "Remove from Favourites" else "Add to Favourites") },
            leadingIcon = { Icon(if (favourite) Icons.Outlined.StarOutline else Icons.Filled.Star, null) },
            onClick = {
                onDismiss()
                scope.launch { try { account.setFavourite(roomId, !favourite) } catch (e: Exception) { onError(e.friendlyMessage) } }
            },
        )
        DropdownMenuItem(
            text = { Text("Notifications") },
            leadingIcon = { Icon(account.notifyLevel(roomId).icon, null) },
            onClick = { notifyOpen = true },
        )
        HorizontalDivider()
        if (!isDirect) {
            DropdownMenuItem(text = { Text("Invite People") }, leadingIcon = { Icon(Icons.Filled.PersonAdd, null) }, onClick = { onDismiss(); onInvite(roomId) })
        }
        DropdownMenuItem(
            text = { Text("Copy Link") },
            leadingIcon = { Icon(Icons.Filled.Link, null) },
            onClick = { onDismiss(); scope.launch { account.roomLink(roomId)?.let { copyToClipboard(context, it) } } },
        )
        DropdownMenuItem(
            text = { Text("${RoomMenuWording.noun(isDirect, inServer)} Settings") },
            leadingIcon = { Icon(Icons.Filled.Settings, null) },
            onClick = { onDismiss(); onSettings(roomId) },
        )
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text(RoomMenuWording.leaveTitle(isDirect, inServer), color = Theme.danger) },
            leadingIcon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, null, tint = Theme.danger) },
            onClick = { onDismiss(); onLeave(roomId) },
        )
    }
    NotifyLevelMenu(expanded && notifyOpen, { notifyOpen = false; onDismiss() }, account, roomId, onError)
}

/** The notification level of a room as a choice list (desktop's RoomNotificationModeSwitcher). */
@Composable
fun NotifyLevelMenu(expanded: Boolean, onDismiss: () -> Unit, account: MatrixAccount, roomId: String, onError: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val current = account.notifyLevel(roomId)
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        RoomNotifyLevel.entries.forEach { level ->
            DropdownMenuItem(
                text = { Text(level.title) },
                leadingIcon = { Icon(level.icon, null) },
                trailingIcon = { if (level == current) Icon(Icons.Filled.CheckCircle, null, tint = Theme.accent) },
                onClick = {
                    onDismiss()
                    scope.launch { try { account.setNotifyLevel(level, roomId) } catch (e: Exception) { onError(e.friendlyMessage) } }
                },
            )
        }
    }
}
