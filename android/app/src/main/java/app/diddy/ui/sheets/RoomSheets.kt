package app.diddy.ui.sheets

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.ViewModule
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.ManageSearch
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.NewRoomAccess
import app.diddy.matrix.NewRoomRequest
import app.diddy.matrix.NewRoomVersionSupport
import app.diddy.matrix.PublicRoomEntry
import app.diddy.matrix.PublicRoomTypeFilter
import app.diddy.matrix.QuickSwitch
import app.diddy.matrix.RoomDirectory
import app.diddy.matrix.createRoom
import app.diddy.matrix.joinRoom
import app.diddy.matrix.knockOnRoom
import app.diddy.matrix.ownServerName
import app.diddy.matrix.publicRooms
import app.diddy.matrix.roomPreview
import app.diddy.matrix.roomVersionChoices
import app.diddy.ui.AvatarView
import app.diddy.ui.FilledButton
import app.diddy.ui.FullSheet
import app.diddy.ui.Navigator
import app.diddy.ui.PhoneTab
import app.diddy.ui.SearchEventTarget
import app.diddy.ui.Sheet
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Shows a server in the Servers tab (after joining or creating one). */
fun Navigator.showServer(id: String) {
    selectServer(id)
    destination = null
    tab = PhoneTab.SERVERS
}

// MARK: - Create

/** Create a room, a channel in a server, or a server (ios NewRoomForm). */
@Composable
fun CreateRoomSheet(account: MatrixAccount, parentId: String?, isSpace: Boolean, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var alias by remember { mutableStateOf("") }
    var access by remember { mutableStateOf(if (parentId != null) NewRoomAccess.RESTRICTED else NewRoomAccess.PRIVATE) }
    var isVoice by remember { mutableStateOf(false) }
    var encryption by remember { mutableStateOf(true) }
    var knock by remember { mutableStateOf(false) }
    var federation by remember { mutableStateOf(true) }
    var advanced by remember { mutableStateOf(false) }
    var version by remember { mutableStateOf<String?>(null) }
    var versions by remember { mutableStateOf<List<String>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val noun = if (isSpace) "Server" else if (parentId != null) "Channel" else "Room"
    val request = NewRoomRequest(
        name = name.trim(), topic = topic.trim(), isSpace = isSpace, isVoice = isVoice && !isSpace, parentId = parentId,
        access = access, aliasLocalPart = alias, encryption = encryption, knock = knock, allowFederation = federation, roomVersion = version,
    )
    val accessChoices = NewRoomAccess.entries.filter { it != NewRoomAccess.RESTRICTED || (parentId != null && NewRoomVersionSupport.restricted(version)) }
    LaunchedEffect(Unit) {
        val (default, available) = account.roomVersionChoices()
        versions = available
        version = default
        if (access !in NewRoomAccess.entries.filter { it != NewRoomAccess.RESTRICTED || (parentId != null && NewRoomVersionSupport.restricted(default)) }) access = NewRoomAccess.PRIVATE
    }
    fun create() {
        busy = true
        error = null
        scope.launch {
            try {
                val id = account.createRoom(request)
                if (isSpace && parentId == null) {
                    val encrypted = request.effectiveAccess != NewRoomAccess.PUBLIC
                    runCatching { account.createChannel(id, "general", "", isVoice = false, encrypted = encrypted) }
                    runCatching { account.createChannel(id, "General", "", isVoice = true, encrypted = encrypted) }
                    account.loadChannels(id)
                }
                navigator.closeAll()
                if (isSpace) { if (parentId == null) navigator.showServer(id) } else navigator.open(id, account)
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            busy = false
        }
    }
    FullSheet("Create $noun", onClose, closeLabel = "Cancel", action = if (busy) "…" else "Create", actionEnabled = name.isNotBlank() && !busy, onAction = { create() }) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
            FormSection("Name") {
                FormField(name, { name = it }, if (isSpace) "My Server" else if (isVoice) "Lounge" else "new-${noun.lowercase()}")
            }
            FormSection("Topic (optional)") { FormField(topic, { topic = it }, "What is it about?", singleLine = false) }
            if (!isSpace) FormSection("Type") {
                FormChoice("Text", !isVoice, icon = Icons.Filled.Tag) { isVoice = false }
                FormDivider()
                FormChoice("Voice", isVoice, icon = Icons.Filled.VolumeUp) { isVoice = true }
            }
            FormSection("Access", footer = access.detail) {
                accessChoices.forEachIndexed { index, choice ->
                    if (index > 0) FormDivider()
                    FormChoice(choice.title, access == choice) { access = choice }
                }
            }
            if (request.effectiveAccess == NewRoomAccess.PUBLIC) {
                FormSection("Address", footer = "#${alias.ifEmpty { "address" }}:${account.ownServerName}") { FormField(alias, { alias = it }, "address") }
            }
            if (!isSpace && request.effectiveAccess != NewRoomAccess.PUBLIC) {
                FormSection(footer = "Encryption can't be turned off after the ${noun.lowercase()} is created.") {
                    FormToggle("End-to-End Encryption", encryption) { encryption = it }
                }
            }
            FormSection {
                FormButton(if (advanced) "Hide Advanced Options" else "Advanced Options", color = Theme.text) { advanced = !advanced }
                if (advanced) {
                    if (request.effectiveAccess != NewRoomAccess.PUBLIC && NewRoomVersionSupport.knock(version)) {
                        FormDivider()
                        FormToggle("Knock to Join", knock, "Anyone can ask to join this ${noun.lowercase()}.") { knock = it }
                    }
                    FormDivider()
                    FormToggle("Allow Federation", federation, "Users from other servers can join.") { federation = it }
                    if (versions.isNotEmpty()) {
                        FormDivider()
                        Text("Room Version", color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(start = 14.dp, top = 10.dp))
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            versions.forEach { v ->
                                val selected = (version ?: versions.first()) == v
                                Text(
                                    v, color = if (selected) Theme.onAccent else Theme.text,
                                    modifier = Modifier.clip(CircleShape).background(if (selected) Theme.accent else Theme.input)
                                        .clickable { version = v }.padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }
                    }
                }
            }
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(16.dp)) }
            if (busy) Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
        }
    }
}

