package app.diddy.ui.settings

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.BuildConfig
import app.diddy.app.AppearanceLogic
import app.diddy.app.ChatSettings
import app.diddy.app.CustomSounds
import app.diddy.app.CustomThemeConfig
import app.diddy.app.DateFormatRules
import app.diddy.app.DiagLog
import app.diddy.app.Sound
import app.diddy.app.Sounds
import app.diddy.matrix.AccountDevice
import app.diddy.matrix.DeviceSignOutResult
import app.diddy.matrix.KeyBackupInfo
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.NotificationLevel
import app.diddy.matrix.PushRuleLogic
import app.diddy.matrix.UiaChallenge
import app.diddy.matrix.VerificationCenter
import app.diddy.matrix.accessTokenForDeveloper
import app.diddy.matrix.accountDevices
import app.diddy.matrix.accountManagementUrl
import app.diddy.matrix.addNotificationKeyword
import app.diddy.matrix.changeRecoveryKey
import app.diddy.matrix.deletePushRule
import app.diddy.matrix.emailAddresses
import app.diddy.matrix.emailNotificationState
import app.diddy.matrix.enableKeyBackup
import app.diddy.matrix.enableRecovery
import app.diddy.matrix.keyBackupInfo
import app.diddy.matrix.pushRules
import app.diddy.matrix.renameDevice
import app.diddy.matrix.setEmailNotifications
import app.diddy.matrix.setPushRuleActions
import app.diddy.matrix.signOutDevices
import app.diddy.push.PushSettings
import app.diddy.ui.InputField
import app.diddy.ui.Navigator
import app.diddy.ui.Sheet
import app.diddy.ui.chat.shareFile
import app.diddy.ui.home.copyToClipboard
import app.diddy.ui.sheets.FormButton
import app.diddy.ui.sheets.FormChoice
import app.diddy.ui.sheets.FormDivider
import app.diddy.ui.sheets.FormField
import app.diddy.ui.sheets.FormSection
import app.diddy.ui.sheets.FormToggle
import app.diddy.ui.theme.DiddyTheme
import app.diddy.ui.theme.Theme
import app.diddy.ui.theme.ThemeStore
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.VerificationState
import java.text.DateFormat
import java.util.Date

@Composable
private fun Page(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) { content() }
}

@Composable
private fun Value(title: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp)) {
        Text(title, color = Theme.text, modifier = Modifier.weight(1f))
        Text(value, color = Theme.muted)
    }
}

// MARK: - Appearance

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppearancePage(open: (SettingsPage) -> Unit) {
    val themes = DiddyTheme.all + DiddyTheme.custom(ThemeStore.custom)
    Page {
        FormSection("Theme") {
            FormToggle("Match System Appearance", ThemeStore.useSystem, "Use a light theme by day and a dark one by night, like the phone.") { ThemeStore.changeUseSystem(it) }
        }
        @Composable
        fun grid(title: String, selected: String, onPick: (DiddyTheme) -> Unit) {
            FormSection(title) {
                FlowRow(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    themes.forEach { theme -> ThemeTile(theme, theme.id == selected) { onPick(theme) } }
                }
            }
        }
        if (ThemeStore.useSystem) {
            grid("Light", ThemeStore.lightId) { ThemeStore.setLight(it) }
            grid("Dark", ThemeStore.darkId) { ThemeStore.setDark(it) }
        } else {
            grid("Themes", ThemeStore.selectedId) { ThemeStore.select(it) }
        }
        FormSection { FormButton("Custom Theme Colors") { open(SettingsPage.CUSTOM_THEME) } }
        FormSection("Display", "Page Zoom goes from 75% to 150% and works on top of the font size set in Android.") {
            Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Page Zoom", color = Theme.text, modifier = Modifier.weight(1f))
                Text("${ThemeStore.zoom}%", color = Theme.muted)
                TextButton(onClick = { ThemeStore.changeZoom(AppearanceLogic.DEFAULT_ZOOM) }, enabled = ThemeStore.zoom != AppearanceLogic.DEFAULT_ZOOM) { Text("Reset") }
            }
            Slider(
                value = ThemeStore.zoom.toFloat(),
                onValueChange = { ThemeStore.changeZoom((it / 5).toInt() * 5) },
                valueRange = AppearanceLogic.zoomRange.first.toFloat()..AppearanceLogic.zoomRange.last.toFloat(),
                colors = SliderDefaults.colors(thumbColor = Theme.accent, activeTrackColor = Theme.accent),
                modifier = Modifier.padding(horizontal = 14.dp),
            )
        }
    }
}

