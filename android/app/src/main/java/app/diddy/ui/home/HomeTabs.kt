package app.diddy.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.filled.AddComment
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.app.ChatSettings
import app.diddy.app.OwnStatusOptions
import app.diddy.app.SyncBannerKind
import app.diddy.app.SyncBannerLogic
import app.diddy.matrix.ChatListLogic
import app.diddy.matrix.Destination
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PublicRoomEntry
import app.diddy.matrix.RailEntry
import app.diddy.matrix.RoomNotifyLevel
import app.diddy.matrix.RoomSummary
import app.diddy.matrix.notifyLevel
import app.diddy.matrix.refreshRail
import app.diddy.matrix.markServerAsRead
import app.diddy.matrix.roomLink
import app.diddy.matrix.watchNotificationSettings
import app.diddy.matrix.refreshNotifyLevels
import app.diddy.matrix.serverInfo
import app.diddy.ui.AvatarView
import app.diddy.ui.Card
import app.diddy.ui.InputField
import app.diddy.ui.ListRow
import app.diddy.ui.MessageDialog
import app.diddy.ui.Navigator
import app.diddy.ui.PhoneTab
import app.diddy.ui.RoundIconButton
import app.diddy.ui.SectionHeader
import app.diddy.ui.Sheet
import app.diddy.ui.TabBadge
import app.diddy.ui.UnreadBadge
import app.diddy.ui.call.CallHomeCard
import app.diddy.ui.call.VoiceRoster
import app.diddy.ui.call.VoiceStatusBar
import app.diddy.ui.profile.DiddyBadgesRow
import app.diddy.ui.profile.DiddyNameText
import app.diddy.ui.profile.OwnStatusButton
import app.diddy.ui.profile.PresenceDot
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.SpaceRoom
import org.matrix.rustcomponents.sdk.SyncServiceState
import java.text.SimpleDateFormat
import java.util.Locale

/** The phone's home: one tab at a time above a tab bar (ios PhoneHome). */
@Composable
fun PhoneHome(account: MatrixAccount, navigator: Navigator) {
    Column(Modifier.fillMaxSize().background(Theme.sidebar)) {
        Box(Modifier.weight(1f).fillMaxWidth().statusBarsPadding()) {
            when (navigator.tab) {
                PhoneTab.CHATS -> ChannelList(account, navigator, server = null)
                PhoneTab.SERVERS -> ServersTab(account, navigator)
                PhoneTab.ACTIVITY -> ActivityTab(account, navigator)
                PhoneTab.YOU -> YouTab(account, navigator)
            }
        }
        PhoneTabBar(account, navigator)
    }
}

