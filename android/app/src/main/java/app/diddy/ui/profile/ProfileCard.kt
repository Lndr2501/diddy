package app.diddy.ui.profile

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Cake
import androidx.compose.material.icons.filled.Construction
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import app.diddy.matrix.DiddyProfile
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.MxcPicture
import app.diddy.ui.theme.Theme

/** The banner of a profile card: the picture, or the card colours, or a colour from the user id (ios DiddyBanner). */
@Composable
fun DiddyBanner(profile: DiddyProfile?, seed: String, account: MatrixAccount, modifier: Modifier = Modifier) {
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    val from = diddyColor(profile?.cardFrom)
    val to = diddyColor(profile?.cardTo)
    val background: Modifier = if (from != null && to != null) {
        val ends = cssGradient(profile?.cardAngle ?: 135.0, size.width.toFloat().coerceAtLeast(1f), size.height.toFloat().coerceAtLeast(1f))
        Modifier.background(Brush.linearGradient(listOf(from, to), ends.first, ends.second))
    } else {
        Modifier.background(from ?: to ?: Theme.color(seed).copy(alpha = 0.7f))
    }
    Box(modifier.onSizeChanged { size = it }.then(background)) {
        profile?.bannerMxc?.let { mxc ->
            MxcPicture(account, null, url = mxc, size = 800, modifier = Modifier.fillMaxSize(), placeholder = {})
        }
    }
}

private fun linkName(kind: String, url: String): String {
    val names = mapOf("github" to "GitHub", "gitlab" to "GitLab", "linkedin" to "LinkedIn", "spotify" to "Spotify", "youtube" to "YouTube")
    if (kind != "web") names[kind]?.let { return it }
    val host = runCatching { Uri.parse(url).host?.lowercase() }.getOrNull()
    if (host.isNullOrEmpty()) return "Website"
    return host.removePrefix("www.")
}

fun activityTitle(kind: String) = when (kind) {
    "music" -> "Listening to"
    "game" -> "Playing"
    "working" -> "Working on"
    "learning" -> "Learning"
    else -> "Doing"
}

fun activityIcon(kind: String): ImageVector = when (kind) {
    "music" -> Icons.Filled.MusicNote
    "game" -> Icons.Filled.SportsEsports
    "working" -> Icons.Filled.Construction
    "learning" -> Icons.Filled.MenuBook
    else -> Icons.Filled.AutoAwesome
}

private fun factIcon(field: String): ImageVector = when (field) {
    "pronouns" -> Icons.Filled.Person
    "location" -> Icons.Filled.Place
    "age" -> Icons.Filled.Cake
    "education" -> Icons.Filled.School
    else -> Icons.Filled.Work
}

/** About me, activity, info, interests and links, in the owner's order (ios DiddyCardModules). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DiddyCardModules(profile: DiddyProfile) {
    val context = LocalContext.current
    val accent = diddyColor(profile.cardAccent)
    @Composable
    fun section(title: String, content: @Composable () -> Unit) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title.uppercase(), color = Theme.faint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            content()
        }
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Theme.elevated).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        for (module in profile.modules) {
            when (module) {
                "bio" -> profile.bio?.let { bio -> section("About Me") { Text(bio, color = Theme.text) } }
                "activity" -> profile.activity?.let { activity ->
                    section(activityTitle(activity.kind)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(accent ?: Theme.accent), contentAlignment = Alignment.Center) {
                                Icon(activityIcon(activity.kind), null, tint = if (accent == null) Theme.onAccent else Color.White, modifier = Modifier.size(18.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(activity.text, color = Theme.text)
                                activity.detail?.let { Text(it, color = Theme.muted, fontSize = 12.sp) }
                            }
                        }
                    }
                }
                "about" -> if (profile.about.isNotEmpty()) section("Info") {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        profile.about.forEach { (field, value) ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(factIcon(field), null, tint = accent ?: Theme.muted, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(value, color = Theme.text)
                            }
                        }
                    }
                }
                "interests" -> if (profile.interests.isNotEmpty()) section("Interests") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        profile.interests.forEach { interest ->
                            val shape = CircleShape
                            Text(
                                interest, color = Theme.text, fontSize = 13.sp,
                                modifier = Modifier.clip(shape).background(Theme.input)
                                    .let { m -> if (accent != null) m.background(accent.copy(alpha = 0.16f)).border(1.dp, accent.copy(alpha = 0.3f), shape) else m }
                                    .padding(horizontal = 10.dp, vertical = 4.dp),
                            )
                        }
                    }
                }
                "links" -> if (profile.links.isNotEmpty()) section("Links") {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        profile.links.forEach { (kind, url) ->
                            Row(
                                Modifier.clickable { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(if (kind == "web") Icons.Filled.Public else Icons.Filled.Link, null, tint = accent ?: Theme.accent, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(linkName(kind, url), color = accent ?: Theme.accent, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
    }
}
