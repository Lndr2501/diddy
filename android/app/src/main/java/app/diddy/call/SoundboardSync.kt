package app.diddy.call

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import app.diddy.app.AppModel
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.matrix.MatrixAccount
import app.diddy.util.ClientApiError
import app.diddy.util.Json
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** One account at a time, durable offline edits, serialized reads/writes and bounded downloads. */
object SoundboardSync {
    private var account: MatrixAccount? = null
    private var polling: Job? = null
    private val mutex = Mutex()
    private val failed = mutableSetOf<String>()
    private fun pendingKey(id: String) = "soundboard.pending.$id"
    private fun cachedKey(id: String) = "soundboard.remote.$id"
    private fun read(key: String) = Json.obj(Prefs.string(key))

    fun activate(next: MatrixAccount?) {
        if (account === next) return
        polling?.cancel()
        account = next
        failed.clear()
        Soundboard.accountChanged(next?.id)
        Soundboard.onUserChange = if (next == null) null else { change -> record(next, change) }
        if (next == null) return
        polling = AppModel.scope.launch {
            while (account === next) {
                if (ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) sync(next)
                delay(30_000)
            }
        }
    }

    fun refresh() { account?.let { current -> AppModel.scope.launch { sync(current) } } }

    private fun record(current: MatrixAccount, change: Soundboard.Change) {
        if (account !== current) return
        val now = System.currentTimeMillis()
        val pending = SoundboardSyncLogic.merge(now, read(pendingKey(current.id)), read(cachedKey(current.id)))
        val updated = if (change.name != null) SoundboardSyncLogic.add(pending, change.path, change.name, now)
            else SoundboardSyncLogic.remove(pending, change.path, now)
        // Store before networking: an offline deletion must not be undone on the next launch.
        Prefs.setString(pendingKey(current.id), Json.encode(updated.json()))
        AppModel.scope.launch { sync(current) }
    }

    private fun path(current: MatrixAccount) = "/_matrix/client/v3/user/${MatrixAccount.pathComponent(current.userId)}/account_data/${SoundboardSyncLogic.TYPE}"

    private suspend fun remote(current: MatrixAccount): Map<String, Any?>? = try {
        current.clientRequest(path(current))
    } catch (e: ClientApiError) {
        if (e.status == 404) null else throw e
    }

    private suspend fun sync(current: MatrixAccount) = mutex.withLock {
        if (account !== current) return@withLock
        try {
            val now = System.currentTimeMillis()
            val server = remote(current)
            if (account !== current) return@withLock
            val savedPending = Prefs.string(pendingKey(current.id))
            var state = SoundboardSyncLogic.merge(now, server, Json.obj(savedPending))
            val removed = state.removed.map { it.path }.toSet()
            // Publish only this account's known MyInstants sources. Own files remain local.
            for (clip in Soundboard.clips) {
                val source = clip.myinstants ?: continue
                if (clip.owner == current.id && source !in removed) state = SoundboardSyncLogic.add(state, source, clip.name, now)
            }
            if (state != SoundboardSyncLogic.merge(now, server)) {
                current.clientRequest(path(current), state.json(), "PUT")
                val after = remote(current)
                val merged = SoundboardSyncLogic.merge(System.currentTimeMillis(), after, state.json())
                if (merged != SoundboardSyncLogic.merge(System.currentTimeMillis(), after)) {
                    current.clientRequest(path(current), merged.json(), "PUT")
                }
                state = merged
            }
            if (account !== current) return@withLock
            Prefs.setString(cachedKey(current.id), Json.encode(state.json()))
            if (Prefs.string(pendingKey(current.id)) == savedPending) Prefs.remove(pendingKey(current.id))
            // A user edit made during an awaited request takes precedence over that response.
            state = SoundboardSyncLogic.merge(System.currentTimeMillis(), state.json(), read(pendingKey(current.id)))
            for (clip in Soundboard.clips.toList()) {
                if (clip.myinstants != null && state.removed.any { it.path == clip.myinstants }) Soundboard.remove(clip, fromSync = true)
            }
            for (sound in state.sounds) {
                if (account !== current) return@withLock
                if (Soundboard.clips.any { it.myinstants == sound.path }) continue
                val legacy = Soundboard.clips.firstOrNull { it.myinstants == null && it.name.equals(sound.name, ignoreCase = true) }
                if (legacy != null) { Soundboard.setSource(legacy.id, sound.path); continue }
                if (sound.path in failed) continue
                try {
                    val url = MyInstantsParser.soundUrl(sound.path) ?: continue
                    val (bytes, ext) = MyInstantsClient.audio(url)
                    if (account !== current) return@withLock
                    val latest = SoundboardSyncLogic.merge(System.currentTimeMillis(), state.json(), read(pendingKey(current.id)))
                    if (latest.sounds.any { it.path == sound.path }) Soundboard.add(bytes, sound.name, ext, sound.path, fromSync = true)
                } catch (e: CancellationException) { throw e
                } catch (_: Exception) { failed += sound.path }
                delay(300)
            }
        } catch (e: CancellationException) { throw e
        } catch (_: Exception) {
            // Keep pending edits for reconnect. Never log account data or server responses.
            DiagLog.write("soundboard sync: unavailable; changes remain queued")
        }
    }
}
