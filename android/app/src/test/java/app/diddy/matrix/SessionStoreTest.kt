package app.diddy.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionStoreTest {
    @Test fun secretsBelongToTheirAccount() {
        assertEquals("abc", SessionStore.accountOfSecret("session.abc"))
        assertEquals("abc", SessionStore.accountOfSecret("storekey.abc"))
        assertNull(SessionStore.accountOfSecret("session."))
        assertNull(SessionStore.accountOfSecret("diddy.accounts"))
    }

    @Test fun onlyAccountsMissingFromTheListAreOrphans() {
        assertEquals(listOf("gone"), SessionStore.orphanIds(listOf("kept", "gone", "gone", " "), setOf("kept")))
        assertEquals(emptyList<String>(), SessionStore.orphanIds(emptyList(), setOf("kept")))
    }
}

class LayoutTest {
    @Test fun wideWindowsShowListAndChatSideBySide() {
        assertEquals(false, app.diddy.app.Layout.isTwoPane(411f)) // phone
        assertEquals(false, app.diddy.app.Layout.isTwoPane(673f)) // foldable cover / small landscape
        assertEquals(true, app.diddy.app.Layout.isTwoPane(800f)) // tablet portrait, foldable open
        assertEquals(true, app.diddy.app.Layout.isTwoPane(1280f))
    }
}
