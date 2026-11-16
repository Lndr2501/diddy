package app.diddy.ui.chat

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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.app.ChatSettings
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MessageEditVersion
import app.diddy.matrix.TimelineController
import app.diddy.matrix.TimelineNav
import app.diddy.ui.AvatarView
import app.diddy.ui.FullSheet
import app.diddy.ui.InputField
import app.diddy.ui.Navigator
import app.diddy.ui.SearchEventTarget
import app.diddy.ui.Sheet
import app.diddy.ui.home.copyToClipboard
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.TimelineFocus
import java.util.Date

@Composable
fun TimelineNavSheetView(
    account: MatrixAccount,
    controller: TimelineController,
    sheet: NavSheet,
    navigator: Navigator,
    onClose: () -> Unit,
    onJump: (String) -> Unit,
) {
    when (sheet) {
        is NavSheet.Readers -> PeopleSheet("Seen by", controller.nav.readers(sheet.eventId), account, controller.roomId, navigator, onClose)
        is NavSheet.Reactions -> PeopleSheet("Reacted with ${sheet.key}", sheet.senders, account, controller.roomId, navigator, onClose)
        is NavSheet.Report -> ReportSheet(account, controller.roomId, sheet.eventId, onClose)
        is NavSheet.Delete -> DeleteSheet(controller, sheet.row, onClose)
        is NavSheet.Source -> SourceSheet(controller.sourceText(sheet.row), onClose)
        is NavSheet.History -> HistorySheet(controller, sheet.row, onClose)
        is NavSheet.Thread -> ThreadSheet(account, controller, sheet.root, navigator, onClose)
        NavSheet.Pinned -> PinnedSheet(account, controller, onClose, onJump)
        NavSheet.JumpToDate -> JumpToDateSheet(account, controller.roomId, onClose, onJump)
        NavSheet.Search -> SearchSheet(account, controller.roomId, navigator, onClose, onJump)
    }
}

