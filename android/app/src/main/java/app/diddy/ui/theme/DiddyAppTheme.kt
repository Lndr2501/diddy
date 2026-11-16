package app.diddy.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

/** Material 3 with Diddy's colours, so system pieces (dialogs, menus, pickers) match the theme. */
@Composable
fun DiddyAppTheme(content: @Composable () -> Unit) {
    val theme = ThemeStore.current
    val scheme: ColorScheme = if (theme.isLight) {
        lightColorScheme(
            primary = theme.accent, onPrimary = theme.onAccent, secondary = theme.accent, onSecondary = theme.onAccent,
            background = theme.chat, onBackground = theme.text, surface = theme.sidebar, onSurface = theme.text,
            surfaceVariant = theme.elevated, onSurfaceVariant = theme.muted, surfaceContainer = theme.elevated,
            surfaceContainerHigh = theme.elevated, surfaceContainerHighest = theme.input, surfaceContainerLow = theme.sidebar,
            error = theme.danger, outline = theme.faint, outlineVariant = theme.input,
        )
    } else {
        darkColorScheme(
            primary = theme.accent, onPrimary = theme.onAccent, secondary = theme.accent, onSecondary = theme.onAccent,
            background = theme.chat, onBackground = theme.text, surface = theme.sidebar, onSurface = theme.text,
            surfaceVariant = theme.elevated, onSurfaceVariant = theme.muted, surfaceContainer = theme.elevated,
            surfaceContainerHigh = theme.elevated, surfaceContainerHighest = theme.input, surfaceContainerLow = theme.sidebar,
            error = theme.danger, outline = theme.faint, outlineVariant = theme.input,
        )
    }
    val density = LocalDensity.current
    // Desktop's Page Zoom scales all text.
    val zoomed = Density(density.density, density.fontScale * ThemeStore.zoom / 100f)
    CompositionLocalProvider(LocalDensity provides zoomed) {
        MaterialTheme(colorScheme = scheme, typography = Typography(), content = content)
    }
}