@Composable
private fun ThemeTile(theme: DiddyTheme, selected: Boolean, onClick: () -> Unit) {
    Column(Modifier.width(96.dp).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.fillMaxWidth().height(64.dp).clip(RoundedCornerShape(12.dp)).background(theme.chat)
                .border(if (selected) 3.dp else 1.dp, if (selected) Theme.accent else Theme.input, RoundedCornerShape(12.dp)),
        ) {
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.width(18.dp).fillMaxSize().background(theme.rail))
                Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(Modifier.width(40.dp).height(6.dp).clip(CircleShape).background(theme.text.copy(alpha = 0.8f)))
                    Box(Modifier.width(28.dp).height(6.dp).clip(CircleShape).background(theme.muted))
                    Box(Modifier.width(22.dp).height(10.dp).clip(CircleShape).background(theme.accent))
                }
            }
        }
        Text(theme.name, color = if (selected) Theme.text else Theme.muted, fontSize = 12.sp, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
    }
}

/** The three colours of the custom theme, as hex values (ios CustomThemeView). */
@Composable
fun CustomThemePage() {
    var draft by remember { mutableStateOf(ThemeStore.savedCustomConfig()) }
    Page {
        Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
            ThemeTile(DiddyTheme.custom(draft), ThemeStore.selectedId == AppearanceLogic.CUSTOM_THEME_ID) {}
        }
        FormSection(footer = "Pick the “Custom” theme in the theme list to use these colors. Colors as hex, like #FF4FA3.") {
            @Composable
            fun colorRow(title: String, value: String, change: (String) -> Unit) {
                Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    val parsed = AppearanceLogic.parseHex(value)
                    Box(Modifier.size(22.dp).clip(CircleShape).background(parsed?.let { Color(0xFF000000 or it) } ?: Color.Transparent).border(1.dp, Theme.faint, CircleShape))
                    Spacer(Modifier.width(12.dp))
                    Text(title, color = Theme.text, modifier = Modifier.weight(1f))
                    Box(Modifier.width(110.dp)) { InputField(value, change, "#RRGGBB") }
                }
            }
            colorRow("Accent", draft.accent) { draft = draft.copy(accent = it) }
            FormDivider()
            colorRow("Background", draft.background) { draft = draft.copy(background = it) }
            FormDivider()
            colorRow("Text", draft.text) { draft = draft.copy(text = it) }
        }
        val valid = listOf(draft.accent, draft.background, draft.text).all { AppearanceLogic.parseHex(it) != null }
        FormSection {
            FormButton("Save Colors", enabled = valid && draft != ThemeStore.custom) {
                ThemeStore.changeCustom(CustomThemeConfig.decode(draft.encoded()))
            }
            FormDivider()
            FormButton("Reset Colors", enabled = draft != CustomThemeConfig.defaults) { draft = CustomThemeConfig.defaults }
        }
    }
}

// MARK: - Chat

