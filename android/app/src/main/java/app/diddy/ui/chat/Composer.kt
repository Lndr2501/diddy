package app.diddy.ui.chat

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DataObject
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FormatBold
import androidx.compose.material.icons.filled.FormatItalic
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.FormatStrikethrough
import androidx.compose.material.icons.filled.FormatUnderlined
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.EmojiEmotions
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import app.diddy.app.ChatSettings
import app.diddy.app.VoiceRecorder
import app.diddy.matrix.BotCommandStore
import app.diddy.matrix.ComposerDraft
import app.diddy.matrix.ComposerDraftStore
import app.diddy.matrix.ComposerFormat
import app.diddy.matrix.ComposerFormatter
import app.diddy.matrix.ComposerQuery
import app.diddy.matrix.ComposerServices
import app.diddy.matrix.ComposerSize
import app.diddy.matrix.ComposerToken
import app.diddy.matrix.EmojiCatalog
import app.diddy.matrix.ImagePack
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MemberStore
import app.diddy.matrix.MessageRow
import app.diddy.matrix.MusicCard
import app.diddy.matrix.SlashCommand
import app.diddy.matrix.TimelineController
import app.diddy.media.VoiceFormat
import app.diddy.ui.AvatarView
import app.diddy.ui.MxcPicture
import app.diddy.ui.theme.Theme
import app.diddy.util.DiddyError
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.matrix.rustcomponents.sdk.EventOrTransactionId
import java.io.File

/** A file waiting to be sent, shown as a chip above the bar. */
class PendingFile(val name: String, val mime: String, val data: ByteArray, val uri: Uri?) {
    val id = System.nanoTime()
    val preview: android.graphics.Bitmap? by lazy {
        if (mime.startsWith("image/")) {
            val options = android.graphics.BitmapFactory.Options().apply { inSampleSize = 8 }
            android.graphics.BitmapFactory.decodeByteArray(data, 0, data.size, options)
        } else null
    }
}

/** The composer's state, kept by the chat so a reply or an edit can start from a message. */
class ComposerState(val account: MatrixAccount, val roomId: String) {
    var value by mutableStateOf(TextFieldValue(""))
    var tokens by mutableStateOf<Map<String, ComposerToken>>(emptyMap())
    var mentions by mutableStateOf<Map<String, String>>(emptyMap())
    var replyTo by mutableStateOf<MessageRow?>(null)
    var restoredReplyId by mutableStateOf<String?>(null)
    var editing by mutableStateOf<MessageRow?>(null)
    var pendingFiles by mutableStateOf<List<PendingFile>>(emptyList())
    var pendingMusic by mutableStateOf<MusicCard?>(null)
    var sending by mutableStateOf(false)
    var draftLoaded = false
    val focus = FocusRequester()

    val text: String get() = value.text

    fun setText(text: String, cursor: Int = text.length) {
        value = TextFieldValue(text, TextRange(cursor))
    }

    fun load() {
        if (draftLoaded) return
        ComposerDraftStore.load(account.id, roomId)?.let { saved ->
            setText(saved.text)
            tokens = saved.tokens
            restoredReplyId = saved.replyEventId
        }
        draftLoaded = true
    }

    fun save() {
        if (!draftLoaded || editing != null) return
        val replyId = (replyTo?.eventId as? EventOrTransactionId.EventId)?.eventId ?: restoredReplyId
        val saved = tokens + mentions.map { (name, id) -> "@$name" to ComposerToken.User(id) }
        ComposerDraftStore.save(ComposerDraft(text, saved, replyId), account.id, roomId)
    }

    fun insert(text: String) {
        val start = minOf(value.selection.start, value.selection.end)
        val end = maxOf(value.selection.start, value.selection.end)
        val next = value.text.substring(0, start) + text + value.text.substring(end)
        value = TextFieldValue(next, TextRange(start + text.length))
    }

    fun replaceWord(replacement: String) {
        val (text, cursor) = ComposerQuery.replacingWord(value.text, value.selection.start, value.selection.end, replacement)
        value = TextFieldValue(text, TextRange(cursor))
    }

