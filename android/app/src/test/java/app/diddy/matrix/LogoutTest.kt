package app.diddy.matrix

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class LogoutTest {
    @Test fun networkFailureDoesNotRemoveAccountOrStopSync() = runTest {
        var removed = false
        val failure = java.io.IOException("offline")
        try {
            performLogout({ throw failure }, { false }, { removed = true })
            fail("Logout must report failure")
        } catch (e: java.io.IOException) { assertSame(failure, e) }
        assertFalse(removed)
    }

    @Test fun successAndRevokedSessionRemoveLocalDataExactlyOnce() = runTest {
        for (revoked in listOf(false, true)) {
            var calls = 0
            performLogout({ if (revoked) throw IllegalStateException("revoked") }, { revoked }, { calls++ })
            assertEquals(1, calls)
        }
    }

    @Test fun cancellationNeverRemovesTheAccount() = runTest {
        var removed = false
        try {
            performLogout({ throw CancellationException() }, { true }, { removed = true })
            fail("Cancellation must propagate")
        } catch (_: CancellationException) { }
        assertFalse(removed)
    }
}
