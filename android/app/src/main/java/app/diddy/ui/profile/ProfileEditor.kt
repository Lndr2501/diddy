package app.diddy.ui.profile

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.DiddyOptionsRoomLogic
import app.diddy.matrix.DiddyProfile
import app.diddy.matrix.DiddyRoomChoice
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PresenceStore
import app.diddy.matrix.adoptRoomAsDiddyOptions
import app.diddy.matrix.canEditDiddyProfile
import app.diddy.matrix.connectDiddyRoom
import app.diddy.matrix.createDiddyOptionsRoom
import app.diddy.matrix.diddyRoomChoices
import app.diddy.matrix.findDiddyRoom
import app.diddy.matrix.loadDiddyProfiles
import app.diddy.matrix.updateDiddyProfileWith
import app.diddy.matrix.uploadDiddyMedia
import app.diddy.matrix.useDiddyRoomWithoutAdmin
import app.diddy.media.ImageTools
import app.diddy.ui.FullSheet
import app.diddy.ui.InputField
import app.diddy.ui.sheets.FormButton
import app.diddy.ui.sheets.FormChoice
import app.diddy.ui.sheets.FormDivider
import app.diddy.ui.sheets.FormField
import app.diddy.ui.sheets.FormSection
import app.diddy.ui.sheets.FormToggle
import app.diddy.ui.theme.Theme
import app.diddy.util.DiddyError
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch

