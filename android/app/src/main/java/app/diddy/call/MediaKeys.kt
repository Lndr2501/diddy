package app.diddy.call

import app.diddy.app.DiagLog
import io.livekit.android.e2ee.BaseKeyProvider
import io.livekit.android.e2ee.KeyProvider
import io.livekit.android.room.Room
import livekit.org.webrtc.FrameCryptor
import livekit.org.webrtc.FrameCryptorKeyDerivationAlgorithm

/**
 * The per-participant media keys of a call (Element Call's scheme). LiveKit's own provider only
 * takes keys as text and knows nothing of key rotation, so this one sets raw keys and decides
 * which index each participant encrypts with.
 */
class MediaKeyProvider private constructor(private val base: BaseKeyProvider) : KeyProvider by base {
    constructor() : this(
        BaseKeyProvider(
            ratchetWindowSize = 10,
            enableSharedKey = false,
            keyRingSize = CallLogic.KEY_RING_SIZE,
            keyDerivationAlgorithm = FrameCryptorKeyDerivationAlgorithm.HKDF,
        ),
    )

    private val latest = mutableMapOf<String, Int>()

    /** Stores a key; `current` makes it the one new tracks of that participant use. */
    fun setRawKey(participantId: String, index: Int, key: ByteArray, current: Boolean = true) {
        base.rtcKeyProvider.setKey(participantId, index, key)
        if (current) synchronized(latest) { latest[participantId] = index }
    }

    override fun getLatestKeyIndex(participantId: String): Int = synchronized(latest) { latest[participantId] ?: 0 }

    /**
     * Switches the tracks we already send to `index`. LiveKit reads the index only when a track
     * is published and keeps its frame cryptors to itself, so this reaches into them. Returns
     * false when that is not possible (a different LiveKit version); the caller then republishes.
     */
    fun useIndexForPublishedTracks(room: Room, localIdentity: String, index: Int): Boolean = try {
        val manager = room.e2eeManager ?: return false
        val field = manager.javaClass.getDeclaredField("frameCryptors").apply { isAccessible = true }
        val cryptors = field.get(manager) as? Map<*, *> ?: return false
        var switched = 0
        for ((key, cryptor) in cryptors) {
            val identity = (key as? Pair<*, *>)?.second ?: continue
            if (identity.toString() != localIdentity && identity != room.localParticipant.identity) continue
            (cryptor as? FrameCryptor)?.setKeyIndex(index)
            switched++
        }
        DiagLog.write("call: own key index $index on $switched tracks")
        true
    } catch (e: Exception) {
        DiagLog.write("call: could not switch the key index: ${e.javaClass.simpleName}")
        false
    }
}
