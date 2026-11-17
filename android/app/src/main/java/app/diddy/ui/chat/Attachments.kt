package app.diddy.ui.chat

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import app.diddy.app.ChatSettings
import app.diddy.app.VoiceWaveform
import app.diddy.matrix.LinkEmbedRules
import app.diddy.matrix.LinkPageFetcher
import app.diddy.matrix.LinkPreviewData
import app.diddy.matrix.LinkPreviewStore
import app.diddy.matrix.LocationAttachment
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MessageMediaSize
import app.diddy.matrix.VideoAttachment
import app.diddy.media.AudioAttachment
import app.diddy.media.MediaLoader
import app.diddy.media.MxcImage
import app.diddy.media.VoiceFormat
import app.diddy.media.VoicePlayer
import app.diddy.media.VoiceRate
import app.diddy.ui.MxcPicture
import app.diddy.ui.profile.diddyColor
import app.diddy.ui.theme.Theme
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.MediaSource
import java.io.File

/** Opens a downloaded file with whatever app handles its type. */
fun openFile(context: Context, file: File, mime: String?) {
    val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime ?: context.contentResolver.getType(uri) ?: "*/*")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        shareFile(context, file, mime)
    }
}

fun shareFile(context: Context, file: File, mime: String?) {
    val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
    val intent = Intent(Intent.ACTION_SEND).setType(mime ?: "*/*").putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** A picture in the chat: the sender's thumbnail when there is one, the original in the viewer. */
@Composable
fun ChatImage(account: MatrixAccount, source: MediaSource, thumbnail: MediaSource?, width: Double?, height: Double?, onOpen: () -> Unit) {
    var requested by remember { mutableStateOf(ChatSettings.autoLoadMedia) }
    val aspect = MessageMediaSize.aspect(width, height).toFloat()
    Box(
        Modifier.widthIn(max = 320.dp).fillMaxWidth().aspectRatio(aspect).clip(RoundedCornerShape(14.dp)).background(Theme.elevated)
            .clickable { if (requested) onOpen() else requested = true },
        contentAlignment = Alignment.Center,
    ) {
        if (requested) {
            MxcPicture(
                account, thumbnail ?: source, size = if (thumbnail != null) null else 800, modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                placeholder = { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), color = Theme.muted, strokeWidth = 2.dp) } },
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Image, null, tint = Theme.muted, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Tap to load", color = Theme.muted, fontSize = 13.sp)
            }
        }
    }
}

/** A sticker: 152 wide like desktop's `MSticker`, without a frame. */
@Composable
fun StickerView(account: MatrixAccount, source: MediaSource, width: Double?, height: Double?) {
    val (w, h) = MessageMediaSize.sticker(width, height)
    MxcPicture(account, source, size = 456, modifier = Modifier.size(w.dp, h.dp), contentScale = ContentScale.Fit, placeholder = {})
}

/** Full-screen picture with pinch to zoom, share and close. */
@Composable
fun ImageViewer(account: MatrixAccount, source: MediaSource, filename: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    val state = rememberTransformableState { zoom, pan, _ ->
        scale = (scale * zoom).coerceIn(1f, 6f)
        offset = if (scale == 1f) Offset.Zero else offset + pan
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AsyncImage(
                model = ImageRequest.Builder(context).data(MxcImage(account, source, null)).build(),
                contentDescription = filename,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().transformable(state)
                    .pointerInput(Unit) { detectTapGestures(onDoubleTap = { scale = if (scale > 1f) 1f else 2.5f; offset = Offset.Zero }) }
                    .graphicsLayer(scaleX = scale, scaleY = scale, translationX = offset.x, translationY = offset.y),
            )
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp)) {
                Icon(Icons.Filled.Close, "Close", tint = Color.White, modifier = Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onClose).padding(10.dp))
                Spacer(Modifier.weight(1f))
                Icon(Icons.Filled.Share, "Share", tint = Color.White, modifier = Modifier.size(44.dp).clip(CircleShape).clickable {
                    scope.launch { MediaLoader.file(source, filename.ifBlank { "image.jpg" }, account)?.let { shareFile(context, it, "image/*") } }
                }.padding(10.dp))
            }
        }
    }
}