@Composable
private fun PhoneTabBar(account: MatrixAccount, navigator: Navigator) {
    val haptics = LocalHapticFeedback.current
    fun select(tab: PhoneTab) {
        if (navigator.tab == tab) return
        haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
        navigator.tab = tab
    }
    val chatsBadge = (account.directMessages + account.roomsOutsideServers).count { it.unread > 0 || it.badge > 0 } + account.invites.size
    val serversBadge = account.spaces.sumOf { account.mentionCount(it.roomId) }.toInt()
    val activityBadge = account.rooms.count { it.isJoined && !it.isSpace && it.mentions > 0 }
    Column(Modifier.fillMaxWidth().background(Theme.rail).navigationBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Theme.text.copy(alpha = 0.07f)))
        Row(Modifier.fillMaxWidth().padding(top = 4.dp, start = 8.dp, end = 8.dp)) {
            TabItem("Chats", if (navigator.tab == PhoneTab.CHATS) Icons.AutoMirrored.Filled.Chat else Icons.AutoMirrored.Outlined.Chat, navigator.tab == PhoneTab.CHATS, chatsBadge) { select(PhoneTab.CHATS) }
            TabItem("Servers", if (navigator.tab == PhoneTab.SERVERS) Icons.Filled.GridView else Icons.Outlined.GridView, navigator.tab == PhoneTab.SERVERS, serversBadge) { select(PhoneTab.SERVERS) }
            TabItem("Activity", if (navigator.tab == PhoneTab.ACTIVITY) Icons.Filled.Notifications else Icons.Outlined.Notifications, navigator.tab == PhoneTab.ACTIVITY, activityBadge) { select(PhoneTab.ACTIVITY) }
            val you = navigator.tab == PhoneTab.YOU
            Column(
                Modifier.weight(1f).height(52.dp).clickable { select(PhoneTab.YOU) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    Modifier.size(28.dp).border(1.5.dp, if (you) Theme.text else androidx.compose.ui.graphics.Color.Transparent, CircleShape),
                    contentAlignment = Alignment.Center,
                ) { AvatarView(account.avatarUrl, account.title, 24.dp, account) }
                Text("You", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = if (you) Theme.text else Theme.faint)
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabItem(title: String, icon: ImageVector, selected: Boolean, badge: Int, onClick: () -> Unit) {
    Column(
        Modifier.weight(1f).height(52.dp).clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box {
            Icon(icon, contentDescription = title, tint = if (selected) Theme.text else Theme.faint, modifier = Modifier.size(24.dp))
            if (badge > 0) TabBadge(badge, Modifier.align(Alignment.TopEnd).offset(x = 14.dp, y = (-6).dp))
        }
        Text(title, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = if (selected) Theme.text else Theme.faint)
    }
}

// MARK: - Chat and channel lists

/**
 * The chat list (`server == null`) or a server's channels (ios ChannelSidebar, phone variant): a
 * large title with round buttons, the search field, then the list.
 */
@Composable
fun ChannelList(account: MatrixAccount, navigator: Navigator, server: String?) {
    val scope = rememberCoroutineScope()
    var filter by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var leaveRequest by remember { mutableStateOf<String?>(null) }
    var composeMenu by remember { mutableStateOf(false) }
    var serverMenu by remember { mutableStateOf(false) }
    var leavingServer by remember { mutableStateOf<String?>(null) }
    var joiningAll by remember { mutableStateOf(false) }
    val query = filter.trim()
    fun matches(name: String) = query.isEmpty() || name.contains(query, ignoreCase = true)
    val serverName = server?.let { s -> account.spaces.firstOrNull { it.roomId == s }?.displayName ?: "Server" } ?: "Direct Messages"

    LaunchedEffect(Unit) { account.watchNotificationSettingsSafe() }
    LaunchedEffect(account.rooms.size) { account.refreshNotifyLevelsSafe() }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(start = 18.dp, end = 10.dp, top = if (server == null) 6.dp else 2.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (server != null) {
                Box(Modifier.weight(1f)) {
                    Row(Modifier.clickable { serverMenu = true }, verticalAlignment = Alignment.CenterVertically) {
                        Text(serverName, color = Theme.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        Icon(Icons.Filled.ExpandMore, null, tint = Theme.muted)
                    }
                    ServerMenu(serverMenu, { serverMenu = false }, account, navigator, server, onJoinAll = if (account.unjoinedChannels(server).isEmpty()) null else {
                        {
                            joiningAll = true
                            scope.launch {
                                val failed = account.joinAllChannels(server)
                                joiningAll = false
                                if (failed > 0) error = "$failed channel(s) could not be joined. They may need an invite."
                            }
                        }
                    }, onLeave = { leavingServer = server })
                }
                RoundIconButton(Icons.Filled.Search, "Search") { navigator.show(Sheet.QuickSwitch) }
                RoundIconButton(Icons.Filled.Group, "Members") { navigator.show(Sheet.Members(server, serverName)) }
            } else {
                Text("Chats", color = Theme.text, fontSize = 32.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Box {
                    RoundIconButton(Icons.Filled.Edit, "New Message or Room") { composeMenu = true }
                    DropdownMenu(composeMenu, { composeMenu = false }) {
                        DropdownMenuItem(text = { Text("New Message") }, leadingIcon = { Icon(Icons.Filled.Edit, null) }, onClick = { composeMenu = false; navigator.show(Sheet.NewMessage) })
                        DropdownMenuItem(text = { Text("Create Room") }, leadingIcon = { Icon(Icons.Filled.AddComment, null) }, onClick = { composeMenu = false; navigator.show(Sheet.CreateRoom) })
                        DropdownMenuItem(text = { Text("Explore") }, leadingIcon = { Icon(Icons.Filled.Explore, null) }, onClick = { composeMenu = false; navigator.show(Sheet.Explore) })
                    }
                }
            }
        }
        SyncBanner(account)
        if (account.needsRecovery) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 2.dp).clip(RoundedCornerShape(8.dp))
                    .background(Theme.accent.copy(alpha = 0.25f)).clickable { navigator.show(Sheet.Recovery) }.padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Lock, null, tint = Theme.text, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Verify this device to read encrypted messages", color = Theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(6.dp))
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 8.dp).clip(RoundedCornerShape(11.dp))
                .background(Theme.elevated).padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, null, tint = Theme.faint, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Box(Modifier.weight(1f)) { InputField(filter, { filter = it }, "Search") }
            if (filter.isNotEmpty()) Icon(Icons.Filled.Cancel, "Clear", tint = Theme.faint, modifier = Modifier.size(18.dp).clickable { filter = "" })
        }
        if (server == null) CallHomeCard(account, navigator)

        val content: @Composable () -> Unit = {
            LazyColumn(Modifier.fillMaxSize()) {
                if (server == null) {
                    val invites = account.invites.filter { matches(it.name) }
                    if (invites.isNotEmpty()) {
                        item { SectionHeader("Invites") }
                        items(invites, key = { "invite" + it.id }) { InviteRow(account, it, navigator) { e -> error = e } }
                    }
                    val all = (account.directMessages + account.roomsOutsideServers).filter { matches(it.name) }
                    val pinned = ChatListLogic.sortedByActivity(all.filter { it.isFavourite }) { it.lastActivity }
                    val rest = ChatListLogic.sortedByActivity(all.filter { !it.isFavourite }) { it.lastActivity }
                    items(pinned + rest, key = { it.id }) { room ->
                        RoomRowWithMenu(account, navigator, room.id, { error = it }, { leaveRequest = it }) { open ->
                            ChatListRow(account, room, selected = navigator.destination?.roomId == room.id, onClick = { navigator.destination = account.destination(room.id) }, onLongClick = open)
                        }
                    }
                    if (all.isEmpty()) item {
                        if (query.isEmpty()) {
                            Column(Modifier.padding(18.dp)) {
                                Text("No chats yet.", color = Theme.muted, fontSize = 15.sp)
                                TextButton(onClick = { navigator.show(Sheet.NewMessage) }) { Text("New Message", fontWeight = FontWeight.SemiBold) }
                            }
                        } else NoResults(query)
                    }
                } else {
                    serverChannels(account, navigator, server, query, ::matches, joiningAll, onJoinAll = {
                        joiningAll = true
                        scope.launch {
                            val failed = account.joinAllChannels(server)
                            joiningAll = false
                            if (failed > 0) error = "$failed channel(s) could not be joined. They may need an invite."
                        }
                    }, onError = { error = it }, onLeave = { leaveRequest = it })
                }
            }
        }
        if (server != null) {
            var refreshing by remember { mutableStateOf(false) }
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = {
                refreshing = true
                scope.launch { account.loadChannels(server); refreshing = false }
            }, modifier = Modifier.weight(1f)) { content() }
            VoiceStatusBar(account, navigator)
        } else {
            Box(Modifier.weight(1f)) { content() }
        }
    }
    MessageDialog("Could not join", error) { error = null }
    leaveRequest?.let { id -> LeaveRoomDialog(account, navigator, id, { error = it }) { leaveRequest = null } }
    leavingServer?.let { id -> LeaveServerDialog(account, navigator, id, { error = it }) { leavingServer = null } }
}

