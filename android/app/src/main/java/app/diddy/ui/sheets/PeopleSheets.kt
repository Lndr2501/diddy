package app.diddy.ui.sheets

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MemberEntry
import app.diddy.matrix.MemberGroup
import app.diddy.matrix.MemberStore
import app.diddy.matrix.PowerLevels
import app.diddy.matrix.VerificationCenter
import app.diddy.matrix.loadDiddyProfiles
import app.diddy.matrix.powerLevels
import app.diddy.matrix.setPowerLevel
import app.diddy.matrix.PresenceStore
import app.diddy.ui.AvatarView
import app.diddy.ui.FullSheet
import app.diddy.ui.Navigator
import app.diddy.ui.Sheet
import app.diddy.ui.call.startCall
import app.diddy.ui.home.copyToClipboard
import app.diddy.ui.profile.DiddyBadgesRow
import app.diddy.ui.profile.DiddyBanner
import app.diddy.ui.profile.DiddyCardModules
import app.diddy.ui.profile.DiddyNameText
import app.diddy.ui.profile.PresenceDot
import app.diddy.ui.profile.diddyColor
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.MembershipState
import org.matrix.rustcomponents.sdk.UserProfile

// MARK: - Members

/** Everyone in a channel or server, grouped by role and searchable (ios MembersView). */
@Composable
fun MembersSheet(account: MatrixAccount, roomId: String, title: String?, navigator: Navigator, onClose: () -> Unit) {
    val store = remember(roomId) { MemberStore() }
    val presence = remember(account.id) { PresenceStore.of(account) }
    var search by remember { mutableStateOf("") }
    val summary = account.summary(roomId)
    val callParticipants = summary?.callParticipants ?: emptyList()
    LaunchedEffect(roomId, navigator.sheets.size) {
        store.load(account, roomId)
        account.loadDiddyProfiles()
    }
    val query = search.trim()
    val filtered = if (query.isEmpty()) store.members else store.members.filter {
        it.name.contains(query, ignoreCase = true) || it.userId.contains(query, ignoreCase = true)
    }
    FullSheet(
        title ?: "Members", onClose, closeLabel = "Done",
        action = if (summary?.isDirect != true) "Invite" else null,
        onAction = { navigator.show(Sheet.Invite(roomId)) },
    ) {
        Column(Modifier.fillMaxSize()) {
            SearchBar(search, { search = it }, "Search members")
            LazyColumn(Modifier.weight(1f)) {
                if (query.isEmpty() && callParticipants.isNotEmpty()) {
                    item { GroupHeader("In Voice", callParticipants.size) }
                    items(callParticipants, key = { "voice-$it" }) { userId ->
                        val entry = store.members.firstOrNull { it.userId == userId }
                        PersonRow(
                            account, entry?.name ?: account.name(userId), "In voice",
                            entry?.avatarUrl ?: account.profiles[userId]?.avatarUrl, userId,
                            trailing = { Icon(Icons.Filled.GraphicEq, null, tint = Theme.online, modifier = Modifier.size(16.dp)) },
                        ) { navigator.show(Sheet.Profile(userId, roomId)) }
                    }
                }
                for (group in MemberGroup.entries) {
                    val entries = filtered.filter { it.group == group }
                    if (entries.isEmpty()) continue
                    item(key = "h-${group.name}") { GroupHeader(group.title, entries.size) }
                    items(entries, key = { it.userId }) { entry ->
                        PersonRow(account, entry.name, presence.message(entry.userId) ?: entry.userId, entry.avatarUrl, entry.userId) {
                            navigator.show(Sheet.Profile(entry.userId, roomId))
                        }
                    }
                }
                if (!store.loading && filtered.isEmpty()) item {
                    when {
                        store.error != null -> EmptyNote(store.error!!, Theme.danger)
                        query.isEmpty() -> EmptyNote("Nobody here yet.")
                        else -> EmptyNote("No one matches “$query”.")
                    }
                }
                if (store.loading && store.members.isEmpty()) item {
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
                }
            }
        }
    }
}