/** A file: name and an icon; a tap downloads (and decrypts) it and opens it in another app. */
@Composable
fun FileAttachment(account: MatrixAccount, label: String, filename: String, source: MediaSource, mimeType: String?) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Row(
        Modifier.widthIn(max = 320.dp).clip(RoundedCornerShape(10.dp)).background(Theme.elevated).clickable(enabled = !busy) {
            busy = true
            scope.launch {
                MediaLoader.file(source, filename, account)?.let { openFile(context, it, mimeType) }
                busy = false
            }
        }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.AutoMirrored.Filled.InsertDriveFile, null, tint = Theme.accent, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(10.dp))
        Text(label.removePrefix("📎 ").removePrefix("🎬 "), color = Theme.text, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        Spacer(Modifier.width(10.dp))
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.muted)
        else Icon(Icons.Filled.Download, "Open", tint = Theme.muted, modifier = Modifier.size(20.dp))
    }
}

/** A voice message or audio file with play, the waveform, time and the speed button. */
@Composable
fun VoiceMessageView(id: String, audio: AudioAttachment, account: MatrixAccount) {
    val current = VoicePlayer.currentId == id
    val playing = current && VoicePlayer.isPlaying
    val fraction = if (current) VoicePlayer.fraction.toFloat() else 0f
    Row(
        Modifier.widthIn(max = 320.dp).clip(RoundedCornerShape(22.dp)).background(Theme.elevated).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(Theme.accent).clickable { VoicePlayer.toggle(id, audio, account) },
            contentAlignment = Alignment.Center,
        ) {
            if (current && VoicePlayer.isLoading) CircularProgressIndicator(Modifier.size(18.dp), color = Theme.onAccent, strokeWidth = 2.dp)
            else Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (playing) "Pause" else "Play", tint = Theme.onAccent)
        }
        Spacer(Modifier.width(8.dp))
        val bars = remember(audio) { VoiceWaveform.bars(audio.waveform, 36) }
        Canvas(
            Modifier.weight(1f).height(30.dp).pointerInput(id) {
                detectTapGestures { offset -> VoicePlayer.seek(id, (offset.x / size.width).toDouble()) }
            },
        ) {
            val gap = 2.dp.toPx()
            val barWidth = (size.width - gap * (bars.size - 1)) / bars.size
            bars.forEachIndexed { i, value ->
                val h = maxOf(3.dp.toPx(), size.height * value)
                val x = i * (barWidth + gap)
                val played = (i + 0.5f) / bars.size <= fraction
                drawRoundRect(
                    color = if (played) Theme.accent else Theme.muted.copy(alpha = 0.5f),
                    topLeft = Offset(x, (size.height - h) / 2),
                    size = Size(barWidth, h),
                    cornerRadius = CornerRadius(barWidth / 2),
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        val total = if (current && VoicePlayer.duration > 0) VoicePlayer.duration else audio.duration ?: 0.0
        Text(VoiceFormat.time(if (current) VoicePlayer.time else total), color = Theme.muted, fontSize = 12.sp)
        if (current) {
            Spacer(Modifier.width(6.dp))
            Text(
                VoiceRate.label(VoicePlayer.rate), color = Theme.text, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(CircleShape).background(Theme.input).clickable { VoicePlayer.cycleRate() }.padding(horizontal = 6.dp, vertical = 3.dp),
            )
        }
        if (VoicePlayer.failedId == id) {
            Spacer(Modifier.width(6.dp))
            Text("!", color = Theme.danger, fontWeight = FontWeight.Bold)
        }
    }
}

/** A video message: its picture with a play button; a tap plays it full screen. */
@Composable
fun VideoMessageView(video: VideoAttachment, account: MatrixAccount) {
    var playing by remember { mutableStateOf(false) }
    val aspect = MessageMediaSize.aspect(video.width, video.height).toFloat()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            Modifier.widthIn(max = 320.dp).fillMaxWidth().aspectRatio(aspect).clip(RoundedCornerShape(14.dp)).background(Color.Black)
                .clickable { playing = true },
            contentAlignment = Alignment.Center,
        ) {
            video.thumbnail?.let { MxcPicture(account, it, size = null, modifier = Modifier.fillMaxSize()) }
            Box(Modifier.size(52.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.PlayArrow, "Play video", tint = Color.White, modifier = Modifier.size(32.dp))
            }
            video.duration?.let {
                Text(
                    VoiceFormat.time(it), color = Color.White, fontSize = 12.sp,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        video.caption?.let { Text(it, color = Theme.text, fontSize = ChatStyle.bodySize) }
    }
    if (playing) VideoPlayerDialog(video, account) { playing = false }
}

@Composable
private fun VideoPlayerDialog(video: VideoAttachment, account: MatrixAccount, onClose: () -> Unit) {
    val context = LocalContext.current
    var file by remember { mutableStateOf<File?>(null) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(video.source) {
        file = MediaLoader.file(video.source, video.filename.ifBlank { "video.mp4" }, account)
        if (file == null) failed = true
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            val loaded = file
            when {
                loaded != null -> {
                    val player = remember(loaded) {
                        ExoPlayer.Builder(context).build().apply {
                            setMediaItem(MediaItem.fromUri(Uri.fromFile(loaded)))
                            prepare()
                            play()
                        }
                    }
                    androidx.compose.runtime.DisposableEffect(player) { onDispose { player.release() } }
                    AndroidView(factory = { PlayerView(it).apply { this.player = player } }, modifier = Modifier.fillMaxSize())
                }
                failed -> Text("The video could not be loaded.", color = Color.White)
                else -> CircularProgressIndicator(color = Color.White)
            }
            Icon(Icons.Filled.Close, "Close", tint = Color.White, modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(8.dp).size(44.dp).clip(CircleShape).clickable(onClick = onClose).padding(10.dp))
        }
    }
}

/** An `m.location` message: the place and a button for the map app. */
@Composable
fun LocationView(location: LocationAttachment) {
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    Row(
        Modifier.widthIn(max = 320.dp).clip(RoundedCornerShape(12.dp)).background(Theme.elevated).clickable {
            try {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(location.location.geoUri(location.label))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: ActivityNotFoundException) {
                uri.openUri(location.location.openStreetMapUrl)
            }
        }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.LocationOn, null, tint = Theme.danger, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(10.dp))
        Column {
            Text(location.label ?: "Location", color = Theme.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(String.format(java.util.Locale.US, "%.5f, %.5f", location.location.latitude, location.location.longitude), color = Theme.muted, fontSize = 12.sp)
        }
    }
}

/** Link cards under a message (desktop UrlPreviewCard); a link to a picture shows the picture. */
@Composable
fun LinkPreviewStrip(urls: List<String>, account: MatrixAccount, encrypted: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
        urls.forEach { url -> LinkPreviewCard(url, account, encrypted) }
    }
}

@Composable
private fun LinkPreviewCard(url: String, account: MatrixAccount, encrypted: Boolean) {
    val uri = LocalUriHandler.current
    if (LinkEmbedRules.isImageLink(url)) {
        var bitmap by remember(url) { mutableStateOf<Bitmap?>(null) }
        LaunchedEffect(url) { bitmap = LinkPageFetcher.image(url) }
        bitmap?.let {
            Image(
                it.asImageBitmap(), null, contentScale = ContentScale.Crop,
                modifier = Modifier.widthIn(max = 320.dp).fillMaxWidth().aspectRatio(MessageMediaSize.aspect(it.width.toDouble(), it.height.toDouble()).toFloat())
                    .clip(RoundedCornerShape(12.dp)).clickable { uri.openUri(url) },
            )
        }
        return
    }
    var data by remember(url) { mutableStateOf<LinkPreviewData?>(null) }
    LaunchedEffect(url, encrypted) { data = LinkPreviewStore.preview(url, account.id, account.client, encrypted) }
    val preview = data ?: return
    val stripe = diddyColor(preview.color?.lowercase()?.let { if (it.length == 4) "#" + it.drop(1).map { c -> "$c$c" }.joinToString("") else it }) ?: Theme.accent
    Row(
        Modifier.widthIn(max = 340.dp).clip(RoundedCornerShape(8.dp)).background(Theme.elevated).clickable { uri.openUri(url) }
            .height(androidx.compose.foundation.layout.IntrinsicSize.Min),
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().background(stripe))
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            preview.siteName?.let { Text(it, color = Theme.muted, fontSize = 12.sp, maxLines = 1) }
            preview.title?.let { Text(it, color = Theme.accent, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            preview.description?.let { Text(it, color = Theme.text, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis) }
            val image = preview.imageUrl
            if (image != null) {
                if (image.startsWith("mxc://")) {
                    MxcPicture(account, null, url = image, size = 640, modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(6.dp)))
                } else {
                    var bitmap by remember(image) { mutableStateOf<Bitmap?>(null) }
                    LaunchedEffect(image) { bitmap = LinkPageFetcher.image(image) }
                    bitmap?.let {
                        Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(6.dp)))
                    }
                }
            }
        }
    }
}

