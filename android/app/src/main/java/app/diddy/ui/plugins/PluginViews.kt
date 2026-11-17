package app.diddy.ui.plugins

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.diddy.app.PluginDockState
import app.diddy.matrix.MatrixAccount
import app.diddy.plugins.PluginAddress
import app.diddy.plugins.PluginHost
import app.diddy.plugins.PluginRules
import app.diddy.plugins.PluginStore
import app.diddy.plugins.UserPlugin
import app.diddy.ui.Navigator
import app.diddy.ui.sheets.FormButton
import app.diddy.ui.sheets.FormDivider
import app.diddy.ui.sheets.FormField
import app.diddy.ui.sheets.FormSection
import app.diddy.ui.sheets.FormToggle
import app.diddy.ui.theme.Theme
import app.diddy.util.friendlyMessage

/** One plugin page in its locked-down frame, as tall as the plugin asks (within the limits). */
@Composable
fun PluginFrameView(plugin: UserPlugin, compact: Boolean, maxHeight: Int? = null, zoom: Int = 100, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val host = remember(plugin.id, plugin.url) { PluginHost(context, plugin.id) }
    host.theme = if (app.diddy.ui.theme.ThemeStore.current.isLight) "light" else "dark"
    host.compact = compact
    host.customCss = plugin.customCss
    LaunchedEffect(plugin.id, plugin.url) {
        val (kind, value) = PluginStore.source(plugin)
        host.load(kind, value)
    }
    DisposableEffect(host) { onDispose { host.destroy() } }
    val height = if (maxHeight != null) PluginDockState.frameHeight(host.height, maxHeight, zoom) else host.height
    AndroidView(
        factory = { host.webView.also { it.setInitialScale(zoom) } },
        update = { it.setInitialScale(zoom) },
        modifier = modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(10.dp)),
    )
}

/** The pinned plugins in the You tab (the desktop's plugin dock in the sidebar). */
@Composable
fun PluginDockSection(account: MatrixAccount, navigator: Navigator) {
    val dock = PluginStore.dock
    val pinned = dock.pinned.mapNotNull { id -> PluginStore.activePlugins.firstOrNull { it.id == id } }
    val shown = pinned.ifEmpty { PluginStore.activePlugins }
    if (shown.isEmpty()) return
    var expanded by remember { mutableStateOf(true) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Theme.elevated)) {
        Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Extension, null, tint = Theme.muted, modifier = Modifier.size(18.dp))
            Text("  Plugins", color = Theme.muted, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = Theme.muted)
        }
        if (expanded) Column(Modifier.padding(horizontal = 10.dp).padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            shown.forEach { plugin ->
                val collapsed = plugin.id in dock.collapsed
                Row(
                    Modifier.fillMaxWidth().clickable { PluginStore.updateDock(dock.withCollapsed(plugin.id, !collapsed)) }.padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(plugin.name, color = Theme.text, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Icon(if (collapsed) Icons.Filled.ExpandMore else Icons.Filled.ExpandLess, null, tint = Theme.faint, modifier = Modifier.size(18.dp))
                }
                if (!collapsed) {
                    val pinnedLook = plugin.id in dock.pinned
                    PluginFrameView(plugin, compact = true, maxHeight = if (pinnedLook) dock.height(plugin.id) else null, zoom = if (pinnedLook) dock.zoom(plugin.id) else 100)
                }
            }
        }
    }
}

/** Settings > Plugins: your plugins, the built-in ones, and adding new ones (ios PluginSettingsView). */
@Composable
fun PluginSettingsPage(account: MatrixAccount) {
    var error by remember { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }
    val opened = detail?.let { id -> PluginStore.plugins.firstOrNull { it.id == id } }
    if (opened != null) {
        PluginDetail(opened) { detail = null }
        return
    }
    if (adding) {
        AddPlugin { adding = false }
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        FormSection(
            "Your plugins",
            "Turned-on plugins appear under You. A plugin is a small web page in a locked-down frame: no access to your account, messages or files.",
        ) {
            PluginStore.plugins.forEach { plugin ->
                Row(Modifier.fillMaxWidth().clickable { detail = plugin.id }.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(plugin.name, color = Theme.text)
                        Text(sourceLabel(plugin), color = Theme.faint, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Switch(plugin.enabled, { PluginStore.setEnabled(plugin.id, it) }, colors = SwitchDefaults.colors(checkedTrackColor = Theme.accent, checkedThumbColor = Theme.onAccent))
                }
                FormDivider()
            }
            FormButton("Add Plugin", enabled = PluginStore.plugins.size < PluginRules.MAX_PLUGINS) { adding = true }
        }
        FormSection("Built-in plugins") {
            PluginStore.builtins.forEachIndexed { index, item ->
                if (index > 0) FormDivider()
                Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.name, color = Theme.text)
                        Text(item.description, color = Theme.faint, fontSize = 12.sp)
                    }
                    if (PluginStore.isAdded(item.slug)) Text("Added", color = Theme.online, fontSize = 13.sp)
                    else TextButton(onClick = { try { PluginStore.addBuiltin(item) } catch (e: Exception) { error = e.friendlyMessage } }) { Text("Add") }
                }
            }
        }
    }
    error?.let { message ->
        AlertDialog(onDismissRequest = { error = null }, title = { Text("Plugins") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { error = null }) { Text("OK") } })
    }
}

