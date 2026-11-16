package app.diddy.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.app.OwnStatusOptions
import app.diddy.matrix.DiddyBadge
import app.diddy.matrix.DiddyNameplate
import app.diddy.matrix.DiddyProfile
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PresenceState
import app.diddy.matrix.PresenceStore
import app.diddy.matrix.updateDiddyProfile
import app.diddy.ui.AvatarView
import app.diddy.ui.MessageDialog
import app.diddy.ui.MxcPicture
import app.diddy.ui.Navigator
import app.diddy.ui.Sheet
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin

/** `#rrggbb` or `#rrggbbaa`, already checked by `DiddyProfile.color`. */
fun diddyColor(hex: String?): Color? {
    if (hex == null || !hex.startsWith("#")) return null
    val value = hex.drop(1).toLongOrNull(16) ?: return null
    return if (hex.length == 9) Color(((value and 0xFF) shl 24) or (value shr 8)) else Color(0xFF000000 or value)
}

/** Start and end of a CSS `linear-gradient(<angle>deg, ...)` in a box of the given size. */
fun cssGradient(angle: Double, width: Float, height: Float): Pair<Offset, Offset> {
    val radians = Math.toRadians(angle)
    val dx = (sin(radians) / 2).toFloat()
    val dy = (-cos(radians) / 2).toFloat()
    return Offset(width * (0.5f - dx), height * (0.5f - dy)) to Offset(width * (0.5f + dx), height * (0.5f + dy))
}

/** The families desktop offers, as the fonts Android ships with. */
private fun nameFamily(font: String): FontFamily? = when (font) {
    "serif" -> FontFamily.Serif
    "mono" -> FontFamily.Monospace
    "rounded" -> FontFamily.SansSerif
    "impact" -> FontFamily.SansSerif
    "script" -> FontFamily.Cursive
    "fantasy" -> FontFamily.Cursive
    "marker" -> FontFamily.Cursive
    else -> null
}

/** A display name in the colour, gradient, font, effect and weight the person chose in Diddy. */
@Composable
fun DiddyNameText(
    name: String,
    profile: DiddyProfile?,
    fontSize: TextUnit = 17.sp,
    weight: FontWeight? = null,
    fallback: Color = Theme.text,
    modifier: Modifier = Modifier,
) {
    val gradientStops = profile?.nameGradient
    val gradientFrom = gradientStops?.firstOrNull()?.let(::diddyColor)
    val gradientTo = gradientStops?.lastOrNull()?.let(::diddyColor)
    val gradient: Pair<Color, Color>? = if (gradientFrom != null && gradientTo != null) gradientFrom to gradientTo else null
    val color = diddyColor(profile?.nameColor) ?: fallback
    val effectColor = gradient?.first ?: color
    val shadow = when (profile?.nameEffect) {
        "glow" -> Shadow(effectColor.copy(alpha = 0.9f), Offset.Zero, 12f)
        "shadow" -> Shadow(Color.Black.copy(alpha = 0.6f), Offset(0f, 4f), 4f)
        "outline" -> Shadow(effectColor, Offset.Zero, 2f)
        else -> null
    }
    val base = TextStyle(
        color = color,
        fontSize = fontSize,
        fontWeight = if (profile?.nameBold == true) FontWeight.Bold else weight,
        fontStyle = if (profile?.nameItalic == true) FontStyle.Italic else null,
        fontFamily = profile?.nameFont?.let(::nameFamily),
        shadow = shadow,
    )
    val style = if (gradient == null) base else {
        val ends = cssGradient(profile?.nameGradientAngle ?: 90.0, 200f, 24f)
        base.merge(TextStyle(brush = Brush.linearGradient(listOf(gradient.first, gradient.second), ends.first, ends.second)))
    }
    Text(name, style = style, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)
}