// MARK: - Profile card

/**
 * The card Discord opens when you tap someone: banner, avatar with presence, name and status, the
 * main actions (Message, Call, Verify), the Diddy card modules, then the room part (role, invite,
 * unban; kick and ban in red) and Block at the bottom (ios UserProfileSheet).
 */
@Composable
fun UserProfileSheet(account: MatrixAccount, userId: String, roomId: String?, navigator: Navigator, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var member by remember { mutableStateOf<MemberEntry?>(null) }
    var ignored by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmBlock by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    val isSelf = userId == account.userId
    val name = member?.name ?: account.name(userId)
    val avatar = member?.avatarUrl ?: account.profiles[userId]?.avatarUrl
    val diddy = account.diddyProfiles[userId]
    val badges = account.diddyBadges[userId] ?: emptyList()
    val accent = diddyColor(diddy?.cardAccent)

    LaunchedEffect(userId, roomId) {
        account.resolveProfiles(listOf(userId), roomId)
        ignored = runCatching { account.client.ignoredUsers() }.getOrDefault(emptyList()).contains(userId)
        if (roomId != null) {
            runCatching { account.room(roomId)?.member(userId) }.getOrNull()?.let { member = MemberEntry.of(it) }
        }
        account.loadDiddyProfiles()
    }

    fun openChat(call: Boolean) {
        busy = if (call) "call" else "message"
        error = null
        scope.launch {
            try {
                val id = account.directMessage(userId)
                account.waitForRoom(id)
                navigator.closeAll()
                navigator.open(id, account)
                if (call) startCall(account, id, name, navigator)
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            busy = null
        }
    }

    FullSheet("", onClose, closeLabel = "Done") {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            val cardModifier = if (accent != null) Modifier.border(2.dp, accent, RoundedCornerShape(16.dp)).padding(10.dp) else Modifier
            Column(cardModifier, verticalArrangement = Arrangement.spacedBy(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    DiddyBanner(diddy, userId, account, Modifier.fillMaxWidth().height(100.dp).clip(RoundedCornerShape(14.dp)))
                    Box(Modifier.offset(y = (-48).dp).padding(bottom = 0.dp)) {
                        Box(Modifier.clip(CircleShape).background(Theme.sidebar).padding(5.dp)) {
                            AvatarView(avatar, name, 96.dp, account)
                        }
                        PresenceDot(userId, account, 24.dp, Theme.sidebar, Modifier.align(Alignment.BottomEnd))
                    }
                }
                Column(Modifier.offset(y = (-40).dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DiddyNameText(name, diddy, 22.sp, FontWeight.Bold, Theme.text)
                        if (badges.isNotEmpty()) DiddyBadgesRow(badges, 18.dp, account)
                    }
                    Text(userId, color = Theme.muted, fontSize = 13.sp)
                    PresenceLabel(account, userId)
                    member?.group?.role?.let { role ->
                        Text(
                            role, color = Theme.accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 4.dp).clip(CircleShape).background(Theme.elevated).padding(horizontal = 10.dp, vertical = 3.dp),
                        )
                    }
                }
                Column(Modifier.offset(y = (-32).dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    if (isSelf) {
                        ProfileActionButton("Edit Diddy Profile", Icons.Filled.Brush, Theme.elevated, Theme.text, false, Modifier.fillMaxWidth()) {
                            navigator.show(Sheet.ProfileEditor(userId))
                        }
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ProfileActionButton(
                                "Message", Icons.AutoMirrored.Filled.Chat, accent ?: Theme.accent,
                                if (accent == null) Theme.onAccent else Color.White, busy == "message", Modifier.weight(1f),
                            ) { if (busy == null) openChat(false) }
                            ProfileActionButton("Call", Icons.Filled.Call, Theme.elevated, Theme.text, busy == "call", Modifier.weight(1f)) {
                                if (busy == null) openChat(true)
                            }
                            ProfileActionButton("Verify", Icons.Filled.VerifiedUser, Theme.elevated, Theme.text, false, Modifier.weight(1f)) {
                                scope.launch {
                                    try { VerificationCenter.of(account).requestUserVerification(userId) } catch (e: Exception) { error = e.friendlyMessage }
                                }
                            }
                        }
                    }
                    if (diddy != null && diddy.hasCardContent) DiddyCardModules(diddy)
                    diddy?.clientVersion?.let {
                        Text("Diddy $it", color = Theme.faint, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End)
                    }
                }
            }
            error?.let { Text(it, color = Theme.danger, fontSize = 13.sp) }
            RowGroup(null) {
                ActionRow(if (copied) "Copied" else "Copy User ID", if (copied) Icons.Filled.CheckCircle else Icons.Filled.ContentCopy) {
                    copyToClipboard(context, userId)
                    copied = true
                }
            }
            if (roomId != null) ModerationRows(account, userId, roomId, name, navigator) { onClose() }
            if (!isSelf) {
                RowGroup(null) {
                    ActionRow(if (ignored) "Unblock" else "Block", Icons.Filled.Block, destructive = !ignored, busy = busy == "block") {
                        if (ignored) {
                            busy = "block"
                            scope.launch {
                                try { account.client.unignoreUser(userId); ignored = false } catch (e: Exception) { error = e.friendlyMessage }
                                busy = null
                            }
                        } else confirmBlock = true
                    }
                }
            }
        }
    }
    if (confirmBlock) {
        AlertDialog(
            onDismissRequest = { confirmBlock = false },
            title = { Text("Block $name?") },
            text = { Text("You will no longer see their messages or invites. You can unblock them later.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmBlock = false
                    busy = "block"
                    scope.launch {
                        try { account.client.ignoreUser(userId); ignored = true } catch (e: Exception) { error = e.friendlyMessage }
                        busy = null
                    }
                }) { Text("Block", color = Theme.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmBlock = false }) { Text("Cancel") } },
        )
    }
}

