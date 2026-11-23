package app.diddy.ui.theme

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import app.diddy.app.AppearanceLogic
import app.diddy.app.CustomThemeConfig
import app.diddy.app.Prefs
import kotlin.math.pow
import kotlin.math.roundToLong

/**
 * One of the desktop app's colour themes, mapped to the app's colour roles (ios DiddyTheme.swift).
 * The desktop's Background tone is the sidebar, Surface the chat and SurfaceVariant the raised
 * panels. `rail` (the server rail) is one step further from the chat than the sidebar.
 */
data class DiddyTheme(
    val id: String,
    val name: String,
    val isLight: Boolean,
    val rail: Color,
    val sidebar: Color,
    val chat: Color,
    val elevated: Color,
    val input: Color,
    val accent: Color,
    val online: Color,
    val danger: Color,
    val text: Color,
    val muted: Color,
    val faint: Color,
    /** Text and icons on top of the accent colour. */
    val onAccent: Color,
) {
    companion object {
        const val DEFAULT_ID = "diddy-theme"
        private const val VIVID_ONLINE = 0x23A55AL
        private const val VIVID_DANGER = 0xF23F43L

        private fun make(
            id: String, name: String, isLight: Boolean,
            rail: Long, sidebar: Long, chat: Long, elevated: Long, input: Long,
            accent: Long, text: Long, online: Long, danger: Long,
            muted: Long? = null, faint: Long? = null,
        ) = DiddyTheme(
            id = id, name = name, isLight = isLight,
            rail = hex(rail), sidebar = hex(sidebar), chat = hex(chat), elevated = hex(elevated), input = hex(input),
            accent = hex(accent), online = hex(online), danger = hex(danger), text = hex(text),
            muted = hex(muted ?: mix(text, chat, if (isLight) 0.38 else 0.28)),
            faint = hex(faint ?: mix(text, chat, 0.55)),
            onAccent = hex(if (luminance(accent) > 0.4) 0x141414 else 0xFFFFFF),
        )

        fun hex(value: Long): Color = Color(0xFF000000 or (value and 0xFFFFFF))

        /** The iOS original: plum surfaces and the pink accent. */
        val diddy = make(
            "diddy-theme", "Diddy", false,
            rail = 0x0F0711, sidebar = 0x180B1B, chat = 0x200F23, elevated = 0x2B162F, input = 0x2F1A33,
            accent = 0xE5517C, text = 0xF2F2F2, online = VIVID_ONLINE, danger = VIVID_DANGER,
            muted = 0xADADAD, faint = 0x737373,
        )
        val light = make(
            "light-theme", "Light", true,
            rail = 0xE5E5E5, sidebar = 0xF2F2F2, chat = 0xFFFFFF, elevated = 0xF2F2F2, input = 0xE5E5E5,
            accent = 0x1858D5, text = 0x000000, online = 0x00844C, danger = 0xC40E0E,
        )
        val silver = make(
            "silver-theme", "Silver", true,
            rail = 0xC7C7C7, sidebar = 0xDEDEDE, chat = 0xEAEAEA, elevated = 0xDEDEDE, input = 0xD3D3D3,
            accent = 0x1245A8, text = 0x000000, online = 0x017343, danger = 0x9D0F0F,
        )
        val dark = make(
            "dark-theme", "Dark", false,
            rail = 0x0D0D0D, sidebar = 0x1A1A1A, chat = 0x262626, elevated = 0x333333, input = 0x404040,
            accent = 0xBDB6EC, text = 0xF2F2F2, online = VIVID_ONLINE, danger = VIVID_DANGER,
        )
        val butter = make(
            "butter-theme", "Butter", false,
            rail = 0x0D0C0B, sidebar = 0x1A1916, chat = 0x262621, elevated = 0x33322C, input = 0x403F38,
            accent = 0xBDB6EC, text = 0xFFFBDE, online = VIVID_ONLINE, danger = VIVID_DANGER,
        )
        val daaark = make(
            "daaark-theme", "DAAARK", false,
            rail = 0x000000, sidebar = 0x111111, chat = 0x000000, elevated = 0x111111, input = 0x1A1A1A,
            accent = 0x346BF1, text = 0xF5F5F5, online = VIVID_ONLINE, danger = VIVID_DANGER,
        )
        /** Wine red surfaces and a cranberry accent, pairs with the Christmas app icon. */
        val christmas = make(
            "christmas-theme", "Christmas", false,
            rail = 0x12070A, sidebar = 0x261117, chat = 0x1B1214, elevated = 0x2A1C20, input = 0x332428,
            accent = 0xDB3B57, text = 0xF6ECEE, online = VIVID_ONLINE, danger = VIVID_DANGER,
        )

        val all: List<DiddyTheme> = listOf(
            diddy, light, silver, dark, butter,
            accentOnBlack("red-theme", "Red & Black", 0x140909, 0xFF4D5A, 0xF7E9E9),
            accentOnBlack("green-theme", "Green & Black", 0x07120C, 0x42E08C, 0xE8F6EE),
            accentOnBlack("purple-theme", "Purple & Black", 0x0F0818, 0xB26BFF, 0xEFE8F9),
            accentOnBlack("amber-theme", "Amber & Black", 0x130C03, 0xFFA726, 0xFBEFD9),
            daaark,
            christmas,
        )

        fun named(id: String?): DiddyTheme {
            if (id == AppearanceLogic.CUSTOM_THEME_ID) return custom(ThemeStore.savedCustomConfig())
            return all.firstOrNull { it.id == id } ?: diddy
        }

        /** Desktop's "Custom" theme: the dark palette built from three colours. */
        fun custom(config: CustomThemeConfig): DiddyTheme = accentOnBlack(
            AppearanceLogic.CUSTOM_THEME_ID, "Custom",
            AppearanceLogic.parseHex(config.background) ?: 0x0E0E12,
            AppearanceLogic.parseHex(config.accent) ?: 0xFF4FA3,
            AppearanceLogic.parseHex(config.text) ?: 0xF2F2F5,
        )

        /** The desktop's `darkPalette()`: a near-black background tinted by the accent. */
        private fun accentOnBlack(id: String, name: String, background: Long, accent: Long, text: Long) = make(
            id, name, false,
            rail = mix(background, 0x000000, 0.4),
            sidebar = background,
            chat = mix(background, 0xFFFFFF, 0.07),
            elevated = mix(background, 0xFFFFFF, 0.13),
            input = mix(background, 0xFFFFFF, 0.2),
            accent = accent, text = text, online = VIVID_ONLINE, danger = VIVID_DANGER,
        )

        /** Mixes `a` towards `b` by `t` (0 gives a, 1 gives b), per channel. */
        fun mix(a: Long, b: Long, t: Double): Long {
            fun channel(shift: Int): Long {
                val x = ((a shr shift) and 0xFF).toDouble()
                val y = ((b shr shift) and 0xFF).toDouble()
                return (x + (y - x) * t).roundToLong().coerceIn(0, 255) shl shift
            }
            return channel(16) or channel(8) or channel(0)
        }

        /** Relative luminance (0...1), the desktop's `onColor()` uses the same cut at 0.4. */
        fun luminance(hex: Long): Double {
            fun linear(shift: Int): Double {
                val c = ((hex shr shift) and 0xFF).toDouble() / 255
                return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
            }
            return 0.2126 * linear(16) + 0.7152 * linear(8) + 0.0722 * linear(0)
        }
    }
}