@Composable
fun ChatSettingsPage() {
    val (showMembership, setShowMembership) = rememberBoolPref(ChatSettings.SHOW_MEMBERSHIP_KEY, true)
    val (autoLoad, setAutoLoad) = rememberBoolPref(ChatSettings.AUTO_LOAD_MEDIA_KEY, true)
    val (previews, setPreviews) = rememberBoolPref(ChatSettings.URL_PREVIEWS_KEY, true)
    val (encryptedPreviews, setEncryptedPreviews) = rememberBoolPref(ChatSettings.ENCRYPTED_URL_PREVIEWS_KEY, true)
    val (timeFormat, setTimeFormat) = rememberStringPref(ChatSettings.TIME_FORMAT_KEY, ChatSettings.TimeFormat.SYSTEM.raw)
    val (dateFormat, setDateFormat) = rememberStringPref(ChatSettings.DATE_FORMAT_KEY, DateFormatRules.DEFAULT_FORMAT)
    var customDate by remember { mutableStateOf(dateFormat !in DateFormatRules.presets) }
    val (enterNewline, setEnterNewline) = rememberBoolPref(ChatSettings.ENTER_FOR_NEWLINE_KEY, false)
    val (markdown, setMarkdown) = rememberBoolPref(ChatSettings.MARKDOWN_KEY, true)
    val (toolbar, setToolbar) = rememberBoolPref(ChatSettings.EDITOR_TOOLBAR_KEY, false)
    val (share, setShare) = rememberBoolPref(ChatSettings.SHARE_ACTIVITY_KEY, true)
    val (nameplates, setNameplates) = rememberBoolPref(DecorationPrefs.NAMEPLATES_KEY, true)
    Page {
        FormSection("Timeline") { FormToggle("Hide Membership Change", !showMembership) { setShowMembership(!it) } }
        FormSection("Media & Previews") {
            FormToggle("Disable Media Auto Load", !autoLoad) { setAutoLoad(!it) }
            FormDivider()
            FormToggle("Url Preview", previews, onChange = setPreviews)
            FormDivider()
            FormToggle("Url Preview in Encrypted Room", encryptedPreviews, onChange = setEncryptedPreviews)
        }
        FormSection("Time Format") {
            ChatSettings.TimeFormat.entries.forEachIndexed { index, format ->
                if (index > 0) FormDivider()
                FormChoice(format.title, timeFormat == format.raw) { setTimeFormat(format.raw) }
            }
        }
        FormSection(
            "Date Format",
            "Example: ${ChatSettings.chatTimestamp(Date())}" + if (customDate) "\nCustom format with the desktop's tokens, for example YYYY, MM, DD, D, MMM, MMMM, dddd. Text in [brackets] is shown as it is." else "",
        ) {
            DateFormatRules.presets.forEach { preset ->
                FormChoice(DateFormatRules.string(Date(), preset), !customDate && dateFormat == preset) { customDate = false; setDateFormat(preset) }
                FormDivider()
            }
            FormChoice("Custom", customDate) { customDate = true }
            if (customDate) {
                FormDivider()
                FormField(dateFormat, { setDateFormat(it.take(DateFormatRules.MAX_LENGTH)) }, "D MMM YYYY")
            }
        }
        FormSection("Editor") {
            FormToggle("ENTER for Newline", enterNewline, "Use the send button to send and Enter for a new line.", onChange = setEnterNewline)
            FormDivider()
            FormToggle("Markdown Formatting", markdown, onChange = setMarkdown)
            FormDivider()
            FormToggle("Editor Toolbar", toolbar, onChange = setToolbar)
            FormDivider()
            FormToggle("Hide Typing & Read Receipts", !share, "Turn off both typing status and read receipts to keep your activity private.") { setShare(!it) }
        }
        FormSection("Profile Decorations", "What other people add to their profile.") {
            FormToggle("Nameplates", nameplates, "Pictures and gradients behind names in the member and DM lists.", onChange = setNameplates)
        }
    }
}

/** Switches for what other people add to their profile (ios AvatarPrefs). */
object DecorationPrefs {
    const val NAMEPLATES_KEY = "diddy.nameplates"
    val nameplates: Boolean get() = app.diddy.app.Prefs.bool(NAMEPLATES_KEY, true)
}

// MARK: - Notifications