/** "Online", "Idle" … under the name, with the status message. */
@Composable
fun PresenceLabel(account: MatrixAccount, userId: String) {
    val store = remember(account.id) { PresenceStore.of(account) }
    LaunchedEffect(userId) { runCatching { store.refreshNow(userId) } }
    val state = store.state(userId) ?: return
    val message = store.message(userId)
    Text(
        listOfNotNull(state.title, message).joinToString(" · "),
        color = Theme.muted, fontSize = 13.sp, textAlign = TextAlign.Center,
    )
}

@Composable
private fun ProfileActionButton(title: String, icon: ImageVector, fill: Color, foreground: Color, busy: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(10.dp)).background(fill).clickable(onClick = onClick).padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = foreground, strokeWidth = 2.dp)
        else Icon(icon, null, tint = foreground, modifier = Modifier.size(20.dp))
        Text(title, color = foreground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** A rounded group of rows on the profile card (ios ProfileRowGroup). */
@Composable
fun RowGroup(title: String?, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (title != null) Text(title.uppercase(), color = Theme.faint, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 14.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Theme.elevated)) { content() }
    }
}

@Composable
fun ActionRow(title: String, icon: ImageVector, destructive: Boolean = false, busy: Boolean = false, enabled: Boolean = true, trailing: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    val color = if (destructive) Theme.danger else Theme.text
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled && !busy, onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = if (enabled) color else Theme.faint, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(title, color = if (enabled) color else Theme.faint, fontSize = 15.sp, modifier = Modifier.weight(1f))
        if (busy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Theme.accent)
        trailing?.invoke()
    }
}