/** The badges someone chose to show next to their name, as small tinted chips. */
@Composable
fun DiddyBadgesRow(badges: List<DiddyBadge>, size: Dp = 14.dp, account: MatrixAccount?) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.padding4()) {
        badges.forEach { badge ->
            val tint = diddyColor(badge.color) ?: diddyColor("#9b9baa")!!
            val side = size * 1.3f
            Box(
                Modifier.size(side).clip(RoundedCornerShape(side * 0.32f)).background(tint.copy(alpha = 0.22f))
                    .border(1.dp, tint.copy(alpha = 0.45f), RoundedCornerShape(side * 0.32f)),
                contentAlignment = Alignment.Center,
            ) {
                if (badge.imageMxc != null && account != null) {
                    AvatarView(badge.imageMxc, badge.name, size, account, cornerRadius = 3.dp)
                } else {
                    Text(badge.emoji ?: badge.name.take(1).uppercase(), fontSize = (size.value * 0.85f).sp)
                }
            }
        }
    }
}

private fun Modifier.padding4() = this.then(Modifier.offset(x = 4.dp))

/** The colour of a presence state, the same in every theme like on desktop. */
val PresenceState.color: Color get() = Color(0xFF000000 or hex)

/** Online status dot on an avatar (ios PresenceDot). Nothing when nothing is known. */
@Composable
fun PresenceDot(userId: String?, account: MatrixAccount, size: Dp, ring: Color = Theme.sidebar, modifier: Modifier = Modifier) {
    if (userId == null) return
    val store = remember(account.id) { PresenceStore.of(account) }
    DisposableEffect(userId) {
        store.watch(userId)
        onDispose { store.unwatch(userId) }
    }
    val state = store.state(userId) ?: return
    Box(
        modifier.size(size).clip(CircleShape).background(ring).padding2(size),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(size * 0.7f).clip(CircleShape).background(state.color))
    }
}

private fun Modifier.padding2(size: Dp) = this

/** Your picture with the status dot; a tap opens the status choice and the profile editor. */
@Composable
fun OwnStatusButton(account: MatrixAccount, navigator: Navigator, size: Dp) {
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val store = remember(account.id) { PresenceStore.of(account) }
    Box {
        Box(Modifier.clickable { open = true }) {
            AvatarView(account.avatarUrl, account.title, size, account)
            PresenceDot(account.userId, account, size * 0.3f, Theme.sidebar, Modifier.align(Alignment.BottomEnd))
        }
        DropdownMenu(open, { open = false }) {
            OwnStatusOptions.all.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    leadingIcon = {
                        Box(Modifier.size(12.dp).clip(CircleShape).background(app.diddy.matrix.PresenceLogic.own(option.status).color))
                    },
                    trailingIcon = { if (store.ownStatus == option.status) Icon(Icons.Filled.CheckCircle, null, tint = Theme.accent) },
                    onClick = {
                        open = false
                        scope.launch {
                            try {
                                account.updateDiddyProfile(mapOf("status" to option.status))
                                store.ownStatusChanged()
                            } catch (e: Exception) {
                                error = e.friendlyMessage
                            }
                        }
                    },
                )
            }
            HorizontalDivider()
            DropdownMenuItem(text = { Text("Edit Profile") }, leadingIcon = { Icon(Icons.Filled.Edit, null) }, onClick = {
                open = false
                navigator.show(Sheet.ProfileEditor(account.userId))
            })
        }
    }
    MessageDialog("Status", error) { error = null }
}

/** The background someone set for their row in member and DM lists (desktop nameplate.ts). */
@Composable
fun NameplateBackground(nameplate: DiddyNameplate?, account: MatrixAccount, modifier: Modifier = Modifier) {
    if (nameplate == null) return
    val colors = nameplate.backgroundColors?.mapNotNull(::diddyColor)
    Box(modifier) {
        if (colors != null && colors.isNotEmpty()) {
            Box(Modifier.matchParentSizeCompat().background(Brush.horizontalGradient(colors.map { it.copy(alpha = if (nameplate.preset != null) 0.55f else 0.45f) })))
        }
        val media = nameplate.imageMxc
        if (media != null) {
            MxcPicture(account, null, url = media, size = 600, modifier = Modifier.matchParentSizeCompat())
            if (!nameplate.fitsFullRow) {
                Box(Modifier.matchParentSizeCompat().background(Brush.horizontalGradient(listOf(Theme.sidebar, Theme.sidebar.copy(alpha = 0.6f), Color.Transparent))))
            }
        }
    }
}

private fun Modifier.matchParentSizeCompat() = this.then(Modifier.fillMaxSize())

fun statusTitle(status: String?) = DiddyProfile.statusTitle(status)