@Composable
fun NotificationsPage(account: MatrixAccount, open: (SettingsPage) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var rules by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var loaded by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<Set<String>>(emptySet()) }
    var error by remember { mutableStateOf<String?>(null) }
    var keyword by remember { mutableStateOf("") }
    var email by remember { mutableStateOf<PushRuleLogic.EmailState?>(null) }
    var emailFailed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var pushOn by remember { mutableStateOf(PushSettings.enabled) }
    // Push works without the permission too, but Android then hides the notifications.
    val pushPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) { PushSettings.setEnabled(context, true); pushOn = true }
    }
    LaunchedEffect(reload) {
        try {
            rules = account.pushRules()
            loaded = true
            error = null
        } catch (e: Exception) {
            error = e.friendlyMessage
        }
        try { email = account.emailNotificationState() } catch (_: Exception) { emailFailed = true }
    }
    fun change(ruleId: String, kind: String, level: NotificationLevel, highlight: Boolean) {
        busy = busy + ruleId
        scope.launch {
            try {
                account.setPushRuleActions(kind, ruleId, PushRuleLogic.actions(level, highlight))
                rules = account.pushRules()
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            busy = busy - ruleId
        }
    }
    Page {
        val push = app.diddy.push.UnifiedPushing
        var distributors by remember { mutableStateOf(push.distributors()) }
        // Back from installing ntfy: look again.
        androidx.lifecycle.compose.LifecycleResumeEffect(Unit) {
            distributors = push.distributors()
            onPauseOrDispose {}
        }
        FormSection(
            "Push",
            when {
                distributors.isEmpty() -> "Install ntfy (F-Droid or Play Store) or another UnifiedPush app. Then the server wakes Diddy for each message, without a connection that stays open."
                push.enabled -> push.status ?: "The server wakes Diddy through ${push.savedDistributor ?: "your push app"} for each message."
                else -> "Uses ${distributors.joinToString()} so the server wakes Diddy for each message. Saves battery compared with the background connection."
            },
        ) {
            FormToggle("Push Notifications (UnifiedPush)", push.enabled, enabled = distributors.isNotEmpty()) { on ->
                if (on) {
                    if (android.os.Build.VERSION.SDK_INT >= 33 &&
                        context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
                    ) pushPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    push.enable(context) {}
                } else push.disable()
            }
            if (push.enabled && distributors.size > 1) {
                FormDivider()
                FormButton("Choose Push App") { push.pick(context) }
            }
        }
        FormSection(
            "This Device",
            "Diddy keeps a quiet connection open so new messages, mentions and calls show up as notifications while the app is closed. Android shows a small permanent notification for it.",
        ) {
            FormToggle("Background Notifications", pushOn) { on ->
                if (on && android.os.Build.VERSION.SDK_INT >= 33 &&
                    context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    permission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    PushSettings.setEnabled(context, on)
                    pushOn = on
                }
            }
            FormDivider()
            FormButton("Sounds", color = Theme.text) { open(SettingsPage.SOUNDS) }
            FormDivider()
            FormButton("Call Alerts", color = Theme.text) { open(SettingsPage.CALL_ALERTS) }
        }
        error?.let {
            FormSection {
                Text(it, color = Theme.danger, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
                FormButton("Try Again") { reload++ }
            }
        }
        if (!loaded && error == null) Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
        @Composable
        fun levelRow(title: String, description: String?, spec: PushRuleLogic.Spec) {
            val (kind, level) = PushRuleLogic.resolve(spec, rules)
            LevelRow(title, description, level, spec.ruleId in busy || !loaded) { change(spec.ruleId, kind, it, spec.highlight) }
        }
        FormSection("All Messages", "Counted in the grey badge. Applies on every device of your account.") {
            PushRuleLogic.allMessages.forEachIndexed { index, row ->
                if (index > 0) FormDivider()
                levelRow(row.title, null, row.spec)
            }
        }
        val localpart = MatrixAccount.localpart(account.userId)
        FormSection("Mentions") {
            PushRuleLogic.mentions.forEachIndexed { index, row ->
                if (index > 0) FormDivider()
                val description = when (row.spec.ruleId) {
                    PushRuleLogic.IS_USER_MENTION -> account.userId
                    PushRuleLogic.CONTAINS_DISPLAY_NAME -> account.displayName?.let { "\"$it\"" }
                    PushRuleLogic.CONTAINS_USER_NAME -> "\"$localpart\""
                    else -> null
                }
                levelRow(row.title, description, row.spec)
            }
        }
        FormSection("Keywords", "Messages with these words notify you, like mentions.") {
            Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { InputField(keyword, { keyword = it }, "Keyword") }
                TextButton(onClick = {
                    val word = keyword.trim()
                    if (word.isEmpty()) return@TextButton
                    scope.launch {
                        try {
                            account.addNotificationKeyword(word)
                            keyword = ""
                            rules = account.pushRules()
                        } catch (e: Exception) {
                            error = e.friendlyMessage
                        }
                    }
                }, enabled = keyword.isNotBlank()) { Text("Save") }
            }
            PushRuleLogic.keywords(rules).forEach { rule ->
                FormDivider()
                LevelRow("\"${rule.pattern ?: rule.ruleId}\"", null, rule.level, rule.ruleId in busy) { change(rule.ruleId, "content", it, true) }
                TextButton(onClick = {
                    scope.launch {
                        try {
                            account.deletePushRule("content", rule.ruleId)
                            rules = account.pushRules()
                        } catch (e: Exception) {
                            error = e.friendlyMessage
                        }
                    }
                }, modifier = Modifier.padding(start = 6.dp)) { Text("Remove", color = Theme.danger, fontSize = 13.sp) }
            }
        }
        FormSection("Email") {
            val address = email?.email
            FormToggle(
                "Email Notification",
                email?.enabled ?: false,
                when {
                    emailFailed -> "The email setting could not be loaded."
                    email != null && address == null -> "Your account does not have any email attached."
                    address != null -> "Send notification to your email. (\"$address\")"
                    else -> "Send notification to your email."
                },
                enabled = address != null,
            ) { on ->
                val before = email
                email = PushRuleLogic.EmailState(address, on)
                scope.launch {
                    try {
                        account.setEmailNotifications(address!!, on)
                        email = account.emailNotificationState()
                    } catch (_: Exception) {
                        email = before
                        error = "Failed to update. Please try again."
                    }
                }
            }
        }
    }
}