/** Role, invite, unban, kick and ban for a person in a room (ios RoomModerationRows). */
@Composable
private fun ModerationRows(account: MatrixAccount, userId: String, roomId: String, name: String, navigator: Navigator, onRemoved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var levels by remember { mutableStateOf<PowerLevels?>(null) }
    var membership by remember { mutableStateOf<MembershipState?>(null) }
    var reload by remember { mutableStateOf(0) }
    var running by remember { mutableStateOf<String?>(null) }
    var prompt by remember { mutableStateOf<String?>(null) }
    var roleMenu by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val me = account.userId
    LaunchedEffect(roomId, userId, reload) {
        levels = runCatching { account.powerLevels(roomId) }.getOrNull()
        membership = runCatching { account.room(roomId)?.member(userId)?.membership }.getOrNull()
    }
    val power = levels ?: return
    val isSelf = userId == me
    val isMember = membership is MembershipState.Join
    val isInvited = membership is MembershipState.Invite
    val isBanned = membership is MembershipState.Ban
    val canInvite = !isSelf && !isMember && !isInvited && !isBanned && power.canInvite(me)
    val canUnban = isBanned && power.canUnban(me)
    val canKick = isMember && power.canKick(me, userId)
    val canCancelInvite = isInvited && power.canKick(me, userId)
    val canBan = !isBanned && power.canBan(me, userId)
    val canRole = power.canChangeRole(me, userId)
    val showsRole = !isSelf || canRole

    fun run(action: String, work: suspend () -> Unit) {
        running = action
        error = null
        scope.launch {
            try {
                work()
                reload++
                if (action == "kick" || action == "ban") onRemoved()
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            running = null
        }
    }

    if (showsRole || isBanned || isInvited || canInvite || canUnban) {
        RowGroup("In This Room") {
            if (showsRole) {
                Box {
                    ActionRow("Role", Icons.Filled.Shield, busy = running == "role", enabled = canRole, trailing = {
                        Text(PowerLevels.roleName(power.user(userId)), color = if (canRole) Theme.accent else Theme.muted, fontSize = 15.sp)
                    }) { roleMenu = true }
                    DropdownMenu(roleMenu, { roleMenu = false }) {
                        power.assignable(me).forEach { value ->
                            DropdownMenuItem(
                                text = { Text(PowerLevels.roleName(value)) },
                                trailingIcon = { if (power.user(userId) == value) Icon(Icons.Filled.CheckCircle, null, tint = Theme.accent) },
                                onClick = {
                                    roleMenu = false
                                    run("role") { account.setPowerLevel(roomId, userId, value) }
                                },
                            )
                        }
                    }
                }
            }
            if (isBanned) Text("Banned", color = Theme.danger, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(14.dp))
            if (isInvited) Text("Invited", color = Theme.muted, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(14.dp))
            if (canInvite) ActionRow("Invite to Room", Icons.Filled.PersonAdd, busy = running == "invite") {
                run("invite") { account.room(roomId)?.inviteUserById(userId) }
            }
            if (canUnban) ActionRow("Unban", Icons.Filled.Undo, busy = running == "unban") {
                run("unban") { account.room(roomId)?.unbanUser(userId, null) }
            }
        }
    }
    if (canKick || canCancelInvite || canBan) {
        RowGroup("Moderation") {
            if (canKick) ActionRow("Kick from Room", Icons.Filled.PersonRemove, destructive = true, busy = running == "kick") { prompt = "kick" }
            if (canCancelInvite) ActionRow("Cancel Invite", Icons.Filled.PersonRemove, destructive = true, busy = running == "kick") {
                run("kick") { account.room(roomId)?.kickUser(userId, null) }
            }
            if (canBan) ActionRow("Ban from Room", Icons.Filled.Block, destructive = true, busy = running == "ban") { prompt = "ban" }
        }
    }
    error?.let { Text(it, color = Theme.danger, fontSize = 13.sp) }
    prompt?.let { action ->
        var reason by remember(action) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { prompt = null },
            title = { Text(if (action == "kick") "Kick $name?" else "Ban $name?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (action == "kick") "They can join again if they are invited or the room is public." else "They cannot join again until someone unbans them.")
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Theme.input).padding(10.dp)) {
                        app.diddy.ui.InputField(reason, { reason = it }, "Reason (optional)")
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    prompt = null
                    val why = reason.trim().ifEmpty { null }
                    run(action) {
                        val room = account.room(roomId)
                        if (action == "kick") room?.kickUser(userId, why) else room?.banUser(userId, why)
                    }
                }) { Text(if (action == "kick") "Kick" else "Ban", color = Theme.danger) }
            },
            dismissButton = { TextButton(onClick = { prompt = null }) { Text("Cancel") } },
        )
    }
}

