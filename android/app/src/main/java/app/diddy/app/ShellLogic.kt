package app.diddy.app

import app.diddy.util.Json
import app.diddy.util.bool
import app.diddy.util.double
import app.diddy.util.obj
import app.diddy.util.str
import java.net.URI
import java.net.URLDecoder

// Pure rules of the app shell (ios App/ShellLogic.swift): user panel, plugin dock, sync banner,
// update notice, matrix.to links, welcome guide. Each part names the desktop file it follows.

// MARK: - Own status (components/user-panel/UserPanelFace.tsx, STATUS_OPTIONS)

data class OwnStatusOption(val status: String, val label: String, val short: String?, val description: String?) {
    val shownLabel: String get() = short ?: label
}

object OwnStatusOptions {
    val all = listOf(
        OwnStatusOption("online", "Online", null, null),
        OwnStatusOption("idle", "Idle", null, null),
        OwnStatusOption("dnd", "Do Not Disturb", "Busy", "Mutes sounds and notifications. Unread badges stay."),
        OwnStatusOption("invisible", "Invisible", null, null),
    )

    /** The option of a status; unknown or missing is "online" like on desktop. */
    fun info(status: String?): OwnStatusOption = all.firstOrNull { it.status == status } ?: all[0]
}

// MARK: - Sync banner (plugins/syncBanner.ts)

enum class SyncBannerKind(val text: String) {
    CONNECTING("Connecting..."),
    RECONNECTING("Verbindung verloren – erneuter Versuch …"),
    ERROR("Homeserver nicht erreichbar"),
}

object SyncBannerLogic {
    /** `state` is the name of the SDK's `SyncServiceState` (idle, running, terminated, error, offline). */
    fun banner(state: String, started: Boolean, everRan: Boolean): SyncBannerKind? {
        if (!started) return null
        return when (state) {
            "running", "terminated" -> null
            "offline" -> SyncBannerKind.RECONNECTING
            "error" -> SyncBannerKind.ERROR
            else -> if (everRan) null else SyncBannerKind.CONNECTING
        }
    }
}

// MARK: - Update check (utils/updateCheck.ts, utils/version.ts)

data class UpdateRelease(val version: String, val pageUrl: String, val apkUrl: String?)

object UpdateCheckLogic {
    const val REPO = "Lndr2501/diddy"
    const val RELEASES_API_URL = "https://api.github.com/repos/$REPO/releases?per_page=30"
    const val RELEASES_PAGE_URL = "https://github.com/$REPO/releases"

    /** Desktop's `compareVersions`: dotted numbers, a missing part counts as 0. */
    fun compareVersions(a: String, b: String): Int {
        fun parse(v: String) = v.split(".").map { part -> part.takeWhile { it in '0'..'9' }.toIntOrNull() ?: 0 }
        val pa = parse(a)
        val pb = parse(b)
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return if (x > y) 1 else -1
        }
        return 0
    }

    /** Only GitHub hosts may serve a release page or download (desktop `isGithubUrl`). */
    fun isGithubUrl(raw: String): Boolean {
        val url = try { URI(raw) } catch (_: Exception) { return false }
        if (url.scheme != "https" || url.userInfo != null) return false
        val host = url.host?.lowercase() ?: return false
        return host == "github.com" || host.endsWith(".github.com") || host.endsWith(".githubusercontent.com")
    }

    /** "v1.6.0" gives the version; anything else (betas, iOS-only tags, other tags) null. */
    fun version(tag: String): String? {
        val text = tag.trim()
        if (!text.startsWith("v")) return null
        val version = text.drop(1)
        val parts = version.split(".")
        if (parts.isEmpty() || parts.any { p -> p.isEmpty() || !p.all { it in '0'..'9' } }) return null
        return version
    }

    /** One release of the GitHub list. Drafts, pre-releases and releases without an APK give null. */
    fun parseRelease(data: Any?): UpdateRelease? {
        val d = data.obj() ?: return null
        if (d["draft"].bool() == true || d["prerelease"].bool() == true) return null
        val version = d["tag_name"].str()?.let(::version) ?: return null
        val apks = mutableMapOf<String, String>()
        for (asset in (d["assets"] as? List<*>) ?: emptyList<Any?>()) {
            val a = asset.obj() ?: continue
            val name = a["name"].str() ?: continue
            val url = a["browser_download_url"].str() ?: continue
            if (name.lowercase().endsWith(".apk") && isGithubUrl(url)) apks[name] = url
        }
        if (apks.isEmpty()) return null
        val names = apks.keys.sorted()
        val pick = names.firstOrNull { it.contains("arm64") } ?: names[0]
        val page = d["html_url"].str()?.takeIf(::isGithubUrl) ?: RELEASES_PAGE_URL
        return UpdateRelease(version, page, apks[pick])
    }

    fun newest(data: Any?): UpdateRelease? {
        val list = data as? List<*> ?: return null
        var best: UpdateRelease? = null
        for (item in list) {
            val release = parseRelease(item) ?: continue
            val current = best
            if (current != null && compareVersions(release.version, current.version) <= 0) continue
            best = release
        }
        return best
    }

    fun isUpdateWanted(latest: String, current: String, skipped: String): Boolean =
        compareVersions(latest, current) > 0 && latest != skipped
}