/** Sound, Silent or Off for one push rule. */
@Composable
private fun LevelRow(title: String, description: String?, level: NotificationLevel, busy: Boolean, onChange: (NotificationLevel) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, color = Theme.text)
                description?.let { Text(it, color = Theme.muted, fontSize = 12.sp) }
            }
            if (busy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Theme.accent)
        }
        Row(Modifier.padding(top = 8.dp).clip(RoundedCornerShape(8.dp)).background(Theme.input)) {
            NotificationLevel.entries.forEach { option ->
                val selected = option == level
                Text(
                    option.shortTitle, color = if (selected) Theme.onAccent else Theme.text, fontSize = 13.sp,
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).background(if (selected) Theme.accent else Color.Transparent)
                        .clickable(enabled = !busy && !selected) { onChange(option) }.padding(vertical = 7.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
    }
}

// MARK: - Sounds

@Composable
fun SoundsPage() {
    val context = LocalContext.current
    var version by remember { mutableIntStateOf(0) }
    var target by remember { mutableStateOf<Sound?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        val sound = target ?: return@rememberLauncherForActivityResult
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            } ?: "sound"
            CustomSounds.set(context, sound, uri, name)
            version++
            Sounds.preview(sound)
        } catch (e: Exception) {
            error = e.friendlyMessage
        }
    }
    DisposableEffect(Unit) { onDispose { Sounds.stopLoop() } }
    Page {
        Sound.groups.forEachIndexed { index, (title, sounds) ->
            FormSection(
                title,
                when {
                    Sound.RINGTONE in sounds -> "The ringtone follows the phone's ring volume and also vibrates."
                    index == Sound.groups.lastIndex -> "Your own sounds stay on this device."
                    else -> null
                },
            ) {
                sounds.forEachIndexed { i, sound ->
                    if (i > 0) FormDivider()
                    key(version, sound) {
                        var on by remember { mutableStateOf(sound.isEnabled) }
                        FormToggle(sound.title, on, sound.detail) { sound.setEnabled(it); on = it }
                        Row(Modifier.padding(start = 6.dp)) {
                            TextButton(onClick = { Sounds.preview(sound) }) { Text("Listen", fontSize = 13.sp) }
                            TextButton(onClick = { target = sound; picker.launch("audio/*") }) { Text("Replace", fontSize = 13.sp) }
                            if (CustomSounds.name(sound) != null) TextButton(onClick = { CustomSounds.reset(sound); version++ }) {
                                Text("Reset", color = Theme.danger, fontSize = 13.sp)
                            }
                        }
                        CustomSounds.name(sound)?.let { Text("Own sound: $it", color = Theme.muted, fontSize = 11.sp, modifier = Modifier.padding(start = 14.dp, bottom = 8.dp)) }
                    }
                }
            }
        }
    }
    error?.let { message ->
        AlertDialog(onDismissRequest = { error = null }, confirmButton = { TextButton(onClick = { error = null }) { Text("OK") } }, title = { Text("Sound") }, text = { Text(message) })
    }
}

// MARK: - Call alerts

/** Ring through ntfy while Diddy is closed (ios CallAlertSettingsView). */
@Composable
fun CallAlertsPage() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (enabled, setEnabled) = rememberBoolPref(app.diddy.push.CallPushSettings.ENABLED_KEY, false)
    val (server, setServer) = rememberStringPref(app.diddy.push.CallPushSettings.SERVER_KEY, app.diddy.push.CallPushSettings.DEFAULT_SERVER)
    var result by remember { mutableStateOf<String?>(null) }
    var testing by remember { mutableStateOf(false) }
    Page {
        FormSection(footer = "When someone calls you from Diddy while it is closed, you get “Name is calling you” through ntfy. Calls from other apps do not send this.") {
            FormToggle("Alert me through ntfy", enabled) { setEnabled(it); app.diddy.push.CallPush.publishSoon() }
        }
        if (enabled) {
            FormSection("ntfy", "Install the ntfy app and subscribe to this topic on the same server. Diddy desktop and iOS send the alert there.") {
                Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Server", color = Theme.text, modifier = Modifier.width(80.dp))
                    InputField(server, setServer, app.diddy.push.CallPushSettings.DEFAULT_SERVER, onGo = { app.diddy.push.CallPush.publishSoon() })
                }
                FormDivider()
                Column(Modifier.fillMaxWidth().clickable { copyToClipboard(context, app.diddy.push.CallPushSettings.topic) }.padding(14.dp)) {
                    Text("Topic (tap to copy)", color = Theme.text)
                    Text(app.diddy.push.CallPushSettings.topic, color = Theme.muted, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                }
                FormDivider()
                FormButton(if (testing) "Sending…" else "Send Test Alert", enabled = !testing) {
                    testing = true
                    scope.launch {
                        result = if (app.diddy.push.CallPush.sendTest()) "Sent. It should appear in ntfy within a few seconds." else "Could not reach the server."
                        testing = false
                    }
                }
                result?.let { Text(it, color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(14.dp)) }
            }
        }
    }
}

// MARK: - Devices

