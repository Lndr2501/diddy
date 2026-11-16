package app.diddy.plugins

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.PluginDockState
import app.diddy.app.Prefs
import app.diddy.util.Json
import java.io.File
import java.util.UUID

/**
 * The plugin list, the HTML of local plugins and the data each plugin saved, all on this device
 * (ios PluginStore). Files in files/plugins: plugins.json, local/<id>.html, data/<id>.json.
 */
@SuppressLint("StaticFieldLeak") // the application context
object PluginStore {
    data class Builtin(val slug: String, val name: String, val description: String)

    /** Same catalog as the desktop's `builtinPlugins.ts`. */
    val builtins = listOf(
        Builtin("clock", "Clock", "Time and date, with a second time zone."),
        Builtin("weather", "Weather", "Current weather and a 4-day forecast."),
        Builtin("timer", "Focus timer", "Pomodoro and a free countdown."),
        Builtin("notes", "Notes", "A quick notepad that saves itself."),
        Builtin("todo", "To-do", "A short task list."),
        Builtin("currency", "Currency", "Convert between common currencies."),
        Builtin("dice", "Dice", "Dice and coin for game nights."),
        Builtin("calendar", "Calendar", "A month at a glance."),
    )

    private lateinit var context: Context
    private lateinit var root: File
    private val dataCache = mutableMapOf<String, Map<String, String>>()

    var plugins by mutableStateOf<List<UserPlugin>>(emptyList())
        private set
    val activePlugins: List<UserPlugin> get() = plugins.filter { it.enabled }

    private const val DOCK_KEY = "diddyPluginDock"
    var dock by mutableStateOf(PluginDockState())
        private set

    fun init(context: Context) {
        this.context = context.applicationContext
        root = File(context.filesDir, "plugins").apply { File(this, "local").mkdirs(); File(this, "data").mkdirs() }
        val stored = Json.arr(runCatching { File(root, "plugins.json").readText() }.getOrNull())
            ?.mapNotNull { (it as? Map<*, *>)?.entries?.associate { e -> e.key.toString() to e.value }?.let(UserPlugin::fromJson) } ?: emptyList()
        plugins = PluginRegistry.sanitize(stored)
        dock = PluginDockState.decode(Prefs.string(DOCK_KEY))
    }

    fun updateDock(next: PluginDockState) {
        dock = next
        Prefs.setString(DOCK_KEY, next.encoded())
    }

    private fun persist() {
        runCatching { File(root, "plugins.json").writeText(Json.encode(plugins.map { it.toJson() })) }
    }

    private val now: Double get() = System.currentTimeMillis().toDouble()
    private fun newId() = UUID.randomUUID().toString().lowercase()

    fun isAdded(slug: String) = plugins.any { it.url == PluginRules.BUILTIN_PREFIX + slug }

    fun addBuiltin(item: Builtin) {
        plugins = PluginRegistry.addBuiltin(plugins, item.slug, item.name, newId(), now)
        persist()
    }

    fun addRemote(name: String, address: String) {
        plugins = PluginRegistry.add(plugins, name, address, newId(), now)
        persist()
    }

    /** Adds a plugin without hosting: its HTML is saved on this device. */
    fun addLocal(name: String, html: String, fileName: String? = null) {
        val checked = PluginContent.validate(html)
        val id = newId()
        val proposed = PluginText.clean(name).ifEmpty {
            PluginContent.title(checked).ifEmpty { fileName?.let(PluginContent::name)?.ifEmpty { null } ?: "Plugin" }
        }
        val next = PluginRegistry.addLocal(plugins, proposed, id, now)
        try { File(root, "local/$id.html").writeText(checked) } catch (_: Exception) { throw PluginError("Could not save the plugin on this device.") }
        plugins = next
        persist()
    }

    fun setEnabled(id: String, enabled: Boolean) {
        plugins = plugins.map { if (it.id == id) it.copy(enabled = enabled) else it }
        persist()
    }

    fun setCustomCss(id: String, css: String) {
        val trimmed = css.take(PluginRules.MAX_CUSTOM_CSS)
        plugins = plugins.map { if (it.id == id) it.copy(customCss = trimmed.ifBlank { null }) else it }
        persist()
    }

    /** Removes the plugin together with its saved content and data. */
    fun remove(id: String) {
        if (!PluginRules.isValidPluginId(id)) return
        plugins = plugins.filter { it.id != id }
        dataCache.remove(id)
        File(root, "local/$id.html").delete()
        File(root, "data/$id.json").delete()
        updateDock(dock.withPinned(id, false))
        persist()
    }

    private fun notice(text: String) =
        "<!doctype html><meta charset=\"utf-8\"><meta name=\"color-scheme\" content=\"light dark\"><body style=\"font:13px system-ui;padding:12px;color:gray\">$text</body>"

    /** What to show for a plugin: (kind, value) with kind "html" or "url". */
    fun source(plugin: UserPlugin): Pair<String, String> {
        PluginAddress.builtinSlug(plugin.url)?.let { slug ->
            val html = if (builtins.any { it.slug == slug }) runCatching { context.assets.open("builtin/$slug.html").bufferedReader().readText() }.getOrNull() else null
            return "html" to (html ?: notice("This built-in plugin is not part of this version of Diddy."))
        }
        PluginAddress.localId(plugin.url)?.let { id ->
            val html = runCatching { File(root, "local/$id.html").readText() }.getOrNull()
            return "html" to (html ?: notice("The content of this plugin is missing on this device. Remove it and add it again."))
        }
        return "url" to plugin.url
    }

    private fun data(id: String): Map<String, String> {
        dataCache[id]?.let { return it }
        val loaded = if (PluginRules.isValidPluginId(id)) {
            Json.obj(runCatching { File(root, "data/$id.json").readText() }.getOrNull())
                ?.mapNotNull { (k, v) -> (v as? String)?.takeIf { PluginRules.isValidStorageKey(k) && it.length <= PluginRules.MAX_STORAGE_VALUE }?.let { k to it } }
                ?.toMap() ?: emptyMap()
        } else emptyMap()
        dataCache[id] = loaded
        return loaded
    }

    fun value(id: String, key: String): String? = data(id)[key]

    fun setValue(id: String, key: String, value: String) {
        val next = PluginMessageParser.applyStorageSet(data(id), key, value) ?: return
        dataCache[id] = next
        runCatching { File(root, "data/$id.json").writeText(Json.encode(next)) }
    }
}
