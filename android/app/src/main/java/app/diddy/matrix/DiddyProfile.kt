package app.diddy.matrix

import app.diddy.util.bool
import app.diddy.util.obj
import app.diddy.util.str
import java.net.URI

/**
 * Diddy profile extras (name colour, card, badges, bio, ...) as Diddy desktop shares them
 * (desktop `plugins/diddy/types.ts`, `profiles.ts`; ios DiddyProfiles.swift). Everything is written
 * by other people, so every value is whitelisted like desktop does.
 */
data class DiddyProfile(
    val nameColor: String? = null,
    val nameGradient: List<String>? = null,
    /** CSS angle of the name gradient in degrees (90 = left to right). */
    val nameGradientAngle: Double = 90.0,
    val nameFont: String = "default",
    val nameEffect: String = "none",
    val nameBold: Boolean = false,
    val nameItalic: Boolean = false,
    val cardFrom: String? = null,
    val cardTo: String? = null,
    val cardAngle: Double = 135.0,
    val cardAccent: String? = null,
    val bannerMxc: String? = null,
    val bannerPos: DiddyImagePos? = null,
    val nameplate: DiddyNameplate? = null,
    /** The animated overlay (#86) and frame (#87) as sent; kept for editing and preset drawing. */
    val effectPreset: String? = null,
    val framePreset: String? = null,
    val clientVersion: String? = null,
    /** "online", "idle", "dnd" or "invisible". */
    val status: String? = null,
    val shownBadges: List<String> = emptyList(),
    val bio: String? = null,
    /** Pronouns, location, age, education, work: in that order, only the ones that are set. */
    val about: List<Pair<String, String>> = emptyList(),
    val interests: List<String> = emptyList(),
    val links: List<Pair<String, String>> = emptyList(),
    val activity: Activity? = null,
    /** The card modules the owner shows, in their order. */
    val modules: List<String> = layoutModules["standard"]!!,
) {
    data class Activity(val kind: String, val text: String, val detail: String?)

    val hasCardContent: Boolean get() = bio != null || about.isNotEmpty() || interests.isNotEmpty() || links.isNotEmpty() || activity != null

    companion object {
        val nameFonts = listOf("default", "serif", "mono", "rounded", "impact", "script", "fantasy", "marker")
        val nameEffects = listOf("none", "glow", "shadow", "outline")
        val aboutFields = listOf("pronouns", "location", "age", "education", "work")
        val modulesAll = listOf("about", "bio", "activity", "interests", "links", "sharedRooms")
        val layoutModules: Map<String, List<String>> = mapOf(
            "compact" to listOf("bio"),
            "standard" to listOf("bio", "about", "links", "sharedRooms"),
            "expanded" to listOf("about", "bio", "activity", "interests", "links", "sharedRooms"),
            "tabs" to listOf("about", "bio", "activity", "interests", "links", "sharedRooms"),
        )
        val activityKinds = listOf("music", "game", "working", "learning", "custom")
        val statuses = listOf("online", "idle", "dnd", "invisible")
        private val linkHosts: Map<String, List<String>> = mapOf(
            "github" to listOf("github.com"),
            "gitlab" to listOf("gitlab.com"),
            "linkedin" to listOf("linkedin.com"),
            "spotify" to listOf("open.spotify.com", "spotify.com"),
            "youtube" to listOf("youtube.com", "youtu.be"),
            "web" to emptyList(),
        )
        val effectPresets = listOf("sparkles", "petals", "embers", "snow", "hearts", "aurora")
        val framePresets = listOf("glow", "gold", "vines", "neon", "pixel")

        /** `sanitizeProfile` of desktop: null unless it is a v1 profile; unknown keys are ignored. */
        fun parse(raw: Map<String, Any?>): DiddyProfile? {
            if ((raw["v"] as? Number)?.toDouble() != 1.0) return null
            var p = DiddyProfile()
            raw["nameStyle"].obj()?.let { style ->
                p = p.copy(nameColor = color(style["color"]))
                style["gradient"].obj()?.let { gradient ->
                    val from = color(gradient["from"])
                    val to = color(gradient["to"])
                    if (from != null && to != null) p = p.copy(nameGradient = listOf(from, to), nameGradientAngle = angle(gradient["angle"], 90.0))
                }
                style["font"].str()?.takeIf { it in nameFonts }?.let { p = p.copy(nameFont = it) }
                style["effect"].str()?.takeIf { it in nameEffects }?.let { p = p.copy(nameEffect = it) }
                p = p.copy(nameBold = style["bold"].bool() ?: false, nameItalic = style["italic"].bool() ?: false)
            }
            raw["card"].obj()?.let { card ->
                val banner = mxc(card["bannerMxc"])
                p = p.copy(
                    cardFrom = color(card["from"]), cardTo = color(card["to"]), cardAngle = angle(card["angle"], 135.0),
                    cardAccent = color(card["accent"]), bannerMxc = banner,
                    bannerPos = if (banner != null) DiddyImagePos.parse(card["bannerPos"]) else null,
                )
            }
            raw["nameplate"].obj()?.let { p = p.copy(nameplate = DiddyNameplate.parse(it)) }
            raw["effect"].obj()?.let { effect ->
                p = p.copy(effectPreset = effect["preset"].str()?.takeIf { it in effectPresets })
            }
            raw["frame"].obj()?.let { frame ->
                p = p.copy(framePreset = frame["preset"].str()?.takeIf { it in framePresets })
            }
            p = p.copy(clientVersion = DiddySanitize.version(raw["clientVersion"]))
            p = p.copy(status = raw["status"].str()?.takeIf { it in statuses })
            (raw["shownBadges"] as? List<*>)?.let { ids ->
                p = p.copy(shownBadges = ids.take(64).mapNotNull { it as? String }.filter { it.isNotEmpty() && it.length <= 64 }.take(4))
            }
            p = p.copy(bio = text(raw["bio"], 160))
            raw["about"].obj()?.let { about ->
                p = p.copy(about = aboutFields.mapNotNull { field -> text(about[field], if (field == "age") 8 else 40)?.let { field to it } })
            }
            (raw["interests"] as? List<*>)?.let { items ->
                val interests = mutableListOf<String>()
                for (item in items.take(24)) {
                    val value = text(item, 24) ?: continue
                    if (value !in interests && interests.size < 12) interests += value
                }
                p = p.copy(interests = interests)
            }
            (raw["links"] as? List<*>)?.let { items ->
                val links = mutableListOf<Pair<String, String>>()
                for (item in items.take(16)) {
                    if (links.size >= 8) break
                    val o = item.obj() ?: continue
                    val kind = o["kind"].str() ?: continue
                    val url = safeLink(kind, o["url"]) ?: continue
                    if (links.none { it.second == url }) links += kind to url
                }
                p = p.copy(links = links)
            }
            raw["activity"].obj()?.let { activity ->
                val kind = activity["kind"].str()
                val text = text(activity["text"], 60)
                if (kind != null && kind in activityKinds && text != null) p = p.copy(activity = Activity(kind, text, text(activity["detail"], 60)))
            }
            val layoutSettings = raw["cardLayout"].obj()
            val layout = layoutSettings?.get("layout").str()?.takeIf { it in layoutModules } ?: "standard"
            val allowed = layoutModules[layout] ?: emptyList()
            val hidden = moduleList(layoutSettings?.get("hidden"))
            val order = moduleList(layoutSettings?.get("order")).filter { it in allowed }
            p = p.copy(modules = (order + allowed.filter { it !in order }).filter { it !in hidden })
            return p
        }

        private val colorPattern = Regex("#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})")

        fun color(value: Any?): String? {
            val raw = value as? String ?: return null
            if (raw.length > 16) return null
            val hex = raw.trim().lowercase()
            if (!colorPattern.matches(hex)) return null
            if (hex.length == 4) return "#" + hex.drop(1).map { "$it$it" }.joinToString("")
            return hex
        }

        /** A finite number clamped to 0...360 (`safeAngle`). */
        fun angle(value: Any?, fallback: Double): Double {
            val number = (value as? Number)?.toDouble() ?: return fallback
            return if (number.isFinite()) number.coerceIn(0.0, 360.0) else fallback
        }

        private val mxcPattern = Regex("mxc://[A-Za-z0-9.\\-:\\[\\]]+/[A-Za-z0-9_\\-]+")

        fun mxc(value: Any?): String? {
            val raw = value as? String ?: return null
            if (raw.length > 512 || !mxcPattern.matches(raw)) return null
            return raw
        }

        /** Trimmed text of at most `max` characters without control characters, or null when empty. */
        fun text(value: Any?, max: Int): String? {
            val raw = value as? String ?: return null
            val clean = raw.take(max * 2).map { if (it.code < 0x20 || it.code == 0x7F) ' ' else it }.joinToString("")
            return clean.take(max).trim().ifEmpty { null }
        }

        /** An https link without credentials whose host fits its kind. */
        fun safeLink(kind: String, raw: Any?): String? {
            val hosts = linkHosts[kind] ?: return null
            val text = (raw as? String)?.trim() ?: return null
            if (text.length > 200) return null
            val uri = try { URI(text) } catch (_: Exception) { return null }
            if (uri.scheme?.lowercase() != "https" || uri.userInfo != null) return null
            val host = uri.host?.lowercase() ?: return null
            if (!host.contains(".")) return null
            if (kind != "web" && hosts.none { host == it || host.endsWith(".$it") }) return null
            return text
        }

        private fun moduleList(value: Any?): List<String> {
            val out = mutableListOf<String>()
            for (item in ((value as? List<*>) ?: emptyList<Any?>()).take(32)) {
                if (item is String && item in modulesAll && item !in out) out += item
            }
            return out
        }

        fun statusTitle(status: String?): String = when (status) {
            "idle" -> "Idle"
            "dnd" -> "Do Not Disturb"
            "invisible" -> "Invisible"
            else -> "Online"
        }
    }
}