@Composable
fun DevicesPage(account: MatrixAccount) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var devices by remember { mutableStateOf<List<AccountDevice>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var renaming by remember { mutableStateOf<AccountDevice?>(null) }
    var signOut by remember { mutableStateOf<List<String>?>(null) }
    var challenge by remember { mutableStateOf<Pair<List<String>, UiaChallenge>?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }
    var manageUrl by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(reload) {
        try {
            devices = account.accountDevices()
            error = null
        } catch (e: Exception) {
            error = e.friendlyMessage
        }
        manageUrl = account.accountManagementUrl()
    }
    fun handle(ids: List<String>, outcome: DeviceSignOutResult) {
        when (outcome) {
            DeviceSignOutResult.Done -> { challenge = null; reload++ }
            is DeviceSignOutResult.NeedsPassword -> { challenge = ids to outcome.challenge; passwordError = outcome.error }
            DeviceSignOutResult.Unsupported -> {
                challenge = null
                error = "Your server needs a step Diddy cannot do here. Sign the device out in your account page or another client."
            }
        }
    }
    val current = account.deviceId
    Page {
        error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(16.dp)) }
        if (devices == null && error == null) Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) }
        val list = devices ?: emptyList()
        list.firstOrNull { it.id == current }?.let { device ->
            FormSection("This Device") { DeviceRow(device, true) { renaming = device } }
        }
        val others = list.filter { it.id != current }
        if (others.isNotEmpty()) {
            FormSection("Other Devices", "Tap a device to rename it or sign it out.") {
                others.forEachIndexed { index, device ->
                    if (index > 0) FormDivider()
                    DeviceRow(device, false) { renaming = device }
                }
                FormDivider()
                FormButton("Sign Out All Other Devices", color = Theme.danger) { signOut = others.map { it.id } }
            }
        }
        manageUrl?.let { url ->
            FormSection(footer = "Your server manages devices on its own account page.") {
                FormButton("Open Account Page") { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
            }
        }
    }
    renaming?.let { device ->
        var name by remember(device.id) { mutableStateOf(device.name ?: "") }
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text(device.name ?: device.id) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${device.id}${device.lastSeen?.let { " · last seen " + DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it) } ?: ""}", color = Theme.muted, fontSize = 13.sp)
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Theme.input).padding(10.dp)) { InputField(name, { name = it }, "Device name") }
                    if (device.id != current) TextButton(onClick = { renaming = null; signOut = listOf(device.id) }) { Text("Sign Out This Device", color = Theme.danger) }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    renaming = null
                    scope.launch {
                        try { account.renameDevice(device.id, name.trim()); reload++ } catch (e: Exception) { error = e.friendlyMessage }
                    }
                }, enabled = name.isNotBlank()) { Text("Rename") }
            },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text("Cancel") } },
        )
    }
    signOut?.let { ids ->
        AlertDialog(
            onDismissRequest = { signOut = null },
            title = { Text(if (ids.size == 1) "Sign out this device?" else "Sign out ${ids.size} devices?") },
            text = { Text("They lose access to your account and encrypted messages.") },
            confirmButton = {
                TextButton(onClick = {
                    signOut = null
                    scope.launch {
                        try { handle(ids, account.signOutDevices(ids)) } catch (e: Exception) { error = e.friendlyMessage }
                    }
                }) { Text("Sign Out", color = Theme.danger) }
            },
            dismissButton = { TextButton(onClick = { signOut = null }) { Text("Cancel") } },
        )
    }
    challenge?.let { (ids, uia) ->
        var password by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { challenge = null },
            title = { Text("Confirm with your password") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Theme.input).padding(10.dp)) { InputField(password, { password = it }, "Password", password = true) }
                    passwordError?.let { Text(it, color = Theme.danger, fontSize = 13.sp) }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        try { handle(ids, account.signOutDevices(ids, password, uia)) } catch (e: Exception) { error = e.friendlyMessage; challenge = null }
                    }
                }, enabled = password.isNotEmpty()) { Text("Sign Out", color = Theme.danger) }
            },
            dismissButton = { TextButton(onClick = { challenge = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun DeviceRow(device: AccountDevice, isCurrent: Boolean, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp)) {
        Text(device.name ?: device.id, color = Theme.text, fontWeight = if (isCurrent) FontWeight.SemiBold else null)
        val seen = device.lastSeen?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it) }
        Text(listOfNotNull(device.id, seen, device.lastSeenIp).joinToString(" · "), color = Theme.muted, fontSize = 12.sp)
    }
}

// MARK: - Encryption

