package app.diddy.ui.sheets

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.ViewModule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.HierarchyRow
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.RailEntry
import app.diddy.matrix.RoomNotifyLevel
import app.diddy.matrix.ServerRailLayout
import app.diddy.matrix.addExistingRooms
import app.diddy.matrix.addableRooms
import app.diddy.matrix.notifyLevel
import app.diddy.matrix.ownServerName
import app.diddy.matrix.removeChild
import app.diddy.matrix.saveRail
import app.diddy.matrix.serverInfo
import app.diddy.matrix.serverTree
import app.diddy.matrix.setNotifyLevel
import app.diddy.matrix.toggleSuggested
import app.diddy.media.ImageTools
import app.diddy.ui.AvatarView
import app.diddy.ui.FullSheet
import app.diddy.ui.InputField
import app.diddy.ui.Navigator
import app.diddy.ui.Sheet
import app.diddy.ui.theme.Theme
import app.diddy.util.DiddyError
import app.diddy.util.friendlyMessage
import app.diddy.util.obj
import app.diddy.util.str
import app.diddy.util.strings
import kotlinx.coroutines.launch

// MARK: - Manage channels

/** The channels and sub-servers of a server: add, create, suggest and remove (ios ManageServerView). */
@Composable
fun ManageServerSheet(account: MatrixAccount, serverId: String, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var rows by remember { mutableStateOf<List<HierarchyRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var addMenuFor by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var removing by remember { mutableStateOf<HierarchyRow?>(null) }
    LaunchedEffect(reload, navigator.sheets.size) {
        try {
            rows = account.serverTree(serverId)
            error = null
        } catch (e: Exception) {
            error = e.friendlyMessage
        }
        loading = false
    }
    fun run(work: suspend () -> Unit) {
        scope.launch {
            try { work(); reload++ } catch (e: Exception) { error = e.friendlyMessage }
        }
    }
    @Composable
    fun addMenu(parent: String, open: Boolean, onDismiss: () -> Unit) {
        DropdownMenu(open, onDismiss) {
            DropdownMenuItem(text = { Text("Create Channel") }, onClick = { onDismiss(); navigator.show(Sheet.CreateChannel(parent)) })
            DropdownMenuItem(text = { Text("Add Existing Room") }, onClick = { onDismiss(); adding = parent to false })
            DropdownMenuItem(text = { Text("Add Existing Server") }, onClick = { onDismiss(); adding = parent to true })
        }
    }
    FullSheet(account.serverInfo(serverId).first, onClose, closeLabel = "Done", action = "Add", onAction = { addMenuFor = serverId }) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.align(Alignment.TopEnd)) { addMenu(serverId, addMenuFor == serverId) { addMenuFor = null } }
            LazyColumn(Modifier.fillMaxSize()) {
                if (loading && rows.isEmpty()) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) } }
                if (!loading && rows.isEmpty()) item { EmptyNote("Nothing in this server yet.") }
                items(rows, key = { it.parentId + it.roomId }) { row ->
                    var menu by remember { mutableStateOf(false) }
                    var subMenu by remember { mutableStateOf(false) }
                    Row(Modifier.fillMaxWidth().padding(start = (16 + row.depth * 20).dp, end = 4.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            when {
                                row.isSpace -> Icons.Filled.ViewModule
                                row.isVoice -> Icons.AutoMirrored.Filled.VolumeUp
                                else -> Icons.Filled.Tag
                            },
                            null, tint = Theme.faint, modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(row.name, color = Theme.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        if (row.suggested) Text("  Suggested", color = Theme.accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        Box {
                            Box(Modifier.size(44.dp).clickable { menu = true }, contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.MoreVert, "Options for ${row.name}", tint = Theme.muted)
                            }
                            DropdownMenu(menu, { menu = false }) {
                                DropdownMenuItem(text = { Text(if (row.suggested) "Unset Suggested" else "Set Suggested") }, onClick = {
                                    menu = false
                                    run { account.toggleSuggested(row) }
                                })
                                if (row.isSpace) DropdownMenuItem(text = { Text("Add…") }, onClick = { menu = false; subMenu = true })
                                HorizontalDivider()
                                DropdownMenuItem(text = { Text("Remove from Server", color = Theme.danger) }, onClick = { menu = false; removing = row })
                            }
                            if (row.isSpace) addMenu(row.roomId, subMenu) { subMenu = false }
                        }
                    }
                }
                error?.let { item { EmptyNote(it, Theme.danger) } }
            }
        }
    }
    removing?.let { row ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove ${row.name}?") },
            text = { Text("${row.name} stays as it is, it is only taken out of this server.") },
            confirmButton = { TextButton(onClick = { removing = null; run { account.removeChild(row.roomId, row.parentId) } }) { Text("Remove", color = Theme.danger) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
    adding?.let { (parent, spacesOnly) ->
        AddExistingSheet(account, parent, spacesOnly, rows.filter { it.parentId == parent }.map { it.roomId }.toSet()) {
            adding = null
            reload++
        }
    }
}

/** Pick rooms or servers you are in to add to a server (ios AddExistingView). */
@Composable
private fun AddExistingSheet(account: MatrixAccount, parentId: String, spacesOnly: Boolean, inside: Set<String>, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val candidates = account.addableRooms(parentId, spacesOnly, inside).filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
    FullSheet(
        if (spacesOnly) "Add Servers" else "Add Rooms", onClose, closeLabel = "Cancel",
        action = if (busy) "…" else "Add", actionEnabled = selected.isNotEmpty() && !busy,
        onAction = {
            busy = true
            scope.launch {
                try {
                    account.addExistingRooms(selected.toList(), parentId)
                    onClose()
                } catch (e: Exception) {
                    error = e.friendlyMessage
                }
                busy = false
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            SearchBar(query, { query = it }, "Search")
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(16.dp)) }
            LazyColumn {
                if (candidates.isEmpty()) item { EmptyNote(if (spacesOnly) "You have no other servers to add." else "You have no other rooms to add.") }
                items(candidates, key = { it.id }) { room ->
                    Row(
                        Modifier.fillMaxWidth().clickable { selected = if (room.id in selected) selected - room.id else selected + room.id }.padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AvatarView(room.avatarUrl, room.name, 34.dp, account, cornerRadius = if (spacesOnly) 10.dp else null)
                        Spacer(Modifier.width(12.dp))
                        Text(room.name, color = Theme.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Icon(if (room.id in selected) Icons.Filled.CheckBox else Icons.Filled.CheckBoxOutlineBlank, null, tint = if (room.id in selected) Theme.accent else Theme.faint)
                    }
                }
            }
        }
    }
}

// MARK: - Arrange servers

/** The order of the server list and its folders, shared with desktop (ios ArrangeServersView). */
@Composable
fun ArrangeServersSheet(account: MatrixAccount, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    var renaming by remember { mutableStateOf<String?>(null) }
    val entries = account.railEntries
    fun apply(next: List<RailEntry>) {
        scope.launch {
            try { account.saveRail(next) } catch (e: Exception) { error = e.friendlyMessage }
        }
    }
    FullSheet("Arrange Servers", onClose, closeLabel = "Done") {
        LazyColumn(Modifier.fillMaxSize()) {
            item { Text("Move servers up and down, or put them in folders. The order is the same in the desktop app.", color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) }
            if (entries.isEmpty()) item { EmptyNote("You have not joined any servers yet.") }
            entries.forEachIndexed { index, entry ->
                item(key = "e$index") {
                    when (entry) {
                        is RailEntry.Space -> ArrangeRow(account, entry.spaceId, 0, index > 0, index < entries.lastIndex,
                            onMove = { delta -> apply(ServerRailLayout.moved(entries, setOf(index), if (delta < 0) index - 1 else index + 2)) },
                            menu = { close ->
                                DropdownMenuItem(text = { Text("Put in New Folder") }, onClick = { close(); apply(ServerRailLayout.foldered(entry.spaceId, entries)) })
                                entries.filterIsInstance<RailEntry.Folder>().forEach { folder ->
                                    DropdownMenuItem(text = { Text("Put in ${folder.folder.name ?: "Folder"}") }, onClick = {
                                        close(); apply(ServerRailLayout.putIntoFolder(entry.spaceId, folder.folder.id, entries))
                                    })
                                }
                            })
                        is RailEntry.Folder -> Column {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Folder, null, tint = Theme.accent, modifier = Modifier.size(22.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(entry.folder.name ?: "Folder", color = Theme.text, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text("${entry.folder.content.size}", color = Theme.muted)
                                MoveButtons(index > 0, index < entries.lastIndex) { delta -> apply(ServerRailLayout.moved(entries, setOf(index), if (delta < 0) index - 1 else index + 2)) }
                                var menu by remember { mutableStateOf(false) }
                                Box {
                                    Box(Modifier.size(40.dp).clickable { menu = true }, contentAlignment = Alignment.Center) { Icon(Icons.Filled.MoreVert, "Folder options", tint = Theme.muted) }
                                    DropdownMenu(menu, { menu = false }) {
                                        DropdownMenuItem(text = { Text("Rename Folder") }, onClick = { menu = false; renaming = entry.folder.id })
                                        DropdownMenuItem(text = { Text("Dissolve Folder") }, onClick = { menu = false; apply(ServerRailLayout.dissolved(entry.folder.id, entries)) })
                                    }
                                }
                            }
                            entry.folder.content.forEachIndexed { inner, spaceId ->
                                ArrangeRow(account, spaceId, 1, inner > 0, inner < entry.folder.content.lastIndex,
                                    onMove = { delta ->
                                        apply(ServerRailLayout.moveInFolder(entry.folder.id, setOf(inner), if (delta < 0) inner - 1 else inner + 2, entries))
                                    },
                                    menu = { close ->
                                        DropdownMenuItem(text = { Text("Take Out of Folder") }, onClick = { close(); apply(ServerRailLayout.takeOut(spaceId, entries)) })
                                    })
                            }
                        }
                    }
                }
            }
            error?.let { item { EmptyNote(it, Theme.danger) } }
        }
    }
    renaming?.let { folderId ->
        val current = entries.filterIsInstance<RailEntry.Folder>().firstOrNull { it.folder.id == folderId }?.folder?.name ?: ""
        var name by remember(folderId) { mutableStateOf(current) }
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text("Rename Folder") },
            text = { InputField(name, { name = it }, "Folder name") },
            confirmButton = { TextButton(onClick = { renaming = null; apply(ServerRailLayout.renamed(folderId, name.trim(), entries)) }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ArrangeRow(
    account: MatrixAccount,
    spaceId: String,
    depth: Int,
    canUp: Boolean,
    canDown: Boolean,
    onMove: (Int) -> Unit,
    menu: @Composable (close: () -> Unit) -> Unit,
) {
    val (name, avatar) = account.serverInfo(spaceId)
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(start = (16 + depth * 28).dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        AvatarView(avatar, name, 34.dp, account, cornerRadius = 10.dp)
        Spacer(Modifier.width(10.dp))
        Text(name, color = Theme.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        MoveButtons(canUp, canDown, onMove)
        Box {
            Box(Modifier.size(40.dp).clickable { open = true }, contentAlignment = Alignment.Center) { Icon(Icons.Filled.MoreVert, "Move $name to a folder", tint = Theme.muted) }
            DropdownMenu(open, { open = false }) { menu { open = false } }
        }
    }
}

@Composable
private fun MoveButtons(canUp: Boolean, canDown: Boolean, onMove: (Int) -> Unit) {
    Box(Modifier.size(36.dp).clickable(enabled = canUp) { onMove(-1) }, contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.ArrowUpward, "Move up", tint = if (canUp) Theme.text else Theme.faint, modifier = Modifier.size(18.dp))
    }
    Box(Modifier.size(36.dp).clickable(enabled = canDown) { onMove(1) }, contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.ArrowDownward, "Move down", tint = if (canDown) Theme.text else Theme.faint, modifier = Modifier.size(18.dp))
    }
}

// MARK: - Room settings

private val joinRuleLabels = linkedMapOf(
    "invite" to "Invite Only",
    "knock" to "Knock & Invite",
    "restricted" to "Space Members",
    "knock_restricted" to "Space Members or Knock",
    "public" to "Public",
)

private val historyLabels = linkedMapOf(
    "shared" to "All Messages",
    "invited" to "After Invite",
    "joined" to "After Join",
    "world_readable" to "All Messages (Guests)",
)

/**
 * A room's or server's settings: picture, name, topic, who can join, history, encryption,
 * directory, addresses, notifications and banned people (ios RoomSettingsView, in short).
 */
@Composable
fun RoomSettingsSheet(account: MatrixAccount, roomId: String, navigator: Navigator, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val summary = account.summary(roomId)
    val isSpace = account.spaces.any { it.roomId == roomId }
    val word = if (isSpace) "server" else "room"
    var reload by remember { mutableIntStateOf(0) }
    var loaded by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var savedName by remember { mutableStateOf("") }
    var savedTopic by remember { mutableStateOf("") }
    var joinRule by remember { mutableStateOf("invite") }
    var history by remember { mutableStateOf("shared") }
    var retention by remember { mutableStateOf<Long?>(null) }
    var encrypted by remember { mutableStateOf(false) }
    var version by remember { mutableStateOf("1") }
    var published by remember { mutableStateOf<Boolean?>(null) }
    var canonical by remember { mutableStateOf<String?>(null) }
    var localAliases by remember { mutableStateOf<List<String>>(emptyList()) }
    var newAlias by remember { mutableStateOf("") }
    var banned by remember { mutableStateOf<List<Pair<String, String?>>>(emptyList()) }
    var levels by remember { mutableStateOf<app.diddy.matrix.PowerLevels?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmEncryption by remember { mutableStateOf(false) }
    val me = account.userId
    fun can(type: String) = levels?.let { it.user(me) >= it.state(type) } ?: false
    val enc = { value: String -> MatrixAccount.pathComponent(value) }
    LaunchedEffect(reload) {
        try {
            val events = account.clientRequestArray("/_matrix/client/v3/rooms/${enc(roomId)}/state")
            fun content(type: String) = events.firstOrNull { it["type"].str() == type && it["state_key"].str() == "" }?.get("content").obj()
            name = content("m.room.name")?.get("name").str() ?: ""
            topic = content("m.room.topic")?.get("topic").str() ?: ""
            savedName = name
            savedTopic = topic
            joinRule = content("m.room.join_rules")?.get("join_rule").str() ?: "invite"
            history = content("m.room.history_visibility")?.get("history_visibility").str() ?: "shared"
            retention = app.diddy.matrix.RoomRetention.lifetime(content(app.diddy.matrix.RoomRetention.EVENT_TYPE))
            encrypted = content("m.room.encryption") != null
            version = content("m.room.create")?.get("room_version").str() ?: "1"
            canonical = content("m.room.canonical_alias")?.get("alias").str()
            banned = events.filter { it["type"].str() == "m.room.member" && it["content"].obj()?.get("membership").str() == "ban" }
                .mapNotNull { e -> e["state_key"].str()?.let { it to e["content"].obj()?.get("reason").str() } }
            levels = app.diddy.matrix.PowerLevels(content("m.room.power_levels") ?: emptyMap(),
                app.diddy.matrix.PowerLevels.creators(events.firstOrNull { it["type"].str() == "m.room.create" }, version))
            published = runCatching { account.clientRequest("/_matrix/client/v3/directory/list/room/${enc(roomId)}")["visibility"].str() == "public" }.getOrNull()
            localAliases = runCatching { account.clientRequest("/_matrix/client/v3/rooms/${enc(roomId)}/aliases")["aliases"].strings() ?: emptyList() }.getOrDefault(emptyList())
            error = null
        } catch (e: Exception) {
            error = e.friendlyMessage
        }
        loaded = true
    }
    fun perform(work: suspend () -> Unit) {
        busy = true
        error = null
        scope.launch {
            try {
                work()
                reload++
                account.loadAllChannels()
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            busy = false
        }
    }
    suspend fun sendState(type: String, content: Map<String, Any?>) {
        account.clientRequest("/_matrix/client/v3/rooms/${enc(roomId)}/state/${enc(type)}/", content, "PUT")
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        perform {
            val data = ImageTools.jpegForUpload(context, uri, 800) ?: throw DiddyError("This image could not be read.")
            account.room(roomId)?.uploadAvatar("image/jpeg", data, null)
        }
    }
    FullSheet(if (isSpace) "Server Settings" else "Channel Settings", onClose, closeLabel = "Done") {
        if (!loaded) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
            return@FullSheet
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
            val avatar = summary?.avatarUrl ?: account.spaces.firstOrNull { it.roomId == roomId }?.avatarUrl
            FormSection("Profile", if (!can("m.room.name")) "Some fields are locked because your role can't change them." else "Name and topic are saved with Save; the picture changes right away.") {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.clickable(enabled = can("m.room.avatar")) { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                        AvatarView(avatar, name.ifEmpty { "?" }, 60.dp, account, cornerRadius = 16.dp)
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(if (can("m.room.avatar")) "Tap the picture to change it." else "", color = Theme.muted, fontSize = 13.sp)
                }
                FormDivider()
                if (can("m.room.name")) FormField(name, { name = it }, "Name") else Text(name, color = Theme.text, modifier = Modifier.padding(14.dp))
                FormDivider()
                if (can("m.room.topic")) FormField(topic, { topic = it }, "Topic", singleLine = false) else Text(topic.ifEmpty { "No topic" }, color = Theme.muted, modifier = Modifier.padding(14.dp))
                if (name != savedName || topic != savedTopic) {
                    FormDivider()
                    FormButton("Save", enabled = name.isNotBlank() && !busy) {
                        perform {
                            val room = account.room(roomId) ?: return@perform
                            if (name != savedName) room.setName(name.trim())
                            if (topic != savedTopic) room.setTopic(topic)
                        }
                    }
                }
            }
            FormSection(if (isSpace) "Server Access" else "Room Access", "Change how people can join the $word.") {
                val inSpace = account.server(roomId) != null
                val v = version.toIntOrNull() ?: 99
                val options = joinRuleLabels.keys.filter { rule ->
                    when (rule) {
                        "knock" -> v >= 7
                        "restricted" -> v >= 8 && inSpace
                        "knock_restricted" -> v >= 10 && inSpace
                        else -> true
                    } || rule == joinRule
                }
                options.forEachIndexed { index, rule ->
                    if (index > 0) FormDivider()
                    FormChoice(joinRuleLabels[rule] ?: rule, joinRule == rule) {
                        if (rule == joinRule || !can("m.room.join_rules") || busy) return@FormChoice
                        val parent = account.server(roomId)
                        val content = mutableMapOf<String, Any?>("join_rule" to rule)
                        if (rule.contains("restricted") && parent != null) content["allow"] = listOf(mapOf("type" to "m.room_membership", "room_id" to parent))
                        perform { sendState("m.room.join_rules", content) }
                    }
                }
            }
            FormSection("Message History Visibility", "Changes only apply to future messages.") {
                historyLabels.entries.forEachIndexed { index, (key, label) ->
                    if (index > 0) FormDivider()
                    FormChoice(label, history == key) {
                        if (key != history && can("m.room.history_visibility") && !busy) perform { sendState("m.room.history_visibility", mapOf("history_visibility" to key)) }
                    }
                }
            }
            FormSection(
                "Delete Messages Automatically",
                "Messages older than this are deleted from the server and hidden in Diddy right away. Other servers in the room and other apps may keep copies.",
            ) {
                val type = app.diddy.matrix.RoomRetention.EVENT_TYPE
                // A value set in another app stays visible as its own entry.
                val choices = listOf<Long?>(null) + app.diddy.matrix.RoomRetention.choices +
                    listOfNotNull(retention?.takeIf { it !in app.diddy.matrix.RoomRetention.choices })
                choices.forEachIndexed { index, value ->
                    if (index > 0) FormDivider()
                    FormChoice(value?.let { app.diddy.matrix.RoomRetention.duration(it) } ?: "Off", retention == value) {
                        if (value != retention && can(type) && !busy) perform {
                            sendState(type, app.diddy.matrix.RoomRetention.content(value))
                            if (value == null) account.retentionLifetimes.remove(roomId) else account.retentionLifetimes[roomId] = value
                        }
                    }
                }
            }
            FormSection(footer = if (encrypted) "Messages are protected by end-to-end encryption." else "Once enabled, encryption cannot be disabled!") {
                if (encrypted) Row(Modifier.padding(14.dp)) {
                    Text("Room Encryption", color = Theme.text, modifier = Modifier.weight(1f))
                    Text("Enabled", color = Theme.online, fontWeight = FontWeight.Bold)
                } else FormButton("Enable Encryption", enabled = can("m.room.encryption") && !busy) { confirmEncryption = true }
                FormDivider()
                FormToggle(
                    "Publish to Directory", published ?: false, "List the $word in the public directory.",
                    enabled = published != null && joinRule in listOf("public", "knock", "knock_restricted") && can("m.room.canonical_alias") && !busy,
                ) { on ->
                    perform {
                        account.clientRequest("/_matrix/client/v3/directory/list/room/${enc(roomId)}", mapOf("visibility" to if (on) "public" else "private"), "PUT")
                    }
                }
            }
            FormSection("Addresses", "The main address is shown in links. Local addresses are on your server.") {
                Text("Main: ${canonical ?: "none"}", color = Theme.text, modifier = Modifier.padding(14.dp))
                localAliases.forEach { alias ->
                    FormDivider()
                    Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(alias, color = Theme.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (alias != canonical && can("m.room.canonical_alias")) TextButton(onClick = { perform { sendState("m.room.canonical_alias", mapOf("alias" to alias)) } }) { Text("Make Main", fontSize = 12.sp) }
                        TextButton(onClick = { perform { account.clientRequest("/_matrix/client/v3/directory/room/${enc(alias)}", method = "DELETE") } }) {
                            Text("Delete", color = Theme.danger, fontSize = 12.sp)
                        }
                    }
                }
                FormDivider()
                Row(Modifier.padding(horizontal = 14.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("#", color = Theme.muted)
                    Box(Modifier.weight(1f).padding(vertical = 10.dp)) { InputField(newAlias, { newAlias = it }, "new-address") }
                    Text(":${account.ownServerName}", color = Theme.muted, fontSize = 13.sp)
                    TextButton(onClick = {
                        val alias = "#${newAlias.trim()}:${account.ownServerName}"
                        perform {
                            try {
                                account.clientRequest("/_matrix/client/v3/directory/room/${enc(alias)}", mapOf("room_id" to roomId), "PUT")
                            } catch (e: Exception) {
                                val message = e.friendlyMessage
                                if (message.contains("in use", true) || message.contains("already exist", true)) throw DiddyError("Address is already in use!")
                                throw e
                            }
                            newAlias = ""
                        }
                    }, enabled = newAlias.isNotBlank() && !busy) { Text("Add") }
                }
            }
            if (!isSpace) FormSection("Notifications") {
                val level = account.notifyLevel(roomId)
                RoomNotifyLevel.entries.forEachIndexed { index, option ->
                    if (index > 0) FormDivider()
                    FormChoice(option.title, level == option) { scope.launch { runCatching { account.setNotifyLevel(option, roomId) } } }
                }
            }
            FormSection("Banned", if (banned.isEmpty()) "Nobody is banned." else null) {
                banned.forEachIndexed { index, (userId, reason) ->
                    if (index > 0) FormDivider()
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(account.name(userId), color = Theme.text)
                            Text(reason?.let { "Reason: $it" } ?: userId, color = Theme.muted, fontSize = 12.sp)
                        }
                        if (levels?.canUnban(me) == true) TextButton(onClick = { perform { account.room(roomId)?.unbanUser(userId, null) } }) { Text("Unban") }
                    }
                }
            }
            FormSection("Manage") {
                FormButton("Members", color = Theme.text) { navigator.show(Sheet.Members(roomId)) }
                if (isSpace) {
                    FormDivider()
                    FormButton("Manage Channels", color = Theme.text) { navigator.show(Sheet.ManageServer(roomId)) }
                }
            }
            FormSection(footer = "Room version $version") {}
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 30.dp)) }
        }
    }
    if (confirmEncryption) {
        AlertDialog(
            onDismissRequest = { confirmEncryption = false },
            title = { Text("Enable encryption?") },
            text = { Text("Are you sure? Once enabled, encryption cannot be disabled!") },
            confirmButton = { TextButton(onClick = { confirmEncryption = false; perform { sendState("m.room.encryption", mapOf("algorithm" to "m.megolm.v1.aes-sha2")) } }) { Text("Enable") } },
            dismissButton = { TextButton(onClick = { confirmEncryption = false }) { Text("Cancel") } },
        )
    }
}