/**
 * The chosen theme, stored on this device. Like desktop: one fixed theme, or "Match System
 * Appearance" with a light and a dark choice, and a custom theme made of three colours. The values
 * are Compose state, so every screen redraws with the new colours on its own.
 */
object ThemeStore {
    const val KEY = "diddy.theme"
    const val USE_SYSTEM_KEY = "diddy.theme.useSystem"
    const val LIGHT_KEY = "diddy.theme.light"
    const val DARK_KEY = "diddy.theme.dark"
    const val CUSTOM_KEY = "customTheme"
    const val MONOCHROME_KEY = "diddy.monochrome"
    const val ZOOM_KEY = "diddy.pageZoom"
    const val DEFAULT_LIGHT_ID = "light-theme"

    var current by mutableStateOf(DiddyTheme.diddy)
        private set
    var selectedId by mutableStateOf(DiddyTheme.DEFAULT_ID)
        private set
    var useSystem by mutableStateOf(false)
        private set
    var lightId by mutableStateOf(DEFAULT_LIGHT_ID)
        private set
    var darkId by mutableStateOf(DiddyTheme.DEFAULT_ID)
        private set
    var custom by mutableStateOf(CustomThemeConfig.defaults)
        private set
    var systemIsLight by mutableStateOf(false)
        private set
    /** Desktop's Page Zoom, in percent: scales all text. */
    var zoom by mutableStateOf(AppearanceLogic.DEFAULT_ZOOM)
        private set

