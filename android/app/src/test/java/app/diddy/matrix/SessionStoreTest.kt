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