// MARK: - matrix.to links (plugins/matrix-to.ts)

sealed class MatrixToLink {
    data class User(val userId: String) : MatrixToLink()
    data class Room(val roomIdOrAlias: String, val via: List<String>) : MatrixToLink()
    data class Event(val roomIdOrAlias: String, val eventId: String, val via: List<String>) : MatrixToLink()

    companion object {
        private val userPattern = Regex("""^https?://matrix\.to/#/(@[^:\s]+:[^?/\s]+)/?$""")
        private val roomPattern = Regex("""^https?://matrix\.to/#/([#!][^?/\s]+)/?(\?\S*)?$""")
        private val eventPattern = Regex("""^https?://matrix\.to/#/([#!][^?/\s]+)/(\$[^?/\s]+)/?(\?\S*)?$""")

        /** The `via` values of a query like "?via=a.org&via=b.org". */
        fun viaServers(query: String?): List<String> {
            var q = query ?: return emptyList()
            if (q.isEmpty()) return emptyList()
            if (q.startsWith("?")) q = q.drop(1)
            return q.split("&").mapNotNull { pair ->
                val parts = pair.split("=", limit = 2)
                if (parts.size != 2 || parts[0] != "via" || parts[1].isEmpty()) null
                else try { URLDecoder.decode(parts[1], "UTF-8") } catch (_: Exception) { parts[1] }
            }
        }

        /**
         * A `matrix:` URI (MSC2312: `matrix:r/alias:server`, `matrix:roomid/id:server/e/event`,
         * `matrix:u/user:server`) as the matrix.to link it stands for; other text stays as it is.
         */
        fun fromMatrixUri(uri: String): String {
            if (!uri.startsWith("matrix:")) return uri
            val body = uri.removePrefix("matrix:").removePrefix("//").substringBefore('#')
            val path = body.substringBefore('?')
            val query = body.substringAfter('?', "").split("&").filter { it.startsWith("via=") }.joinToString("&")
            val parts = path.split("/")
            if (parts.size < 2) return uri
            val sigil = when (parts[0]) {
                "r" -> "#"
                "roomid" -> "!"
                "u" -> "@"
                else -> return uri
            }
            var target = "https://matrix.to/#/" + sigil + parts[1]
            if (parts.size >= 4 && parts[2] == "e") target += "/$" + parts[3]
            return if (query.isEmpty()) target else "$target?$query"
        }

        /** A matrix.to link of a user, room or message, percent-decoded first like desktop. */
        fun parse(href: String): MatrixToLink? {
            val raw = href.trim()
            val text = try { URLDecoder.decode(raw.replace("+", "%2B"), "UTF-8") } catch (_: Exception) { raw }
            userPattern.find(text)?.let { return User(it.groupValues[1]) }
            roomPattern.find(text)?.let { return Room(it.groupValues[1], viaServers(it.groups[2]?.value)) }
            eventPattern.find(text)?.let { return Event(it.groupValues[1], it.groupValues[2], viaServers(it.groups[3]?.value)) }
            return null
        }
    }
}

