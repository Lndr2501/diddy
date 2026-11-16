package app.diddy.plugins

import app.diddy.util.Json
import java.net.URI

/**
 * Plugins, the pure part: validation, the message contract and the registry rules (a port of
 * ios PluginProtocol.swift, itself from cinny/src/app/plugins/userPlugins.ts). The wire format is
 * the desktop's (docs/plugins.md, apiVersion 1), so the unchanged plugin pages work.
 */
class PluginError(message: String) : Exception(message)

object PluginRules {
    const val API_VERSION = 1
    const val MAX_PLUGINS = 12
    const val MAX_NAME_LENGTH = 40
    const val MAX_URL_LENGTH = 2048
    const val MAX_DESCRIPTION_LENGTH = 140
    const val MIN_FRAME_HEIGHT = 80.0
    const val MAX_FRAME_HEIGHT = 600.0
    const val DEFAULT_FRAME_HEIGHT = 240.0
    const val MAX_CUSTOM_CSS = 4000
    const val MAX_STORAGE_KEYS = 50
    const val MAX_STORAGE_VALUE = 20000
    const val MAX_LOCAL_BYTES = 512 * 1024
    const val MAX_MESSAGE_LENGTH = 40_000
    const val BUILTIN_PREFIX = "diddy:builtin/"
    const val LOCAL_PREFIX = "diddy:local/"
    private val reservedKeys = setOf("__proto__", "constructor", "prototype")

    fun isValidStorageKey(key: String): Boolean =
        key !in reservedKeys && key.length in 1..40 && key.all { it in 'a'..'z' || it in '0'..'9' || it == '_' || it == '.' || it == '-' }

    fun isValidPluginId(id: String): Boolean =
        id.length in 1..64 && id.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' }
}

object PluginText {
    /** Removes control and bidi characters, collapses whitespace and trims. */
    fun clean(value: String): String {
        val kept = value.filter { c ->
            val v = c.code
            !(v <= 0x1F || v in 0x7F..0x9F || v in 0x200B..0x200F || v in 0x202A..0x202E || v in 0x2066..0x2069)
        }
        return kept.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
    }

    fun normalizeLocale(locale: String?): String {
        val value = locale?.trim() ?: return "en"
        return if (Regex("^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$").matches(value)) value else "en"
    }

    fun clampHeight(height: Double): Double {
        if (!height.isFinite()) return PluginRules.DEFAULT_FRAME_HEIGHT
        return Math.round(height).toDouble().coerceIn(PluginRules.MIN_FRAME_HEIGHT, PluginRules.MAX_FRAME_HEIGHT)
    }
}

object PluginAddress {
    /** An https plugin address in canonical form; without a scheme https is assumed. */
    fun normalize(input: String): String {
        val raw = input.trim()
        if (raw.isEmpty()) throw PluginError("Enter the address of the plugin.")
        if (raw.length > PluginRules.MAX_URL_LENGTH) throw PluginError("This address is too long.")
        if (raw.any { it.isWhitespace() }) throw PluginError("The address must not contain spaces.")
        val withScheme = if (raw.contains("://")) raw else "https://$raw"
        val uri = runCatching { URI(withScheme) }.getOrNull() ?: throw PluginError("This is not a valid address.")
        val host = uri.host?.lowercase()
        if (host.isNullOrEmpty()) throw PluginError("This is not a valid address.")
        if (uri.scheme?.lowercase() != "https") throw PluginError("Only https:// addresses can be added.")
        if (uri.userInfo != null) throw PluginError("The address must not contain a user or password.")
        if (host == "localhost" || host.endsWith(".localhost")) throw PluginError("This address is reserved by the app.")
        val text = uri.toString()
        if (text.length > PluginRules.MAX_URL_LENGTH) throw PluginError("This address is too long.")
        return text
    }

    /** A link a plugin asks the app to open: https only, no credentials. */
    fun externalUrl(input: Any?): String? {
        val text = input as? String ?: return null
        if (text.length > PluginRules.MAX_URL_LENGTH || text.any { it.isWhitespace() }) return null
        val uri = runCatching { URI(text) }.getOrNull() ?: return null
        if (uri.scheme?.lowercase() != "https" || uri.userInfo != null || uri.host.isNullOrEmpty()) return null
        return text
    }

    fun builtinSlug(url: String): String? {
        if (!url.startsWith(PluginRules.BUILTIN_PREFIX)) return null
        val slug = url.removePrefix(PluginRules.BUILTIN_PREFIX)
        return slug.takeIf { it.length in 1..30 && it.all { c -> c in 'a'..'z' || c in '0'..'9' || c == '-' } }
    }

