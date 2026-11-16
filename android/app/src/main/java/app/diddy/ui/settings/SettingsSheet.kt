package app.diddy.ui.settings

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.WavingHand
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.app.AppModel
import app.diddy.app.Prefs
import app.diddy.matrix.MatrixAccount
import app.diddy.ui.AvatarView
import app.diddy.ui.FullSheet
import app.diddy.ui.InputField
import app.diddy.ui.Navigator
import app.diddy.ui.Sheet
import app.diddy.ui.sheets.FormButton
import app.diddy.ui.sheets.FormDivider
import app.diddy.ui.sheets.FormSection
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.VerificationState

/** The pages inside Settings (an iOS NavigationStack). */
enum class SettingsPage(val title: String) {
    APPEARANCE("Appearance"), CUSTOM_THEME("Custom Theme"), CHAT("Chat"), NOTIFICATIONS("Notifications"),
    SOUNDS("Sounds"), CALLS("Calls"), CALL_ALERTS("Call Alerts"), WATCH_TOGETHER("Watch Together"), PLUGINS("Plugins"),
    DEVICES("Devices"), ENCRYPTION("Encryption"), CONTACT("Contact Information"), BLOCKED("Blocked Users"),
    ABOUT("About Diddy"), DEVELOPER("Developer Tools"), WELCOME("Welcome"),
}

/** A setting kept on this device, as Compose state for the switch that shows it. */
@Composable
fun rememberBoolPref(key: String, default: Boolean): Pair<Boolean, (Boolean) -> Unit> {
    var value by remember(key) { mutableStateOf(Prefs.bool(key, default)) }
    return value to { on: Boolean -> value = on; Prefs.setBool(key, on) }
}

@Composable
fun rememberStringPref(key: String, default: String): Pair<String, (String) -> Unit> {
    var value by remember(key) { mutableStateOf(Prefs.string(key) ?: default) }
    return value to { text: String -> value = text; Prefs.setString(key, text) }
}

/** Settings: your profile, accounts, account security, the app, help (ios SettingsView). */
@Composable
fun SettingsSheet(account: MatrixAccount, navigator: Navigator, onClose: () -> Unit) {
    var pages by remember { mutableStateOf<List<SettingsPage>>(emptyList()) }
    val page = pages.lastOrNull()
    val open: (SettingsPage) -> Unit = { pages = pages + it }
    val back = { pages = pages.dropLast(1) }
    FullSheet(page?.title ?: "Settings", if (page == null) onClose else back, closeLabel = if (page == null) "Done" else "Back") {
        if (page != null) BackHandler(onBack = back)
        when (page) {
            null -> SettingsMain(account, navigator, open, onClose)
            SettingsPage.APPEARANCE -> AppearancePage(open)
            SettingsPage.CUSTOM_THEME -> CustomThemePage()
            SettingsPage.CHAT -> ChatSettingsPage()
            SettingsPage.NOTIFICATIONS -> NotificationsPage(account, open)
            SettingsPage.SOUNDS -> SoundsPage()
            SettingsPage.CALLS -> app.diddy.ui.call.CallSettingsPage()
            SettingsPage.CALL_ALERTS -> CallAlertsPage()
            SettingsPage.WATCH_TOGETHER -> app.diddy.ui.call.WatchTogetherSettingsPage()
            SettingsPage.PLUGINS -> app.diddy.ui.plugins.PluginSettingsPage(account)
            SettingsPage.DEVICES -> DevicesPage(account)
            SettingsPage.ENCRYPTION -> EncryptionPage(account, navigator)
            SettingsPage.CONTACT -> ContactInfoPage(account)
            SettingsPage.BLOCKED -> BlockedUsersPage(account)
            SettingsPage.ABOUT -> AboutPage()
            SettingsPage.DEVELOPER -> DeveloperToolsPage(account)
            SettingsPage.WELCOME -> WelcomePage(account) { back() }
        }
    }
}

/** The coloured square icon of a settings row (ios SettingsRowLabel). */
@Composable
fun SettingsRow(title: String, icon: ImageVector, color: Color, value: String? = null, valueColor: Color = Theme.muted, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(29.dp).clip(RoundedCornerShape(7.dp)).background(color), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Color.White, modifier = Modifier.size(17.dp))
        }
        Spacer(Modifier.width(12.dp))
        Text(title, color = Theme.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
        if (value != null) Text(value, color = valueColor, fontSize = 15.sp, maxLines = 1)
        Icon(Icons.Filled.ChevronRight, null, tint = Theme.faint, modifier = Modifier.size(20.dp))
    }
}

