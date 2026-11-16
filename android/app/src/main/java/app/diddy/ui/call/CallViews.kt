package app.diddy.ui.call

import android.Manifest
import android.app.Activity
import android.content.Context
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Headset
import androidx.compose.material.icons.filled.HeadsetOff
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.ScreenShare
import androidx.compose.material.icons.filled.SmartDisplay
import androidx.compose.material.icons.filled.StopScreenShare
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.VolumeDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.diddy.call.CallManager
import app.diddy.call.CallMember
import app.diddy.call.CallPrefs
import app.diddy.call.CallSession
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.AvatarView
import app.diddy.ui.Navigator
import app.diddy.ui.Sheet
import app.diddy.ui.settings.rememberBoolPref
import app.diddy.ui.sheets.FormButton
import app.diddy.ui.sheets.FormDivider
import app.diddy.ui.sheets.FormSection
import app.diddy.ui.sheets.FormToggle
import app.diddy.ui.theme.Theme
import io.livekit.android.renderer.TextureViewRenderer
import app.diddy.util.friendlyMessage
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.launch

/** Starts or joins the call of a room and shows it (the phone button in a chat). */
suspend fun startCall(account: MatrixAccount, roomId: String, title: String, navigator: Navigator) {
    CallManager.requestJoin(account, roomId, title, showCallScreen = true)
}

// MARK: - Over everything

/**
 * The call parts that sit over the whole app: the full call screen, an incoming call, "leave your
 * current call?", errors, and the microphone permission when a call starts.
 */
@Composable
fun CallOverlay(account: MatrixAccount, navigator: Navigator) {
    val scope = rememberCoroutineScope()
    val session = CallManager.current
    val context = LocalContext.current
    val mic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) CallManager.current?.let { s ->
            // The call service may now keep the microphone running in the background.
            app.diddy.call.CallService.start(context, s.roomName)
            scope.launch { if (!s.microphoneOn) s.toggleMicrophone(true) }
        }
    }
    var asked by remember { mutableStateOf(false) }
    LaunchedEffect(session) {
        if (session != null && !CallManager.microphoneAllowed && !asked) {
            asked = true
            mic.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    if (session != null && CallManager.showCallScreen && session.account.id == account.id) {
        Dialog(
            onDismissRequest = { CallManager.showCallScreen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
        ) {
            ConnectedCall(session, session.roomName, navigator, onMinimize = { CallManager.showCallScreen = false }, minimizeIcon = Icons.Filled.KeyboardArrowDown)
        }
    }
    CallManager.incoming?.let { IncomingCallScreen() }
    CompanionOfferDialog()
    CallManager.switchRequest?.let { request ->
        AlertDialog(
            onDismissRequest = { CallManager.switchRequest = null },
            title = { Text("Leave ${request.currentName}?") },
            text = { Text("You are in a call. Leave it to join ${request.roomName}?") },
            confirmButton = { TextButton(onClick = { scope.launch { CallManager.confirmSwitch(request) } }) { Text("Leave and Join") } },
            dismissButton = { TextButton(onClick = { CallManager.switchRequest = null }) { Text("Cancel") } },
        )
    }
    CallManager.error?.let { message ->
        AlertDialog(
            onDismissRequest = { CallManager.error = null },
            title = { Text("Call") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { CallManager.error = null }) { Text("OK") } },
        )
    }
}

/** Someone calls you: their picture pulsing, Decline and Accept (ios IncomingCallView). */
@Composable
private fun IncomingCallScreen() {
    val call = CallManager.incoming ?: return
    val scope = rememberCoroutineScope()
    val pulse = rememberInfiniteTransition(label = "ring")
    val scale by pulse.animateFloat(1f, 1.35f, infiniteRepeatable(tween(1300), RepeatMode.Restart), label = "scale")
    val alpha by pulse.animateFloat(0.7f, 0f, infiniteRepeatable(tween(1300), RepeatMode.Restart), label = "alpha")
    Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false, dismissOnBackPress = false)) {
        Column(
            Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Theme.accent.copy(alpha = 0.45f), Theme.rail, Theme.rail))).statusBarsPadding().navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(1f))
            Box(contentAlignment = Alignment.Center) {
                Box(Modifier.size(132.dp).scale(scale).border(3.dp, Theme.online.copy(alpha = alpha), CircleShape))
                AvatarView(call.avatarUrl, call.name, 120.dp, call.account)
            }
            Spacer(Modifier.height(18.dp))
            Text(call.name, color = Theme.text, fontSize = 30.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
            Text("Incoming voice call", color = Theme.muted, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Row(Modifier.padding(bottom = 48.dp), horizontalArrangement = Arrangement.spacedBy(64.dp)) {
                RoundAction("Decline", Icons.Filled.CallEnd, Theme.danger) { scope.launch { CallManager.declineIncoming() } }
                RoundAction("Accept", Icons.Filled.Call, Theme.online) { CallManager.answerIncoming() }
            }
        }
    }
}

