package app.diddy.ui.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.app.ChatSettings
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MentionText
import app.diddy.matrix.MessageRow
import app.diddy.matrix.TimelineLayout
import app.diddy.ui.AvatarView
import app.diddy.ui.MxcPicture
import app.diddy.ui.profile.DiddyBadgesRow
import app.diddy.ui.profile.DiddyNameText
import app.diddy.ui.theme.Theme
import java.text.DateFormat
import java.util.Date

/** "Today", "Yesterday" or the date, like the desktop's day divider. */
fun dayTitle(day: Date): String = when (TimelineLayout.day(day)) {
    TimelineLayout.Day.TODAY -> "Today"
    TimelineLayout.Day.YESTERDAY -> "Yesterday"
    else -> DateFormat.getDateInstance(DateFormat.LONG).format(day)
}

class MessageActions(
    val onProfile: (String) -> Unit,
    val onLink: (String) -> Unit,
    val onReact: (MessageRow, String) -> Unit,
    val onReactionInfo: (MessageRow, String) -> Unit,
    val onImage: (MessageRow) -> Unit,
    val onCardCommand: (String) -> Unit,
    val onReplyTap: (MessageRow) -> Unit,
    val onLongPress: (MessageRow) -> Unit,
    val onDoubleTap: (MessageRow) -> Unit,
)

/** One row of the chat (ios MessageRowView): a day divider, a room notice or a message. */
@Composable
fun MessageRowView(row: MessageRow, account: MatrixAccount, roomId: String, actions: MessageActions, highlighted: Boolean) {
    Column(Modifier.fillMaxWidth().background(if (highlighted) Theme.accent.copy(alpha = 0.18f) else Color.Transparent)) {
        row.dayDivider?.let {
            Text(
                dayTitle(it), color = Theme.faint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 2.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
        val body = row.body
        if (body is MessageRow.Body.Notice) NoticeLine(row, body.text) else MessageBubble(row, account, roomId, actions)
    }
}

@Composable
private fun NoticeLine(row: MessageRow, text: String) {
    val (icon, tint) = noticeSymbol(row)
    val shown = if (row.callCount > 1) TimelineLayout.callText(row.senderName, row.callCount) else text
    var time = ChatSettings.time(row.date)
    if (row.callCount > 1) row.lastCallDate?.let { time += "–" + ChatSettings.time(it) }
    Row(Modifier.fillMaxWidth().padding(horizontal = ChatStyle.edgePadding).padding(top = 8.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(ChatStyle.avatarSize), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint, modifier = Modifier.size(14.dp)) }
        Spacer(Modifier.width(ChatStyle.avatarSpacing))
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = Theme.muted)) { append(shown) }
                withStyle(SpanStyle(color = Theme.faint, fontSize = 11.sp)) { append("  $time") }
            },
            fontSize = 13.sp,
        )
    }
}