// MARK: - Plugin dock (state/pluginDock.ts)

data class PluginDockLook(val height: Int? = null, val zoom: Int? = null)

/** Which plugins are pinned to the dock, which cards are collapsed, height and zoom per plugin. */
data class PluginDockState(
    val pinned: List<String> = emptyList(),
    val collapsed: List<String> = emptyList(),
    val styles: Map<String, PluginDockLook> = emptyMap(),
) {
    fun encoded(): String {
        val styleJson = styles.mapValues { (_, look) ->
            buildMap<String, Any?> {
                look.height?.let { put("height", it) }
                look.zoom?.let { put("zoom", it) }
            }
        }
        return Json.encode(sortedMapOf("pinned" to pinned, "collapsed" to collapsed, "styles" to styleJson))
    }

    fun withPinned(id: String, on: Boolean) = copy(pinned = toggle(pinned, id, on))
    fun withCollapsed(id: String, on: Boolean) = copy(collapsed = toggle(collapsed, id, on))
    fun withHeight(id: String, value: Double) = copy(styles = styles + (id to (styles[id] ?: PluginDockLook()).copy(height = clamp(value, MIN_HEIGHT, MAX_HEIGHT))))
    fun withZoom(id: String, value: Double) = copy(styles = styles + (id to (styles[id] ?: PluginDockLook()).copy(zoom = clamp(value, MIN_ZOOM, MAX_ZOOM))))
    fun height(id: String): Int = styles[id]?.height ?: DEFAULT_HEIGHT
    fun zoom(id: String): Int = styles[id]?.zoom ?: MAX_ZOOM

    companion object {
        const val MIN_HEIGHT = 60
        const val MAX_HEIGHT = 320
        const val DEFAULT_HEIGHT = 96
        const val MIN_ZOOM = 50
        const val MAX_ZOOM = 100

        private fun toggle(list: List<String>, id: String, on: Boolean): List<String> {
            val without = list.filter { it != id }
            return if (on) without + id else without
        }

        fun clamp(value: Any?, min: Int, max: Int): Int? {
            val number = value.double() ?: return null
            if (number.isNaN() || number.isInfinite()) return null
            return Math.round(number.coerceIn(min.toDouble(), max.toDouble())).toInt()
        }

        fun cleanLook(raw: Any?): PluginDockLook {
            val r = raw.obj() ?: emptyMap()
            return PluginDockLook(clamp(r["height"], MIN_HEIGHT, MAX_HEIGHT), clamp(r["zoom"], MIN_ZOOM, MAX_ZOOM))
        }

        fun decode(text: String?): PluginDockState {
            val json = Json.obj(text) ?: return PluginDockState()
            fun strings(value: Any?) = (value as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
            val styles = json["styles"].obj()?.mapValues { (_, raw) -> cleanLook(raw) } ?: emptyMap()
            return PluginDockState(strings(json["pinned"]), strings(json["collapsed"]), styles)
        }

        /** Height of a dock card's frame: the plugin's own height, capped at the user's, then zoomed. */
        fun frameHeight(pluginHeight: Double, look: Int, zoom: Int): Double = minOf(pluginHeight, look.toDouble()) * zoom / 100
    }
}

// MARK: - Welcome guide (plugins/diddy/onboarding.ts, plugins/diddy/intro.ts)

data class OnboardingStored(val done: Boolean = false, val dismissedSpaces: List<String> = emptyList()) {
    fun encoded(): String = Json.encode(sortedMapOf("done" to done, "dismissedSpaces" to dismissedSpaces))
    fun dismiss(keys: List<String>) = copy(dismissedSpaces = dismissedSpaces + keys.filter { it !in dismissedSpaces }.distinct())

    companion object {
        fun decode(text: String?): OnboardingStored {
            val json = Json.obj(text) ?: return OnboardingStored()
            return OnboardingStored(json["done"].bool() == true, (json["dismissedSpaces"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList())
        }
    }
}

enum class OnboardingShow { WELCOME, SERVER }

object OnboardingLogic {
    const val OPTIONS_ROOM_NAME = "Diddy Options"

    fun isDiddyRoom(name: String?, topic: String?, tag: String): Boolean {
        if (name != null && name.trim().lowercase() == OPTIONS_ROOM_NAME.lowercase()) return true
        return topic?.contains(tag) == true
    }

    fun show(stored: OnboardingStored, pendingKeys: List<String>): OnboardingShow? {
        if (!stored.done) return OnboardingShow.WELCOME
        return if (pendingKeys.any { it !in stored.dismissedSpaces }) OnboardingShow.SERVER else null
    }
}

// MARK: - Matrix intro for Discord users (features/intro/introSteps.ts)

data class IntroStep(val title: String, val lead: String, val points: List<Pair<String, String>>)

object IntroSteps {
    /** Desktop's `INTRO_STEPS`, word for word (German like on desktop). */
    val all = listOf(
        IntroStep(
            "Willkommen bei Matrix",
            "Diddy ist ein Chat-Programm für Matrix. Matrix ist ein offenes Netzwerk, das nicht einer Firma gehört – ähnlich wie E-Mail.",
            listOf(
                "Server" to "Dein Konto liegt auf einem Server (z. B. matrix.tllx.eu). Der Server gehört nicht Diddy.",
                "Dein Name" to "Du heißt @name:server. Der Teil nach dem Doppelpunkt ist dein Server.",
                "Offen" to "Du kannst auch mit Leuten auf anderen Matrix-Servern schreiben (Föderation).",
            ),
        ),
        IntroStep(
            "Discord auf Matrix übersetzt",
            "Vieles kennst du schon, es heißt nur anders.",
            listOf(
                "Discord-Server → Space" to "Ein „Space“ bündelt Räume, wie ein Discord-Server.",
                "Kanal → Raum" to "Text- und Sprachkanäle sind „Räume“. Es gibt Räume mit Anruf (Call-Räume) für Sprache, Kamera und Bildschirm.",
                "DM → Direktnachricht" to "Eins-zu-eins-Chats funktionieren wie auf Discord.",
                "Rollen → Berechtigungen" to "Statt Rollen gibt es Rechte-Stufen (z. B. Admin, Moderator) pro Raum.",
            ),
        ),
        IntroStep(
            "Verschlüsselung und Schlüssel",
            "Private Räume sind Ende-zu-Ende verschlüsselt. Das ist sicherer, hat aber eine Eigenheit.",
            listOf(
                "Nur Teilnehmer lesen mit" to "Auch der Server-Admin kann verschlüsselte Nachrichten nicht lesen.",
                "Geräte verifizieren" to "Bestätige dein Gerät (Einstellungen → Geräte), damit alte Nachrichten lesbar bleiben.",
                "Wiederherstellungsschlüssel" to "Speichere ihn gut. Ohne ihn und ohne ein anderes angemeldetes Gerät sind verschlüsselte Nachrichten verloren.",
            ),
        ),
        IntroStep(
            "Was Diddy kann",
            "Diddy ergänzt Matrix um Dinge, die du von Discord kennst.",
            listOf(
                "Anrufe" to "Sprach-, Video- und Bildschirm-Anrufe mit Ton in Call-Räumen.",
                "Profil" to "Eigene Profilkarte mit Banner, Badges, Schriftart und Status – sichtbar für andere Diddy-Nutzer.",
                "Sprachnachrichten" to "Aufnehmen und senden direkt im Eingabefeld.",
            ),
        ),
        IntroStep(
            "Was anders ist",
            "Ehrlich gesagt: Einiges gibt es auf Matrix nicht oder anders.",
            listOf(
                "Kein Nitro, keine Server-Boosts" to "Es gibt keine bezahlten Extras des Netzwerks.",
                "Profil nur bei Diddy" to "Banner, Badges und Profilkarte sehen nur Nutzer, die auch Diddy mit demselben Datenraum nutzen. Andere Clients zeigen Name und Bild.",
                "Server entscheidet mit" to "Dein Server legt fest, wer Räume erstellen darf, wie groß Dateien sein dürfen und ob Anrufe möglich sind.",
                "Kein globaler Status" to "Online-Status und Aktivitäten sind begrenzt und hängen vom Server ab.",
            ),
        ),
    )
}
