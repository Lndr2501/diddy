package app.diddy.call

import io.livekit.android.e2ee.BaseKeyProvider
import io.livekit.android.e2ee.KeyProvider
import livekit.org.webrtc.FrameCryptorKeyDerivationAlgorithm

/** Matrix supplies binary keys. Keep LiveKit's index bookkeeping without converting bytes to text. */
class BinaryKeyProvider(
    private val delegate: KeyProvider = BaseKeyProvider(
        ratchetWindowSize = 10, enableSharedKey = false, keyRingSize = 256,
        keyDerivationAlgorithm = FrameCryptorKeyDerivationAlgorithm.HKDF,
    ),
) : KeyProvider by delegate {
    private val indices = mutableMapOf<String, Int>()
    override fun getLatestKeyIndex(participantId: String) = indices[participantId] ?: 0
    fun install(participantId: String, index: Int, key: ByteArray) {
        check(rtcKeyProvider.setKey(participantId, index, key)) { "Could not install a call encryption key." }
        indices[participantId] = index
    }
}