/** Join a server by address or link, or create one (ios AddServerView). */
@Composable
fun AddServerSheet(account: MatrixAccount, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var address by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    FullSheet("Add a Server", onClose, closeLabel = "Cancel") {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
            FormSection("Join a server", "For example #community:matrix.org or a matrix.to link.") {
                FormField(address, { address = it }, "Address or link")
                FormDivider()
                FormButton("Join Server", enabled = address.isNotBlank(), busy = busy) {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            val id = account.joinServer(address)
                            navigator.closeAll()
                            if (account.spaces.any { it.roomId == id }) navigator.showServer(id) else navigator.open(id, account)
                        } catch (e: Exception) {
                            error = e.friendlyMessage
                        }
                        busy = false
                    }
                }
            }
            FormSection("Create your own", "Choose who can join, the address, encryption and more.") {
                FormButton("Create a Server") { navigator.show(Sheet.CreateServer) }
            }
            FormSection {
                FormButton("Explore Public Servers", icon = Icons.Filled.ManageSearch) { navigator.show(Sheet.Explore) }
            }
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(16.dp)) }
        }
    }
}

// MARK: - Explore

private sealed class ExploreSource {
    data object Featured : ExploreSource()
    data class Server(val name: String) : ExploreSource()
}

/** The public room directory of servers, and featured spaces and rooms (ios ExploreView). */
@Composable
fun ExploreSheet(account: MatrixAccount, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var source by remember { mutableStateOf<ExploreSource>(ExploreSource.Featured) }
    var term by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(PublicRoomTypeFilter.ALL) }
    var results by remember { mutableStateOf<List<PublicRoomEntry>>(emptyList()) }
    var nextBatch by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val featured = remember { mutableStateListOf<Pair<String, PublicRoomEntry?>>() }
    var customServer by remember { mutableStateOf("") }
    var customServers by remember { mutableStateOf<List<String>>(emptyList()) }
    val own = account.ownServerName
    val servers = (listOf(own) + RoomDirectory.otherServers(own) + customServers).distinct()

    suspend fun load(more: Boolean) {
        val server = (source as? ExploreSource.Server)?.name ?: return
        loading = true
        if (!more) error = null
        try {
            val page = account.publicRooms(server, term.trim(), filter, if (more) nextBatch else null)
            results = if (more) results + page.rooms else page.rooms
            nextBatch = page.nextBatch
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            if (!more) results = emptyList()
            nextBatch = null
            error = e.friendlyMessage
        }
        loading = false
    }
    LaunchedEffect(source, term.trim(), filter) {
        if (source !is ExploreSource.Server) return@LaunchedEffect
        if (term.isNotBlank()) delay(400)
        load(false)
    }
    LaunchedEffect(Unit) {
        if (featured.isNotEmpty()) return@LaunchedEffect
        val items = RoomDirectory.featuredSpaces.map { it to true } + RoomDirectory.featuredRooms.map { it to false }
        featured.addAll(items.map { it.first to null })
        items.forEachIndexed { index, (alias, isSpace) ->
            val entry = account.roomPreview(alias) ?: PublicRoomEntry(alias, null, null, alias, null, 0, if (isSpace) "m.space" else null, null)
            if (index < featured.size) featured[index] = alias to entry
        }
    }
    val via = (source as? ExploreSource.Server)?.let { listOf(it.name) } ?: emptyList()

    FullSheet("Explore", onClose, closeLabel = "Done") {
        Column(Modifier.fillMaxSize()) {
            SearchBar(term, { term = it }, "Search public rooms")
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Chip("Featured", source == ExploreSource.Featured) { source = ExploreSource.Featured }
                servers.forEach { server ->
                    Chip(if (server == own) "$server (yours)" else server, source == ExploreSource.Server(server)) { source = ExploreSource.Server(server) }
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).clip(RoundedCornerShape(10.dp)).background(Theme.elevated).padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).padding(vertical = 6.dp)) { app.diddy.ui.InputField(customServer, { customServer = it }, "Another server, like matrix.org") }
                TextButton(onClick = {
                    RoomDirectory.cleanServerName(customServer)?.let { server ->
                        if (server !in servers) customServers = customServers + server
                        source = ExploreSource.Server(server)
                        customServer = ""
                    }
                }, enabled = RoomDirectory.cleanServerName(customServer) != null) { Text("Browse") }
            }
            if (source is ExploreSource.Server) {
                Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PublicRoomTypeFilter.entries.forEach { f -> Chip(f.title, filter == f) { filter = f } }
                }
            }
            LazyColumn(Modifier.weight(1f)) {
                when (source) {
                    ExploreSource.Featured -> {
                        val spaces = featured.filter { it.second?.isSpace ?: RoomDirectory.featuredSpaces.contains(it.first) }
                        val rooms = featured.filter { it !in spaces }
                        if (spaces.isNotEmpty()) item { GroupHeader("Featured Spaces") }
                        items(spaces, key = { "s-" + it.first }) { (alias, entry) -> EntryRow(account, alias, entry) { navigator.show(Sheet.Preview(it, emptyList())) } }
                        if (rooms.isNotEmpty()) item { GroupHeader("Featured Rooms") }
                        items(rooms, key = { "r-" + it.first }) { (alias, entry) -> EntryRow(account, alias, entry) { navigator.show(Sheet.Preview(it, emptyList())) } }
                    }
                    is ExploreSource.Server -> {
                        items(results, key = { it.roomId }) { entry -> EntryRow(account, entry.roomId, entry) { navigator.show(Sheet.Preview(it, via)) } }
                        if (loading) item { Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) } }
                        if (!loading && results.isEmpty() && error == null) item { EmptyNote("No public rooms or servers found.") }
                        error?.let { item { EmptyNote(it, Theme.danger) } }
                        if (nextBatch != null && !loading) item { TextButton(onClick = { scope.launch { load(true) } }, modifier = Modifier.padding(8.dp)) { Text("Load more") } }
                    }
                }
            }
        }
    }
}