private val orange = Color(0xFFFF9500)
private val gray = Color(0xFF8E8E93)
private val green = Color(0xFF34C759)
private val blue = Color(0xFF0A84FF)
private val red = Color(0xFFFF3B30)
private val pink = Color(0xFFFF2D55)
private val purple = Color(0xFFAF52DE)

@Composable
private fun SettingsMain(account: MatrixAccount, navigator: Navigator, open: (SettingsPage) -> Unit, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var confirmLogout by remember { mutableStateOf<MatrixAccount?>(null) }
    val verified = account.verificationState == VerificationState.VERIFIED
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        ProfileSection(account, navigator)
        FormSection("Accounts") {
            AppModel.accounts.forEachIndexed { index, other ->
                if (index > 0) FormDivider()
                Row(
                    Modifier.fillMaxWidth().clickable {
                        scope.launch {
                            AppModel.switchTo(other)
                            onClose()
                        }
                    }.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AvatarView(other.avatarUrl, other.title, 38.dp, other)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(other.title, color = Theme.text)
                        Text(other.userId, color = Theme.faint, fontSize = 12.sp)
                    }
                    if (other.id == account.id) Icon(Icons.Filled.Check, null, tint = Theme.accent)
                    else TextButton(onClick = { confirmLogout = other }) { Text("Log Out", color = Theme.danger, fontSize = 13.sp) }
                }
            }
            FormDivider()
            FormButton("Add Account", icon = Icons.Filled.AddCircle) {
                onClose()
                AppModel.addingAccount = true
            }
        }
        FormSection(
            "Account",
            footer = if (!verified) "This device is not verified yet. Enter your recovery key or verify it from another device to read your encrypted messages." else null,
        ) {
            if (!verified) {
                SettingsRow("Enter Recovery Key", Icons.Filled.Key, orange) { navigator.show(Sheet.Recovery) }
                FormDivider()
            }
            SettingsRow("Devices", Icons.Filled.Smartphone, gray) { open(SettingsPage.DEVICES) }
            FormDivider()
            SettingsRow("Encryption", Icons.Filled.Lock, green, if (verified) "Verified" else "Not Verified", if (verified) Theme.muted else Theme.danger) {
                open(SettingsPage.ENCRYPTION)
            }
            FormDivider()
            SettingsRow("Contact Information", Icons.Filled.Email, blue) { open(SettingsPage.CONTACT) }
            FormDivider()
            SettingsRow("Blocked Users", Icons.Filled.Block, red) { open(SettingsPage.BLOCKED) }
        }
        FormSection("App") {
            SettingsRow("Appearance", Icons.Filled.Palette, pink) { open(SettingsPage.APPEARANCE) }
            FormDivider()
            SettingsRow("Chat", Icons.AutoMirrored.Filled.Chat, blue) { open(SettingsPage.CHAT) }
            FormDivider()
            SettingsRow("Notifications", Icons.Filled.Notifications, red) { open(SettingsPage.NOTIFICATIONS) }
            FormDivider()
            SettingsRow("Sounds", Icons.AutoMirrored.Filled.VolumeUp, pink) { open(SettingsPage.SOUNDS) }
            FormDivider()
            SettingsRow("Calls", Icons.Filled.Call, green) { open(SettingsPage.CALLS) }
            FormDivider()
            SettingsRow("Watch Together", Icons.Filled.PlayCircle, red) { open(SettingsPage.WATCH_TOGETHER) }
            FormDivider()
            SettingsRow("Plugins", Icons.Filled.Extension, purple) { open(SettingsPage.PLUGINS) }
        }
        FormSection("Help") {
            SettingsRow("Welcome Guide", Icons.Filled.WavingHand, orange) { open(SettingsPage.WELCOME) }
            FormDivider()
            SettingsRow("About Diddy", Icons.Filled.Info, gray) { open(SettingsPage.ABOUT) }
            FormDivider()
            SettingsRow("Developer Tools", Icons.Filled.Build, gray) { open(SettingsPage.DEVELOPER) }
        }
        FormSection(footer = "Signed in as ${account.userId}") {
            FormButton("Log Out of ${account.record.serverName}", color = Theme.danger) { confirmLogout = account }
        }
    }
    confirmLogout?.let { target ->
        AlertDialog(
            onDismissRequest = { confirmLogout = null },
            title = { Text("Log out of ${target.title}?") },
            text = { Text("Encrypted messages can only be read again with your recovery key or another verified device.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmLogout = null
                    scope.launch {
                        AppModel.logout(target)
                        if (target.id == account.id) onClose()
                    }
                }) { Text("Log Out", color = Theme.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmLogout = null }) { Text("Cancel") } },
        )
    }
}