    fun load() {
        useSystem = Prefs.bool(USE_SYSTEM_KEY)
        selectedId = Prefs.string(KEY) ?: DiddyTheme.DEFAULT_ID
        lightId = Prefs.string(LIGHT_KEY) ?: DEFAULT_LIGHT_ID
        darkId = Prefs.string(DARK_KEY) ?: DiddyTheme.DEFAULT_ID
        custom = savedCustomConfig()
        zoom = AppearanceLogic.clampZoom(Prefs.int(ZOOM_KEY, AppearanceLogic.DEFAULT_ZOOM))
        refresh()
    }

    fun savedCustomConfig(): CustomThemeConfig = CustomThemeConfig.decode(Prefs.string(CUSTOM_KEY))

    fun select(theme: DiddyTheme) {
        Prefs.setString(KEY, theme.id)
        selectedId = theme.id
        refresh()
    }

    fun changeUseSystem(isOn: Boolean) {
        if (isOn == useSystem) return
        Prefs.setBool(USE_SYSTEM_KEY, isOn)
        useSystem = isOn
        refresh()
    }

    fun setLight(theme: DiddyTheme) {
        Prefs.setString(LIGHT_KEY, theme.id)
        lightId = theme.id
        refresh()
    }

    fun setDark(theme: DiddyTheme) {
        Prefs.setString(DARK_KEY, theme.id)
        darkId = theme.id
        refresh()
    }

    fun changeCustom(config: CustomThemeConfig) {
        if (config == custom) return
        Prefs.setString(CUSTOM_KEY, config.encoded())
        custom = config
        refresh()
    }

    fun changeZoom(percent: Int) {
        zoom = AppearanceLogic.clampZoom(percent)
        Prefs.setInt(ZOOM_KEY, zoom)
    }

    /** The system went light or dark (read where the app is shown, while the theme follows it). */
    fun systemAppearanceChanged(isLight: Boolean) {
        if (isLight == systemIsLight) return
        systemIsLight = isLight
        if (useSystem) refresh()
    }

    private fun refresh() {
        val activeId = AppearanceLogic.activeThemeId(useSystem, systemIsLight, selectedId, lightId, darkId)
        current = if (activeId == AppearanceLogic.CUSTOM_THEME_ID) DiddyTheme.custom(custom) else DiddyTheme.named(activeId)
    }
}

/** Discord's layout and density with Diddy's colours (ios Theme.swift). Each role reads the current theme. */
object Theme {
    val rail get() = ThemeStore.current.rail
    val sidebar get() = ThemeStore.current.sidebar
    val chat get() = ThemeStore.current.chat
    val elevated get() = ThemeStore.current.elevated
    val input get() = ThemeStore.current.input
    val accent get() = ThemeStore.current.accent
    val online get() = ThemeStore.current.online
    val danger get() = ThemeStore.current.danger
    val text get() = ThemeStore.current.text
    val muted get() = ThemeStore.current.muted
    val faint get() = ThemeStore.current.faint
    val onAccent get() = ThemeStore.current.onAccent
    val warning = Color(0xFFF0B232)
    val idle = Color(0xFFF0B232)

    private val palette = listOf(
        Color(0.89f, 0.32f, 0.49f), Color(0.35f, 0.40f, 0.95f),
        Color(0.58f, 0.33f, 0.86f), Color(0.15f, 0.65f, 0.55f),
        Color(0.93f, 0.55f, 0.20f), Color(0.20f, 0.60f, 0.86f),
    )

    /** Stable colour per user / room, like Discord's default avatars. */
    fun color(seed: String): Color {
        var sum = 0
        seed.codePoints().forEach { sum = (sum * 31 + it) and 0xFFFF }
        return palette[sum % palette.size]
    }
}
