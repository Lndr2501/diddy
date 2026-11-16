package app.diddy

import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.lifecycleScope
import app.diddy.app.AppModel
import app.diddy.matrix.OAuthRedirects
import app.diddy.ui.RootScreen
import app.diddy.ui.theme.DiddyAppTheme
import app.diddy.ui.theme.ThemeStore
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /** Set while the OAuth page is open in a Custom Tab. */
    private var waitingForOAuth = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applySystemBars()
        ThemeStore.systemAppearanceChanged(!isNightMode())
        OAuthRedirects.open = { url ->
            waitingForOAuth = true
            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, Uri.parse(url))
        }
        setContent {
            LaunchedEffect(Unit) {
                snapshotFlow { ThemeStore.current.isLight }.collect { applySystemBars() }
            }
            DiddyAppTheme {
                RootScreen()
            }
        }
        AppModel.restore()
        Wiring.appStarted(this)
        handle(intent)
    }

    private fun isNightMode() =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private fun applySystemBars() {
        val light = ThemeStore.current.isLight
        val style = if (light) SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        else SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ThemeStore.systemAppearanceChanged(!isNightMode())
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        AppModel.resumeAll()
        if (waitingForOAuth) {
            // Back from the browser without the redirect: the user closed the login page.
            lifecycleScope.launch {
                delay(1200)
                if (waitingForOAuth && OAuthRedirects.isWaiting) OAuthRedirects.cancel()
                waitingForOAuth = false
            }
        }
    }

    private fun handle(intent: Intent?) {
        if (intent == null) return
        val data = intent.data
        if (data != null && data.scheme == OAuthRedirects.SCHEME) {
            waitingForOAuth = false
            OAuthRedirects.deliver(data.toString())
            return
        }
        IntentRouter.handle(this, intent)
    }
}
