package app.diddy.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.chat.MessageSearchSheet
import app.diddy.ui.profile.ProfileEditorSheet
import app.diddy.ui.settings.RecoverySheet
import app.diddy.ui.settings.SettingsSheet
import app.diddy.ui.sheets.AddServerSheet
import app.diddy.ui.sheets.ArrangeServersSheet
import app.diddy.ui.sheets.ChannelInfoSheet
import app.diddy.ui.sheets.CreateRoomSheet
import app.diddy.ui.sheets.ExploreSheet
import app.diddy.ui.sheets.InviteSheet
import app.diddy.ui.sheets.JoinLinkSheet
import app.diddy.ui.sheets.ManageServerSheet
import app.diddy.ui.sheets.MediaOverviewSheet
import app.diddy.ui.sheets.MembersSheet
import app.diddy.ui.sheets.NewMessageSheet
import app.diddy.ui.sheets.PublicRoomPreviewSheet
import app.diddy.ui.sheets.QuickSwitchSheet
import app.diddy.ui.sheets.RoomSettingsSheet
import app.diddy.ui.sheets.UserProfileSheet
import app.diddy.ui.sheets.VerificationHost

/** Shows the sheets the navigator holds, the top one last (iOS sheets). */
@Composable
fun SheetHost(account: MatrixAccount, navigator: Navigator) {
    navigator.sheets.forEachIndexed { index, sheet ->
        key(index, sheet) {
            val close = { navigator.close(sheet) }
            when (sheet) {
                Sheet.Settings -> SettingsSheet(account, navigator, close)
                Sheet.NewMessage -> NewMessageSheet(account, navigator, close)
                Sheet.CreateRoom -> CreateRoomSheet(account, null, isSpace = false, navigator, close)
                Sheet.CreateServer -> CreateRoomSheet(account, null, isSpace = true, navigator, close)
                is Sheet.CreateChannel -> CreateRoomSheet(account, sheet.parentId, isSpace = false, navigator, close)
                Sheet.Explore -> ExploreSheet(account, navigator, close)
                Sheet.AddServer -> AddServerSheet(account, navigator, close)
                Sheet.ArrangeServers -> ArrangeServersSheet(account, navigator, close)
                Sheet.QuickSwitch -> QuickSwitchSheet(account, navigator, close)
                Sheet.MessageSearch -> MessageSearchSheet(account, null, close) { roomId, eventId ->
                    navigator.closeAll()
                    navigator.open(roomId, account)
                    navigator.searchTarget = SearchEventTarget(roomId, eventId)
                }
                Sheet.Recovery -> RecoverySheet(account, close)
                is Sheet.Members -> MembersSheet(account, sheet.roomId, sheet.title, navigator, close)
                is Sheet.Invite -> InviteSheet(account, sheet.roomId, close)
                is Sheet.RoomSettings -> RoomSettingsSheet(account, sheet.roomId, navigator, close)
                is Sheet.ManageServer -> ManageServerSheet(account, sheet.serverId, navigator, close)
                is Sheet.Profile -> UserProfileSheet(account, sheet.userId, sheet.roomId, navigator, close)
                is Sheet.Preview -> PublicRoomPreviewSheet(account, sheet.entry, sheet.via, navigator, close)
                is Sheet.JoinLink -> JoinLinkSheet(account, sheet.address, sheet.via, sheet.eventId, navigator, close)
                is Sheet.ChannelInfo -> ChannelInfoSheet(account, sheet.roomId, navigator, close)
                is Sheet.ProfileEditor -> ProfileEditorSheet(account, close)
                is Sheet.Media -> MediaOverviewSheet(account, sheet.roomId, close)
            }
        }
    }
    VerificationHost(account)
}