/** Picture and display name, changed in place; the Diddy profile below (ios ProfileSection). */
@Composable
private fun ProfileSection(account: MatrixAccount, navigator: Navigator) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember(account.displayName) { mutableStateOf(account.displayName ?: "") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun run(work: suspend () -> Unit) {
        saving = true
        error = null
        scope.launch {
            try {
                work()
                account.refreshProfile()
            } catch (e: Exception) {
                error = e.friendlyMessage
            }
            saving = false
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        run {
            val data = app.diddy.media.ImageTools.jpegForUpload(context, uri) ?: throw app.diddy.util.DiddyError("This image could not be read.")
            account.client.uploadAvatar("image/jpeg", data)
        }
    }
    FormSection(footer = "Tap your picture or name to change them.") {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.clickable { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                AvatarView(account.avatarUrl, account.title, 64.dp, account)
                Box(
                    Modifier.align(Alignment.BottomEnd).size(22.dp).clip(CircleShape).background(Theme.accent),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.PhotoCamera, "Change profile picture", tint = Theme.onAccent, modifier = Modifier.size(13.dp)) }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                InputField(name, { name = it }, "Display name", imeAction = androidx.compose.ui.text.input.ImeAction.Done, onGo = {
                    val trimmed = name.trim()
                    if (trimmed.isNotEmpty() && trimmed != account.displayName) run { account.client.setDisplayName(trimmed) }
                })
                Text(account.userId, color = Theme.faint, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.accent)
        }
        if (name != (account.displayName ?: "") && name.isNotBlank()) {
            FormDivider()
            FormButton("Save Name", enabled = !saving) { run { account.client.setDisplayName(name.trim()) } }
        }
        error?.let { Text(it, color = Theme.danger, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) }
        FormDivider()
        SettingsRow("Diddy Profile", Icons.Filled.Brush, Theme.accent) { navigator.show(Sheet.ProfileEditor(account.userId)) }
    }
}

/** Enter the recovery key or passphrase to unlock the message history on this device (ios RecoveryView). */
@Composable
fun RecoverySheet(account: MatrixAccount, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var key by remember { mutableStateOf("") }
    var reveal by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    FullSheet("Verify this device", onClose, closeLabel = "Cancel") {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
            FormSection(
                "Recovery key or passphrase",
                "The recovery key (or security key) or passphrase you saved when you set up encryption, for example in Diddy desktop or Element. It unlocks your message history on this device.",
            ) {
                Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) {
                        androidx.compose.foundation.text.BasicTextField(
                            key, { key = it },
                            textStyle = androidx.compose.ui.text.TextStyle(color = Theme.text, fontSize = 16.sp, fontFamily = FontFamily.Monospace),
                            cursorBrush = androidx.compose.ui.graphics.SolidColor(Theme.accent),
                            visualTransformation = if (reveal) androidx.compose.ui.text.input.VisualTransformation.None else androidx.compose.ui.text.input.PasswordVisualTransformation(),
                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(autoCorrectEnabled = false, keyboardType = androidx.compose.ui.text.input.KeyboardType.Password),
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                Box { if (key.isEmpty()) Text("EsTc 1234 …", color = Theme.faint, fontFamily = FontFamily.Monospace); inner() }
                            },
                        )
                    }
                    TextButton(onClick = { reveal = !reveal }) { Text(if (reveal) "Hide" else "Show", color = Theme.muted) }
                }
            }
            error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 30.dp)) }
            FormSection {
                FormButton("Verify", enabled = key.isNotEmpty(), busy = busy) {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            account.recover(key)
                            key = ""
                            onClose()
                        } catch (e: Exception) {
                            error = e.friendlyMessage
                        }
                        busy = false
                    }
                }
            }
            FormSection(footer = "Or confirm with emojis on a device that is already verified.") {
                FormButton("Verify with Another Device") {
                    scope.launch { app.diddy.matrix.VerificationCenter.of(account).requestDeviceVerification() }
                }
            }
        }
    }
}