@Composable
private fun RoundAction(title: String, icon: ImageVector, color: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(color).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
            Icon(icon, title, tint = Color.White, modifier = Modifier.size(32.dp))
        }
        Spacer(Modifier.height(8.dp))
        Text(title, color = Theme.text, fontSize = 14.sp)
    }
}

// MARK: - Voice channel

/** A voice channel: who is in it and Join, or the running call (ios VoiceChannelView). */
@Composable
fun VoiceChannelScreen(account: MatrixAccount, roomId: String, navigator: Navigator, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val scope = rememberCoroutineScope()
    val session = CallManager.current
    val summary = account.summary(roomId)
    val title = summary?.name ?: "Voice"
    if (session != null && session.roomId == roomId) {
        ConnectedCall(session, title, navigator, onMinimize = onBack, minimizeIcon = Icons.AutoMirrored.Filled.ArrowBack)
        return
    }
    var joining by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(Theme.rail).statusBarsPadding().navigationBarsPadding()) {
        CallHeader(title, null, Icons.AutoMirrored.Filled.ArrowBack, onBack) { navigator.show(Sheet.Members(roomId)) }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.height(40.dp))
            Box(Modifier.size(84.dp).clip(CircleShape).background((if (summary?.hasCall == true) Theme.online else Theme.accent).copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.VolumeUp, null, tint = if (summary?.hasCall == true) Theme.online else Theme.accent, modifier = Modifier.size(44.dp))
            }
            Text(title, color = Theme.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            val participants = summary?.callParticipants ?: emptyList()
            LaunchedEffect(participants) { account.resolveProfiles(participants, roomId) }
            if (participants.isNotEmpty()) {
                Text(if (participants.size == 1) "1 person in voice" else "${participants.size} people in voice", color = Theme.online, fontWeight = FontWeight.SemiBold)
                participants.forEach { userId ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { navigator.show(Sheet.Profile(userId, roomId)) }.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AvatarView(account.profiles[userId]?.avatarUrl, account.name(userId), 36.dp, account)
                        Spacer(Modifier.width(12.dp))
                        Text(account.name(userId), color = Theme.text)
                    }
                }
            } else {
                Text("No one is here yet.", color = Theme.muted)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(24.dp).clip(CircleShape).background(Theme.online).clickable(enabled = !joining) {
                joining = true
                scope.launch {
                    CallManager.requestJoin(account, roomId, title)
                    joining = false
                }
            }.padding(vertical = 14.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (joining) {
                CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
            Text(if (joining) "Connecting…" else if (session == null) "Join Voice" else "Switch to This Channel", color = Color.White, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CallHeader(title: String, subtitle: String?, backIcon: ImageVector, onBack: () -> Unit, onWatch: (() -> Unit)? = null, onMembers: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(48.dp).clickable(onClick = onBack), contentAlignment = Alignment.Center) { Icon(backIcon, "Back", tint = Theme.text) }
        Column(Modifier.weight(1f)) {
            Text(title, color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            subtitle?.let { Text(it, color = Theme.muted, fontSize = 12.sp, maxLines = 1) }
        }
        if (onWatch != null) Box(Modifier.size(48.dp).clickable(onClick = onWatch), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.SmartDisplay, "Watch together", tint = Theme.text)
        }
        Box(Modifier.size(48.dp).clickable(onClick = onMembers), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Group, "Members", tint = Theme.text) }
    }
}

/** The running call: tiles, a shared screen big when chosen, the control bar (ios ConnectedVoiceView). */
@Composable
private fun ConnectedCall(session: CallSession, title: String, navigator: Navigator, onMinimize: () -> Unit, minimizeIcon: ImageVector) {
    var volumeFor by remember { mutableStateOf<CallMember?>(null) }
    var watchLink by remember { mutableStateOf(false) }
    if (watchLink) WatchLinkSheet(session.watchTogether) { watchLink = false }
    val watchEnabled = app.diddy.call.WatchPrefsStore.prefs.enabled
    // Turned on during the call: start listening now.
    LaunchedEffect(watchEnabled, session.connected) {
        if (watchEnabled && session.connected && session.companion == null) session.watchTogether.start()
    }
    val watchOffered = watchEnabled && session.watchTogether.available && session.companion == null
    val status = when {
        session.outgoing == CallSession.OutgoingRing.RINGING -> "Ringing…"
        session.outgoing == CallSession.OutgoingRing.NO_ANSWER -> "No answer"
        !session.connected -> session.state
        session.state != "Voice connected" -> session.state
        else -> if (session.members.size == 1) "Only you" else "${session.members.size} in voice"
    }
    Column(Modifier.fillMaxSize().background(Theme.rail).statusBarsPadding().navigationBarsPadding()) {
        CallHeader(
            title, status + if (session.deafened) " · Deafened" else "", minimizeIcon, onMinimize,
            onWatch = if (watchOffered) ({ watchLink = true }) else null,
        ) { navigator.show(Sheet.Members(session.roomId)) }
        session.companion?.let { role ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp).clip(RoundedCornerShape(10.dp)).background(Theme.accent.copy(alpha = 0.15f)).padding(10.dp)) {
                Text("This phone is your computer's ${listOfNotNull("camera".takeIf { role.media.camera }, "microphone".takeIf { role.media.microphone }, "screen".takeIf { role.media.screen }).joinToString(" and ")}. The call plays on your computer.", color = Theme.text, fontSize = 13.sp)
                if (role.media.screen && !session.screenSharing) {
                    val context = LocalContext.current
                    val scope = rememberCoroutineScope()
                    val projection = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                        val data = result.data
                        if (result.resultCode == Activity.RESULT_OK && data != null) scope.launch { session.startScreenShare(data) }
                    }
                    TextButton(onClick = {
                        val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                        projection.launch(manager.createScreenCaptureIntent())
                    }) { Text("Share This Screen") }
                }
            }
        }
        if (session.companion == null) WatchTogetherArea(session.watchTogether)
        val watched = session.members.firstOrNull { it.id == session.watchedShare && it.screenShare != null }
        Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 10.dp)) {
            if (watched != null) {
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.Black).clickable { session.watchedShare = null }) {
                        VideoView(watched.screenShare!!, session, Modifier.fillMaxSize(), fill = false)
                        Text("${watched.name}'s screen · tap to close", color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).padding(horizontal = 8.dp, vertical = 3.dp))
                    }
                    TileGrid(session, Modifier.height(130.dp), small = true, onVolume = { volumeFor = it })
                }
            } else {
                TileGrid(session, Modifier.fillMaxSize(), small = false, onVolume = { volumeFor = it })
            }
            session.lastError?.let { error ->
                Text(
                    error, color = Color.White, fontSize = 13.sp,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(10.dp).clip(RoundedCornerShape(10.dp)).background(Theme.danger).clickable { session.lastError = null }.padding(10.dp),
                )
            }
        }
        ControlBar(session)
    }
    volumeFor?.let { member ->
        var value by remember(member.userId) { mutableStateOf(CallPrefs.volume(member.userId).toFloat()) }
        AlertDialog(
            onDismissRequest = { volumeFor = null },
            title = { Text(member.name) },
            text = {
                Column {
                    Text("Volume ${(value * 100).toInt()}%", color = Theme.muted)
                    Slider(value, { value = it; session.setVolume(member.userId, it.toDouble()) }, valueRange = 0f..2f,
                        colors = SliderDefaults.colors(thumbColor = Theme.accent, activeTrackColor = Theme.accent))
                }
            },
            confirmButton = { TextButton(onClick = { volumeFor = null }) { Text("Done") } },
            dismissButton = {
                TextButton(onClick = { navigator.show(Sheet.Profile(member.userId, session.roomId)); volumeFor = null }) { Text("Profile") }
            },
        )
    }
}