private fun androidx.compose.foundation.lazy.LazyListScope.serverChannels(
    account: MatrixAccount,
    navigator: Navigator,
    server: String,
    query: String,
    matches: (String) -> Boolean,
    joiningAll: Boolean,
    onJoinAll: () -> Unit,
    onError: (String) -> Unit,
    onLeave: (String) -> Unit,
) {
    val categories = account.categories[server] ?: emptyList()
    val unjoined = account.unjoinedChannels(server)
    if (categories.isEmpty()) {
        item {
            if (server in account.loadedServers) {
                Column(Modifier.padding(18.dp)) {
                    Text("This server has no channels yet.", color = Theme.muted, fontSize = 15.sp)
                    TextButton(onClick = { navigator.show(Sheet.CreateChannel(server)) }) { Text("Create a channel", fontWeight = FontWeight.SemiBold) }
                }
            } else {
                Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
            }
        }
    }
    // Matrix only shows who is in voice for channels you have joined, unlike Discord.
    if (unjoined.size > 1 && query.isEmpty()) {
        item {
            Column(Modifier.fillMaxWidth().clickable(enabled = !joiningAll, onClick = onJoinAll).padding(horizontal = 18.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (joiningAll) {
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("Join all ${unjoined.size} channels", color = Theme.accent, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
                Text("See messages and who is in voice everywhere.", color = Theme.muted, fontSize = 12.sp)
            }
        }
    }
    if (query.isNotEmpty() && categories.isNotEmpty() && categories.none { c -> c.channels.any { matches(it.displayName) } }) {
        item { NoResults(query) }
    }
    for (category in categories) {
        val channels = category.channels.filter { matches(it.displayName) }
        if (channels.isEmpty()) continue
        item(key = "cat" + category.id) { SectionHeader(category.name) }
        items(channels, key = { category.id + it.roomId }) { channel ->
            if (account.isJoined(channel)) {
                RoomRowWithMenu(account, navigator, channel.roomId, onError, onLeave) { open ->
                    ChannelRow(account, channel, selected = navigator.destination?.roomId == channel.roomId,
                        onClick = { navigator.destination = account.destination(channel.roomId) }, onLongClick = open)
                }
            } else {
                Box(Modifier.alpha(0.55f)) {
                    ChannelRow(account, channel, selected = false, onClick = {
                        navigator.show(Sheet.Preview(PublicRoomEntry(channel.roomId, channel.displayName, channel.topic, channel.canonicalAlias, channel.avatarUrl, channel.numJoinedMembers.toInt(), null, null), channel.via))
                    }, onLongClick = {})
                }
            }
        }
    }
}

@Composable
private fun NoResults(query: String) {
    Text("No results for “$query”", color = Theme.muted, fontSize = 15.sp, modifier = Modifier.padding(18.dp))
}

/** A room row with its long-press menu. */
@Composable
private fun RoomRowWithMenu(
    account: MatrixAccount,
    navigator: Navigator,
    roomId: String,
    onError: (String) -> Unit,
    onLeave: (String) -> Unit,
    row: @Composable (open: () -> Unit) -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    Box {
        row { menu = true }
        RoomContextMenu(
            expanded = menu, onDismiss = { menu = false }, account = account, roomId = roomId,
            onInvite = { navigator.show(Sheet.Invite(it)) },
            onSettings = { navigator.show(Sheet.RoomSettings(it)) },
            onLeave = onLeave, onError = onError,
        )
    }
}

@Composable
private fun LeaveRoomDialog(account: MatrixAccount, navigator: Navigator, roomId: String, onError: (String) -> Unit, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val summary = account.summary(roomId)
    val isDirect = summary?.isDirect == true
    val inServer = account.server(roomId) != null
    val name = summary?.name ?: "this room"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isDirect) "Close $name?" else "Leave $name?") },
        text = {
            Text(if (isDirect) "The conversation disappears from your list." else "Are you sure you want to leave this ${RoomMenuWording.noun(false, inServer).lowercase()}?")
        },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                scope.launch {
                    try {
                        account.leave(roomId)
                        if (navigator.destination?.roomId == roomId) navigator.destination = null
                    } catch (e: Exception) {
                        onError(e.friendlyMessage)
                    }
                }
            }) { Text(RoomMenuWording.leaveTitle(isDirect, inServer), color = Theme.danger) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun LeaveServerDialog(account: MatrixAccount, navigator: Navigator, serverId: String, onError: (String) -> Unit, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val name = account.serverInfo(serverId).first
    var withChannels by remember { mutableStateOf(true) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Leave $name?") },
        text = {
            Column {
                Text("You can join again later with an invite or the server's address.")
                Row(Modifier.padding(top = 12.dp).clickable { withChannels = !withChannels }, verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(checked = withChannels, onCheckedChange = { withChannels = it })
                    Text("Also leave its channels")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                scope.launch {
                    try {
                        account.leaveServer(serverId, withChannels)
                        if (navigator.server == serverId) navigator.selectServer(null)
                    } catch (e: Exception) {
                        onError(e.friendlyMessage)
                    }
                }
            }) { Text("Leave Server", color = Theme.danger) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** "Connecting...", "Reconnecting" or "Homeserver unreachable", the desktop's texts. */
@Composable
private fun SyncBanner(account: MatrixAccount) {
    val state = when (account.syncState) {
        SyncServiceState.IDLE -> "idle"
        SyncServiceState.RUNNING -> "running"
        SyncServiceState.TERMINATED -> "terminated"
        SyncServiceState.ERROR -> "error"
        SyncServiceState.OFFLINE -> "offline"
    }
    val kind = SyncBannerLogic.banner(state, account.started, account.syncEverRan) ?: return
    val color = if (kind == SyncBannerKind.ERROR) Theme.danger else Theme.warning
    Text(
        kind.text,
        color = androidx.compose.ui.graphics.Color.Black,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.fillMaxWidth().background(color).padding(vertical = 4.dp, horizontal = 12.dp),
    )
}

/** One conversation in the phone's chat list (ios ChatListRow). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChatListRow(
    account: MatrixAccount,
    room: RoomSummary,
    selected: Boolean = false,
    context: String? = null,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val unread = room.unread > 0 || room.badge > 0
    val muted = account.notifyLevel(room.id) == RoomNotifyLevel.MUTE
    Row(
        Modifier.fillMaxWidth()
            .background(if (selected) Theme.elevated else androidx.compose.ui.graphics.Color.Transparent)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 8.dp)
            .alpha(if (muted) 0.55f else 1f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            AvatarView(room.avatarUrl, room.name, 48.dp, account)
            PresenceDot(room.dmUserId, account, 12.dp, Theme.sidebar, Modifier.align(Alignment.BottomEnd).offset(2.dp, 2.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    val dm = room.dmUserId
                    val weight = if (unread) FontWeight.Bold else FontWeight.Medium
                    if (dm != null && account.diddyProfiles[dm] != null) {
                        DiddyNameText(room.name, account.diddyProfiles[dm], 17.sp, weight, Theme.text, Modifier.weight(1f, fill = false))
                        account.diddyBadges[dm]?.let { DiddyBadgesRow(it, 13.dp, account) }
                    } else {
                        Text(room.name, color = Theme.text, fontSize = 17.sp, fontWeight = weight, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                room.lastActivity?.let {
                    Text(timeLabel(it), color = if (unread) Theme.text else Theme.faint, fontSize = 12.sp, modifier = Modifier.padding(start = 4.dp))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                val text = room.lastMessage ?: if (room.hasCall) "Call in progress" else ""
                val preview = if (context == null) text else if (text.isEmpty()) context else "$context · $text"
                Text(
                    app.diddy.matrix.MentionText.readable(preview) { account.name(it) },
                    color = if (unread) Theme.text else Theme.muted, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (room.hasCall) Icon(Icons.Filled.VolumeUp, "Call in progress", tint = Theme.online, modifier = Modifier.padding(start = 4.dp).size(14.dp))
                if (muted) Icon(Icons.Filled.NotificationsOff, "Muted", tint = Theme.faint, modifier = Modifier.padding(start = 4.dp).size(12.dp))
                if (room.mentions > 0) {
                    Spacer(Modifier.width(4.dp))
                    TabBadge(room.mentions.toInt())
                } else if (unread && !muted) {
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(9.dp).clip(CircleShape).background(Theme.text))
                }
            }
        }
    }
}

fun timeLabel(date: java.util.Date): String = ChatListLogic.timeLabel(
    date,
    clock = { ChatSettings.time(it) },
    weekday = { SimpleDateFormat("EEE", Locale.getDefault()).format(it) },
    short = { ChatSettings.date(it) },
)

/** A channel of a server, with who is in voice below it (ios ChannelRow). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChannelRow(account: MatrixAccount, channel: SpaceRoom, selected: Boolean, isJoining: Boolean = false, onClick: () -> Unit, onLongClick: () -> Unit) {
    val summary = account.summary(channel.roomId)
    val unread = (summary?.unread ?: 0) > 0
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp).clip(RoundedCornerShape(6.dp))
            .background(if (selected) Theme.elevated else androidx.compose.ui.graphics.Color.Transparent)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.height(28.dp)) {
            Icon(
                if (account.isVoiceChannel(channel.roomId)) Icons.Filled.VolumeUp else Icons.Filled.Tag,
                null,
                tint = if (summary?.hasCall == true) Theme.online else Theme.faint,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                channel.displayName, color = if (unread) Theme.text else Theme.muted, fontSize = 16.sp,
                fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (account.notifyLevel(channel.roomId) == RoomNotifyLevel.MUTE) Icon(Icons.Filled.NotificationsOff, "Muted", tint = Theme.faint, modifier = Modifier.size(12.dp))
            when {
                isJoining -> CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                !account.isJoined(channel) -> Text("Join", color = Theme.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                (summary?.mentions ?: 0) > 0 -> UnreadBadge(summary!!.mentions)
            }
        }
        VoiceRoster(account, channel.roomId, summary?.callParticipants ?: emptyList())
    }
}

/** An invite waiting for an answer (ios InviteRow). */
@Composable
fun InviteRow(account: MatrixAccount, invite: RoomSummary, navigator: Navigator, onError: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    fun respond(accept: Boolean) {
        busy = true
        scope.launch {
            try {
                if (accept) {
                    account.acceptInvite(invite.id)
                    if (invite.isSpace) {
                        navigator.selectServer(invite.id)
                        navigator.tab = PhoneTab.SERVERS
                    } else navigator.open(invite.id, account)
                } else account.declineInvite(invite.id)
            } catch (e: Exception) {
                onError(e.friendlyMessage)
            }
            busy = false
        }
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarView(invite.avatarUrl, invite.name, 36.dp, account, cornerRadius = if (invite.isSpace) 10.dp else null)
            Spacer(Modifier.width(10.dp))
            Column {
                Text(invite.name, color = Theme.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                val what = if (invite.isSpace) "Server invite" else "Room invite"
                Text(
                    if (invite.isDirect) "Wants to message you" else invite.inviterName?.let { "$what from $it" } ?: what,
                    color = Theme.muted, fontSize = 12.sp, maxLines = 1,
                )
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.Button(
                onClick = { respond(true) }, enabled = !busy,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Theme.online, contentColor = androidx.compose.ui.graphics.Color.White),
            ) { Text("Accept", fontWeight = FontWeight.SemiBold) }
            androidx.compose.material3.OutlinedButton(onClick = { respond(false) }, enabled = !busy) { Text("Decline", color = Theme.text) }
        }
    }
}

// MARK: - Servers tab

/** The server shown in the Servers tab: the one picked last, else the first in the rail. */
private fun shownServer(account: MatrixAccount, navigator: Navigator): String? {
    navigator.server?.let { server -> if (account.spaces.any { it.roomId == server }) return server }
    for (entry in account.railEntries) {
        when (entry) {
            is RailEntry.Space -> return entry.spaceId
            is RailEntry.Folder -> entry.folder.content.firstOrNull()?.let { return it }
        }
    }
    return account.spaces.firstOrNull()?.roomId
}

@Composable
private fun ServersTab(account: MatrixAccount, navigator: Navigator) {
    val shown = shownServer(account, navigator)
    Column(Modifier.fillMaxSize()) {
        ServerRailRow(account, navigator, shown)
        if (shown != null) {
            ChannelList(account, navigator, shown)
        } else {
            Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Icon(Icons.Outlined.GridView, null, tint = Theme.faint, modifier = Modifier.size(40.dp))
                Spacer(Modifier.height(10.dp))
                Text("No servers yet", color = Theme.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                Text("Join or create one with + above, or find one with Explore.", color = Theme.muted, fontSize = 15.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
    }
}

/** The server rail as a row across the top (ios ServerRail, horizontal). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ServerRailRow(account: MatrixAccount, navigator: Navigator, selected: String?) {
    var expanded by remember { mutableStateOf(setOf<String>()) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var leaving by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(account.spaces.map { it.roomId }, account.rooms.size) { account.refreshRail() }
    val entries = account.railEntries.ifEmpty { account.spaces.map { RailEntry.Space(it.roomId) } }
    Row(
        Modifier.fillMaxWidth().height(72.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        @Composable
        fun space(id: String) {
            val info = account.serverInfo(id)
            val isSelected = selected == id
            val badge = account.mentionCount(id)
            val unread = account.unreadCount(id) > 0
            Box(Modifier.padding(4.dp)) {
                Box(
                    Modifier.size(48.dp).let { if (isSelected) it.border(2.dp, Theme.text, RoundedCornerShape(19.dp)).padding(0.dp) else it }
                        .combinedClickable(onClick = { navigator.selectServer(id) }, onLongClick = { menuFor = id }),
                    contentAlignment = Alignment.Center,
                ) {
                    AvatarView(info.second, info.first, if (isSelected) 40.dp else 48.dp, account, cornerRadius = if (isSelected) 14.dp else 24.dp)
                }
                if (badge > 0) Box(Modifier.align(Alignment.BottomEnd).offset(4.dp, 4.dp)) { UnreadBadge(badge) }
                else if (unread && !isSelected) Box(
                    Modifier.align(Alignment.TopEnd).offset(3.dp, (-3).dp).size(10.dp).clip(CircleShape).background(Theme.text)
                        .border(2.5.dp, Theme.sidebar, CircleShape),
                )
                ServerMenu(menuFor == id, { menuFor = null }, account, navigator, id, onJoinAll = null, onArrange = { navigator.show(Sheet.ArrangeServers) }, onLeave = { leaving = id })
            }
        }
        for (entry in entries) {
            when (entry) {
                is RailEntry.Space -> space(entry.spaceId)
                is RailEntry.Folder -> {
                    val open = entry.folder.id in expanded
                    Box(
                        Modifier.size(48.dp).clip(RoundedCornerShape(if (open) 16.dp else 24.dp)).background(Theme.elevated)
                            .combinedClickable(onClick = { expanded = if (open) expanded - entry.folder.id else expanded + entry.folder.id }, onLongClick = { navigator.show(Sheet.ArrangeServers) }),
                        contentAlignment = Alignment.Center,
                    ) {
                        val shown = entry.folder.content.take(4)
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            for (rowIndex in 0..1) Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                for (col in 0..1) {
                                    val id = shown.getOrNull(rowIndex * 2 + col)
                                    if (id != null) {
                                        val info = account.serverInfo(id)
                                        AvatarView(info.second, info.first, 20.dp, account, cornerRadius = 6.dp)
                                    } else Spacer(Modifier.size(20.dp))
                                }
                            }
                        }
                    }
                    if (open) entry.folder.content.forEach { space(it) }
                }
            }
        }
        RailRoundButton(Icons.Filled.Add, "Add a Server") { navigator.show(Sheet.AddServer) }
        RailRoundButton(Icons.Filled.Explore, "Explore") { navigator.show(Sheet.Explore) }
    }
    leaving?.let { LeaveServerDialog(account, navigator, it, { e -> error = e }) { leaving = null } }
    MessageDialog("Server", error) { error = null }
}

@Composable
private fun RailRoundButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Box(Modifier.size(48.dp).clip(CircleShape).background(Theme.elevated).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, label, tint = Theme.online)
    }
}

/** The menu of a server (ios ServerMenuItems), from the rail (long press) and the server's name. */
@Composable
fun ServerMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    account: MatrixAccount,
    navigator: Navigator,
    serverId: String,
    onJoinAll: (() -> Unit)?,
    onArrange: (() -> Unit)? = null,
    onLeave: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    DropdownMenu(expanded, onDismiss) {
        DropdownMenuItem(
            text = { Text("Mark as Read") },
            enabled = account.unreadCount(serverId) > 0 || account.mentionCount(serverId) > 0,
            onClick = { onDismiss(); scope.launch { account.markServerAsRead(serverId) } },
        )
        DropdownMenuItem(text = { Text("Invite People") }, onClick = { onDismiss(); navigator.show(Sheet.Invite(serverId)) })
        DropdownMenuItem(text = { Text("Copy Link") }, onClick = {
            onDismiss()
            scope.launch { account.roomLink(serverId)?.let { copyToClipboard(context, it) } }
        })
        androidx.compose.material3.HorizontalDivider()
        DropdownMenuItem(text = { Text("Create Channel") }, onClick = { onDismiss(); navigator.show(Sheet.CreateChannel(serverId)) })
        if (onJoinAll != null) DropdownMenuItem(text = { Text("Join All Channels") }, onClick = { onDismiss(); onJoinAll() })
        DropdownMenuItem(text = { Text("Manage Channels") }, onClick = { onDismiss(); navigator.show(Sheet.ManageServer(serverId)) })
        DropdownMenuItem(text = { Text("Server Settings") }, onClick = { onDismiss(); navigator.show(Sheet.RoomSettings(serverId)) })
        if (onArrange != null) {
            androidx.compose.material3.HorizontalDivider()
            DropdownMenuItem(text = { Text("Arrange Servers") }, onClick = { onDismiss(); onArrange() })
        }
        androidx.compose.material3.HorizontalDivider()
        DropdownMenuItem(text = { Text("Leave Server", color = Theme.danger) }, onClick = { onDismiss(); onLeave() })
    }
}

// MARK: - Activity

@Composable
private fun ActivityTab(account: MatrixAccount, navigator: Navigator) {
    val rooms = ChatListLogic.sortedByActivity(account.rooms.filter { it.isJoined && !it.isSpace && (it.mentions > 0 || it.notifications > 0) }) { it.lastActivity }
    Column(Modifier.fillMaxSize()) {
        Text("Activity", color = Theme.text, fontSize = 32.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, top = 6.dp, bottom = 8.dp))
        if (rooms.isEmpty() && account.invites.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Icon(Icons.Outlined.Notifications, null, tint = Theme.faint, modifier = Modifier.size(40.dp))
                Spacer(Modifier.height(10.dp))
                Text("You're all caught up", color = Theme.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                Text("Mentions and new messages that notify you show up here.", color = Theme.muted, fontSize = 15.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        } else {
            var error by remember { mutableStateOf<String?>(null) }
            LazyColumn(Modifier.fillMaxSize()) {
                if (account.invites.isNotEmpty()) {
                    item { SectionHeader("Invites") }
                    items(account.invites, key = { "i" + it.id }) { InviteRow(account, it, navigator) { e -> error = e } }
                }
                items(rooms, key = { it.id }) { room ->
                    ChatListRow(account, room, context = account.server(room.id)?.let { account.serverInfo(it).first },
                        onClick = { navigator.open(room.id, account) }, onLongClick = {})
                }
            }
            MessageDialog("Could not join", error) { error = null }
        }
    }
}

// MARK: - You

@Composable
private fun YouTab(account: MatrixAccount, navigator: Navigator) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Column(Modifier.padding(top = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OwnStatusButton(account, navigator, 84.dp)
            DiddyNameText(account.title, account.diddyProfiles[account.userId], 22.sp, FontWeight.Bold, Theme.text)
            Text(account.userId, color = Theme.muted, fontSize = 15.sp, maxLines = 1)
            Text(OwnStatusOptions.info(account.diddyProfiles[account.userId]?.status).shownLabel, color = Theme.faint, fontSize = 13.sp)
            Text("Tap your picture to change your status or edit your profile.", color = Theme.faint, fontSize = 12.sp)
        }
        VoiceStatusBar(account, navigator, rounded = true)
        Card {
            ListRow(Icons.Filled.Settings, "Settings", trailing = { Icon(Icons.Filled.ChevronRight, null, tint = Theme.faint) }) { navigator.show(Sheet.Settings) }
        }
        app.diddy.ui.plugins.PluginDockSection(account, navigator)
    }
}

private suspend fun MatrixAccount.watchNotificationSettingsSafe() = try { watchNotificationSettings() } catch (_: Exception) {}
private suspend fun MatrixAccount.refreshNotifyLevelsSafe() = try { refreshNotifyLevels() } catch (_: Exception) {}