private fun noticeSymbol(row: MessageRow): Pair<ImageVector, Color> = when (row.membership) {
    TimelineLayout.Membership.JOINED -> Icons.AutoMirrored.Filled.ArrowForward to Theme.online
    TimelineLayout.Membership.INVITED -> Icons.Filled.PersonAdd to Theme.faint
    TimelineLayout.Membership.LEFT, TimelineLayout.Membership.REMOVED -> Icons.AutoMirrored.Filled.ArrowBack to Theme.faint
    TimelineLayout.Membership.BANNED -> Icons.Filled.Block to Theme.faint
    TimelineLayout.Membership.UNBANNED -> Icons.AutoMirrored.Filled.Undo to Theme.faint
    TimelineLayout.Membership.DECLINED -> Icons.Filled.Close to Theme.faint
    null -> Icons.Filled.Phone to Theme.faint
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(row: MessageRow, account: MatrixAccount, roomId: String, actions: MessageActions) {
    val body = row.body
    val mentionsMe = !row.isOwn && body is MessageRow.Body.Text &&
        (body.text.contains("@room") || account.userId in MentionText.userIds(body.text))
    Row(
        Modifier.fillMaxWidth()
            .background(if (mentionsMe) Theme.accent.copy(alpha = 0.1f) else Color.Transparent)
            .combinedClickable(onClick = {}, onLongClick = { actions.onLongPress(row) }, onDoubleClick = { actions.onDoubleTap(row) })
            .alpha(if (row.isPending) 0.6f else 1f),
    ) {
        if (mentionsMe) Box(Modifier.width(3.dp).height(1.dp))
        Column(Modifier.padding(top = if (row.showsHeader) 14.dp else 2.dp, bottom = if (mentionsMe) 4.dp else 0.dp)) {
            row.reply?.let { reply ->
                Row(
                    Modifier.padding(start = ChatStyle.edgePadding + ChatStyle.avatarSize / 2, end = ChatStyle.edgePadding)
                        .clickable { actions.onReplyTap(row) }.padding(bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.width(ChatStyle.avatarSize / 2 + ChatStyle.avatarSpacing - 6.dp).height(9.dp).padding(top = 4.dp).border(width = 2.dp, color = Theme.faint.copy(alpha = 0.7f), shape = RoundedCornerShape(topStart = 6.dp)))
                    Spacer(Modifier.width(5.dp))
                    AvatarView(reply.avatar, reply.sender, 16.dp, account)
                    Spacer(Modifier.width(5.dp))
                    DiddyNameText(reply.sender, account.diddyProfiles[reply.senderId], 12.sp, FontWeight.SemiBold, Theme.muted)
                    Spacer(Modifier.width(5.dp))
                    Text(MentionText.readable(reply.text) { account.name(it) }, color = Theme.faint, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(Modifier.padding(horizontal = ChatStyle.edgePadding)) {
                if (row.showsHeader) {
                    Box(Modifier.clip(CircleShape).clickable { actions.onProfile(row.sender) }) {
                        AvatarView(row.senderAvatar, row.senderName, ChatStyle.avatarSize, account)
                    }
                } else Spacer(Modifier.width(ChatStyle.avatarSize))
                Spacer(Modifier.width(ChatStyle.avatarSpacing))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (row.showsHeader) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.weight(1f, fill = false).clickable { actions.onProfile(row.sender) }) {
                                DiddyNameText(row.senderName, account.diddyProfiles[row.sender], ChatStyle.nameSize, FontWeight.SemiBold, Theme.text)
                            }
                            account.diddyBadges[row.sender]?.let { DiddyBadgesRow(it, 13.dp, account) }
                            Spacer(Modifier.width(6.dp))
                            Text(ChatSettings.time(row.date), color = Theme.faint, fontSize = ChatStyle.timeSize, maxLines = 1)
                        }
                    }
                    Content(row, account, roomId, actions)
                    if (row.previewUrls.isNotEmpty()) LinkPreviewStrip(row.previewUrls, account, row.previewsLocal)
                    if (row.reactions.isNotEmpty()) {
                        FlowRow(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            row.reactions.forEach { reaction ->
                                Row(
                                    Modifier.clip(CircleShape).background(if (reaction.mine) Theme.accent.copy(alpha = 0.18f) else Theme.elevated)
                                        .border(1.dp, if (reaction.mine) Theme.accent.copy(alpha = 0.55f) else Color.Transparent, CircleShape)
                                        .combinedClickable(onClick = { actions.onReact(row, reaction.key) }, onLongClick = { actions.onReactionInfo(row, reaction.key) })
                                        .padding(horizontal = 8.dp, vertical = 5.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    ReactionKey(reaction.key, account)
                                    Spacer(Modifier.width(4.dp))
                                    Text("${reaction.count}", color = if (reaction.mine) Theme.text else Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                    if (row.sendFailed) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.ErrorOutline, null, tint = Theme.danger, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Not sent", color = Theme.danger, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

/** An emoji, or a custom emoji picture for an `mxc://` key. */
@Composable
fun ReactionKey(key: String, account: MatrixAccount) {
    if (key.startsWith("mxc://")) MxcPicture(account, null, url = key, size = 64, modifier = Modifier.size(18.dp), contentScale = androidx.compose.ui.layout.ContentScale.Fit, placeholder = {})
    else Text(key, fontSize = 15.sp)
}

@Composable
private fun Content(row: MessageRow, account: MatrixAccount, roomId: String, actions: MessageActions) {
    when (val body = row.body) {
        is MessageRow.Body.Text -> when {
            row.card != null -> BotCardView(row.card, account, actions.onCardCommand)
            row.music != null -> MusicCardView(row.music, account)
            row.location != null -> LocationView(row.location)
            else -> TextBody(body.text, row, account, roomId, actions)
        }
        is MessageRow.Body.Image -> if (row.isSticker) StickerView(account, body.source, body.width, body.height) else {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ChatImage(account, body.source, row.imageThumbnail, body.width, body.height) { actions.onImage(row) }
                Caption(row, account, roomId, actions)
            }
        }
        is MessageRow.Body.Audio -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            VoiceMessageView(row.id, body.audio, account)
            Caption(row, account, roomId, actions)
        }
        is MessageRow.Body.File -> {
            val video = row.video
            if (video != null) VideoMessageView(video, account) else Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                FileAttachment(account, body.label, body.filename, body.source, body.mimeType)
                Caption(row, account, roomId, actions)
            }
        }
        MessageRow.Body.Undecryptable -> Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Lock, null, tint = Theme.faint, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text("Waiting for this message's key. Verify this device in Settings.", color = Theme.faint, fontSize = 13.sp)
        }
        MessageRow.Body.Redacted -> Text("Message deleted", color = Theme.faint, fontSize = 13.sp)
        is MessageRow.Body.Notice -> Text(body.text, color = Theme.muted, fontSize = ChatStyle.bodySize)
    }
}

@Composable
private fun Caption(row: MessageRow, account: MatrixAccount, roomId: String, actions: MessageActions) {
    val caption = row.caption ?: return
    MessageText(caption, row.captionRich, false, false, account, onLink = actions.onLink)
    ResolveMentions(caption, account, roomId)
}

@Composable
private fun TextBody(text: String, row: MessageRow, account: MatrixAccount, roomId: String, actions: MessageActions) {
    MessageText(text, row.rich, row.richItalic, row.isEdited, account, onLink = actions.onLink)
    ResolveMentions(text, account, roomId)
}

/** Names of mentioned people the account does not know yet are looked up once. */
@Composable
private fun ResolveMentions(text: String, account: MatrixAccount, roomId: String) {
    LaunchedEffect(text) {
        val unknown = MentionText.userIds(text).filter { it !in account.profiles }
        if (unknown.isNotEmpty()) account.resolveProfiles(unknown, roomId)
    }
}
