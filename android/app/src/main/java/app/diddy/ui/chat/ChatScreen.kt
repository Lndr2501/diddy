package app.diddy.ui.chat

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DataObject
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleEventEffect
import app.diddy.app.MatrixToLink
import app.diddy.app.Sounds
import app.diddy.matrix.BotCommandStore
import app.diddy.matrix.ComposerServices
import app.diddy.matrix.ImagePack
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MemberStore
import app.diddy.matrix.MentionText
import app.diddy.matrix.MessageRow
import app.diddy.matrix.PresenceStore
import app.diddy.matrix.RoomNotifyLevel
import app.diddy.matrix.TimelineController
import app.diddy.matrix.TimelineLayout
import app.diddy.matrix.TimelineNav
import app.diddy.matrix.loadDiddyProfiles
import app.diddy.matrix.notifyLevel
import app.diddy.matrix.refreshNotifyLevel
import app.diddy.ui.AvatarView
import app.diddy.ui.MessageDialog
import app.diddy.ui.Navigator
import app.diddy.ui.Sheet
import app.diddy.ui.call.ChatCallBanner
import app.diddy.ui.call.startCall
import app.diddy.ui.home.NotifyLevelMenu
import app.diddy.ui.home.copyToClipboard
import app.diddy.ui.home.icon
import app.diddy.ui.profile.PresenceDot
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.RoomMessageEventContentWithoutRelation

val quickReactions = listOf("👍", "❤️", "😂", "😮", "😢", "🔥", "👀", "✅")

/** A sheet the chat opens over itself (ios TimelineNavSheet). */
sealed class NavSheet {
    data class Readers(val eventId: String) : NavSheet()
    data class Reactions(val key: String, val senders: List<String>) : NavSheet()
    data class Report(val eventId: String) : NavSheet()
    data class Delete(val row: MessageRow) : NavSheet()
    data class Source(val row: MessageRow) : NavSheet()
    data class History(val row: MessageRow) : NavSheet()
    data class Thread(val root: String) : NavSheet()
    data object Pinned : NavSheet()
    data object JumpToDate : NavSheet()
    data object Search : NavSheet()
}