/** What the editor changes, kept as plain values until Save. */
internal data class ProfileDraft(
    val nameColor: String = "",
    val gradientFrom: String = "",
    val gradientTo: String = "",
    val font: String = "default",
    val effect: String = "none",
    val bold: Boolean = false,
    val italic: Boolean = false,
    val cardFrom: String = "",
    val cardTo: String = "",
    val accent: String = "",
    val bannerMxc: String? = null,
    val status: String = "online",
    val bio: String = "",
    val about: Map<String, String> = emptyMap(),
    val interests: String = "",
    val links: List<Pair<String, String>> = emptyList(),
    val activityKind: String = "",
    val activityText: String = "",
    val activityDetail: String = "",
) {
    companion object {
        fun of(profile: DiddyProfile?): ProfileDraft {
            if (profile == null) return ProfileDraft()
            return ProfileDraft(
                nameColor = profile.nameColor ?: "",
                gradientFrom = profile.nameGradient?.firstOrNull() ?: "",
                gradientTo = profile.nameGradient?.lastOrNull() ?: "",
                font = profile.nameFont,
                effect = profile.nameEffect,
                bold = profile.nameBold,
                italic = profile.nameItalic,
                cardFrom = profile.cardFrom ?: "",
                cardTo = profile.cardTo ?: "",
                accent = profile.cardAccent ?: "",
                bannerMxc = profile.bannerMxc,
                status = profile.status ?: "online",
                bio = profile.bio ?: "",
                about = profile.about.toMap(),
                interests = profile.interests.joinToString(", "),
                links = profile.links,
                activityKind = profile.activity?.kind ?: "",
                activityText = profile.activity?.text ?: "",
                activityDetail = profile.activity?.detail ?: "",
            )
        }

        private val hex = Regex("^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
        fun color(value: String): String? = value.trim().takeIf { hex.matches(it) }?.lowercase()
    }

    /** Merges the draft into the stored profile, keeping everything the editor does not show. */
    fun apply(stored: Map<String, Any?>): Map<String, Any?> {
        val content = stored.toMutableMap()
        val style = linkedMapOf<String, Any?>()
        color(nameColor)?.let { style["color"] = it }
        val from = color(gradientFrom)
        val to = color(gradientTo)
        if (from != null && to != null) style["gradient"] = mapOf("from" to from, "to" to to, "angle" to 90)
        if (font != "default") style["font"] = font
        if (effect != "none") style["effect"] = effect
        if (bold) style["bold"] = true
        if (italic) style["italic"] = true
        if (style.isEmpty()) content.remove("nameStyle") else content["nameStyle"] = style
        val card = ((stored["card"] as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()).toMutableMap()
        fun setCard(key: String, value: Any?) { if (value == null) card.remove(key) else card[key] = value }
        setCard("from", color(cardFrom))
        setCard("to", color(cardTo))
        setCard("accent", color(accent))
        setCard("bannerMxc", bannerMxc)
        if (bannerMxc == null) card.remove("bannerPos")
        if (card.isEmpty()) content.remove("card") else content["card"] = card
        content["status"] = status
        if (bio.isBlank()) content.remove("bio") else content["bio"] = bio.trim().take(160)
        val facts = about.filterValues { it.isNotBlank() }.mapValues { it.value.trim() }
        if (facts.isEmpty()) content.remove("about") else content["about"] = facts
        val tags = interests.split(',').map { it.trim().take(24) }.filter { it.isNotEmpty() }.distinct().take(12)
        if (tags.isEmpty()) content.remove("interests") else content["interests"] = tags
        val kept = links.filter { it.second.isNotBlank() }.take(8)
        if (kept.isEmpty()) content.remove("links") else content["links"] = kept.map { mapOf("kind" to it.first, "url" to it.second.trim()) }
        if (activityKind.isEmpty() || activityText.isBlank()) content.remove("activity")
        else content["activity"] = buildMap {
            put("kind", activityKind)
            put("text", activityText.trim().take(60))
            if (activityDetail.isNotBlank()) put("detail", activityDetail.trim().take(60))
        }
        return content
    }
}

/** Your Diddy profile: name style, card, status, about you (ios DiddyProfileEditor, in short). */
@Composable
fun ProfileEditorSheet(account: MatrixAccount, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf(ProfileDraft()) }
    var original by remember { mutableStateOf(ProfileDraft()) }
    var saving by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }
    LaunchedEffect(reload) {
        account.loadDiddyProfiles(force = true)
        val profile = account.diddyProfiles[account.userId]
        draft = ProfileDraft.of(profile)
        original = draft
        loaded = true
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        uploading = true
        scope.launch {
            try {
                val data = ImageTools.jpegForUpload(context, uri, 1600) ?: throw DiddyError("This image could not be read.")
                draft = draft.copy(bannerMxc = account.uploadDiddyMedia(data, "image/jpeg", "banner.jpg"))
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            uploading = false
        }
    }
    val canEdit = account.diddyPrimaryRoom != null && account.canEditDiddyProfile
    FullSheet(
        "Diddy Profile", onClose, closeLabel = "Cancel",
        action = if (saving) "…" else "Save", actionEnabled = canEdit && draft != original && !saving && !uploading,
        onAction = {
            saving = true
            error = null
            scope.launch {
                try {
                    account.updateDiddyProfileWith { stored -> draft.apply(stored) }
                    PresenceStore.of(account).ownStatusChanged()
                    onClose()
                } catch (e: Exception) {
                    error = e.friendlyMessage
                }
                saving = false
            }
        },
    ) {
        if (!loaded) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
            return@FullSheet
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
            if (!canEdit) {
                OptionsRoomSetup(account) { reload++ }
                return@Column
            }
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 30.dp, vertical = 6.dp)) }
            // Preview
            val preview = DiddyProfile(
                nameColor = ProfileDraft.color(draft.nameColor),
                nameGradient = listOfNotNull(ProfileDraft.color(draft.gradientFrom), ProfileDraft.color(draft.gradientTo)).takeIf { it.size == 2 },
                nameFont = draft.font, nameEffect = draft.effect, nameBold = draft.bold, nameItalic = draft.italic,
                cardFrom = ProfileDraft.color(draft.cardFrom), cardTo = ProfileDraft.color(draft.cardTo), cardAccent = ProfileDraft.color(draft.accent),
                bannerMxc = draft.bannerMxc,
            )
            Column(Modifier.padding(16.dp).clip(RoundedCornerShape(14.dp)).background(Theme.elevated)) {
                DiddyBanner(preview, account.userId, account, Modifier.fillMaxWidth().height(90.dp))
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    app.diddy.ui.AvatarView(account.avatarUrl, account.title, 48.dp, account)
                    Spacer(Modifier.width(12.dp))
                    DiddyNameText(account.title, preview, 20.sp, FontWeight.Bold, Theme.text)
                }
            }
            FormSection("Status") {
                app.diddy.app.OwnStatusOptions.all.forEachIndexed { index, option ->
                    if (index > 0) FormDivider()
                    FormChoice(option.label, draft.status == option.status, option.description) { draft = draft.copy(status = option.status) }
                }
            }
            FormSection("Name Color", "Colors as hex, like #ff4fa3. A gradient needs both colors.") {
                ColorField("Color", draft.nameColor) { draft = draft.copy(nameColor = it) }
                FormDivider()
                ColorField("Gradient from", draft.gradientFrom) { draft = draft.copy(gradientFrom = it) }
                FormDivider()
                ColorField("Gradient to", draft.gradientTo) { draft = draft.copy(gradientTo = it) }
            }
            FormSection("Name Style") {
                ChipRow("Font", DiddyProfile.nameFonts, draft.font) { draft = draft.copy(font = it) }
                FormDivider()
                ChipRow("Effect", DiddyProfile.nameEffects, draft.effect) { draft = draft.copy(effect = it) }
                FormDivider()
                FormToggle("Bold", draft.bold) { draft = draft.copy(bold = it) }
                FormDivider()
                FormToggle("Italic", draft.italic) { draft = draft.copy(italic = it) }
            }
            FormSection("Card", "The banner shows the picture, else the two card colors.") {
                FormButton(if (draft.bannerMxc == null) "Choose Banner Picture" else "Change Banner Picture", busy = uploading) {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
                if (draft.bannerMxc != null) {
                    FormDivider()
                    FormButton("Remove Banner Picture", color = Theme.danger) { draft = draft.copy(bannerMxc = null) }
                }
                FormDivider()
                ColorField("Card from", draft.cardFrom) { draft = draft.copy(cardFrom = it) }
                FormDivider()
                ColorField("Card to", draft.cardTo) { draft = draft.copy(cardTo = it) }
                FormDivider()
                ColorField("Accent", draft.accent) { draft = draft.copy(accent = it) }
            }
            FormSection("About Me", "Up to 160 characters.") {
                FormField(draft.bio, { draft = draft.copy(bio = it.take(160)) }, "Tell people about you", singleLine = false)
            }
            FormSection("Info") {
                DiddyProfile.aboutFields.forEachIndexed { index, field ->
                    if (index > 0) FormDivider()
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(field.replaceFirstChar { it.uppercase() }, color = Theme.muted, modifier = Modifier.width(100.dp))
                        InputField(draft.about[field] ?: "", { value ->
                            draft = draft.copy(about = draft.about + (field to value.take(if (field == "age") 8 else 40)))
                        }, "")
                    }
                }
            }
            FormSection("Interests", "Separated by commas, up to 12.") {
                FormField(draft.interests, { draft = draft.copy(interests = it) }, "Music, games, coffee")
            }
            FormSection("Activity") {
                ChipRow("Kind", listOf("") + DiddyProfile.activityKinds, draft.activityKind, label = { if (it.isEmpty()) "none" else activityTitle(it) }) {
                    draft = draft.copy(activityKind = it)
                }
                if (draft.activityKind.isNotEmpty()) {
                    FormDivider()
                    FormField(draft.activityText, { draft = draft.copy(activityText = it.take(60)) }, "What")
                    FormDivider()
                    FormField(draft.activityDetail, { draft = draft.copy(activityDetail = it.take(60)) }, "Detail (optional)")
                }
            }
            FormSection("Links", "GitHub, GitLab, LinkedIn, Spotify, YouTube or a website (https).") {
                draft.links.forEachIndexed { index, (kind, url) ->
                    if (index > 0) FormDivider()
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(kind, color = Theme.muted, modifier = Modifier.width(70.dp))
                        Box(Modifier.weight(1f)) {
                            InputField(url, { value -> draft = draft.copy(links = draft.links.toMutableList().also { it[index] = kind to value }) }, "https://")
                        }
                        TextButton(onClick = { draft = draft.copy(links = draft.links.filterIndexed { i, _ -> i != index }) }) { Text("Remove", color = Theme.danger, fontSize = 12.sp) }
                    }
                }
                if (draft.links.size < 8) {
                    FormDivider()
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("web", "github", "gitlab", "linkedin", "spotify", "youtube").forEach { kind ->
                            Text("+ $kind", color = Theme.accent, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).background(Theme.input).clickable {
                                draft = draft.copy(links = draft.links + (kind to ""))
                            }.padding(horizontal = 10.dp, vertical = 6.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ColorField(title: String, value: String, onChange: (String) -> Unit) {
    Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        val color = ProfileDraft.color(value)?.let(::diddyColor)
        Box(Modifier.size(22.dp).clip(CircleShape).background(color ?: Color.Transparent).border(1.dp, Theme.faint, CircleShape))
        Spacer(Modifier.width(12.dp))
        Text(title, color = Theme.text, modifier = Modifier.weight(1f))
        Box(Modifier.width(110.dp)) { InputField(value, { onChange(it.take(7)) }, "none") }
        if (value.isNotEmpty()) TextButton(onClick = { onChange("") }) { Text("Clear", fontSize = 12.sp) }
    }
}

@Composable
private fun ChipRow(title: String, options: List<String>, selected: String, label: (String) -> String = { it }, onPick: (String) -> Unit) {
    Column(Modifier.padding(vertical = 8.dp)) {
        Text(title, color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(start = 14.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { option ->
                val on = option == selected
                Text(
                    label(option), color = if (on) Theme.onAccent else Theme.text, fontSize = 14.sp,
                    modifier = Modifier.clip(CircleShape).background(if (on) Theme.accent else Theme.input).clickable { onPick(option) }.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
    }
}

/**
 * Diddy keeps profiles in a hidden room. Without one, nothing can be saved: find it in your
 * servers, create one, or use an existing room (ios DiddyOptionsSetupView).
 */
@Composable
private fun OptionsRoomSetup(account: MatrixAccount, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var found by remember { mutableStateOf<List<DiddyRoomChoice>?>(null) }
    var choices by remember { mutableStateOf<List<DiddyRoomChoice>>(emptyList()) }
    var roomName by remember { mutableStateOf(DiddyOptionsRoomLogic.ROOM_NAME) }
    var spaceId by remember { mutableStateOf<String?>(account.spaces.firstOrNull()?.roomId) }
    var tagTopic by remember { mutableStateOf(true) }
    fun run(work: suspend () -> Unit) {
        working = true
        error = null
        scope.launch {
            try {
                work()
                account.loadDiddyProfiles(force = true)
                onDone()
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            working = false
        }
    }
    LaunchedEffect(Unit) {
        found = account.spaces.mapNotNull { runCatching { account.findDiddyRoom(it.roomId) }.getOrNull() }
        choices = runCatching { account.diddyRoomChoices() }.getOrDefault(emptyList())
    }
    Text(
        "Diddy needs a hidden room to share profiles, badges and name styles. Without it your customization cannot be saved or seen by others.",
        color = Theme.muted, modifier = Modifier.padding(16.dp),
    )
    error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 16.dp)) }
    FormSection("Join your server's room", "Looks for a room named ${DiddyOptionsRoomLogic.ROOM_NAME} or tagged in your servers.") {
        when {
            found == null -> Box(Modifier.padding(14.dp)) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.accent) }
            found!!.isEmpty() -> Text("No Diddy Options room found in your servers. Ask an admin to set one up, or create one.", color = Theme.muted, modifier = Modifier.padding(14.dp))
            else -> found!!.forEachIndexed { index, room ->
                if (index > 0) FormDivider()
                FormButton("${room.name} in ${room.spaceName ?: "your server"}", enabled = !working) { run { account.connectDiddyRoom(room.id, room.via) } }
            }
        }
    }
    FormSection("Create one", "In a server, everyone there can join the room and Diddy does it for them.") {
        FormField(roomName, { roomName = it }, DiddyOptionsRoomLogic.ROOM_NAME)
        FormDivider()
        FormChoice("No server (private room)", spaceId == null) { spaceId = null }
        account.spaces.forEach { space ->
            FormDivider()
            FormChoice(space.displayName, spaceId == space.roomId) { spaceId = space.roomId }
        }
        FormDivider()
        FormButton("Create Diddy Options Room", enabled = roomName.isNotBlank() && !working, busy = working) { run { account.createDiddyOptionsRoom(roomName.trim(), spaceId) } }
    }
    if (choices.isNotEmpty()) FormSection("Use an existing room", "You need permission to change its settings, or everyone has to choose the same room themselves.") {
        FormToggle("Let Others Find It", tagTopic, "Adds [diddy-options] to the topic.") { tagTopic = it }
        choices.forEach { choice ->
            FormDivider()
            Column {
                Text(choice.name + (choice.spaceName?.let { " · $it" } ?: ""), color = Theme.text, modifier = Modifier.padding(start = 14.dp, top = 10.dp))
                Row {
                    TextButton(onClick = { run { account.adoptRoomAsDiddyOptions(choice.id, choice.via, tagTopic) } }, enabled = !working) { Text("Use This Room") }
                    TextButton(onClick = { run { account.useDiddyRoomWithoutAdmin(choice.id, choice.via) } }, enabled = !working) { Text("Without Admin Rights") }
                }
            }
        }
    }
}