private fun sourceLabel(plugin: UserPlugin): String = when {
    PluginAddress.builtinSlug(plugin.url) != null -> "Built-in"
    PluginAddress.localId(plugin.url) != null -> "Saved on this device"
    else -> plugin.url
}

@Composable
private fun PluginDetail(plugin: UserPlugin, onBack: () -> Unit) {
    var css by remember(plugin.id) { mutableStateOf(plugin.customCss ?: "") }
    var confirmRemove by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }
    val dock = PluginStore.dock
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        FormSection {
            TextButton(onClick = onBack) { Text("‹ Plugins") }
        }
        FormSection(plugin.name) {
            androidx.compose.runtime.key(reload) { Box(Modifier.padding(8.dp)) { PluginFrameView(plugin, compact = false) } }
            FormDivider()
            FormButton("Reload Preview") { reload++ }
        }
        FormSection("Address") { Text(plugin.url, color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(14.dp)) }
        FormSection("Under You", "Pinned plugins stay in the list with their own height and zoom.") {
            FormToggle("Pin", plugin.id in dock.pinned) { PluginStore.updateDock(dock.withPinned(plugin.id, it)) }
            if (plugin.id in dock.pinned) {
                FormDivider()
                Text("Height: ${dock.height(plugin.id)} px", color = Theme.text, fontSize = 13.sp, modifier = Modifier.padding(start = 14.dp, top = 8.dp))
                Slider(dock.height(plugin.id).toFloat(), { PluginStore.updateDock(dock.withHeight(plugin.id, it.toDouble())) },
                    valueRange = PluginDockState.MIN_HEIGHT.toFloat()..PluginDockState.MAX_HEIGHT.toFloat(),
                    colors = SliderDefaults.colors(thumbColor = Theme.accent, activeTrackColor = Theme.accent), modifier = Modifier.padding(horizontal = 14.dp))
                Text("Zoom: ${dock.zoom(plugin.id)}%", color = Theme.text, fontSize = 13.sp, modifier = Modifier.padding(start = 14.dp))
                Slider(dock.zoom(plugin.id).toFloat(), { PluginStore.updateDock(dock.withZoom(plugin.id, it.toDouble())) },
                    valueRange = PluginDockState.MIN_ZOOM.toFloat()..PluginDockState.MAX_ZOOM.toFloat(),
                    colors = SliderDefaults.colors(thumbColor = Theme.accent, activeTrackColor = Theme.accent), modifier = Modifier.padding(horizontal = 14.dp))
            }
        }
        FormSection("Custom CSS", "Sent to the plugin, which decides whether to apply it (up to ${PluginRules.MAX_CUSTOM_CSS} characters).") {
            FormField(css, { css = it.take(PluginRules.MAX_CUSTOM_CSS) }, "body { … }", singleLine = false)
            FormDivider()
            FormButton("Save CSS", enabled = css != (plugin.customCss ?: "")) { PluginStore.setCustomCss(plugin.id, css) }
        }
        FormSection(footer = "Removing also deletes what the plugin saved on this device.") {
            FormButton("Remove Plugin", color = Theme.danger) { confirmRemove = true }
        }
    }
    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove ${plugin.name}?") },
            confirmButton = { TextButton(onClick = { confirmRemove = false; PluginStore.remove(plugin.id); onBack() }) { Text("Remove", color = Theme.danger) } },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
        )
    }
}

/** Add a plugin by address, by pasting its HTML, or from an HTML file (ios AddPluginView). */
@Composable
private fun AddPlugin(onDone: () -> Unit) {
    val context = LocalContext.current
    var name by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var fileName by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val resolver = context.contentResolver
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) fileName = c.getString(0) }
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return@rememberLauncherForActivityResult
            if (bytes.size > PluginRules.MAX_LOCAL_BYTES) { error = "The plugin is too large (at most ${PluginRules.MAX_LOCAL_BYTES / 1024} KB)."; return@rememberLauncherForActivityResult }
            code = String(bytes)
        } catch (e: Exception) {
            error = e.friendlyMessage
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        FormSection { TextButton(onClick = onDone) { Text("‹ Plugins") } }
        FormSection("Name", "Optional for pasted code and files: the page title is used.") { FormField(name, { name = it }, "My plugin") }
        FormSection("Address", "A web page that follows the plugin contract (docs/plugins.md). Only https addresses work.") {
            FormField(address, { address = it }, "https://example.com/plugin.html")
            FormDivider()
            FormButton("Add from Address", enabled = address.isNotBlank()) {
                try { PluginStore.addRemote(name, address); onDone() } catch (e: Exception) { error = e.friendlyMessage }
            }
        }
        FormSection("HTML code", "One self-contained HTML file, at most ${PluginRules.MAX_LOCAL_BYTES / 1024} KB. It is saved on this device.") {
            FormButton(fileName?.let { "File: $it" } ?: "Choose HTML File") { picker.launch("text/html") }
            FormDivider()
            FormField(code, { code = it; fileName = null }, "<!doctype html> …", singleLine = false)
            FormDivider()
            FormButton("Add from Code", enabled = code.isNotBlank()) {
                try { PluginStore.addLocal(name, code, fileName); onDone() } catch (e: Exception) { error = e.friendlyMessage }
            }
        }
        error?.let { Text(it, color = Theme.danger, modifier = Modifier.padding(horizontal = 30.dp)) }
    }
}