    fun reply(row: MessageRow) {
        replyTo = row
        restoredReplyId = null
        editing = null
        runCatching { focus.requestFocus() }
    }

    fun startEditing(row: MessageRow, text: String) {
        editing = row
        replyTo = null
        val linked = Regex("""\[([^\]]+)\]\(https://matrix\.to/#/(@[^)\s]+)\)""")
        val found = mutableMapOf<String, String>()
        val readable = linked.replace(text) { match ->
            val label = match.groupValues[1].replace("\\", "").removePrefix("@")
            found[label] = match.groupValues[2]
            "@$label"
        }
        mentions = found
        setText(readable)
        runCatching { focus.requestFocus() }
    }

    fun clear() {
        setText("")
        mentions = emptyMap()
        tokens = emptyMap()
        replyTo = null
        restoredReplyId = null
        editing = null
    }
}

/** Reads a picked file from another app. */
private fun readUri(context: Context, uri: Uri): Triple<ByteArray, String, String>? = try {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri) ?: "application/octet-stream"
    var name = "attachment"
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0)?.let { name = it }
    }
    val data = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw DiddyError("The file could not be read.")
    Triple(data, name, mime)
} catch (_: Exception) {
    null
}

/**
 * The message composer (ios ChatView composer): suggestions, reply and edit context, files
 * waiting to be sent, and one rounded bar with attachments, text, emoji and mic or send.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Composer(
    state: ComposerState,
    controller: TimelineController,
    account: MatrixAccount,
    title: String,
    members: MemberStore,
    botCommands: BotCommandStore,
    packs: List<ImagePack>,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember { VoiceRecorder(context) }
    var attachMenu by remember { mutableStateOf(false) }
    var showEmoji by remember { mutableStateOf(false) }
    var cameraFile by remember { mutableStateOf<File?>(null) }
    val showFormat = remember { ChatSettings.editorToolbar }

    suspend fun addData(data: ByteArray, name: String, mime: String, uri: Uri?) {
        try {
            val config = try { account.clientRequest("/_matrix/media/v3/config") } catch (_: Exception) { null }
            if (ComposerSize.exceeds(data.size.toLong(), ComposerSize.uploadLimit(config))) throw DiddyError("File exceeds the server upload limit.")
            state.pendingFiles = state.pendingFiles + PendingFile(name, mime, data, uri)
        } catch (e: Exception) {
            controller.sendError = e.friendlyMessage
        }
    }

    fun addUris(uris: List<Uri>) {
        scope.launch {
            for (uri in uris) {
                val file = withContext(Dispatchers.IO) { readUri(context, uri) } ?: continue
                addData(file.first, file.second, file.third, uri)
            }
        }
    }

    val pickMedia = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(20)) { addUris(it) }
    val pickFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { addUris(it) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val file = cameraFile
        if (ok && file != null) scope.launch {
            addData(withContext(Dispatchers.IO) { file.readBytes() }, "photo.jpg", "image/jpeg", null)
            file.delete()
        }
    }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) recorder.start() else recorder.error = "Microphone access is off. Turn it on in Android's settings for Diddy."
    }

    LaunchedEffect(state.text) {
        controller.setTyping(state.text.isNotEmpty() && state.editing == null)
        delay(600)
        state.save()
    }
    LaunchedEffect(state.text) {
        if (BotCommandStore.mayBeCommand(state.text)) botCommands.refreshFromServer(controller.room, account)
    }

    fun send() {
        if (state.sending) return
        val original = state.text
        if (original.isBlank() && state.pendingFiles.isEmpty() && state.pendingMusic == null) return
        val allTokens = state.tokens + state.mentions.map { (name, id) -> "@$name" to ComposerToken.User(id) }
        val command = if (state.editing == null) SlashCommand.command(original) else null
        val reply = state.replyTo?.eventId ?: state.restoredReplyId?.let { EventOrTransactionId.EventId(it) }
        val edited = state.editing
        val message = ComposerFormatter.message(
            original, allTokens, ChatSettings.markdown, if (command?.sendsMessage == true) command else null,
            reply != null, state.replyTo?.sender, account.userId,
        )
        val files = state.pendingFiles
        val caption = original.trim()
        val music = if (edited == null) state.pendingMusic else null
        state.sending = true
        scope.launch {
            var success = true
            if (music != null) {
                if (!controller.sendMusic(music, account.client)) { state.sending = false; return@launch }
                state.pendingMusic = null
            }
            if (music != null && files.isEmpty() && caption.isEmpty()) {
                // nothing else to send
            } else if (files.isNotEmpty()) {
                for ((index, file) in files.withIndex()) {
                    if (controller.sendAttachment(context, file.data, file.name, file.mime, if (index == 0) caption else "", if (index == 0) reply else null, file.uri)) {
                        state.pendingFiles = state.pendingFiles.filter { it.id != file.id }
                    } else {
                        success = false
                        break
                    }
                }
            } else if (command != null && !command.sendsMessage) {
                try { ComposerServices.run(command, original, account, controller.roomId) } catch (e: Exception) { controller.sendError = e.friendlyMessage; success = false }
            } else if (edited != null) {
                if (message != null) success = controller.editComposed(edited, message)
            } else if (message != null) {
                success = controller.sendComposed(message, command, reply)
            }
            if (success && state.text == original) {
                state.clear()
                state.save()
            }
            state.sending = false
        }
    }

    Column(Modifier.fillMaxWidth().background(Theme.chat)) {
        // Suggestions: bot commands, people, slash commands, rooms, emoji.
        val query = ComposerQuery.current(state.text, state.value.selection.start, state.value.selection.end)
        Column(Modifier.fillMaxWidth().background(Theme.elevated)) {
            if (state.editing == null) botCommands.suggestions(state.text).forEach { command ->
                SuggestionRow(glyph = command.prefix, title = command.usage, subtitle = command.desc.ifEmpty { null }) {
                    state.setText(command.prefix + command.name + " ")
                }
            }
            if (state.editing == null && botCommands.suggestions(state.text).isEmpty()) botCommands.argumentMatch(state.text)?.let { match ->
                val hint = (if (match.option.required) "" else "optional · ") + match.option.name + (match.option.desc?.let { " — $it" } ?: "")
                if (match.choices.isEmpty()) SuggestionRow(title = match.command.usage, subtitle = hint) {}
                else match.choices.forEach { choice ->
                    SuggestionRow(title = choice, subtitle = hint) {
                        state.setText(state.text.dropLast(match.partial.length) + choice + " ")
                    }
                }
            }
            if (query is ComposerQuery.User) {
                members.members.filter {
                    it.userId != account.userId && (query.query.isEmpty() || it.name.contains(query.query, true) || it.userId.contains(query.query, true))
                }.take(6).forEach { member ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            state.mentions = state.mentions + (member.name to member.userId)
                            state.replaceWord("@${member.name} ")
                        }.padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AvatarView(member.avatarUrl, member.name, 28.dp, account)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(member.name, color = Theme.text, fontSize = 15.sp, maxLines = 1)
                            Text(member.userId, color = Theme.muted, fontSize = 12.sp, maxLines = 1)
                        }
                    }
                }
            }
            if (state.editing == null) SlashCommand.suggestions(state.text).take(6).forEach { command ->
                SuggestionRow(glyph = "/", title = "/" + command.raw, subtitle = command.description) { state.setText("/" + command.raw + " ") }
            }
            if (query is ComposerQuery.Room) {
                account.rooms.filter { it.isJoined && !it.isSpace && (query.query.isEmpty() || it.name.contains(query.query, true)) }.take(6).forEach { room ->
                    SuggestionRow(icon = Icons.Filled.Tag, title = room.name) {
                        val key = "#" + room.name
                        state.tokens = state.tokens + (key to ComposerToken.Room(room.canonicalAlias ?: room.id, emptyList()))
                        state.replaceWord("$key ")
                    }
                }
            }
            if (query is ComposerQuery.Emoticon && query.query.isNotEmpty()) {
                EmojiCatalog.search(query.query, 5).forEach { emoji ->
                    SuggestionRow(glyph = emoji.unicode, title = ":${emoji.shortcode}:") { state.replaceWord(emoji.unicode + " ") }
                }
                packs.flatMap { it.images(ImagePack.EMOTICON) }.filter { ImagePack.matches(it, query.query) }.take(5).forEach { image ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            val key = ":${image.shortcode}:"
                            state.tokens = state.tokens + (key to ComposerToken.Emoticon(image.url, image.shortcode))
                            state.replaceWord("$key ")
                        }.padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        MxcPicture(account, null, url = image.url, size = 64, modifier = Modifier.size(24.dp), contentScale = ContentScale.Fit, placeholder = {})
                        Spacer(Modifier.width(10.dp))
                        Text(":${image.shortcode}:", color = Theme.text, fontSize = 15.sp)
                    }
                }
            }
        }
        state.pendingMusic?.let { music ->
            Box(Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp)) {
                MusicCardView(music, account, interactive = false)
                Icon(
                    Icons.Filled.Close, "Remove song", tint = Color.White,
                    modifier = Modifier.align(Alignment.TopEnd).offset(10.dp, (-10).dp).size(22.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.7f))
                        .clickable(enabled = !state.sending) { state.pendingMusic = null }.padding(4.dp),
                )
            }
        }
        if (state.pendingFiles.isNotEmpty()) {
            Column(Modifier.padding(horizontal = 14.dp).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.pendingFiles.forEach { file ->
                        Box {
                            Box(Modifier.size(72.dp).clip(RoundedCornerShape(10.dp)).background(Theme.elevated), contentAlignment = Alignment.Center) {
                                val preview = file.preview
                                if (preview != null) Image(preview.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.size(72.dp))
                                else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(Icons.AutoMirrored.Filled.InsertDriveFile, null, tint = Theme.muted)
                                    Text(file.name, color = Theme.muted, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp))
                                }
                            }
                            Icon(
                                Icons.Filled.Close, "Remove", tint = Color.White,
                                modifier = Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp).size(22.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.7f))
                                    .clickable(enabled = !state.sending) { state.pendingFiles = state.pendingFiles.filter { it.id != file.id } }.padding(4.dp),
                            )
                        }
                    }
                }
                if (controller.uploadingAttachment) Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("Uploading…", color = Theme.muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = { controller.cancelAttachment() }) { Text("Cancel", fontWeight = FontWeight.SemiBold) }
                }
            }
        }
        if (showFormat) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp)) {
                ComposerFormat.entries.forEach { format ->
                    Icon(
                        formatIcon(format), format.title, tint = Theme.muted,
                        modifier = Modifier.size(38.dp, 32.dp).clickable {
                            val (text, start, end) = format.apply(state.value.text, state.value.selection.min, state.value.selection.max)
                            state.value = TextFieldValue(text, TextRange(start, end))
                        }.padding(6.dp),
                    )
                }
            }
        }
        if (state.replyTo == null && state.restoredReplyId != null) {
            ContextBar(Icons.AutoMirrored.Filled.Reply, buildAnnotatedString { withStyle(SpanStyle(color = Theme.muted)) { append("Replying to saved message") } }) {
                state.restoredReplyId = null
                state.save()
            }
        }
        state.replyTo?.let { reply ->
            ContextBar(Icons.AutoMirrored.Filled.Reply, buildAnnotatedString {
                withStyle(SpanStyle(color = Theme.muted)) { append("Replying to ") }
                withStyle(SpanStyle(color = Theme.text, fontWeight = FontWeight.Bold)) { append(reply.senderName) }
            }) { state.replyTo = null }
        }
        if (state.editing != null) {
            ContextBar(Icons.Filled.Edit, buildAnnotatedString { withStyle(SpanStyle(color = Theme.muted)) { append("Editing message") } }) {
                state.editing = null
                state.setText("")
            }
        }
        recorder.error?.let {
            Text(it, color = Theme.danger, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp).clickable { recorder.error = null })
        }
        // The bar: plus, text, emoji, then send or the microphone.
        Box(Modifier.padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(23.dp)).background(Theme.input).padding(horizontal = 4.dp, vertical = 3.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                if (state.editing == null) {
                    Box {
                        Box(Modifier.size(38.dp, 40.dp).clickable { attachMenu = true }, contentAlignment = Alignment.Center) {
                            Box(Modifier.size(30.dp).clip(CircleShape).background(Theme.text.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.Add, "Add attachment", tint = Theme.text, modifier = Modifier.size(18.dp))
                            }
                        }
                        DropdownMenu(attachMenu, { attachMenu = false }) {
                            DropdownMenuItem(text = { Text("Photos and Videos") }, leadingIcon = { Icon(Icons.Filled.PhotoLibrary, null) }, onClick = {
                                attachMenu = false
                                pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                            })
                            if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
                                DropdownMenuItem(text = { Text("Camera") }, leadingIcon = { Icon(Icons.Filled.PhotoCamera, null) }, onClick = {
                                    attachMenu = false
                                    val file = File(context.cacheDir, "camera-${System.nanoTime()}.jpg")
                                    cameraFile = file
                                    takePicture.launch(FileProvider.getUriForFile(context, context.packageName + ".files", file))
                                })
                            }
                            DropdownMenuItem(text = { Text("Files") }, leadingIcon = { Icon(Icons.AutoMirrored.Filled.InsertDriveFile, null) }, onClick = {
                                attachMenu = false
                                pickFiles.launch(arrayOf("*/*"))
                            })
                        }
                    }
                }
                Box(Modifier.weight(1f).heightIn(min = 40.dp).padding(horizontal = 8.dp, vertical = 10.dp), contentAlignment = Alignment.CenterStart) {
                    if (state.text.isEmpty()) {
                        Text(
                            when {
                                state.editing != null -> "Edit message"
                                state.pendingMusic != null -> "Add a message…"
                                state.pendingFiles.isNotEmpty() -> "Add a caption…"
                                else -> "Message $title"
                            },
                            color = Theme.faint, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    BasicTextField(
                        value = state.value,
                        onValueChange = { next ->
                            state.value = next
                            state.tokens = ComposerFormatter.pruned(state.tokens, next.text)
                        },
                        textStyle = TextStyle(color = Theme.text, fontSize = 16.sp),
                        cursorBrush = SolidColor(Theme.accent),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                        maxLines = 8,
                        modifier = Modifier.fillMaxWidth().focusRequester(state.focus),
                    )
                }
                if (state.editing == null) {
                    Icon(
                        Icons.Outlined.EmojiEmotions, "Emoji and stickers", tint = Theme.muted,
                        modifier = Modifier.size(36.dp, 40.dp).clickable { showEmoji = true }.padding(horizontal = 6.dp, vertical = 8.dp),
                    )
                }
                if (state.text.isNotBlank() || state.pendingFiles.isNotEmpty() || state.pendingMusic != null) {
                    Box(Modifier.size(38.dp, 40.dp).clickable(enabled = !state.sending) { send() }, contentAlignment = Alignment.Center) {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(Theme.accent.copy(alpha = if (state.sending) 0.6f else 1f)), contentAlignment = Alignment.Center) {
                            Icon(if (state.editing == null) Icons.Filled.ArrowUpward else Icons.Filled.Check, if (state.editing == null) "Send" else "Save edit", tint = Theme.onAccent, modifier = Modifier.size(18.dp))
                        }
                    }
                } else if (state.editing == null) {
                    Icon(
                        Icons.Filled.Mic, "Record voice message", tint = Theme.muted,
                        modifier = Modifier.size(36.dp, 40.dp).clickable {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) recorder.start()
                            else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                        }.padding(horizontal = 6.dp, vertical = 8.dp),
                    )
                }
            }
            if (recorder.isActive) RecordingBar(recorder, Modifier.matchParentSize()) {
                val recording = recorder.stop() ?: return@RecordingBar
                scope.launch {
                    val reply = state.replyTo?.eventId ?: state.restoredReplyId?.let { EventOrTransactionId.EventId(it) }
                    if (controller.sendVoice(recording, reply)) {
                        state.replyTo = null
                        state.restoredReplyId = null
                        state.save()
                    } else recorder.restore(recording)
                }
            }
        }
    }

    if (showEmoji) {
        EmojiPickerSheet(account, packs, onDismiss = { showEmoji = false }, onEmoji = { emoji ->
            state.insert(emoji)
            showEmoji = false
        }, onCustom = { image, sticker ->
            showEmoji = false
            if (sticker) {
                scope.launch {
                    try {
                        val content = mapOf(
                            "body" to (image.body ?: image.shortcode), "url" to image.url,
                            "info" to mapOf("w" to (image.width ?: 256), "h" to (image.height ?: 256), "mimetype" to (image.mimetype ?: "image/png")),
                        )
                        controller.room.sendRaw("m.sticker", app.diddy.util.Json.encode(content), null)
                    } catch (e: Exception) {
                        controller.sendError = e.friendlyMessage
                    }
                }
            } else {
                val key = ":${image.shortcode}:"
                state.tokens = state.tokens + (key to ComposerToken.Emoticon(image.url, image.shortcode))
                state.insert(key)
            }
        })
    }
}

