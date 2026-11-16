package app.diddy

import android.Manifest
import android.os.Build
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import app.diddy.matrix.SecretBox
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the emulator in CI (Build Android > Emulator smoke): the app starts with the native
 * Matrix SDK and WebRTC libraries loaded, shows the login, and the Keystore seals secrets. No
 * server, account or network is involved.
 */
@RunWith(AndroidJUnit4::class)
class LaunchSmokeTest {
    @get:Rule(order = 0)
    val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS) else GrantPermissionRule.grant()

    @get:Rule(order = 1)
    val compose = createAndroidComposeRule<MainActivity>()

    @Test fun aFreshInstallShowsTheLogin() {
        compose.waitUntil(60_000) { compose.onAllNodesWithText("Welcome to Diddy").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Sign in with your Matrix account.").assertExists()
    }

    @Test fun theKeystoreSealsAndOpensSecrets() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val secret = ByteArray(32) { it.toByte() }
        SecretBox.put(context, "smoke.test", secret)
        assertArrayEquals(secret, SecretBox.get(context, "smoke.test"))
        SecretBox.remove(context, "smoke.test")
        assertNull(SecretBox.get(context, "smoke.test"))
    }
}