/** A list of people: who has read a message, or who reacted with an emoji. */
@Composable
fun PeopleSheet(title: String, userIds: List<String>, account: MatrixAccount, roomId: String, navigator: Navigator, onClose: () -> Unit) {
    LaunchedEffect(userIds) { account.resolveProfiles(userIds, roomId) }
    FullSheet(title, onClose, background = Theme.chat) {
        if (userIds.isEmpty()) Text("Nobody yet.", color = Theme.muted, modifier = Modifier.padding(24.dp))
        LazyColumn {
            items(userIds) { userId ->
                Row(
                    Modifier.fillMaxWidth().clickable { navigator.show(Sheet.Profile(userId, roomId)) }.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AvatarView(account.profiles[userId]?.avatarUrl, account.name(userId), 36.dp, account)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(account.name(userId), color = Theme.text, fontSize = 16.sp)
                        Text(userId, color = Theme.muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReasonForm(intro: String, label: String, button: String, busyLabel: String, required: Boolean, busy: Boolean, status: String?, statusColor: androidx.compose.ui.graphics.Color, onSubmit: (String) -> Unit) {
    var reason by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(intro, color = Theme.muted)
        Text(label, color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Theme.elevated).padding(12.dp)) {
            InputField(reason, { reason = it }, "Reason", singleLine = false)
        }
        status?.let { Text(it, color = statusColor) }
        TextButton(onClick = { onSubmit(reason) }, enabled = !busy && (!required || reason.isNotBlank())) {
            Text(if (busy) busyLabel else button, color = Theme.danger, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ReportSheet(account: MatrixAccount, roomId: String, eventId: String, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var sending by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    FullSheet("Report Message", onClose, closeLabel = if (done) "Close" else "Cancel") {
        ReasonForm(
            "Report this message to server, which may then notify the appropriate people to take action.", "REASON", "Report", "Reporting…",
            true, sending || done, status, if (done) Theme.online else Theme.danger,
        ) { reason ->
            sending = true
            scope.launch {
                try {
                    account.clientRequest(TimelineNav.reportPath(roomId, eventId), TimelineNav.reportBody(reason), "POST")
                    done = true
                    status = "Message has been reported to server."
                } catch (_: Exception) {
                    status = "Failed to report message! Please try again."
                }
                sending = false
            }
        }
    }
}

@Composable
private fun DeleteSheet(controller: TimelineController, row: app.diddy.matrix.MessageRow, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var deleting by remember { mutableStateOf(false) }
    FullSheet("Delete Message", onClose, closeLabel = "Cancel") {
        ReasonForm(
            "This action is irreversible! Are you sure that you want to delete this message?", "REASON (OPTIONAL)", "Delete", "Deleting…",
            false, deleting, null, Theme.danger,
        ) { reason ->
            deleting = true
            scope.launch {
                val ok = controller.redact(row, reason)
                deleting = false
                if (ok) onClose()
            }
        }
    }
}

@Composable
private fun SourceSheet(text: String, onClose: () -> Unit) {
    val context = LocalContext.current
    FullSheet("Message Source", onClose, action = "Copy", onAction = { copyToClipboard(context, text) }, background = Theme.chat) {
        SelectionContainer(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState())) {
            Text(text, color = Theme.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
        }
    }
}

@Composable
private fun HistorySheet(controller: TimelineController, row: app.diddy.matrix.MessageRow, onClose: () -> Unit) {
    var versions by remember { mutableStateOf<List<MessageEditVersion>?>(null) }
    LaunchedEffect(row.id) { versions = controller.editHistory(row) ?: emptyList() }
    FullSheet("Edit History", onClose, background = Theme.chat) {
        val loaded = versions
        when {
            loaded == null -> CircularProgressIndicator(Modifier.padding(24.dp))
            loaded.isEmpty() -> Text("No earlier versions found.", color = Theme.muted, modifier = Modifier.padding(24.dp))
            else -> LazyColumn {
                items(loaded) { version ->
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                        Text(version.text, color = Theme.text)
                        version.date?.let { Text("${ChatSettings.date(it)} ${ChatSettings.time(it)}", color = Theme.faint, fontSize = 12.sp) }
                    }
                }
            }
        }
    }
}

/** A thread: its own focused timeline and a small composer that sends into it. */
@Composable
private fun ThreadSheet(account: MatrixAccount, parent: TimelineController, root: String, navigator: Navigator, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val controller = remember(root) { TimelineController(parent.room, account.userId, false, TimelineFocus.Thread(root)) }
    DisposableEffect(root) { onDispose { controller.close() } }
    LaunchedEffect(root) { controller.start() }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val list = rememberLazyListState()
    LaunchedEffect(controller.rows.size) { if (controller.rows.isNotEmpty()) list.animateScrollToItem(controller.rows.size - 1) }
    val actions = MessageActions(
        onProfile = { navigator.show(Sheet.Profile(it, controller.roomId)) }, onLink = {},
        onReact = { row, key -> scope.launch { controller.toggleReaction(key, row) } }, onReactionInfo = { _, _ -> },
        onImage = {}, onCardCommand = { scope.launch { controller.sendCardAction(it) } }, onReplyTap = {}, onLongPress = {}, onDoubleTap = {},
    )
    FullSheet("Thread", onClose, background = Theme.chat) {
        Column(Modifier.fillMaxSize()) {
            LazyColumn(state = list, modifier = Modifier.weight(1f)) {
                items(controller.rows, key = { it.id }) { MessageRowView(it, account, controller.roomId, actions, false) }
            }
            Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.Bottom) {
                Box(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(Theme.elevated).padding(horizontal = 12.dp, vertical = 10.dp)) {
                    InputField(draft, { draft = it }, "Reply in thread", singleLine = false)
                }
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier.size(36.dp).clip(CircleShape).background(if (draft.isBlank() || sending) Theme.faint else Theme.accent).clickable(enabled = draft.isNotBlank() && !sending) {
                        val text = draft
                        sending = true
                        scope.launch {
                            if (controller.sendInThread(text, root) && draft == text) draft = ""
                            sending = false
                        }
                    },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.ArrowUpward, "Send", tint = Theme.onAccent) }
            }
        }
    }
}

@Composable
private fun PinnedSheet(account: MatrixAccount, parent: TimelineController, onClose: () -> Unit, onJump: (String) -> Unit) {
    val controller = remember { TimelineController(parent.room, parent.ownUserId, parent.isDirect, TimelineFocus.PinnedEvents) }
    DisposableEffect(Unit) { onDispose { controller.close() } }
    LaunchedEffect(Unit) { controller.start() }
    val actions = MessageActions({}, {}, { _, _ -> }, { _, _ -> }, {}, {}, {}, {}, {})
    FullSheet("Pinned Messages", onClose, background = Theme.chat) {
        when {
            parent.nav.pinned.isEmpty() -> Text("No pinned messages.", color = Theme.muted, modifier = Modifier.padding(24.dp))
            controller.rows.isEmpty() -> CircularProgressIndicator(Modifier.padding(24.dp))
            else -> LazyColumn {
                items(controller.rows.asReversed(), key = { it.id }) { row ->
                    Box(Modifier.clickable { row.remoteEventId?.let(onJump) }) {
                        MessageRowView(row.copy(showsHeader = true, dayDivider = null), account, controller.roomId, actions, false)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JumpToDateSheet(account: MatrixAccount, roomId: String, onClose: () -> Unit, onJump: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val state = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis())
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    FullSheet("Jump to Time", onClose, action = if (working) "…" else "Open", actionEnabled = !working, onAction = {
        val millis = state.selectedDateMillis ?: return@FullSheet
        working = true
        scope.launch {
            try {
                val json = account.clientRequest(TimelineNav.timestampToEventPath(roomId, Date(millis)))
                val eventId = json["event_id"].str()
                if (eventId != null) onJump(eventId) else error = "No message found at that time."
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            working = false
        }
    }) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            DatePicker(state, title = null)
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(16.dp)) }
        }
    }
}

/** Server-side message search in this room (`POST /search`); encrypted rooms cannot be searched there. */
@Composable
private fun SearchSheet(account: MatrixAccount, roomId: String, navigator: Navigator, onClose: () -> Unit, onJump: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var term by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var next by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var searched by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun load(fresh: Boolean) {
        val query = term.trim()
        if (query.isEmpty()) return
        loading = true
        scope.launch {
            try {
                val body = mapOf("search_categories" to mapOf("room_events" to mapOf(
                    "search_term" to query, "order_by" to "recent", "filter" to mapOf("rooms" to listOf(roomId)),
                )))
                val path = "/_matrix/client/v3/search" + (if (!fresh && next != null) "?next_batch=" + java.net.URLEncoder.encode(next, "UTF-8") else "")
                val json = account.clientRequest(path, body)
                val events = json["search_categories"].obj()?.get("room_events").obj()
                val hits = events?.get("results").objectsLenient().mapNotNull { it["result"].obj() }
                results = if (fresh) hits else results + hits
                next = events?.get("next_batch").str()
                searched = true
                error = null
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            loading = false
        }
    }
    FullSheet("Search Messages", onClose, background = Theme.chat) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(10.dp)).background(Theme.elevated).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = Theme.faint, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                InputField(term, { term = it }, "Search", imeAction = androidx.compose.ui.text.input.ImeAction.Search, onGo = { load(true) })
            }
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 16.dp)) }
            if (searched && results.isEmpty() && !loading) Text("No messages found. Encrypted messages cannot be searched on the server.", color = Theme.muted, modifier = Modifier.padding(16.dp))
            LazyColumn(Modifier.weight(1f)) {
                items(results) { event ->
                    val content = event["content"].obj()
                    val body = content?.get("m.new_content").obj()?.get("body").str() ?: content?.get("body").str() ?: ""
                    val sender = event["sender"].str() ?: ""
                    val target = content?.get("m.relates_to").obj()?.takeIf { it["rel_type"].str() == "m.replace" }?.get("event_id").str() ?: event["event_id"].str()
                    val ts = event["origin_server_ts"].long()
                    Row(
                        Modifier.fillMaxWidth().clickable { target?.let(onJump) }.padding(horizontal = 16.dp, vertical = 10.dp),
                    ) {
                        AvatarView(account.profiles[sender]?.avatarUrl, account.name(sender), 32.dp, account)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Row {
                                Text(account.name(sender), color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                ts?.let { Text("  " + ChatSettings.chatTimestamp(Date(it)), color = Theme.faint, fontSize = 12.sp) }
                            }
                            Text(body, color = Theme.text, fontSize = 15.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (next != null) item {
                    TextButton(onClick = { load(false) }, enabled = !loading, modifier = Modifier.padding(8.dp)) { Text("Load more") }
                }
                if (loading) item { CircularProgressIndicator(Modifier.padding(16.dp)) }
            }
        }
    }
}