private fun formatIcon(format: ComposerFormat): ImageVector = when (format) {
    ComposerFormat.BOLD -> Icons.Filled.FormatBold
    ComposerFormat.ITALIC -> Icons.Filled.FormatItalic
    ComposerFormat.UNDERLINE -> Icons.Filled.FormatUnderlined
    ComposerFormat.STRIKE -> Icons.Filled.FormatStrikethrough
    ComposerFormat.CODE -> Icons.Filled.Code
    ComposerFormat.SPOILER -> Icons.Filled.VisibilityOff
    ComposerFormat.QUOTE -> Icons.Filled.FormatQuote
    ComposerFormat.CODE_BLOCK -> Icons.Filled.DataObject
    ComposerFormat.ORDERED_LIST -> Icons.Filled.FormatListNumbered
    ComposerFormat.UNORDERED_LIST -> Icons.Filled.FormatListBulleted
    ComposerFormat.HEADING -> Icons.Filled.TextFields
    ComposerFormat.LINK -> Icons.Filled.Link
}

@Composable
private fun ContextBar(icon: ImageVector, text: androidx.compose.ui.text.AnnotatedString, onCancel: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(Theme.elevated).padding(start = 14.dp, end = 8.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = Theme.muted, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Icon(Icons.Filled.Cancel, "Cancel", tint = Theme.muted, modifier = Modifier.size(30.dp).clickable(onClick = onCancel).padding(5.dp))
    }
}