@Composable
fun EncryptionPage(account: MatrixAccount, navigator: Navigator) {
    app.diddy.ui.ProtectSecrets()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var backup by remember { mutableStateOf<KeyBackupInfo?>(null) }
    var backupLoaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf<String?>(null) }
    var newKey by remember { mutableStateOf<String?>(null) }
    var askPassphrase by remember { mutableStateOf(false) }
    var deviceKey by remember { mutableStateOf<String?>(null) }
    val verified = account.verificationState == VerificationState.VERIFIED
    LaunchedEffect(Unit) {
        backup = runCatching { account.keyBackupInfo() }.getOrNull()
        backupLoaded = true
        deviceKey = runCatching { account.client.encryption().ed25519Key() }.getOrNull()
    }
    Page {
        FormSection("This Device", if (verified) "This device can read your encrypted messages." else "Verify this device to read your encrypted messages and let others trust it.") {
            Value("Status", if (verified) "Verified" else "Not Verified")
            if (!verified) {
                FormDivider()
                FormButton("Verify with Another Device") { scope.launch { VerificationCenter.of(account).requestDeviceVerification() } }
                FormDivider()
                FormButton("Enter Recovery Key") { navigator.show(Sheet.Recovery) }
            }
            deviceKey?.let {
                FormDivider()
                Column(Modifier.fillMaxWidth().clickable { copyToClipboard(context, it) }.padding(14.dp)) {
                    Text("Device Key", color = Theme.text)
                    Text(it.chunked(4).joinToString(" "), color = Theme.muted, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                }
            }
        }
        FormSection("Key Backup", "The backup keeps the keys of your encrypted messages on the server, locked with your recovery key.") {
            when {
                !backupLoaded -> Box(Modifier.fillMaxWidth().padding(14.dp)) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.accent) }
                backup != null -> {
                    Value("Backup Version", backup!!.version)
                    backup!!.count?.let { FormDivider(); Value("Keys", "$it") }
                }
                else -> FormButton("Create Backup") {
                    scope.launch {
                        try { account.enableKeyBackup(); backup = account.keyBackupInfo() } catch (e: Exception) { error = e.friendlyMessage }
                    }
                }
            }
        }
        FormSection("Recovery", "Save the recovery key somewhere safe, for example in a password manager. Without it, a new device cannot read old messages.") {
            FormButton("Set Up Recovery") { askPassphrase = true }
            FormDivider()
            FormButton("Change Recovery Key") {
                progress = "Creating a new key…"
                scope.launch {
                    try { newKey = account.changeRecoveryKey() } catch (e: Exception) { error = e.friendlyMessage }
                    progress = null
                }
            }
        }
        progress?.let { Text(it, color = Theme.muted, modifier = Modifier.padding(horizontal = 30.dp)) }
        error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 30.dp)) }
    }
    if (askPassphrase) {
        var phrase by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { askPassphrase = false },
            properties = SecretDialog,
            title = { Text("Set up recovery") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Optionally choose a passphrase to use instead of the key. Leave it empty to get only a recovery key.", color = Theme.muted)
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Theme.input).padding(10.dp)) { InputField(phrase, { phrase = it }, "Passphrase (optional)", password = true) }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    askPassphrase = false
                    progress = "Starting…"
                    scope.launch {
                        try { newKey = account.enableRecovery(phrase) { text -> scope.launch { progress = text } } } catch (e: Exception) { error = e.friendlyMessage }
                        progress = null
                    }
                }) { Text("Continue") }
            },
            dismissButton = { TextButton(onClick = { askPassphrase = false }) { Text("Cancel") } },
        )
    }
    newKey?.let { key ->
        // DialogProperties defaults to inheriting the parent window's secure flag.
        AlertDialog(
            onDismissRequest = {},
            properties = SecretDialog,
            title = { Text("Your recovery key") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Save it now. Diddy does not show it again.", color = Theme.muted)
                    Text(key, color = Theme.text, fontFamily = FontFamily.Monospace, fontSize = 15.sp, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Theme.input).padding(10.dp))
                    TextButton(onClick = { copyToClipboard(context, key) }) { Text("Copy") }
                }
            },
            confirmButton = { TextButton(onClick = { newKey = null }) { Text("I Saved It") } },
        )
    }
}

/** Dialogs with a recovery key or passphrase stay out of screenshots and screen sharing. */
private val SecretDialog = androidx.compose.ui.window.DialogProperties(securePolicy = androidx.compose.ui.window.SecureFlagPolicy.SecureOn)

// MARK: - Account

