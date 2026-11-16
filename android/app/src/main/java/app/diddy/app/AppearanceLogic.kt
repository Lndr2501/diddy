package app.diddy.app

import app.diddy.util.Json
import app.diddy.util.str

/**
 * The settings of desktop's "Custom" theme (`state/customTheme.ts`): the three colours the palette
 * is built from. Same keys and `#RRGGBB` strings as the desktop.
 */
data class CustomThemeConfig(val accent: String, val background: String, val text: String) {
    /** The JSON string kept in the settings. */
    fun encoded(): String = Json.encode(sortedMapOf("accent" to accent, "background" to background, "text" to text))

    companion object {
        val defaults = CustomThemeConfig(accent = "#FF4FA3", background = "#0E0E12", text = "#F2F2F5")

        /** Reads what is stored; anything missing or broken falls back to the default colour. */
        fun decode(json: String?): CustomThemeConfig {
            val raw = Json.obj(json) ?: return defaults
            fun color(key: String, fallback: String): String {
                val parsed = raw[key].str()?.let(AppearanceLogic::parseHex) ?: return fallback
                return AppearanceLogic.hexString(parsed)
            }
            return CustomThemeConfig(
                accent = color("accent", defaults.accent),
                background = color("background", defaults.background),
                text = color("text", defaults.text),
            )
        }
    }
}

/** Appearance rules that mirror desktop's Settings > General > Theme and Display. */
object AppearanceLogic {
    const val CUSTOM_THEME_ID = "custom-theme"

    /** `#RRGGBB`, `RRGGBB` or `#RGB`. */
    fun parseHex(value: String): Long? {
        var digits = value.trim()
        if (digits.startsWith("#")) digits = digits.drop(1)
        if (digits.length == 3) digits = digits.map { "$it$it" }.joinToString("")
        if (digits.length != 6) return null
        return digits.toLongOrNull(16)
    }

    fun hexString(value: Long): String = "#" + (value and 0xFFFFFF).toString(16).uppercase().padStart(6, '0')

    /** Desktop's `useActiveTheme`. */
    fun activeThemeId(useSystem: Boolean, systemIsLight: Boolean, themeId: String, lightId: String, darkId: String): String {
        if (!useSystem) return themeId
        return if (systemIsLight) lightId else darkId
    }

    val zoomRange = 75..150
    const val DEFAULT_ZOOM = 100

    fun clampZoom(value: Int): Int = value.coerceIn(zoomRange)
}