// MARK: - Finding people

/** Search for people by name or a full ID, then act on one (ios UserSearch). */
@Composable
private fun UserSearchResults(account: MatrixAccount, query: String, onPick: (String) -> Unit) {
    var results by remember { mutableStateOf<List<UserProfile>>(emptyList()) }
    var status by remember { mutableStateOf<String?>(null) }
    val term = query.trim()
    LaunchedEffect(term) {
        status = null
        if (term.length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(300) // wait for a pause in typing
        try {
            val found = account.searchUsers(term)
            results = found
            status = if (found.isEmpty()) "No one found. You can also enter a full ID like @friend:matrix.org." else null
        } catch (e: Exception) {
            results = emptyList()
            status = e.friendlyMessage
        }
    }
    val typedId = term.takeIf { it.startsWith("@") && it.contains(":") && results.none { r -> r.userId == it } }
    LazyColumn {
        if (typedId != null) item {
            PersonRow(account, MatrixAccount.localpart(typedId), typedId, null) { onPick(typedId) }
        }
        items(results, key = { it.userId }) { user ->
            PersonRow(account, user.displayName ?: MatrixAccount.localpart(user.userId), user.userId, user.avatarUrl, user.userId) { onPick(user.userId) }
        }
        if (status != null && typedId == null) item { Text(status!!, color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) }
        if (term.length < 2) item {
            Text("Search by name, or enter a full ID like @friend:matrix.org.", color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
        }
    }
}

/** Start a direct message with someone (ios NewMessageView). */
@Composable
fun NewMessageSheet(account: MatrixAccount, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    FullSheet("New Message", onClose, closeLabel = "Cancel") {
        Column(Modifier.fillMaxSize()) {
            SearchBar(query, { query = it }, "Find someone")
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 16.dp)) }
            if (busy) Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
            UserSearchResults(account, query) { userId ->
                if (busy) return@UserSearchResults
                busy = true
                scope.launch {
                    try {
                        val id = account.directMessage(userId)
                        account.waitForRoom(id)
                        onClose()
                        navigator.open(id, account)
                    } catch (e: Exception) {
                        error = e.friendlyMessage
                    }
                    busy = false
                }
            }
        }
    }
}

/** Invite people to a room, or share its link (ios InviteView). */
@Composable
fun InviteSheet(account: MatrixAccount, roomId: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var link by remember { mutableStateOf<String?>(null) }
    var invited by remember { mutableStateOf<List<String>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(roomId) { link = runCatching { account.room(roomId)?.matrixToPermalink() }.getOrNull() }
    FullSheet("Invite People", onClose, closeLabel = "Done") {
        Column(Modifier.fillMaxSize()) {
            SearchBar(query, { query = it }, "Name or @user:server")
            link?.let { url ->
                ActionRow("Share invite link", Icons.Filled.Share) {
                    val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                    context.startActivity(Intent.createChooser(intent, null))
                }
                ActionRow("Copy invite link", Icons.Filled.Link) { copyToClipboard(context, url) }
            }
            invited.forEach { userId ->
                Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, null, tint = Theme.online, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(userId, color = Theme.online)
                }
            }
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 16.dp)) }
            UserSearchResults(account, query) { userId ->
                scope.launch {
                    try {
                        account.room(roomId)?.inviteUserById(userId)
                        invited = invited + userId
                        query = ""
                        error = null
                    } catch (e: Exception) {
                        error = e.friendlyMessage
                    }
                }
            }
        }
    }
}