    fun localId(url: String): String? {
        if (!url.startsWith(PluginRules.LOCAL_PREFIX)) return null
        return url.removePrefix(PluginRules.LOCAL_PREFIX).takeIf(PluginRules::isValidPluginId)
    }
}

/** A message from a plugin, checked to be exactly one of the known shapes. */
sealed class PluginMessage {
    data class Ready(val apiVersion: Int?, val description: String?, val height: Double?) : PluginMessage()
    data class Resize(val height: Double) : PluginMessage()
    data class StorageGet(val id: String, val key: String) : PluginMessage()
    data class StorageSet(val key: String, val value: String) : PluginMessage()
    data class Open(val url: String) : PluginMessage()
}

object PluginMessageParser {
    private fun number(value: Any?): Double? = (value as? Number)?.toDouble()?.takeIf { it.isFinite() }

    private fun hasOnly(data: Map<String, Any?>, allowed: Set<String>) = data.keys.all { it in allowed }

    fun parse(json: String): PluginMessage? {
        if (json.length > PluginRules.MAX_MESSAGE_LENGTH) return null
        return parse(Json.obj(json) ?: return null)
    }

    fun parse(data: Map<String, Any?>): PluginMessage? {
        return when (data["type"] as? String ?: return null) {
            "diddy:ready" -> {
                if (!hasOnly(data, setOf("type", "apiVersion", "manifest"))) return null
                var version: Int? = null
                if (data.containsKey("apiVersion")) {
                    val d = number(data["apiVersion"]) ?: return null
                    if (d != Math.rint(d) || d < 1 || d >= 1e9) return null
                    version = d.toInt()
                }
                val manifest = data["manifest"] as? Map<*, *>
                val description = (manifest?.get("description") as? String)?.let { PluginText.clean(it).take(PluginRules.MAX_DESCRIPTION_LENGTH) }?.ifEmpty { null }
                val height = number(manifest?.get("height"))?.let(PluginText::clampHeight)
                PluginMessage.Ready(version, description, height)
            }
            "diddy:resize" -> {
                if (!hasOnly(data, setOf("type", "height"))) return null
                PluginMessage.Resize(PluginText.clampHeight(number(data["height"]) ?: return null))
            }
            "diddy:storage:get" -> {
                if (!hasOnly(data, setOf("type", "id", "key"))) return null
                val id = (data["id"] as? String)?.takeIf { it.length in 1..64 } ?: return null
                val key = (data["key"] as? String)?.takeIf(PluginRules::isValidStorageKey) ?: return null
                PluginMessage.StorageGet(id, key)
            }
            "diddy:storage:set" -> {
                if (!hasOnly(data, setOf("type", "key", "value"))) return null
                val key = (data["key"] as? String)?.takeIf(PluginRules::isValidStorageKey) ?: return null
                val value = (data["value"] as? String)?.takeIf { it.length <= PluginRules.MAX_STORAGE_VALUE } ?: return null
                PluginMessage.StorageSet(key, value)
            }
            "diddy:open" -> {
                if (!hasOnly(data, setOf("type", "url"))) return null
                PluginMessage.Open(PluginAddress.externalUrl(data["url"]) ?: return null)
            }
            else -> null
        }
    }

    fun initMessage(theme: String, locale: String?, compact: Boolean, customCss: String?): Map<String, Any?> {
        val message = linkedMapOf<String, Any?>(
            "type" to "diddy:init",
            "apiVersion" to PluginRules.API_VERSION,
            "theme" to if (theme == "light") "light" else "dark",
            "locale" to PluginText.normalizeLocale(locale),
            "layout" to if (compact) "compact" else "full",
        )
        if (!customCss.isNullOrBlank()) message["customCss"] = customCss.take(PluginRules.MAX_CUSTOM_CSS)
        return message
    }

    fun applyStorageSet(data: Map<String, String>, key: String, value: String): Map<String, String>? {
        if (!PluginRules.isValidStorageKey(key) || value.length > PluginRules.MAX_STORAGE_VALUE) return null
        if (!data.containsKey(key) && data.size >= PluginRules.MAX_STORAGE_KEYS) return null
        return data + (key to value)
    }
}

data class UserPlugin(val id: String, val name: String, val url: String, val enabled: Boolean, val addedAt: Double, val customCss: String? = null) {
    fun toJson(): Map<String, Any?> = buildMap {
        put("id", id); put("name", name); put("url", url); put("enabled", enabled); put("addedAt", addedAt)
        if (customCss != null) put("customCss", customCss)
    }

    companion object {
        fun fromJson(raw: Map<String, Any?>): UserPlugin? = UserPlugin(
            raw["id"] as? String ?: return null,
            raw["name"] as? String ?: return null,
            raw["url"] as? String ?: return null,
            raw["enabled"] as? Boolean ?: true,
            (raw["addedAt"] as? Number)?.toDouble() ?: 0.0,
            raw["customCss"] as? String,
        )
    }
}

