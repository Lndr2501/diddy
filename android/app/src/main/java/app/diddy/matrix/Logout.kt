package app.diddy.matrix

import kotlinx.coroutines.CancellationException

/** Keep the account, stores and sync intact unless the server accepted logout (or it was revoked). */
suspend fun performLogout(
    remote: suspend () -> Unit,
    alreadyRevoked: (Exception) -> Boolean,
    removeLocal: suspend () -> Unit,
) {
    try {
        remote()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        if (!alreadyRevoked(e)) throw e
    }
    removeLocal()
}
