package app.diddy.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.Prefs
import app.diddy.matrix.Destination
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PublicRoomEntry

/** The tabs at the bottom of the phone. */
enum class PhoneTab { CHATS, SERVERS, ACTIVITY, YOU }

/** Screens that open over everything (sheets on iOS). */
sealed class Sheet {
    data object Settings : Sheet()
    data object NewMessage : Sheet()
    data object CreateRoom : Sheet()
    data object CreateServer : Sheet()
    data object MessageSearch : Sheet()
    data class Media(val roomId: String) : Sheet()
    data object Explore : Sheet()
    data object AddServer : Sheet()
    data object ArrangeServers : Sheet()
    data object QuickSwitch : Sheet()
    data object Recovery : Sheet()
    data class CreateChannel(val parentId: String) : Sheet()
    data class Members(val roomId: String, val title: String? = null) : Sheet()
    data class Invite(val roomId: String) : Sheet()
    data class RoomSettings(val roomId: String) : Sheet()
    data class ManageServer(val serverId: String) : Sheet()
    data class Profile(val userId: String, val roomId: String?) : Sheet()
    data class Preview(val entry: PublicRoomEntry, val via: List<String>) : Sheet()
    data class JoinLink(val address: String, val via: List<String>, val eventId: String? = null) : Sheet()
    data class ChannelInfo(val roomId: String) : Sheet()
    data class ProfileEditor(val userId: String) : Sheet()
}

/** A message the search found, to scroll to in its chat. */
data class SearchEventTarget(val roomId: String, val eventId: String) {
    val id: String get() = "$roomId|$eventId"
}

/** Where the app is showing; anything can send you to a room (ios AppNavigator). */
class Navigator {
    var server by mutableStateOf(Prefs.string("diddy.lastServer"))
        private set
    var destination by mutableStateOf<Destination?>(null)
    var tab by mutableStateOf(PhoneTab.CHATS)
    var sheets by mutableStateOf<List<Sheet>>(emptyList())
        private set
    var searchTarget by mutableStateOf<SearchEventTarget?>(null)
    var showCallScreen by mutableStateOf(false)

    fun selectServer(id: String?) {
        server = id
        Prefs.setString("diddy.lastServer", id)
    }

    fun open(roomId: String, account: MatrixAccount) {
        selectServer(account.server(roomId) ?: server)
        tab = if (account.server(roomId) == null) PhoneTab.CHATS else PhoneTab.SERVERS
        destination = account.destination(roomId)
    }

    fun show(sheet: Sheet) {
        sheets = sheets + sheet
    }

    fun close(sheet: Sheet) {
        val index = sheets.lastIndexOf(sheet)
        if (index >= 0) sheets = sheets.toMutableList().also { it.removeAt(index) }
    }

    fun closeTop() {
        if (sheets.isNotEmpty()) sheets = sheets.dropLast(1)
    }

    fun closeAll() {
        sheets = emptyList()
    }
}
