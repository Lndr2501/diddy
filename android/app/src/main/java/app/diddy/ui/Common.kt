package app.diddy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.MatrixAccount
import app.diddy.media.MxcImage
import app.diddy.ui.theme.Theme
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import org.matrix.rustcomponents.sdk.MediaSource

/**
 * Round avatar with the Discord fallback: coloured circle with the first letter (ios AvatarView).
 * `account` is the login the avatar URL came from; its client downloads the image.
 */
@Composable
fun AvatarView(
    url: String?,
    name: String,
    size: Dp = 40.dp,
    account: MatrixAccount?,
    cornerRadius: Dp? = null,
    modifier: Modifier = Modifier,
) {
    val shape: Shape = cornerRadius?.let { RoundedCornerShape(it) } ?: CircleShape
    val context = LocalContext.current
    val pixels = (size.value * 3).toInt()
    val data = remember(account?.id, url, pixels) { account?.let { MxcImage.of(it, url, pixels) } }
    Box(modifier.size(size).clip(shape), contentAlignment = Alignment.Center) {
        val fallback: @Composable () -> Unit = {
            Box(Modifier.size(size).background(Theme.color(name)), contentAlignment = Alignment.Center) {
                Text(initial(name), color = Color.White, fontSize = (size.value * 0.42f).sp, fontWeight = FontWeight.SemiBold)
            }
        }
        if (data == null) {
            fallback()
        } else {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context).data(data).crossfade(true).build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size),
                loading = { fallback() },
                error = { fallback() },
            )
        }
    }
}

fun initial(name: String): String = name.trim('@', '#', '!').firstOrNull()?.uppercase() ?: "?"

/** A picture from the homeserver, any size (chat images, banners). */
@Composable
fun MxcPicture(
    account: MatrixAccount,
    source: MediaSource?,
    url: String? = null,
    size: Int?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    placeholder: @Composable () -> Unit = { Box(Modifier.background(Theme.elevated)) },
) {
    val context = LocalContext.current
    val data = remember(account.id, source, url, size) {
        source?.let { MxcImage(account, it, size) } ?: MxcImage.of(account, url, size)
    }
    if (data == null) {
        Box(modifier) { placeholder() }
        return
    }
    SubcomposeAsyncImage(
        model = ImageRequest.Builder(context).data(data).crossfade(true).build(),
        contentDescription = null,
        contentScale = contentScale,
        modifier = modifier,
        loading = { placeholder() },
        error = { placeholder() },
    )
}

/** Small red unread pill. */
@Composable
fun UnreadBadge(count: Long) {
    Box(
        Modifier.defaultMinSize(16.dp, 16.dp).clip(CircleShape).background(Theme.danger).padding(horizontal = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else "$count", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/** The small count on a tab or a chat row, in the accent colour: something is for you. */
@Composable
fun TabBadge(count: Int, modifier: Modifier = Modifier) {
    Box(
        modifier.defaultMinSize(18.dp, 18.dp).clip(CircleShape).background(Theme.accent)
            .border(2.dp, Theme.rail, CircleShape).padding(horizontal = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else "$count", color = Theme.onAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/** Uppercase section title of lists. */
@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier) {
    Text(
        title.uppercase(),
        color = Theme.faint,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        modifier = modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 6.dp),
    )
}

/** The wide accent button of the login and setup screens. */
@Composable
fun FilledButton(title: String, busy: Boolean = false, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(if (enabled) Theme.accent else Theme.accent.copy(alpha = 0.5f))
            .clickable(enabled = enabled && !busy, onClick = onClick).padding(vertical = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(16.dp), color = Theme.onAccent, strokeWidth = 2.dp)
            Spacer(Modifier.width(8.dp))
        }
        Text(title, color = Theme.onAccent, fontWeight = FontWeight.Bold)
    }
}

/** A round icon button of the phone headers. */
@Composable
fun RoundIconButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Box(Modifier.size(48.dp).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Theme.elevated), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = Theme.text, modifier = Modifier.size(20.dp))
        }
    }
}

/** One settings-like row: icon, title, optional detail and a chevron. */
@Composable
fun ListRow(
    icon: ImageVector?,
    title: String,
    detail: String? = null,
    tint: Color = Theme.text,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)?,
) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 50.dp).let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = if (tint == Theme.text) Theme.muted else tint, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = tint, fontSize = 16.sp)
            if (detail != null) Text(detail, color = Theme.muted, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
    }
}

/** A simple message box with OK. */
@Composable
fun MessageDialog(title: String, message: String?, onDismiss: () -> Unit) {
    if (message == null) return
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
        title = { Text(title) },
        text = { Text(message) },
    )
}

/** A rounded card on the elevated surface, like the iOS grouped lists. */
@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Theme.elevated)) { content() }
}

@Composable
fun Divider(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Theme.text.copy(alpha = 0.07f)))
}

/**
 * A screen over everything (an iOS sheet): a bar with the title, Close on the left and an optional
 * action on the right, then the content.
 */
@Composable
fun FullSheet(
    title: String,
    onClose: () -> Unit,
    closeLabel: String = "Close",
    action: String? = null,
    actionEnabled: Boolean = true,
    onAction: () -> Unit = {},
    background: Color = Theme.sidebar,
    /** Keeps the sheet out of screenshots, screen sharing and the app switcher (recovery keys). */
    secure: Boolean = false,
    content: @Composable () -> Unit,
) {
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onClose,
        properties = androidx.compose.ui.window.DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
            securePolicy = if (secure) androidx.compose.ui.window.SecureFlagPolicy.SecureOn else androidx.compose.ui.window.SecureFlagPolicy.Inherit,
        ),
    ) {
        Column(
            Modifier.fillMaxSize().background(background).androidxStatusBars().androidxImePadding(),
        ) {
            Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onClose) { Text(closeLabel, color = Theme.accent) }
                Text(title, color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                if (action != null) TextButton(onClick = onAction, enabled = actionEnabled) { Text(action, color = if (actionEnabled) Theme.accent else Theme.faint, fontWeight = FontWeight.SemiBold) }
                else Spacer(Modifier.width(72.dp))
            }
            Divider()
            Box(Modifier.fillMaxSize().androidxNavigationBars()) { content() }
        }
    }
}

private fun Modifier.androidxStatusBars() = this.then(Modifier.statusBarsPaddingCompat())
private fun Modifier.androidxNavigationBars() = this.then(Modifier.navigationBarsPaddingCompat())
private fun Modifier.androidxImePadding() = this.then(Modifier.imePaddingCompat())