/** The background someone set for their row in member and DM lists (desktop `nameplate.ts`). */
data class DiddyNameplate(
    val color: String? = null,
    val preset: String? = null,
    val flow: Boolean = false,
    val imageMxc: String? = null,
    val videoMxc: String? = null,
    val imagePos: DiddyImagePos? = null,
    /** "fade" (default) shows it on the right fading towards the name; "full" covers the row. */
    val fitsFullRow: Boolean = false,
) {
    /** The gradient stops (a preset) or the colour wash under any media. */
    val backgroundColors: List<String>?
        get() = preset?.let { presets[it] } ?: color?.let { listOf(it, it) }

    companion object {
        val presets: Map<String, List<String>> = mapOf(
            "aurora" to listOf("#1fa2ff", "#12d8fa", "#a6ffcb"),
            "sunset" to listOf("#ff5f6d", "#ff9966", "#ffc371"),
            "ocean" to listOf("#1a2a6c", "#2c5fa8", "#3ab0d8"),
            "forest" to listOf("#134e5e", "#3f8f6b", "#9bd27a"),
            "ember" to listOf("#8e1b2b", "#e2462f", "#f8b500"),
            "lavender" to listOf("#6a3fd0", "#b06ee8", "#f0c6ff"),
            "candy" to listOf("#ff6fd8", "#a259ff", "#4f3ee0"),
            "mint" to listOf("#00a693", "#4cc9a4", "#b5e88a"),
            "midnight" to listOf("#1c1d2b", "#3b3f72", "#7b6cf6"),
            "gold" to listOf("#8a6418", "#d4a537", "#f7e08a"),
        )

        fun parse(raw: Map<String, Any?>): DiddyNameplate? {
            val color = DiddyProfile.color(raw["color"])
            val preset = raw["preset"].str()?.takeIf { it in presets }
            val image = DiddyProfile.mxc(raw["imageMxc"])
            val video = DiddyProfile.mxc(raw["videoMxc"])
            if (color == null && preset == null && image == null && video == null) return null
            return DiddyNameplate(
                color = color,
                preset = preset,
                flow = preset != null && raw["flow"] == true,
                imageMxc = image,
                videoMxc = video,
                imagePos = if (image != null || video != null) DiddyImagePos.parse(raw["imagePos"]) else null,
                fitsFullRow = raw["fit"].str() == "full",
            )
        }
    }
}
