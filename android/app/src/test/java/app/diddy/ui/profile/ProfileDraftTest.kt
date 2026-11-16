package app.diddy.ui.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class ProfileDraftTest {
    @Test fun keepsWhatTheEditorDoesNotShow() {
        val stored = mapOf(
            "v" to 1, "shownBadges" to listOf("b1"), "nameplate" to mapOf("preset" to "x"),
            "card" to mapOf("bannerPos" to mapOf("x" to 1), "angle" to 45),
            "nameStyle" to mapOf("color" to "#ffffff"),
        )
        val draft = ProfileDraft(gradientFrom = "#FF0000", gradientTo = "#00ff00", bannerMxc = "mxc://a/b", bio = "  hi  ", interests = "a, b, a, ")
        val out = draft.apply(stored)
        assertEquals(listOf("b1"), out["shownBadges"])
        assertEquals(mapOf("preset" to "x"), out["nameplate"])
        @Suppress("UNCHECKED_CAST") val style = out["nameStyle"] as Map<String, Any?>
        assertEquals(mapOf("from" to "#ff0000", "to" to "#00ff00", "angle" to 90), style["gradient"])
        assertFalse(style.containsKey("color"))
        @Suppress("UNCHECKED_CAST") val card = out["card"] as Map<String, Any?>
        assertEquals(45, card["angle"])
        assertEquals("mxc://a/b", card["bannerMxc"])
        assertEquals("hi", out["bio"])
        assertEquals(listOf("a", "b"), out["interests"])
    }

    @Test fun clearingRemovesFields() {
        val out = ProfileDraft().apply(mapOf("nameStyle" to mapOf("color" to "#fff"), "card" to mapOf("bannerMxc" to "mxc://a/b", "bannerPos" to 1), "bio" to "x"))
        assertNull(out["nameStyle"])
        assertNull(out["card"])
        assertNull(out["bio"])
        assertEquals("online", out["status"])
        assertNull(ProfileDraft.color("red"))
    }
}