@Composable
private fun SuggestionRow(icon: ImageVector? = null, glyph: String? = null, title: String, subtitle: String? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(26.dp), contentAlignment = Alignment.Center) {
            if (icon != null) Icon(icon, null, tint = Theme.muted, modifier = Modifier.size(18.dp))
            else if (glyph != null) Text(glyph, color = Theme.muted, fontSize = 17.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, color = Theme.text, fontSize = 15.sp, maxLines = 1)
            subtitle?.let { Text(it, color = Theme.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/** While recording: time, live level bars, throw away and send. */
@Composable
private fun RecordingBar(recorder: VoiceRecorder, modifier: Modifier, onSend: () -> Unit) {
    Row(
        modifier.clip(RoundedCornerShape(23.dp)).background(Theme.input).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Delete, "Discard", tint = Theme.danger, modifier = Modifier.size(38.dp).clickable { recorder.cancel() }.padding(8.dp))
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (recorder.state == VoiceRecorder.State.RECORDING) Theme.danger else Theme.muted))
        Spacer(Modifier.width(8.dp))
        Text(VoiceFormat.time(recorder.elapsed), color = Theme.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(10.dp))
        Row(Modifier.weight(1f).heightIn(max = 28.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
            recorder.levels.takeLast(40).forEach { level ->
                Box(Modifier.width(3.dp).heightIn(min = 3.dp).padding(vertical = ((1 - level) * 12).dp).clip(CircleShape).background(Theme.accent))
            }
        }
        Box(Modifier.size(38.dp).clickable(onClick = onSend), contentAlignment = Alignment.Center) {
            Box(Modifier.size(30.dp).clip(CircleShape).background(Theme.accent), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.ArrowUpward, "Send voice message", tint = Theme.onAccent, modifier = Modifier.size(18.dp))
            }
        }
    }
}
