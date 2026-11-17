package app.diddy

import android.content.Context
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.diddy.call.BinaryKeyProvider
import app.diddy.matrix.SecretBox
import app.diddy.matrix.SessionStore
import io.livekit.android.LiveKit
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.matrix.rustcomponents.sdk.ClientBuilder
import org.matrix.rustcomponents.sdk.Session
import org.matrix.rustcomponents.sdk.SlidingSyncVersion

/** Runs on fresh CI emulators. Only synthetic data: no production accounts, gateway or media. */
@RunWith(AndroidJUnit4::class)
class AndroidSmokeTest {
    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun nativeLibrariesAndRotatedBinaryKeysLoad() {
        ClientBuilder().close() // Loads the actual Matrix Rust JNI library, also on 16-KB systems.
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val room = LiveKit.create(context)
            try {
                val provider = BinaryKeyProvider()
                val old = ByteArray(16) { 1 }
                val fresh = ByteArray(16) { 2 }
                provider.install("@test:invalid:DEVICE", 0, old)
                provider.install("@test:invalid:DEVICE", 0, fresh)
                assertEquals(0, provider.getLatestKeyIndex("@test:invalid:DEVICE"))
                assertArrayEquals(fresh, provider.rtcKeyProvider.exportKey("@test:invalid:DEVICE", 0))
            } finally { room.release() }
        }
    }

    @Test fun encryptedSessionSurvivesReloadAndCanBeRemoved() {
        val id = "instrumentation-only"
        val session = Session("synthetic-token", null, "@test:invalid", "TEST", "https://invalid", null, SlidingSyncVersion.NATIVE)
        try {
            SessionStore.save(session, id)
            assertEquals(session, SessionStore.load(id))
            val stored = context.getSharedPreferences("diddy.secrets", Context.MODE_PRIVATE).getString("session.$id", null)!!
            assertFalse(stored.contains("synthetic-token"))
            assertNotNull(SecretBox.get(context, "session.$id"))
        } finally { SessionStore.delete(id) }
        assertNull(SessionStore.load(id))
    }

    @Test fun coldStartAndActivityRecreationShowLoginWithoutCrashing() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { assertFalse(it.isFinishing); assertFalse(it.isDestroyed) }
            assertLoginVisible()
            scenario.recreate()
            scenario.onActivity { assertFalse(it.isFinishing); assertFalse(it.isDestroyed) }
            assertLoginVisible()
        }
    }

    private fun assertLoginVisible() {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val deadline = android.os.SystemClock.uptimeMillis() + 15_000
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            val root = automation.rootInActiveWindow
            if (root != null && containsText(root, "Continue")) return
            android.os.SystemClock.sleep(100)
        }
        fail("Login screen was not visible after startup/recreation")
    }

    /**
     * Walks the tree instead of findAccessibilityNodeInfosByText: before Android 10 that search does
     * not reach Compose's virtual nodes, so API 26 never found the login button.
     */
    private fun containsText(node: AccessibilityNodeInfo, text: String, depth: Int = 0): Boolean {
        if (node.text?.toString() == text || node.contentDescription?.toString() == text) return true
        if (depth > 60) return false
        return (0 until node.childCount).any { index ->
            node.getChild(index)?.let { containsText(it, text, depth + 1) } ?: false
        }
    }
}