@Composable
private fun Chip(title: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        title, color = if (selected) Theme.onAccent else Theme.text, fontSize = 14.sp,
        modifier = Modifier.clip(CircleShape).background(if (selected) Theme.accent else Theme.elevated).clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

@Composable
private fun EntryRow(account: MatrixAccount, alias: String, entry: PublicRoomEntry?, onOpen: (PublicRoomEntry) -> Unit) {
    if (entry == null) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(alias, color = Theme.muted, modifier = Modifier.weight(1f))
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Theme.accent)
        }
        return
    }
    Row(
        Modifier.fillMaxWidth().clickable { onOpen(entry) }.padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarView(entry.avatarUrl, entry.displayName, 40.dp, account, cornerRadius = if (entry.isSpace) 12.dp else null)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(entry.displayName, color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            entry.topic?.let { Text(it, color = Theme.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            Text("${entry.memberCount} members", color = Theme.faint, fontSize = 11.sp)
        }
        if (account.summary(entry.roomId)?.isJoined == true) Text("Joined", color = Theme.online, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** What a public room or server shows before joining (ios PublicRoomPreviewSheet). */
@Composable
fun PublicRoomPreviewSheet(account: MatrixAccount, entry: PublicRoomEntry, via: List<String>, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var knocked by remember { mutableStateOf(false) }
    val joined = account.summary(entry.roomId)?.isJoined == true
    val needsInvite = entry.joinRule == "invite"
    val canKnock = entry.joinRule == "knock"
    fun open(roomId: String) {
        navigator.closeAll()
        if (entry.isSpace) navigator.showServer(roomId) else navigator.open(roomId, account)
    }
    fun run(work: suspend () -> Unit) {
        busy = true
        error = null
        scope.launch {
            try { work() } catch (e: Exception) { error = e.friendlyMessage }
            busy = false
        }
    }
    FullSheet(if (entry.isSpace) "Server" else "Room", onClose, closeLabel = "Cancel") {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            AvatarView(entry.avatarUrl, entry.displayName, 84.dp, account, cornerRadius = if (entry.isSpace) 24.dp else null)
            Text(entry.displayName, color = Theme.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            entry.canonicalAlias?.let { Text(it, color = Theme.muted) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Group, null, tint = Theme.muted, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (entry.memberCount == 1) "1 member" else "${entry.memberCount} members", color = Theme.muted)
            }
            Text(
                entry.topic ?: if (entry.isSpace) "This server has no description." else "This room has no topic.",
                color = if (entry.topic != null) Theme.text else Theme.faint,
                modifier = Modifier.fillMaxWidth(),
            )
            if (needsInvite) Text("You need an invitation to join.", color = Theme.muted, fontSize = 13.sp)
            if (knocked) Text("Request sent. You are in once someone lets you in.", color = Theme.online, fontSize = 13.sp)
            error?.let { Text(it, color = Theme.danger, fontSize = 13.sp) }
            when {
                busy -> CircularProgressIndicator(color = Theme.accent)
                joined -> FilledButton("Open") { open(entry.roomId) }
                canKnock -> FilledButton("Request to Join", enabled = !knocked) { run { account.knockOnRoom(entry.joinTarget, via); knocked = true } }
                !needsInvite -> FilledButton("Join") { run { open(account.joinRoom(entry.joinTarget, via)) } }
            }
        }
    }
}

/** A matrix.to or room link from a message: open or join the room (ios ShellJoinRoomView). */
@Composable
fun JoinLinkSheet(account: MatrixAccount, address: String, via: List<String>, eventId: String?, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var preview by remember { mutableStateOf<PublicRoomEntry?>(null) }
    val known = account.summary(address) ?: account.rooms.firstOrNull { it.canonicalAlias == address }
    LaunchedEffect(address) { if (known == null) preview = account.roomPreview(address, via) }
    val name = known?.name ?: preview?.displayName ?: address
    FullSheet("Open Matrix room", onClose, closeLabel = "Cancel") {
        Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            AvatarView(known?.avatarUrl ?: preview?.avatarUrl, name, 72.dp, account)
            Text(name, color = Theme.text, fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            (preview?.topic ?: known?.topic)?.let { Text(it, color = Theme.muted, textAlign = TextAlign.Center) }
            if (eventId != null) Text("Links to a message in this room.", color = Theme.faint, fontSize = 13.sp)
            error?.let { Text(it, color = Theme.danger) }
            if (busy) CircularProgressIndicator(color = Theme.accent)
            else FilledButton(if (known?.isJoined == true) "Open Room" else "Join Room") {
                busy = true
                scope.launch {
                    try {
                        val id = if (known?.isJoined == true) known.id else account.joinRoom(address, via)
                        navigator.closeAll()
                        if (account.spaces.any { it.roomId == id }) navigator.showServer(id) else {
                            navigator.open(id, account)
                            if (eventId != null) navigator.searchTarget = SearchEventTarget(id, eventId)
                        }
                    } catch (e: Exception) {
                        error = e.friendlyMessage
                    }
                    busy = false
                }
            }
        }
    }
}

// MARK: - Quick switch

/** Jump to any room, person or server; `#`, `@` and `*` narrow it down (ios QuickSwitchView). */
@Composable
fun QuickSwitchSheet(account: MatrixAccount, navigator: Navigator, onClose: () -> Unit) {
    var query by remember { mutableStateOf("") }
    val rooms = account.rooms.filter { it.isJoined && !it.isSpace && !it.isDirect }.map { QuickSwitch.Item(it.id, it.name, null, QuickSwitch.Kind.ROOMS) }
    val directs = account.directMessages.map { room ->
        QuickSwitch.Item(room.id, room.name, room.dmUserId?.drop(1)?.substringBefore(':'), QuickSwitch.Kind.DIRECTS)
    }
    val spaces = account.spaces.map { QuickSwitch.Item(it.roomId, it.displayName, null, QuickSwitch.Kind.SPACES) }
    val (kind, text) = QuickSwitch.parse(query)
    val results = if (text.isEmpty()) {
        val activity = account.rooms.withIndex().associate { it.value.id to it.index }
        QuickSwitch.recent(kind, rooms, directs, spaces, activity)
    } else QuickSwitch.search(text, QuickSwitch.targets(kind, rooms, directs, spaces))
    FullSheet("Search", onClose) {
        Column(Modifier.fillMaxSize()) {
            SearchBar(query, { query = it }, "Search (# rooms, @ people, * servers)")
            FormButton("Search Messages", icon = Icons.Filled.ManageSearch) { navigator.show(Sheet.MessageSearch) }
            GroupHeader("Rooms, people and servers")
            LazyColumn(Modifier.weight(1f)) {
                items(results, key = { it.kind.name + it.id }) { item ->
                    val summary = account.summary(item.id)
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            navigator.closeAll()
                            if (item.kind == QuickSwitch.Kind.SPACES) navigator.showServer(item.id) else navigator.open(item.id, account)
                        }.padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val avatar = summary?.avatarUrl ?: account.spaces.firstOrNull { it.roomId == item.id }?.avatarUrl
                        AvatarView(avatar, item.name, 32.dp, account, cornerRadius = if (item.kind == QuickSwitch.Kind.SPACES) 10.dp else null)
                        Spacer(Modifier.width(12.dp))
                        Text(item.name, color = Theme.text, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Icon(
                            when (item.kind) {
                                QuickSwitch.Kind.SPACES -> Icons.Filled.ViewModule
                                QuickSwitch.Kind.DIRECTS -> Icons.Filled.Person
                                QuickSwitch.Kind.ROOMS -> Icons.Filled.Tag
                            },
                            null, tint = Theme.faint, modifier = Modifier.size(16.dp),
                        )
                    }
                }
                if (results.isEmpty()) item { EmptyNote("No results found") }
            }
        }
    }
}

// MARK: - Channel details

/** Name, topic, members, invite, settings, media and leave for a room (ios ChannelInfoView). */
@Composable
fun ChannelInfoSheet(account: MatrixAccount, roomId: String, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val summary = account.summary(roomId)
    var canEdit by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf(summary?.name ?: "") }
    var topic by remember { mutableStateOf(summary?.topic ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmLeave by remember { mutableStateOf(false) }
    val isDirect = summary?.isDirect == true
    LaunchedEffect(roomId) {
        if (!isDirect) canEdit = runCatching {
            account.room(roomId)?.getPowerLevels()?.canOwnUserSendState(uniffi.ruma_events.StateEventType.RoomName)
        }.getOrNull() ?: false
    }
    FullSheet("Details", onClose, closeLabel = "Done") {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
            FormSection {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    AvatarView(summary?.avatarUrl, summary?.name ?: "?", 52.dp, account, cornerRadius = 14.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(summary?.name ?: "", color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                        summary?.canonicalAlias?.let { Text(it, color = Theme.muted, fontSize = 12.sp) }
                        if (summary?.isEncrypted == true) Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Lock, null, tint = Theme.muted, modifier = Modifier.size(12.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("End-to-end encrypted", color = Theme.muted, fontSize = 12.sp)
                        }
                    }
                }
                if (!canEdit && !summary?.topic.isNullOrEmpty()) Text(summary?.topic ?: "", color = Theme.muted, modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp))
            }
            if (canEdit) FormSection("Edit") {
                FormField(name, { name = it }, "Name")
                FormDivider()
                FormField(topic, { topic = it }, "Topic", singleLine = false)
                FormDivider()
                FormButton("Save Changes", enabled = name.isNotBlank() && (name != summary?.name || topic != (summary?.topic ?: ""))) {
                    scope.launch {
                        try {
                            val room = account.room(roomId) ?: return@launch
                            if (name != summary?.name) room.setName(name.trim())
                            if (topic != (summary?.topic ?: "")) room.setTopic(topic)
                            account.loadAllChannels()
                            onClose()
                        } catch (e: Exception) {
                            error = e.friendlyMessage
                        }
                    }
                }
            }
            FormSection {
                FormButton("Members", icon = Icons.Filled.Group, detail = "${summary?.memberCount ?: 0}", color = Theme.text) { navigator.show(Sheet.Members(roomId)) }
                if (!isDirect) {
                    FormDivider()
                    FormButton("Invite People", icon = Icons.Filled.PersonAdd, color = Theme.text) { navigator.show(Sheet.Invite(roomId)) }
                    FormDivider()
                    FormButton("Channel Settings", icon = Icons.Filled.Settings, color = Theme.text) { navigator.show(Sheet.RoomSettings(roomId)) }
                }
                FormDivider()
                FormButton("Media & Files", icon = Icons.Filled.PhotoLibrary, color = Theme.text) { navigator.show(Sheet.Media(roomId)) }
            }
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(16.dp)) }
            FormSection {
                FormButton(if (isDirect) "Close Conversation" else "Leave Channel", icon = Icons.AutoMirrored.Filled.Logout, color = Theme.danger) { confirmLeave = true }
            }
        }
    }
    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text("Leave ${summary?.name ?: "this channel"}?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmLeave = false
                    scope.launch {
                        try {
                            account.leave(roomId)
                            navigator.closeAll()
                            navigator.destination = null
                        } catch (e: Exception) {
                            error = e.friendlyMessage
                        }
                    }
                }) { Text("Leave", color = Theme.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("Cancel") } },
        )
    }
}
