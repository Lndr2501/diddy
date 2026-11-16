package app.diddy.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.BotCard
import app.diddy.matrix.BotCardAction
import app.diddy.matrix.BotCardParser
import app.diddy.matrix.BotCardTone
import app.diddy.matrix.BotCardTrack
import app.diddy.matrix.BotCardTrackState
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MusicCard
import app.diddy.media.MusicPreviewPlayer
import app.diddy.ui.MxcPicture
import app.diddy.ui.theme.Theme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Date
import kotlin.math.roundToInt

/**
 * The drawn card of a bot message (ios BotCardView, desktop BotCard.tsx). Buttons and the seek bar
 * hand a bot command to `onCommand`, which sends it into the room.
 */
@Composable
fun BotCardView(card: BotCard, account: MatrixAccount, onCommand: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    fun run(command: String) {
        if (busy) return
        busy = true
        onCommand(command)
        scope.launch { delay(700); busy = false }
    }
    Box(Modifier.widthIn(max = 380.dp)) {
        when (card) {
            is BotCard.Track -> if (card.track.controls != null) PlayerCard(card.track, account, busy, ::run) else ClassicTrackCard(card.track, account, busy, ::run)
            is BotCard.Queue -> Container {
                card.now?.let { now ->
                    SectionTitle("NOW PLAYING")
                    ItemRow(null, now.title, now.artist, now.duration)
                }
                if (card.items.isNotEmpty()) {
                    SectionTitle("UP NEXT · ${card.total}")
                    card.items.forEachIndexed { i, item -> ItemRow(i + 1, item.title, item.artist, item.duration) }
                    if (card.total > card.items.size) Hint("…and ${card.total - card.items.size} more")
                } else if (card.now == null) Hint("The queue is empty.")
                ActionButtons(card.actions, busy, ::run)
            }
            is BotCard.ListCard -> Container {
                Text(card.title, color = Theme.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                if (card.items.isEmpty()) Hint(card.empty ?: "Nothing here.")
                card.items.forEachIndexed { i, item -> ItemRow(i + 1, item.title, item.artist, item.duration) }
                if (card.total > card.items.size) Hint("…and ${card.total - card.items.size} more")
                ActionButtons(card.actions, busy, ::run)
            }
            is BotCard.Help -> Container {
                card.groups.forEach { group ->
                    SectionTitle(group.title.uppercase())
                    group.items.forEach { item ->
                        Column(Modifier.padding(vertical = 2.dp)) {
                            Text(item.usage, color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                            Text(item.desc, color = Theme.muted, fontSize = 13.sp)
                        }
                    }
                }
                card.note?.let { Hint(it) }
            }
            is BotCard.Stats -> Container {
                Text(card.title, color = Theme.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                card.charts.forEach { chart ->
                    SectionTitle(chart.title.uppercase())
                    val max = chart.items.maxOf { it.value }.takeIf { it > 0 } ?: 1.0
                    chart.items.forEach { item ->
                        Column(Modifier.padding(vertical = 2.dp)) {
                            Row {
                                Text(item.label, color = Theme.text, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                Text(trimmed(item.value) + (chart.unit?.let { " $it" } ?: ""), color = Theme.muted, fontSize = 12.sp)
                            }
                            Bar((item.value / max).toFloat(), Theme.accent)
                            item.sub?.let { Text(it, color = Theme.faint, fontSize = 11.sp) }
                        }
                    }
                }
                ActionButtons(card.actions, busy, ::run)
            }
            is BotCard.Note -> NoteCard(card)
        }
    }
}

private fun trimmed(value: Double) = if (value == Math.floor(value)) value.toLong().toString() else String.format(java.util.Locale.US, "%.1f", value)

@Composable
private fun Container(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Theme.elevated)
            .border(1.dp, Theme.faint.copy(alpha = 0.25f), RoundedCornerShape(10.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

@Composable
private fun SectionTitle(text: String) = Text(text, color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)

@Composable
private fun Hint(text: String) = Text(text, color = Theme.muted, fontSize = 13.sp)

@Composable
private fun Bar(ratio: Float, color: Color) {
    Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(Theme.input)) {
        Box(Modifier.fillMaxWidth(ratio.coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(color))
    }
}

@Composable
private fun ItemRow(index: Int?, title: String, subtitle: String?, duration: Double?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (index != null) Text("$index", color = Theme.faint, fontSize = 12.sp, modifier = Modifier.width(22.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Theme.text, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            subtitle?.let { Text(it, color = Theme.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        duration?.let { Text(BotCardParser.formatTime(it), color = Theme.muted, fontSize = 12.sp) }
    }
}

@Composable
private fun ActionButtons(actions: List<BotCardAction>, busy: Boolean, run: (String) -> Unit) {
    if (actions.isEmpty()) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        actions.forEach { action ->
            Text(
                action.label, color = Theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).background(Theme.input).border(1.dp, Theme.faint.copy(alpha = 0.3f), CircleShape)
                    .clickable(enabled = !busy) { run(action.send) }.padding(horizontal = 12.dp, vertical = 7.dp),
            )
        }
    }
}

@Composable
private fun StateChip(state: BotCardTrackState) {
    val (label, color) = when (state) {
        BotCardTrackState.SEARCHING -> "Searching" to Theme.accent
        BotCardTrackState.DOWNLOADING -> "Downloading" to Theme.accent
        BotCardTrackState.PLAYING -> "Now playing" to Theme.online
        BotCardTrackState.PAUSED -> "Paused" to Theme.muted
        BotCardTrackState.STOPPED -> "Stopped" to Theme.faint
        BotCardTrackState.ERROR -> "Error" to Theme.danger
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(5.dp))
        Text(label, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CardCover(url: String?, account: MatrixAccount) {
    Box(Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)).background(Theme.input), contentAlignment = Alignment.Center) {
        if (url != null) MxcPicture(account, null, url = url, size = 168, modifier = Modifier.fillMaxSize())
        else Icon(Icons.Filled.MusicNote, null, tint = Theme.faint)
    }
}

@Composable
private fun ClassicTrackCard(track: BotCardTrack, account: MatrixAccount, busy: Boolean, run: (String) -> Unit) {
    Container {
        Row(verticalAlignment = Alignment.Top) {
            CardCover(track.thumbnail, account)
            Spacer(Modifier.width(10.dp))
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                StateChip(track.state)
                Text(track.title, color = Theme.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                track.artist?.let { Text(it, color = Theme.muted, fontSize = 13.sp) }
            }
        }
        LiveProgress(track, true, busy, run)
        track.note?.let { Hint(it) }
        ActionButtons(track.actions, busy, run)
    }
}

/** The progress bar; a tap on it seeks when the bot offers a seek command. */
@Composable
private fun LiveProgress(track: BotCardTrack, showVolume: Boolean, busy: Boolean, run: (String) -> Unit) {
    val duration = track.duration
    if (track.position == null || duration == null) {
        if (duration != null) Hint("Length ${BotCardParser.formatTime(duration)}")
        return
    }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(track) {
        while (track.state == BotCardTrackState.PLAYING) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    val position = BotCardParser.livePosition(track, Date(now)) ?: return
    val ratio = if (duration > 0) minOf(1.0, position / duration).toFloat() else 0f
    val seekable = track.seek != null && (track.state == BotCardTrackState.PLAYING || track.state == BotCardTrackState.PAUSED)
    var width by remember { mutableFloatStateOf(1f) }
    Column {
        Box(
            Modifier.fillMaxWidth().height(24.dp).onSizeChanged { width = it.width.toFloat() }.pointerInput(track) {
                detectTapGestures { offset ->
                    val seek = track.seek
                    if (seekable && seek != null && !busy && width > 0) {
                        val target = (offset.x / width).coerceIn(0f, 1f) * duration
                        run("$seek ${BotCardParser.formatTime(target)}")
                    }
                }
            },
            contentAlignment = Alignment.Center,
        ) { Bar(ratio, if (track.state == BotCardTrackState.PAUSED) Theme.muted else Theme.accent) }
        Row {
            Text(BotCardParser.formatTime(position), color = Theme.muted, fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            if (showVolume) track.volume?.let { Text("🔊 ${it.roundToInt()}", color = Theme.muted, fontSize = 11.sp) }
            Spacer(Modifier.weight(1f))
            Text(BotCardParser.formatTime(duration), color = Theme.muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun PlayerCard(track: BotCardTrack, account: MatrixAccount, busy: Boolean, run: (String) -> Unit) {
    val controls = track.controls ?: return
    val playing = track.state == BotCardTrackState.PLAYING
    val volumeMax = track.volumeMax ?: 100.0
    var panel by remember { mutableStateOf<String?>(null) }
    var volume by remember(track.volume) { mutableFloatStateOf(minOf(track.volume ?: 0.0, volumeMax).toFloat()) }
    val base = when (track.state) {
        BotCardTrackState.SEARCHING -> "Searching"
        BotCardTrackState.DOWNLOADING -> "Loading"
        BotCardTrackState.PLAYING -> "Now playing"
        BotCardTrackState.PAUSED -> "Paused"
        BotCardTrackState.STOPPED -> "Stopped"
        BotCardTrackState.ERROR -> "Error"
    }
    val header = if (track.room != null && (playing || track.state == BotCardTrackState.PAUSED)) "$base in ${track.room}" else base
    val sub = listOfNotNull(track.artist, track.requestedBy?.let { "requested by $it" }).joinToString(" · ")
    Row(Modifier.clip(RoundedCornerShape(10.dp)).height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
        Box(Modifier.width(4.dp).fillMaxHeight().background(Theme.accent))
        Box(Modifier.weight(1f)) {
            Container {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CardCover(track.thumbnail, account)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(header.uppercase(), color = Theme.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        Text(track.title, color = Theme.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        if (sub.isNotEmpty()) Text(sub, color = Theme.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                LiveProgress(track, false, busy, run)
                track.note?.let { Hint(it) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    controls.prev?.let { cmd -> PlayerButton(null, Icons.Filled.SkipPrevious, busy = busy) { run(cmd) } }
                    controls.toggle?.let { cmd -> PlayerButton(if (playing) "Pause" else "Play", if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, primary = true, busy = busy) { run(cmd) } }
                    controls.skip?.let { cmd -> PlayerButton("Skip", Icons.Filled.SkipNext, busy = busy) { run(cmd) } }
                    if (controls.volume != null) PlayerButton(track.volume?.let { "${it.roundToInt()}%" }, Icons.AutoMirrored.Filled.VolumeUp, selected = panel == "volume", busy = busy) {
                        panel = if (panel == "volume") null else "volume"
                    }
                    controls.dashboard?.let { cmd -> PlayerButton("Dashboard", Icons.Filled.GridView, busy = busy) { run(cmd) } }
                    if (track.more.isNotEmpty()) PlayerButton(null, Icons.Filled.MoreHoriz, selected = panel == "more", busy = busy) {
                        panel = if (panel == "more") null else "more"
                    }
                }
                val volumeCommand = controls.volume
                if (panel == "volume" && volumeCommand != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.AutoMirrored.Filled.VolumeUp, null, tint = Theme.muted, modifier = Modifier.size(16.dp))
                        Slider(
                            value = volume, onValueChange = { volume = it }, valueRange = 0f..volumeMax.toFloat(),
                            onValueChangeFinished = {
                                val value = volume.roundToInt()
                                if (track.volume?.roundToInt() != value) run("$volumeCommand $value")
                            },
                            colors = SliderDefaults.colors(thumbColor = Theme.accent, activeTrackColor = Theme.accent),
                            modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                        )
                        Text("${volume.roundToInt()}%", color = Theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                if (panel == "more") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        track.more.forEach { action ->
                            Text(
                                action.label, color = Theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.defaultMinSize(minHeight = 40.dp).clip(RoundedCornerShape(10.dp)).background(Theme.input)
                                    .clickable(enabled = !busy) { run(action.send); panel = null }.padding(horizontal = 14.dp, vertical = 10.dp),
                            )
                        }
                    }
                }
                if (track.upNext.isNotEmpty()) {
                    SectionTitle("UP NEXT")
                    track.upNext.forEachIndexed { i, item -> ItemRow(i + 1, item.title, item.artist, null) }
                }
            }
        }
    }
}

@Composable
private fun PlayerButton(title: String?, icon: ImageVector, primary: Boolean = false, selected: Boolean = false, busy: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.defaultMinSize(40.dp, 40.dp).clip(RoundedCornerShape(10.dp)).background(if (primary) Theme.accent else Theme.input)
            .border(1.5.dp, if (selected) Theme.accent else Color.Transparent, RoundedCornerShape(10.dp))
            .clickable(enabled = !busy, onClick = onClick).padding(horizontal = if (title == null) 8.dp else 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, title, tint = if (primary) Theme.onAccent else Theme.text, modifier = Modifier.size(18.dp))
        if (title != null) {
            Spacer(Modifier.width(6.dp))
            Text(title, color = if (primary) Theme.onAccent else Theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun NoteCard(note: BotCard.Note) {
    val uri = LocalUriHandler.current
    val color = when (note.tone) {
        BotCardTone.INFO -> Theme.accent
        BotCardTone.SUCCESS -> Theme.online
        BotCardTone.WARNING -> Theme.warning
        BotCardTone.ERROR -> Theme.danger
    }
    Row(
        Modifier.clip(RoundedCornerShape(10.dp)).background(color.copy(alpha = 0.12f)).border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        note.icon?.let {
            Text(it, fontSize = 15.sp)
            Spacer(Modifier.width(8.dp))
        }
        Text(note.text, color = Theme.text, fontSize = 14.sp, modifier = Modifier.weight(1f, fill = false))
        val url = note.url
        if (url != null) {
            Spacer(Modifier.width(8.dp))
            Text(
                note.linkLabel ?: "Open", color = color, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).background(color.copy(alpha = 0.15f)).clickable { uri.openUri(url) }.padding(horizontal = 10.dp, vertical = 5.dp),
            )
        }
    }
}

/**
 * A shared song like iMessage's Apple Music lyrics (ios MusicCardView): the lines large on a
 * backdrop made from the cover, below title, artist, service and the preview button.
 */
@Composable
fun MusicCardView(card: MusicCard, account: MatrixAccount?, interactive: Boolean = true) {
    val uri = LocalUriHandler.current
    val playing = MusicPreviewPlayer.current == card.preview && MusicPreviewPlayer.isPlaying
    val cover = card.artwork
    Box(
        Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(22.dp)).background(Color(0xFF2B2B2B))
            .clickable(enabled = interactive) { uri.openUri(card.url) },
    ) {
        if (cover != null && account != null) {
            MxcPicture(account, null, url = cover, size = 300, modifier = Modifier.matchParentSize().blur(38.dp), contentScale = ContentScale.Crop, placeholder = {})
        }
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.18f), Color.Black.copy(alpha = 0.42f)))))
        Column {
            if (card.lyrics.isNotEmpty()) {
                Row(Modifier.padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 16.dp), verticalAlignment = Alignment.Bottom) {
                    Text(card.lyrics.joinToString("\n"), color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp, modifier = Modifier.weight(1f))
                    card.time?.let { Text(MusicCard.clock(it), color = Color.White.copy(alpha = 0.55f), fontSize = 15.sp) }
                }
            }
            Row(
                Modifier.fillMaxWidth().background(Color.Black.copy(alpha = if (card.lyrics.isEmpty()) 0f else 0.14f)).padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (card.lyrics.isEmpty()) {
                    Box(Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.12f))) {
                        if (cover != null && account != null) MxcPicture(account, null, url = cover, size = 168, modifier = Modifier.fillMaxSize())
                    }
                    Spacer(Modifier.width(12.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(card.title, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (card.artist.isNotEmpty()) Text(card.artist, color = Color.White.copy(alpha = 0.85f), fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        when (card.service) {
                            "apple" -> " Music"
                            "spotify" -> "Spotify"
                            else -> runCatching { java.net.URI(card.url).host }.getOrNull() ?: ""
                        },
                        color = Color.White.copy(alpha = 0.5f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                val preview = card.preview
                if (preview != null) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier.size(46.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.16f))
                            .clickable(enabled = interactive) { MusicPreviewPlayer.toggle(preview) },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (interactive && MusicPreviewPlayer.current == preview && MusicPreviewPlayer.isLoading) {
                            CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (playing) "Pause preview" else "Play preview", tint = Color.White)
                        }
                        if (playing) CircularProgressIndicator({ MusicPreviewPlayer.progress }, Modifier.fillMaxSize(), color = Color.White, strokeWidth = 2.dp, trackColor = Color.Transparent)
                    }
                }
            }
        }
    }
}
