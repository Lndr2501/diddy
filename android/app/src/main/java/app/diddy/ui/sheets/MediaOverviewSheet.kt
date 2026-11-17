package app.diddy.ui.sheets

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.app.ChatSettings
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MessageRow
import app.diddy.matrix.TimelineController
import app.diddy.ui.FullSheet
import app.diddy.ui.MxcPicture
import app.diddy.ui.chat.FileAttachment
import app.diddy.ui.chat.ImageViewer
import app.diddy.ui.chat.VideoMessageView
import app.diddy.ui.theme.Theme
import kotlinx.coroutines.launch

private enum class MediaKind(val title: String) { PICTURES("Pictures"), VIDEOS("Videos"), FILES("Files") }

/**
 * Pictures, videos and files of a channel in one place (ios MediaOverviewView). It reads the
 * channel's own timeline and goes back page by page, so it finds what was shared before too.
 */
@Composable
fun MediaOverviewSheet(account: MatrixAccount, roomId: String, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var controller by remember(roomId) { mutableStateOf<TimelineController?>(null) }
    var kind by remember { mutableStateOf(MediaKind.PICTURES) }
    var viewed by remember { mutableStateOf<MessageRow.Body.Image?>(null) }
    LaunchedEffect(roomId) {
        runCatching { account.waitForRoom(roomId) }
        val room = account.room(roomId) ?: return@LaunchedEffect
        val made = TimelineController(room, account.userId, account.summary(roomId)?.isDirect == true)
        controller = made
        made.start()
        // A few more pages up front, so a quiet channel already shows its older media.
        repeat(4) { if (!made.reachedStart) made.paginate() }
    }
    DisposableEffect(roomId) { onDispose { controller?.close() } }
    FullSheet("Media & Files", onClose, closeLabel = "Done") {
        val current = controller
        if (current == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
            return@FullSheet
        }
        // Newest first, which is what people look for in an overview.
        val rows = current.rows.asReversed()
        val pictures = rows.filter { it.body is MessageRow.Body.Image && !it.isSticker }
        val videos = rows.filter { it.video != null }
        val files = rows.filter { it.body is MessageRow.Body.File && it.video == null }
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MediaKind.entries.forEach { k ->
                    Text(
                        k.title, color = if (kind == k) Theme.onAccent else Theme.text, fontSize = 14.sp,
                        modifier = Modifier.clip(CircleShape).background(if (kind == k) Theme.accent else Theme.elevated)
                            .clickable { kind = k }.padding(horizontal = 14.dp, vertical = 7.dp),
                    )
                }
            }
            val shown = when (kind) {
                MediaKind.PICTURES -> pictures
                MediaKind.VIDEOS -> videos
                MediaKind.FILES -> files
            }
            LazyVerticalGrid(
                GridCells.Adaptive(if (kind == MediaKind.PICTURES) 104.dp else 1000.dp),
                Modifier.weight(1f).padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(if (kind == MediaKind.PICTURES) 6.dp else 12.dp),
            ) {
                items(shown, key = { it.id }) { row ->
                    when (kind) {
                        MediaKind.PICTURES -> {
                            val image = row.body as MessageRow.Body.Image
                            MxcPicture(
                                account, row.imageThumbnail ?: image.source, size = 320,
                                modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(6.dp)).clickable { viewed = image },
                            )
                        }
                        MediaKind.VIDEOS -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            row.video?.let { VideoMessageView(it, account) }
                            Caption(row)
                        }
                        MediaKind.FILES -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            val file = row.body as MessageRow.Body.File
                            FileAttachment(account, file.label, file.filename, file.source, file.mimeType)
                            Caption(row)
                        }
                    }
                }
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                        when {
                            current.loading -> CircularProgressIndicator(color = Theme.accent)
                            !current.reachedStart -> TextButton(onClick = { scope.launch { repeat(3) { if (!current.reachedStart) current.paginate() } } }) {
                                Text("Load older")
                            }
                            shown.isEmpty() -> Text("Nothing shared here yet.", color = Theme.muted)
                            else -> Text("That is everything.", color = Theme.faint, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
    viewed?.let { image -> ImageViewer(account, image.source, image.filename) { viewed = null } }
}

@Composable
private fun Caption(row: MessageRow) {
    Text("${row.senderName} · ${ChatSettings.chatTimestamp(row.date)}", color = Theme.faint, fontSize = 12.sp)
}
