package app.diddy.ui.call

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.diddy.call.SharedWatch
import app.diddy.call.WatchPlayback
import app.diddy.call.WatchPlayerHost
import app.diddy.call.WatchPrefsStore
import app.diddy.call.WatchSponsorBlock
import app.diddy.call.WatchTogetherSession
import app.diddy.call.WatchYouTube
import app.diddy.ui.FullSheet
import app.diddy.ui.sheets.FormDivider
import app.diddy.ui.sheets.FormField
import app.diddy.ui.sheets.FormSection
import app.diddy.ui.sheets.FormToggle
import app.diddy.ui.theme.Theme

/** The shared video above the call tiles, or the toast when someone starts or stops one. */
@Composable
fun WatchTogetherArea(watch: WatchTogetherSession) {
    val prefs = WatchPrefsStore.prefs
    if (!prefs.enabled || !watch.available) return
    val shared = watch.shared
    val visible = shared?.takeIf { it.state != WatchPlayback.STOPPED && watch.closedSession != it.session }
    Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (visible != null) key(visible.session) { WatchPlayerCard(watch, visible) }
        else if (shared != null && shared.state != WatchPlayback.STOPPED) {
            TextButton(onClick = { watch.reopen() }) { Text("Show the shared video again") }
        }
        watch.toast?.let { text ->
            Row(
                Modifier.clip(CircleShape).background(Theme.elevated).padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Info, null, tint = Theme.text, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(text, color = Theme.text, fontSize = 12.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun WatchPlayerCard(watch: WatchTogetherSession, shared: SharedWatch) {
    val context = LocalContext.current
    val prefs = WatchPrefsStore.prefs
    val host = remember(shared.session) {
        WatchPlayerHost(context, shared).also { h ->
            h.onChange = { watch.change(it) }
            h.onToast = { watch.showToast(it) }
            h.start(prefs)
        }
    }
    DisposableEffect(host) { onDispose { host.destroy() } }
    LaunchedEffect(shared) { host.update(shared) }
    var loadedCategories by remember { mutableStateOf(prefs.categories) }
    LaunchedEffect(prefs) {
        host.apply(prefs.volume, prefs.muted, prefs.quality)
        if (prefs.categories != loadedCategories) {
            loadedCategories = prefs.categories
            host.setCategories(prefs.categories)
        }
    }
    var closeMenu by remember { mutableStateOf(false) }
    var qualityMenu by remember { mutableStateOf(false) }
    val openYouTube = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WatchYouTube.watchUrl(shared.videoId)))) } }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Theme.elevated).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.PlayArrow, null, tint = Theme.accent, modifier = Modifier.size(16.dp))
            Text(" Watch Together", color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Box(Modifier.size(40.dp).clickable { openYouTube() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, "Open on YouTube", tint = Theme.text, modifier = Modifier.size(20.dp))
            }
            Box {
                Box(Modifier.size(40.dp).clickable { closeMenu = true }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Cancel, "Close the video", tint = Theme.muted)
                }
                DropdownMenu(closeMenu, { closeMenu = false }) {
                    DropdownMenuItem(text = { Text("Close for Me") }, onClick = { closeMenu = false; watch.closeForMe() })
                    DropdownMenuItem(text = { Text("Stop for Everyone", color = Theme.danger) }, onClick = { closeMenu = false; watch.stopForEveryone() })
                }
            }
        }
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(10.dp)).background(Color.Black)) {
            AndroidView(factory = { host.webView }, modifier = Modifier.fillMaxSize())
            host.errorCode?.let { code ->
                Column(
                    Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.75f)).padding(10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    Text(WatchYouTube.errorText(code), color = Color.White, fontSize = 13.sp, textAlign = TextAlign.Center)
                    TextButton(onClick = { openYouTube() }) { Text("Open on YouTube") }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clickable { WatchPrefsStore.update { it.copy(muted = !it.muted) } }, contentAlignment = Alignment.Center) {
                Icon(if (prefs.muted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp, if (prefs.muted) "Unmute video" else "Mute video", tint = Theme.text)
            }
            Slider(
                prefs.volume.toFloat(), { v -> WatchPrefsStore.update { it.copy(volume = v.toInt().coerceIn(0, 100), muted = false) } },
                valueRange = 0f..100f, modifier = Modifier.weight(1f),
                colors = SliderDefaults.colors(thumbColor = Theme.accent, activeTrackColor = Theme.accent),
            )
            Box {
                Box(Modifier.size(40.dp).clickable { qualityMenu = true }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Settings, "Quality", tint = Theme.text)
                }
                DropdownMenu(qualityMenu, { qualityMenu = false }) {
                    WatchYouTube.qualityChoices.forEach { choice ->
                        DropdownMenuItem(
                            text = { Text((WatchYouTube.qualityLabels[choice] ?: choice) + if (choice == prefs.quality) "  ✓" else "") },
                            onClick = { qualityMenu = false; WatchPrefsStore.update { it.copy(quality = choice) } },
                        )
                    }
                }
            }
        }
        Text(
            "Volume and quality are yours only. Use headphones: the video plays on your phone and the speaker would leak into your microphone." +
                if (prefs.categories.isNotEmpty()) " Sponsor segments are skipped with SponsorBlock." else "",
            color = Theme.faint, fontSize = 11.sp,
        )
    }
}

/** Paste a YouTube link to start a video for everyone in the call (ios WatchLinkSheet). */
@Composable
fun WatchLinkSheet(watch: WatchTogetherSession, onClose: () -> Unit) {
    var input by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    fun submit() {
        val ref = WatchYouTube.parseUrl(input)
        if (ref == null) {
            error = "That is not a YouTube video link (youtube.com/watch, youtu.be or shorts)."
            return
        }
        watch.startWatching(ref.first, ref.second)
        onClose()
    }
    FullSheet("Watch together", onClose, closeLabel = "Cancel", action = "Start", actionEnabled = input.isNotBlank(), onAction = { submit() }) {
        Column(Modifier.fillMaxSize().padding(vertical = 8.dp)) {
            FormSection(
                footer = error ?: "Paste a YouTube link. Everybody in the call gets the video; play, pause and seeking are shared, volume and quality stay yours.",
            ) {
                FormField(input, { input = it; error = null }, "https://youtu.be/…", onGo = { submit() })
            }
        }
    }
}

/** Settings > Watch Together (ios WatchTogetherSettingsView). */
@Composable
fun WatchTogetherSettingsPage() {
    val prefs = WatchPrefsStore.prefs
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        FormSection(footer = "Share a YouTube video in a call: everyone sees the same moment. Turned off, you neither see shared videos nor can start one.") {
            FormToggle("Watch Together", prefs.enabled) { on -> WatchPrefsStore.update { it.copy(enabled = on) } }
        }
        FormSection("SponsorBlock", "Skips these parts automatically, with the community data of sponsor.ajay.app. Only the first characters of a hash of the video id are sent.") {
            WatchSponsorBlock.categories.forEachIndexed { index, category ->
                if (index > 0) FormDivider()
                FormToggle(WatchSponsorBlock.labels[category] ?: category, category in prefs.categories) { WatchPrefsStore.setCategory(category, it) }
            }
        }
    }
}