/** One chat (ios ChatView): header, call banner, messages and the composer. */
@Composable
fun ChatScreen(account: MatrixAccount, roomId: String, navigator: Navigator, onBack: () -> Unit) {
    var controller by remember(roomId) { mutableStateOf<TimelineController?>(null) }
    LaunchedEffect(roomId) {
        if (controller != null) return@LaunchedEffect
        try { account.waitForRoom(roomId) } catch (_: Exception) {}
        val room = account.room(roomId) ?: return@LaunchedEffect
        val created = TimelineController(room, account.userId, account.summary(roomId)?.isDirect == true)
        controller = created
        created.start()
    }
    DisposableEffect(roomId) {
        Sounds.openRoomId = roomId
        app.diddy.push.Notifications.clearRoom(account, roomId)
        onDispose {
            controller?.setTyping(false)
            controller?.close()
            if (Sounds.openRoomId == roomId) Sounds.openRoomId = null
        }
    }
    BackHandler(onBack = onBack)
    Box(Modifier.fillMaxSize().background(Theme.chat)) {
        val current = controller
        if (current == null) {
            CircularProgressIndicator(Modifier.align(Alignment.Center), color = Theme.accent)
        } else {
            ChatContent(account, current, navigator, onBack)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatContent(account: MatrixAccount, controller: TimelineController, navigator: Navigator, onBack: () -> Unit) {
    val roomId = controller.roomId
    val summary = account.summary(roomId)
    val title = summary?.name ?: "Channel"
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    val haptics = LocalHapticFeedback.current
    val composer = remember(roomId) {
        ComposerState(account, roomId).also { state ->
            state.load()
            // Something shared from another app for this chat: draft text and attachments.
            app.diddy.app.ShareInbox.take(roomId)?.let { share ->
                if (share.text.isNotEmpty()) state.setText(if (state.text.isEmpty()) share.text else state.text + "\n" + share.text)
                state.pendingFiles = state.pendingFiles + share.files.map { PendingFile(it.name, it.mime, it.data, null) }
            }
        }
    }
    val members = remember(roomId) { MemberStore() }
    val botCommands = remember(roomId) { BotCommandStore() }
    var packs by remember(roomId) { mutableStateOf<List<ImagePack>>(emptyList()) }
    var canSend by remember(roomId) { mutableStateOf(true) }
    var actionRow by remember { mutableStateOf<MessageRow?>(null) }
    var reactingTo by remember { mutableStateOf<MessageRow?>(null) }
    var viewedImage by remember { mutableStateOf<MessageRow?>(null) }
    var navSheet by remember { mutableStateOf<NavSheet?>(null) }
    var highlighted by remember { mutableStateOf<String?>(null) }
    var notifyError by remember { mutableStateOf<String?>(null) }
    val list = rememberLazyListState()

    LaunchedEffect(roomId) {
        account.refreshNotifyLevel(roomId)
        packs = ComposerServices.packs(account, roomId)
    }
    LaunchedEffect(roomId) {
        account.loadDiddyProfiles()
        members.load(account, roomId)
        canSend = try {
            controller.room.getPowerLevels().canOwnUserSendMessage(uniffi.ruma_events.MessageLikeEventType.RoomMessage)
        } catch (_: Exception) { true }
    }
    LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_PAUSE) { composer.save() }
    DisposableEffect(roomId) { onDispose { composer.save() } }

    val rows = controller.rows
    val reversed = remember(rows) { rows.asReversed() }
    val atBottom by remember { derivedStateOf { list.firstVisibleItemIndex <= 1 } }
    // Newest message: follow it while at the bottom (or when it is your own) and mark as read.
    LaunchedEffect(rows.lastOrNull()?.id) {
        if (atBottom || rows.lastOrNull()?.isOwn == true) list.animateScrollToItem(0)
        if (atBottom) controller.markRead()
    }
    // Older pages load when the top comes near.
    LaunchedEffect(list) {
        snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }.collect { last ->
            if (last >= reversed.size - 8 && !controller.reachedStart && !controller.loading) controller.loadOlderMessages()
        }
    }
    LaunchedEffect(navigator.searchTarget) {
        val target = navigator.searchTarget ?: return@LaunchedEffect
        if (target.roomId != roomId) return@LaunchedEffect
        navigator.searchTarget = null
        jumpTo(controller, target.eventId, reversed, list) { highlighted = it }
    }

    fun handleLink(url: String) {
        when (val link = MatrixToLink.parse(url)) {
            is MatrixToLink.Room -> { navigator.show(Sheet.JoinLink(link.roomIdOrAlias, link.via)); return }
            is MatrixToLink.Event -> { navigator.show(Sheet.JoinLink(link.roomIdOrAlias, link.via, link.eventId)); return }
            else -> {}
        }
        val user = MentionText.userId(url)
        if (user != null) navigator.show(Sheet.Profile(user, roomId)) else runCatching { uri.openUri(url) }
    }

    val actions = remember(controller) {
        MessageActions(
            onProfile = { navigator.show(Sheet.Profile(it, roomId)) },
            onLink = ::handleLink,
            onReact = { row, key -> scope.launch { controller.toggleReaction(key, row) } },
            onReactionInfo = { row, key -> navSheet = NavSheet.Reactions(key, controller.nav.snapshot.reactionSenders[row.id]?.get(key) ?: emptyList()) },
            onImage = { viewedImage = it },
            onCardCommand = { scope.launch { controller.sendCardAction(it) } },
            onReplyTap = { row ->
                controller.nav.snapshot.replyTargets[row.id]?.let { target ->
                    scope.launch { jumpTo(controller, target, reversed, list) { highlighted = it } }
                }
            },
            onLongPress = { row ->
                if (row.layoutKind == TimelineLayout.Kind.MESSAGE) {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    actionRow = row
                }
            },
            onDoubleTap = { row ->
                if (row.body is MessageRow.Body.Text && row.card == null && row.music == null && !row.isRedactedMessage) {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    scope.launch { controller.toggleReaction("❤️", row) }
                }
            },
        )
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        ChatHeader(account, roomId, title, onBack, onInfo = { navigator.show(Sheet.ChannelInfo(roomId)) },
            onCall = { scope.launch { startCall(account, roomId, title, navigator) } },
            onSearch = { navSheet = NavSheet.Search }, onMembers = { navigator.show(Sheet.Members(roomId)) },
            onPinned = { navSheet = NavSheet.Pinned }, onJump = { navSheet = NavSheet.JumpToDate }, onError = { notifyError = it })
        ChatCallBanner(account, roomId, title, navigator)
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val divider = controller.nav.dividerRowId(account.userId)
            LazyColumn(state = list, reverseLayout = true, modifier = Modifier.fillMaxSize()) {
                item(key = "following") { FollowingLine(account, controller) { navSheet = NavSheet.Readers(it) } }
                items(reversed, key = { it.id }) { row ->
                    Column {
                        if (divider == row.id) NewMessagesDivider()
                        MessageRowView(row, account, roomId, actions, highlighted == row.id)
                        controller.nav.snapshot.threads[row.id]?.let { info ->
                            row.remoteEventId?.let { eventId -> ThreadSummaryButton(info) { navSheet = NavSheet.Thread(eventId) } }
                        }
                        if (controller.nav.isPinned(row.remoteEventId)) {
                            Row(Modifier.padding(start = ChatStyle.textLeading, top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.PushPin, null, tint = Theme.faint, modifier = Modifier.size(11.dp))
                                Spacer(Modifier.width(3.dp))
                                Text("Pinned", color = Theme.faint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                item(key = "start") {
                    if (controller.reachedStart) ChannelIntro(title, summary?.topic, summary?.isDirect == true)
                    else Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), color = Theme.muted, strokeWidth = 2.dp) }
                }
            }
            TypingPill(account, controller, Modifier.align(Alignment.BottomStart))
            androidx.compose.animation.AnimatedVisibility(visible = !atBottom, modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp), enter = fadeIn(), exit = fadeOut()) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(Theme.elevated).border(1.dp, Theme.faint.copy(alpha = 0.4f), CircleShape)
                        .clickable { scope.launch { list.animateScrollToItem(0) } },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.KeyboardArrowDown, "Jump to latest messages", tint = Theme.text) }
            }
        }
        if (canSend) {
            Box(Modifier.navigationBarsPadding()) {
                Composer(composer, controller, account, title, members, botCommands, packs)
            }
        } else {
            Text(
                "You do not have permission to send messages here.", color = Theme.muted, fontSize = 13.sp,
                modifier = Modifier.fillMaxWidth().background(Theme.chat).navigationBarsPadding().padding(14.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }

    actionRow?.let { row ->
        MessageActionsSheet(row, account, controller, onDismiss = { actionRow = null },
            onReact = { emoji -> actionRow = null; scope.launch { controller.toggleReaction(emoji, row) } },
            onMoreReactions = { actionRow = null; reactingTo = row },
            onReply = { actionRow = null; composer.reply(row) },
            onEdit = { text -> actionRow = null; composer.startEditing(row, text) },
            onCopy = { text -> actionRow = null; copyToClipboard(context, MentionText.readable(text) { account.name(it) }) },
            onNav = { sheet -> actionRow = null; navSheet = sheet },
            onProfile = { actionRow = null; navigator.show(Sheet.Profile(row.sender, roomId)) },
        )
    }
    reactingTo?.let { row ->
        EmojiPickerSheet(account, emptyList(), onDismiss = { reactingTo = null }, onEmoji = { emoji ->
            reactingTo = null
            scope.launch {
                controller.toggleReaction(emoji, row)
                account.addRecentEmoji(emoji)
            }
        })
    }
    viewedImage?.let { row ->
        val body = row.body as? MessageRow.Body.Image
        if (body != null) ImageViewer(account, body.source, body.filename) { viewedImage = null }
    }
    navSheet?.let { sheet ->
        TimelineNavSheetView(account, controller, sheet, navigator, onClose = { navSheet = null }) { eventId ->
            navSheet = null
            scope.launch { jumpTo(controller, eventId, controller.rows.asReversed(), list) { highlighted = it } }
        }
    }
    MessageDialog("Message", controller.sendError) { controller.sendError = null }
    MessageDialog("Notifications", notifyError) { notifyError = null }
}

/** Shows a message, loading older ones first, and highlights it for a moment. */
private suspend fun jumpTo(
    controller: TimelineController,
    eventId: String,
    @Suppress("UNUSED_PARAMETER") rows: List<MessageRow>,
    list: androidx.compose.foundation.lazy.LazyListState,
    highlight: (String?) -> Unit,
) {
    val rowId = controller.loadRowId(eventId) ?: return
    val index = controller.rows.asReversed().indexOfFirst { it.id == rowId }
    if (index < 0) return
    list.animateScrollToItem(index + 1)
    highlight(rowId)
    delay(2000)
    highlight(null)
}

@Composable
private fun ChatHeader(
    account: MatrixAccount,
    roomId: String,
    title: String,
    onBack: () -> Unit,
    onInfo: () -> Unit,
    onCall: () -> Unit,
    onSearch: () -> Unit,
    onMembers: () -> Unit,
    onPinned: () -> Unit,
    onJump: () -> Unit,
    onError: (String) -> Unit,
) {
    val summary = account.summary(roomId)
    var menu by remember { mutableStateOf(false) }
    var notifyMenu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().background(Theme.chat).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().height(54.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Theme.text, modifier = Modifier.size(44.dp).clickable(onClick = onBack).padding(10.dp))
            Row(Modifier.weight(1f).clickable(onClick = onInfo).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (summary?.isDirect == true) {
                    Box {
                        AvatarView(summary.avatarUrl, title, 34.dp, account)
                        PresenceDot(summary.dmUserId, account, 10.dp, Theme.chat, Modifier.align(Alignment.BottomEnd).offset(2.dp, 2.dp))
                    }
                } else {
                    Box(Modifier.size(34.dp).clip(CircleShape).background(Theme.elevated), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Tag, null, tint = Theme.muted, modifier = Modifier.size(18.dp))
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(title, color = Theme.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val dm = summary?.dmUserId
                    if (summary?.isDirect == true && dm != null) {
                        PresenceStore.of(account).state(dm)?.let { Text(it.title, color = Theme.muted, fontSize = 12.sp) }
                    } else if ((summary?.memberCount ?: 0) > 0) {
                        Text(if (summary!!.memberCount == 1L) "1 member" else "${summary.memberCount} members", color = Theme.muted, fontSize = 12.sp, maxLines = 1)
                    }
                }
            }
            Icon(Icons.Filled.Phone, "Start voice call", tint = Theme.muted, modifier = Modifier.size(44.dp).clickable(onClick = onCall).padding(11.dp))
            Box {
                Icon(Icons.Filled.MoreVert, "More", tint = Theme.muted, modifier = Modifier.size(44.dp).clickable { menu = true }.padding(11.dp))
                DropdownMenu(menu, { menu = false }) {
                    MenuItem("Details", Icons.Filled.Info) { menu = false; onInfo() }
                    MenuItem("Search Messages", Icons.Filled.Search) { menu = false; onSearch() }
                    MenuItem("Members", Icons.Filled.Group) { menu = false; onMembers() }
                    HorizontalDivider()
                    MenuItem("Pinned Messages", Icons.Outlined.PushPin) { menu = false; onPinned() }
                    MenuItem("Jump to Time", Icons.Filled.CalendarMonth) { menu = false; onJump() }
                    HorizontalDivider()
                    MenuItem("Notifications", account.notifyLevel(roomId).icon) { menu = false; notifyMenu = true }
                }
                NotifyLevelMenu(notifyMenu, { notifyMenu = false }, account, roomId, onError)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Theme.text.copy(alpha = 0.07f)))
    }
}

