package app.diddy.ui.sheets

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.AvatarView
import app.diddy.ui.Divider
import app.diddy.ui.InputField
import app.diddy.ui.profile.DiddyBadgesRow
import app.diddy.ui.profile.DiddyNameText
import app.diddy.ui.profile.NameplateBackground
import app.diddy.ui.profile.PresenceDot
import app.diddy.ui.theme.Theme

/** A grouped section of a form (an iOS Form section): header, rounded card, footer. */
@Composable
fun FormSection(
    header: String? = null,
    footer: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        if (header != null) {
            Text(header.uppercase(), color = Theme.faint, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 14.dp, bottom = 6.dp))
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Theme.elevated)) { content() }
        if (footer != null) {
            Text(footer, color = Theme.faint, fontSize = 12.sp, modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = 6.dp))
        }
    }
}

/** A text field inside a form section. */
@Composable
fun FormField(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    singleLine: Boolean = true,
    password: Boolean = false,
    imeAction: ImeAction = ImeAction.Done,
    onGo: (() -> Unit)? = null,
) {
    Box(Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp).padding(horizontal = 14.dp, vertical = 13.dp), contentAlignment = Alignment.CenterStart) {
        InputField(value, onChange, placeholder, password = password, singleLine = singleLine, imeAction = imeAction, onGo = onGo)
    }
}

/** A tappable row of a form section: optional icon, title, detail on the right. */
@Composable
fun FormButton(
    title: String,
    icon: ImageVector? = null,
    detail: String? = null,
    color: Color = Theme.accent,
    enabled: Boolean = true,
    busy: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp).clickable(enabled = enabled && !busy, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val tint = if (enabled) color else Theme.faint
        if (icon != null) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
        }
        Text(title, color = tint, fontSize = 16.sp, modifier = Modifier.weight(1f))
        if (busy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Theme.accent)
        else if (detail != null) Text(detail, color = Theme.muted, fontSize = 15.sp)
    }
}

/** A switch row with an optional explanation under the title. */
@Composable
fun FormToggle(title: String, checked: Boolean, detail: String? = null, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled) { onChange(!checked) }.padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = if (enabled) Theme.text else Theme.faint, fontSize = 16.sp)
            if (detail != null) Text(detail, color = Theme.muted, fontSize = 12.sp)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = Theme.accent, checkedThumbColor = Theme.onAccent),
        )
    }
}

/** One choice of a list where exactly one is picked (an inline iOS picker). */
@Composable
fun FormChoice(title: String, selected: Boolean, detail: String? = null, icon: ImageVector? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 46.dp).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = Theme.muted, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = Theme.text, fontSize = 16.sp)
            if (detail != null) Text(detail, color = Theme.muted, fontSize = 12.sp)
        }
        if (selected) Icon(Icons.Filled.Check, null, tint = Theme.accent, modifier = Modifier.size(20.dp))
    }
}

/** A thin line between rows of a section. */
@Composable
fun FormDivider() = Divider(Modifier.padding(start = 14.dp))

/** The search bar at the top of list sheets. */
@Composable
fun SearchBar(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, onGo: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp).clip(RoundedCornerShape(10.dp)).background(Theme.elevated)
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Search, null, tint = Theme.faint, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        InputField(value, onChange, placeholder, imeAction = ImeAction.Search, onGo = onGo)
    }
}

/** A person in a list: avatar with presence, Diddy name and badges, a line under it (ios PersonRow). */
@Composable
fun PersonRow(
    account: MatrixAccount,
    name: String,
    subtitle: String?,
    avatarUrl: String?,
    userId: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    avatarSize: Dp = 36.dp,
    onClick: (() -> Unit)? = null,
) {
    val diddy = userId?.let { account.diddyProfiles[it] }
    val badges = userId?.let { account.diddyBadges[it] } ?: emptyList()
    Box(Modifier.fillMaxWidth()) {
        NameplateBackground(diddy?.nameplate, account, Modifier.matchParentSize())
        Row(
            Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box {
                AvatarView(avatarUrl, name, avatarSize, account)
                PresenceDot(userId, account, 12.dp, Theme.sidebar, Modifier.align(Alignment.BottomEnd))
            }
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    DiddyNameText(name, diddy, 16.sp, FontWeight.Medium, Theme.text, Modifier.weight(1f, fill = false))
                    if (badges.isNotEmpty()) DiddyBadgesRow(badges, 13.dp, account)
                }
                if (subtitle != null) Text(subtitle, color = Theme.faint, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            trailing?.invoke()
        }
    }
}

/** Small uppercase header of a list group, with a count like Discord ("MEMBERS — 12"). */
@Composable
fun GroupHeader(title: String, count: Int? = null) {
    Text(
        title.uppercase() + (count?.let { " — $it" } ?: ""),
        color = Theme.faint,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
    )
}

/** Centered note for empty lists and errors. */
@Composable
fun EmptyNote(text: String, color: Color = Theme.muted) {
    Text(text, color = color, fontSize = 15.sp, modifier = Modifier.fillMaxWidth().padding(24.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
}