@Composable
private fun TileGrid(session: CallSession, modifier: Modifier, small: Boolean, onVolume: (CallMember) -> Unit) {
    val members = session.members
    val columns = when {
        small -> GridCells.Fixed(maxOf(3, members.size.coerceAtMost(4)))
        members.size <= 1 -> GridCells.Fixed(1)
        members.size <= 4 -> GridCells.Fixed(2)
        else -> GridCells.Fixed(3)
    }
    LazyVerticalGrid(columns, modifier, verticalArrangement = Arrangement.spacedBy(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(members, key = { it.id }) { member ->
            MemberTile(member, session, small, Modifier.aspectRatio(if (small) 1f else if (members.size <= 2) 0.9f else 1f), onVolume)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MemberTile(member: CallMember, session: CallSession, small: Boolean, modifier: Modifier, onVolume: (CallMember) -> Unit) {
    val ring = if (member.isSpeaking) Theme.online else Color.Transparent
    Box(
        modifier.clip(RoundedCornerShape(14.dp)).background(Theme.sidebar).border(3.dp, ring, RoundedCornerShape(14.dp))
            .combinedClickable(
                onClick = { if (member.screenShare != null) session.watchedShare = member.id },
                onLongClick = { if (!member.isLocal) onVolume(member) },
            ),
        contentAlignment = Alignment.Center,
    ) {
        val video = member.camera
        if (video != null) {
            VideoView(video, session, Modifier.fillMaxSize(), fill = true, mirror = member.isLocal)
        } else {
            val size: Dp = if (small) 44.dp else 72.dp
            Box(Modifier.alpha(if (member.isConnecting) 0.5f else 1f)) { AvatarView(member.avatarUrl, member.name, size, session.account) }
        }
        Row(
            Modifier.align(Alignment.BottomStart).padding(6.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!member.microphoneOn) {
                Icon(Icons.Filled.MicOff, "Muted", tint = Theme.danger, modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(3.dp))
            }
            Text(if (member.isLocal) "${member.name} (you)" else member.name, color = Color.White, fontSize = if (small) 10.sp else 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (member.screenShare != null) {
            Row(
                Modifier.align(Alignment.TopEnd).padding(6.dp).clip(CircleShape).background(Theme.danger).padding(horizontal = 6.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.ScreenShare, null, tint = Color.White, modifier = Modifier.size(11.dp))
                if (!small) Text(" LIVE", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
        if (member.isConnecting) CircularProgressIndicator(Modifier.align(Alignment.TopStart).padding(8.dp).size(14.dp), strokeWidth = 2.dp, color = Theme.muted)
    }
}

/** A LiveKit video track in a TextureView. */
@Composable
fun VideoView(track: VideoTrack, session: CallSession, modifier: Modifier, fill: Boolean, mirror: Boolean = false) {
    var renderer by remember { mutableStateOf<TextureViewRenderer?>(null) }
    AndroidView(
        factory = { context ->
            TextureViewRenderer(context).also {
                session.liveKitRoom.initVideoRenderer(it)
                renderer = it
            }
        },
        update = { view ->
            view.setMirror(mirror)
            view.setScalingType(if (fill) livekit.org.webrtc.RendererCommon.ScalingType.SCALE_ASPECT_FILL else livekit.org.webrtc.RendererCommon.ScalingType.SCALE_ASPECT_FIT)
        },
        onRelease = { it.release() },
        modifier = modifier,
    )
    DisposableEffect(track, renderer) {
        val view = renderer
        if (view != null) track.addRenderer(view)
        onDispose { if (view != null) track.removeRenderer(view) }
    }
}

/** Speaker, camera, microphone, share, deafen and leave in one row, like FaceTime. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ControlBar(session: CallSession) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // A new permission: the call service needs the matching type to keep it in the background.
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            app.diddy.call.CallService.start(context, session.roomName)
            scope.launch { session.toggleCamera(true) }
        }
    }
    val mic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) app.diddy.call.CallService.start(context, session.roomName)
        scope.launch { session.toggleMicrophone(granted) }
    }
    val projection = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) scope.launch { session.startScreenShare(data) }
    }
    var soundboard by remember { mutableStateOf(false) }
    if (soundboard) SoundboardSheet(session) { soundboard = false }
    Row(Modifier.fillMaxWidth().background(Theme.sidebar).padding(horizontal = 4.dp, vertical = 12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
        BarButton(if (session.speakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.Filled.VolumeDown, "Speaker", highlight = session.speakerOn) { session.toggleSpeaker() }
        Box {
            BarButton(
                if (session.cameraOn) Icons.Filled.Videocam else Icons.Filled.VideocamOff, "Camera", highlight = session.cameraOn,
                onLongClick = { if (session.cameraOn) session.flipCamera() },
            ) {
                if (!session.cameraOn && !CallManager.cameraAllowed) camera.launch(Manifest.permission.CAMERA)
                else scope.launch { session.toggleCamera(true) }
            }
        }
        BarButton(if (session.microphoneOn) Icons.Filled.Mic else Icons.Filled.MicOff, "Microphone", warn = !session.microphoneOn) {
            if (!session.microphoneOn && !CallManager.microphoneAllowed) mic.launch(Manifest.permission.RECORD_AUDIO)
            else scope.launch { session.toggleMicrophone(true) }
        }
        BarButton(if (session.screenSharing) Icons.Filled.StopScreenShare else Icons.Filled.ScreenShare, "Share Screen", highlight = session.screenSharing) {
            if (session.screenSharing) scope.launch { session.stopScreenShare() }
            else {
                val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                projection.launch(manager.createScreenCaptureIntent())
            }
        }
        BarButton(if (session.deafened) Icons.Filled.HeadsetOff else Icons.Filled.Headset, "Deafen", warn = session.deafened) { scope.launch { session.toggleDeafen() } }
        BarButton(Icons.Filled.LibraryMusic, "Soundboard", highlight = app.diddy.call.Soundboard.playing != null) { soundboard = true }
        BarButton(Icons.Filled.CallEnd, "Leave", destructive = true) { scope.launch { CallManager.leave() } }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun BarButton(icon: ImageVector, label: String, highlight: Boolean = false, warn: Boolean = false, destructive: Boolean = false, onLongClick: (() -> Unit)? = null, onClick: () -> Unit) {
    val background = when {
        destructive -> Theme.danger
        warn -> Theme.danger.copy(alpha = 0.2f)
        highlight -> Theme.text
        else -> Theme.elevated
    }
    val tint = when {
        destructive -> Color.White
        warn -> Theme.danger
        highlight -> Theme.sidebar
        else -> Theme.text
    }
    Box(
        Modifier.size(46.dp).clip(CircleShape).background(background).combinedClickable(onClick = onClick, onLongClick = onLongClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, label, tint = tint, modifier = Modifier.size(22.dp)) }
}

/** The soundboard: tap a sound to play it for everyone in the call (ios SoundboardView). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SoundboardSheet(session: CallSession, onClose: () -> Unit) {
    val board = app.diddy.call.Soundboard
    var error by remember { mutableStateOf<String?>(null) }
    var removing by remember { mutableStateOf<app.diddy.call.Soundboard.Clip?>(null) }
    var instants by remember { mutableStateOf(false) }
    if (instants) MyInstantsSheet { instants = false }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) try { board.add(uri) } catch (e: Exception) { error = e.friendlyMessage }
    }
    app.diddy.ui.FullSheet("Soundboard", onClose, closeLabel = "Done", action = "Add", onAction = { picker.launch("audio/*") }) {
        Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!session.microphoneOn) Text("Your microphone is off: only you hear the sounds. Turn it on to play them for everyone.", color = Theme.muted, fontSize = 13.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.VolumeDown, null, tint = Theme.muted)
                Slider(board.volume.toFloat(), { board.changeVolume(it.toDouble()) }, Modifier.weight(1f),
                    colors = SliderDefaults.colors(thumbColor = Theme.accent, activeTrackColor = Theme.accent))
                Icon(Icons.AutoMirrored.Filled.VolumeUp, null, tint = Theme.muted)
            }
            TextButton(onClick = { instants = true }) { Text("Search MyInstants") }
            if (board.clips.isEmpty()) Text("No sounds yet. Tap Add to pick audio files of up to 20 seconds, or search MyInstants.", color = Theme.muted)
            LazyVerticalGrid(GridCells.Adaptive(100.dp), Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(board.clips, key = { it.id }) { clip ->
                    Box(
                        Modifier.height(64.dp).clip(RoundedCornerShape(12.dp))
                            .background(if (board.playing == clip.id) Theme.accent else Theme.elevated)
                            .combinedClickable(onClick = { board.play(clip) }, onLongClick = { removing = clip })
                            .padding(8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(clip.name, color = if (board.playing == clip.id) Theme.onAccent else Theme.text, fontSize = 13.sp, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            if (board.playing != null) TextButton(onClick = { board.stopAll() }) { Text("Stop All", color = Theme.danger) }
            Text("Long-press a sound to remove it.", color = Theme.faint, fontSize = 12.sp)
        }
    }
    removing?.let { clip ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove ${clip.name}?") },
            confirmButton = { TextButton(onClick = { board.remove(clip); removing = null }) { Text("Remove", color = Theme.danger) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
    error?.let { message ->
        AlertDialog(onDismissRequest = { error = null }, title = { Text("Soundboard") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { error = null }) { Text("OK") } })
    }
}

// MARK: - Bits elsewhere in the app

/** The running call at the bottom of the list: name, how many, mute and leave (ios VoiceStatusBar). */
@Composable
fun VoiceStatusBar(account: MatrixAccount, navigator: Navigator, rounded: Boolean = false) {
    val session = CallManager.current ?: return
    val scope = rememberCoroutineScope()
    Row(
        Modifier.fillMaxWidth().let { if (rounded) it.clip(RoundedCornerShape(14.dp)) else it }.background(Theme.elevated)
            .clickable {
                if (session.account.id == account.id && account.isVoiceChannel(session.roomId)) navigator.open(session.roomId, account)
                else CallManager.showCallScreen = true
            }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.GraphicEq, null, tint = Theme.online, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(session.state, color = Theme.online, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text("${session.roomName} · ${session.members.size} in voice", color = Theme.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.size(40.dp).clip(CircleShape).clickable { scope.launch { session.toggleMicrophone(CallManager.microphoneAllowed) } }, contentAlignment = Alignment.Center) {
            Icon(if (session.microphoneOn) Icons.Filled.Mic else Icons.Filled.MicOff, "Microphone", tint = if (session.microphoneOn) Theme.text else Theme.danger)
        }
        Box(Modifier.size(40.dp).clip(CircleShape).clickable { scope.launch { CallManager.leave() } }, contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.CallEnd, "Leave call", tint = Theme.danger)
        }
    }
}

/** Calls going on in your DMs, to join with one tap, at the top of Chats. */
@Composable
fun CallHomeCard(account: MatrixAccount, navigator: Navigator) {
    val scope = rememberCoroutineScope()
    val running = account.directMessages.filter { room -> room.callParticipants.any { it != account.userId } && CallManager.current?.roomId != room.id }
    if (running.isEmpty()) return
    Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        running.forEach { room ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Theme.online.copy(alpha = 0.15f)).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AvatarView(room.avatarUrl, room.name, 34.dp, account)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(room.name, color = Theme.text, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text("Call in progress", color = Theme.online, fontSize = 12.sp)
                }
                Text(
                    "Join", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(CircleShape).background(Theme.online).clickable {
                        scope.launch { startCall(account, room.id, room.name, navigator) }
                    }.padding(horizontal = 14.dp, vertical = 6.dp),
                )
            }
        }
    }
}

/** Who is in a voice channel, under its row in the channel list. */
@Composable
fun VoiceRoster(account: MatrixAccount, roomId: String, participants: List<String>) {
    if (participants.isEmpty()) return
    LaunchedEffect(participants) { account.resolveProfiles(participants, roomId) }
    val speaking = CallManager.current?.takeIf { it.roomId == roomId }?.members?.filter { it.isSpeaking }?.map { it.userId }?.toSet() ?: emptySet()
    Column(Modifier.padding(start = 44.dp, end = 16.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        participants.forEach { userId ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                Box(Modifier.clip(CircleShape).border(2.dp, if (userId in speaking) Theme.online else Color.Transparent, CircleShape)) {
                    AvatarView(account.profiles[userId]?.avatarUrl, account.name(userId), 22.dp, account)
                }
                Spacer(Modifier.width(8.dp))
                Text(account.name(userId), color = Theme.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** In a chat with a running call: join it, or go back to it. */
@Composable
fun ChatCallBanner(account: MatrixAccount, roomId: String, title: String, navigator: Navigator) {
    val scope = rememberCoroutineScope()
    val inThis = CallManager.current?.roomId == roomId
    val others = account.summary(roomId)?.callParticipants?.filter { it != account.userId } ?: emptyList()
    if (!inThis && others.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().background(Theme.online.copy(alpha = 0.15f)).clickable {
            if (inThis) CallManager.showCallScreen = true else scope.launch { startCall(account, roomId, title, navigator) }
        }.padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.PhoneInTalk, null, tint = Theme.online, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
        Text(if (inThis) "You are in this call" else "Call in progress", color = Theme.text, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Text(if (inThis) "Open" else "Join", color = Theme.online, fontWeight = FontWeight.Bold)
    }
}

// MARK: - Settings

/** Settings > Calls (ios CallSettingsView). */
@Composable
fun CallSettingsPage() {
    val (noise, setNoise) = rememberBoolPref(CallPrefs.NOISE_SUPPRESSION_KEY, true)
    val (processing, setProcessing) = rememberBoolPref(CallPrefs.VOICE_PROCESSING_KEY, true)
    var confirmReset by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        FormSection("Microphone", "Filters background noise such as fans and typing out of your microphone. Applies the next time you join a call.") {
            FormToggle("Noise Suppression", noise, onChange = setNoise)
            FormDivider()
            FormToggle("Voice Processing", processing, "Echo cancellation and automatic gain. Keep it on with the speaker; off keeps music sounding natural.", onChange = setProcessing)
        }
        FormSection("Volumes", "Long-press someone in a call to change how loud they are. Diddy remembers it per person.") {
            FormButton("Reset Volumes", color = Theme.danger) { confirmReset = true }
        }
    }
    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text("Reset all volumes?") },
            text = { Text("Everyone plays at 100% again.") },
            confirmButton = { TextButton(onClick = { CallPrefs.resetVolumes(); confirmReset = false }) { Text("Reset", color = Theme.danger) } },
            dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } },
        )
    }
}