@Composable
private fun MenuItem(title: String, icon: ImageVector, color: androidx.compose.ui.graphics.Color = Theme.text, onClick: () -> Unit) {
    DropdownMenuItem(text = { Text(title, color = color) }, leadingIcon = { Icon(icon, null, tint = color) }, onClick = onClick)
}

@Composable
private fun ChannelIntro(title: String, topic: String?, isDirect: Boolean) {
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 40.dp, bottom = 8.dp)) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(Theme.elevated), contentAlignment = Alignment.Center) {
            Icon(if (isDirect) Icons.Filled.AccountCircle else Icons.Filled.Tag, null, tint = Theme.text, modifier = Modifier.size(34.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text(if (isDirect) title else "Welcome to #$title", color = Theme.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text(
            topic ?: if (isDirect) "This is the beginning of your direct message history with $title." else "This is the start of the #$title channel.",
            color = Theme.muted, fontSize = 15.sp,
        )
    }
}

/** The line above the first unread message, in a soft accent. */
@Composable
private fun NewMessagesDivider() {
    Row(Modifier.fillMaxWidth().padding(horizontal = ChatStyle.edgePadding).padding(top = 10.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f).height(1.dp).background(Theme.accent.copy(alpha = 0.45f)))
        Spacer(Modifier.width(8.dp))
        Text("NEW", color = Theme.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ThreadSummaryButton(info: app.diddy.matrix.ThreadInfo, onOpen: () -> Unit) {
    Row(
        Modifier.padding(start = ChatStyle.textLeading, end = ChatStyle.edgePadding, top = 2.dp).clip(RoundedCornerShape(8.dp))
            .background(Theme.elevated).clickable(onClick = onOpen).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Forum, null, tint = Theme.muted, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(if (info.replies == 1) "1 reply" else "${info.replies} replies", color = Theme.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        if (info.latestText.isNotEmpty()) {
            Spacer(Modifier.width(6.dp))
            Text("${info.latestSender}: ${info.latestText}", color = Theme.faint, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        }
        Spacer(Modifier.width(4.dp))
        Icon(Icons.Filled.ChevronRight, null, tint = Theme.faint, modifier = Modifier.size(14.dp))
    }
}

/** Who has read the newest message: small pictures at the right under the last message. */
@Composable
private fun FollowingLine(account: MatrixAccount, controller: TimelineController, onTap: (String) -> Unit) {
    val readers = controller.nav.latestReaders
    LaunchedEffect(readers) { if (readers.isNotEmpty()) account.resolveProfiles(readers, controller.roomId) }
    Box(Modifier.fillMaxWidth().height(22.dp).padding(horizontal = ChatStyle.edgePadding), contentAlignment = Alignment.CenterEnd) {
        if (readers.isNotEmpty()) {
            Row(Modifier.clickable { controller.nav.latestShownEventId?.let(onTap) }, verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy((-4).dp)) {
                    readers.take(4).forEach { userId ->
                        Box(Modifier.border(1.5.dp, Theme.chat, CircleShape)) {
                            AvatarView(account.profiles[userId]?.avatarUrl, account.name(userId), 16.dp, account)
                        }
                    }
                }
                if (readers.size > 4) Text("+${readers.size - 4}", color = Theme.faint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 4.dp))
            }
        }
    }
}

/** "Lndr is typing…" floating over the bottom left of the chat. */
@Composable
private fun TypingPill(account: MatrixAccount, controller: TimelineController, modifier: Modifier) {
    val ids = controller.typing.userIds
    if (ids.isEmpty()) return
    LaunchedEffect(ids) { account.resolveProfiles(ids, controller.roomId) }
    val names = ids.map { account.name(it) }
    val text = when (names.size) {
        1 -> "${names[0]} is typing…"
        2 -> "${names[0]} and ${names[1]} are typing…"
        else -> "Several people are typing…"
    }
    Row(
        modifier.padding(start = 12.dp, bottom = 4.dp).clip(CircleShape).background(Theme.elevated.copy(alpha = 0.95f))
            .border(1.dp, Theme.text.copy(alpha = 0.07f), CircleShape).padding(start = 9.dp, end = 11.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(3) {
            Box(Modifier.padding(horizontal = 1.dp).size(4.dp).clip(CircleShape).background(Theme.muted))
        }
        Spacer(Modifier.width(6.dp))
        Text(text, color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

/** Long press on a message: quick reactions on top, then the actions in three groups. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActionsSheet(
    row: MessageRow,
    account: MatrixAccount,
    controller: TimelineController,
    onDismiss: () -> Unit,
    onReact: (String) -> Unit,
    onMoreReactions: () -> Unit,
    onReply: () -> Unit,
    onEdit: (String) -> Unit,
    onCopy: (String) -> Unit,
    onNav: (NavSheet) -> Unit,
    onProfile: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val sheet = rememberModalBottomSheetState()
    val eventId = if (row.layoutKind == TimelineLayout.Kind.MESSAGE && !row.isRedactedMessage) row.remoteEventId else null
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Theme.sidebar) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            quickReactions.take(6).forEach { emoji ->
                Box(Modifier.size(46.dp).clip(CircleShape).background(Theme.elevated).clickable { onReact(emoji) }, contentAlignment = Alignment.Center) {
                    Text(emoji, fontSize = 24.sp)
                }
            }
            Box(Modifier.size(46.dp).clip(CircleShape).background(Theme.elevated).clickable(onClick = onMoreReactions), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Add, "More reactions", tint = Theme.text)
            }
        }
        Spacer(Modifier.height(8.dp))
        Column(Modifier.padding(bottom = 24.dp)) {
            ActionItem("Reply", Icons.AutoMirrored.Filled.Reply, onClick = onReply)
            if (eventId != null) ActionItem("Reply in Thread", Icons.Filled.Forum) {
                val root = controller.nav.snapshot.entries.firstOrNull { it.eventId == eventId }?.threadRoot
                onNav(NavSheet.Thread(root ?: eventId))
            }
            val body = row.body
            if (body is MessageRow.Body.Text) {
                ActionItem("Copy Text", Icons.Filled.ContentCopy) { onCopy(body.text) }
                if (row.isOwn) ActionItem("Edit Message", Icons.Filled.Edit) { onEdit(body.text) }
            }
            HorizontalDivider(Modifier.padding(vertical = 4.dp), color = Theme.text.copy(alpha = 0.07f))
            if (eventId != null) {
                if (controller.nav.canPin) {
                    val pinned = controller.nav.isPinned(eventId)
                    ActionItem(if (pinned) "Unpin Message" else "Pin Message", Icons.Outlined.PushPin) {
                        onDismiss()
                        scope.launch { controller.setPinned(eventId, !pinned) }
                    }
                }
                ActionItem("Copy Link", Icons.Filled.Link) {
                    onDismiss()
                    scope.launch { controller.permalink(eventId)?.let { copyToClipboard(context, it) } }
                }
                if (controller.nav.readers(eventId).isNotEmpty()) ActionItem("Read Receipts", Icons.Filled.TaskAlt) { onNav(NavSheet.Readers(eventId)) }
                if (row.isEdited) ActionItem("Edit History", Icons.Filled.History) { onNav(NavSheet.History(row)) }
            }
            ActionItem("View Profile", Icons.Filled.AccountCircle, onClick = onProfile)
            HorizontalDivider(Modifier.padding(vertical = 4.dp), color = Theme.text.copy(alpha = 0.07f))
            if (eventId != null) {
                ActionItem("View Source", Icons.Filled.DataObject) { onNav(NavSheet.Source(row)) }
                if (!row.isOwn) ActionItem("Report Message", Icons.Filled.Report) { onNav(NavSheet.Report(eventId)) }
            }
            if (row.layoutKind == TimelineLayout.Kind.MESSAGE && row.eventId != null &&
                TimelineNav.canDelete(row.isOwn, row.isRedactedMessage, controller.nav.canRedactOwn, controller.nav.canRedactOther)
            ) {
                ActionItem("Delete Message", Icons.Filled.Delete, Theme.danger) { onNav(NavSheet.Delete(row)) }
            }
        }
    }
}

@Composable
private fun ActionItem(title: String, icon: ImageVector, color: androidx.compose.ui.graphics.Color = Theme.text, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (color == Theme.text) Theme.muted else color, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Text(title, color = color, fontSize = 16.sp)
    }
}