@Composable
fun ContactInfoPage(account: MatrixAccount) {
    val context = LocalContext.current
    var emails by remember { mutableStateOf<List<String>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var manageUrl by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        try { emails = account.emailAddresses() } catch (e: Exception) { error = e.friendlyMessage }
        manageUrl = account.accountManagementUrl()
    }
    Page {
        FormSection("Email Addresses", "Used to reset your password and for email notifications.") {
            when {
                error != null -> Text(error!!, color = Theme.danger, modifier = Modifier.padding(14.dp))
                emails == null -> Box(Modifier.padding(14.dp)) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.accent) }
                emails!!.isEmpty() -> Text("No email address on this account.", color = Theme.muted, modifier = Modifier.padding(14.dp))
                else -> emails!!.forEachIndexed { index, email ->
                    if (index > 0) FormDivider()
                    Text(email, color = Theme.text, modifier = Modifier.padding(14.dp))
                }
            }
        }
        manageUrl?.let { url ->
            FormSection(footer = "Change your email and password on your server's account page.") {
                FormButton("Open Account Page") { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
            }
        }
    }
}

@Composable
fun BlockedUsersPage(account: MatrixAccount) {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<String>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { users = runCatching { account.client.ignoredUsers() }.getOrElse { error = it.friendlyMessage; emptyList() } }
    Page {
        FormSection(footer = "You do not see messages and invites from blocked people.") {
            when {
                users == null -> Box(Modifier.padding(14.dp)) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.accent) }
                users!!.isEmpty() -> Text("You have not blocked anyone.", color = Theme.muted, modifier = Modifier.padding(14.dp))
                else -> users!!.forEachIndexed { index, userId ->
                    if (index > 0) FormDivider()
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(userId, color = Theme.text, modifier = Modifier.weight(1f))
                        TextButton(onClick = {
                            scope.launch {
                                try {
                                    account.client.unignoreUser(userId)
                                    users = users!! - userId
                                } catch (e: Exception) {
                                    error = e.friendlyMessage
                                }
                            }
                        }) { Text("Unblock") }
                    }
                }
            }
        }
        error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 30.dp)) }
    }
}

// MARK: - Help

@Composable
fun AboutPage() {
    val context = LocalContext.current
    fun openUrl(url: String) = runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    Page {
        FormSection("Diddy") {
            Value("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            FormDivider()
            Value("Android", "${android.os.Build.VERSION.RELEASE} (${android.os.Build.MODEL})")
        }
        FormSection(footer = "Diddy for Android is built with matrix-rust-sdk and LiveKit.") {
            FormButton("Diddy on GitHub") { openUrl("https://github.com/Lndr2501/diddy") }
            FormDivider()
            FormButton("Report a Problem") { openUrl("https://github.com/Lndr2501/diddy/issues") }
        }
        FormSection("Diagnostics", "A text file with Diddy's log and crash reports, to attach to a bug report. It contains no messages or keys.") {
            FormButton("Share Diagnostics File") { shareFile(context, DiagLog.export(context), "text/plain") }
        }
    }
}

@Composable
fun DeveloperToolsPage(account: MatrixAccount) {
    val context = LocalContext.current
    var confirmToken by remember { mutableStateOf(false) }
    Page {
        FormSection("Session") {
            Value("User ID", account.userId)
            FormDivider()
            Value("Device ID", account.deviceId)
            FormDivider()
            Value("Homeserver", account.record.serverName)
        }
        FormSection(footer = "Anyone with the access token can use your account. Never share it.") {
            FormButton("Copy Access Token", color = Theme.danger) { confirmToken = true }
        }
        FormSection {
            FormButton("Share Diagnostics File") { shareFile(context, DiagLog.export(context), "text/plain") }
        }
    }
    if (confirmToken) {
        AlertDialog(
            onDismissRequest = { confirmToken = false },
            title = { Text("Copy the access token?") },
            text = { Text("It gives full access to your account. Only paste it into tools you trust.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmToken = false
                    account.accessTokenForDeveloper()?.let { copyToClipboard(context, it) }
                }) { Text("Copy", color = Theme.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmToken = false }) { Text("Cancel") } },
        )
    }
}

/** A short tour of Diddy (ios DiddyWelcomeView, in short). */
@Composable
fun WelcomePage(account: MatrixAccount, onDone: () -> Unit) {
    Page {
        val steps = listOf(
            "Chats" to "Your direct messages and rooms, newest first. Long-press a chat for more.",
            "Servers" to "Servers with their text and voice channels, like Discord. Tap a voice channel to join the call.",
            "Activity" to "Mentions and invites that are for you.",
            "You" to "Your status, your Diddy profile and all settings.",
            "Profile" to "Make your profile yours: name colour, banner, about me and badges, seen in every Diddy app.",
        )
        Text("Welcome to Diddy, ${account.title}!", color = Theme.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(20.dp))
        steps.forEach { (title, text) ->
            FormSection(title) { Text(text, color = Theme.text, modifier = Modifier.padding(14.dp)) }
        }
        FormSection { FormButton("Done", onClick = onDone) }
    }
}