object PluginRegistry {
    fun validName(input: String): String {
        val name = PluginText.clean(input)
        if (name.isEmpty()) throw PluginError("Enter a name for the plugin.")
        if (name.length > PluginRules.MAX_NAME_LENGTH) throw PluginError("The name can be at most ${PluginRules.MAX_NAME_LENGTH} characters long.")
        return name
    }

    private fun append(plugins: List<UserPlugin>, id: String, name: String, url: String, now: Double): List<UserPlugin> {
        if (plugins.size >= PluginRules.MAX_PLUGINS) throw PluginError("You can add at most ${PluginRules.MAX_PLUGINS} plugins. Remove one first.")
        if (plugins.any { it.url == url }) throw PluginError("This plugin has already been added.")
        if (plugins.any { it.name.equals(name, ignoreCase = true) }) throw PluginError("A plugin with this name already exists.")
        if (!PluginRules.isValidPluginId(id) || plugins.any { it.id == id }) throw PluginError("Could not add the plugin.")
        return plugins + UserPlugin(id, name, url, true, now)
    }

    fun add(plugins: List<UserPlugin>, name: String, address: String, id: String, now: Double) =
        append(plugins, id, validName(name), PluginAddress.normalize(address), now)

    fun addBuiltin(plugins: List<UserPlugin>, slug: String, name: String, id: String, now: Double) =
        append(plugins, id, validName(name), PluginRules.BUILTIN_PREFIX + slug, now)

    fun addLocal(plugins: List<UserPlugin>, name: String, id: String, now: Double) =
        append(plugins, id, validName(name), PluginRules.LOCAL_PREFIX + id, now)

    /** Reads the stored list: every entry is checked again, duplicates and overflow are dropped. */
    fun sanitize(stored: List<UserPlugin>): List<UserPlugin> {
        val result = mutableListOf<UserPlugin>()
        for (entry in stored) {
            if (result.size >= PluginRules.MAX_PLUGINS) break
            if (!PluginRules.isValidPluginId(entry.id)) continue
            val name = runCatching { validName(entry.name) }.getOrNull() ?: continue
            val url = when {
                entry.url.startsWith(PluginRules.LOCAL_PREFIX) -> entry.url.takeIf { PluginAddress.localId(it) == entry.id } ?: continue
                PluginAddress.builtinSlug(entry.url) != null -> entry.url
                else -> runCatching { PluginAddress.normalize(entry.url) }.getOrNull() ?: continue
            }
            if (result.any { it.id == entry.id || it.url == url || it.name.equals(name, ignoreCase = true) }) continue
            result += entry.copy(name = name, url = url, customCss = entry.customCss?.take(PluginRules.MAX_CUSTOM_CSS))
        }
        return result
    }
}

object PluginContent {
    private val tags = Regex(
        "<(!doctype\\s+html|html|head|body|meta|title|script|style|link|main|div|section|article|template|canvas|svg|button|span|p|h[1-6]|ul|table)[\\s>/]",
        RegexOption.IGNORE_CASE,
    )

    /** Checks pasted or loaded content: not empty, within the size cap, no binary data, looks like HTML. */
    fun validate(input: String): String {
        val html = input.removePrefix("\uFEFF")
        if (html.isBlank()) throw PluginError("The plugin is empty.")
        if (html.toByteArray().size > PluginRules.MAX_LOCAL_BYTES) throw PluginError("The plugin is too large (at most ${PluginRules.MAX_LOCAL_BYTES / 1024} KB).")
        if (html.contains('\u0000')) throw PluginError("This looks like a binary file, not an HTML page.")
        if (!html.trimStart().startsWith("<") || !tags.containsMatchIn(html)) throw PluginError("This does not look like an HTML page.")
        return html
    }

    /** The page's `<title>`, cleaned. */
    fun title(html: String): String {
        val match = Regex("<title[^>]*>([\\s\\S]{0,400}?)</title>", RegexOption.IGNORE_CASE).find(html.take(20000)) ?: return ""
        var text = match.groupValues[1]
        for ((entity, char) in listOf("&amp;" to "&", "&lt;" to "<", "&gt;" to ">", "&quot;" to "\"", "&apos;" to "'")) text = text.replace(entity, char)
        return PluginText.clean(text).take(PluginRules.MAX_NAME_LENGTH).trim()
    }

    fun name(fileName: String): String =
        PluginText.clean(fileName.substringAfterLast('/').replace(Regex("\\.html?$", RegexOption.IGNORE_CASE), "")).take(PluginRules.MAX_NAME_LENGTH)
}
