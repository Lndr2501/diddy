package app.diddy.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.DiagLog
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.SessionVerificationController
import org.matrix.rustcomponents.sdk.SessionVerificationControllerDelegate
import org.matrix.rustcomponents.sdk.SessionVerificationData
import org.matrix.rustcomponents.sdk.SessionVerificationRequestDetails

data class VerificationEmoji(val symbol: String, val label: String)

data class VerificationRequest(val userId: String, val name: String, val deviceId: String, val deviceName: String?, val flowId: String)

/** Where a verification stands (ios VerificationPhase). */
sealed class VerificationPhase {
    data object Idle : VerificationPhase()
    data class Incoming(val request: VerificationRequest) : VerificationPhase()
    data class Requesting(val message: String) : VerificationPhase()
    data object Starting : VerificationPhase()
    data class Emojis(val emojis: List<VerificationEmoji>) : VerificationPhase()
    data class Decimals(val values: List<Int>) : VerificationPhase()
    data object Confirming : VerificationPhase()
    data object Done : VerificationPhase()
    data class Cancelled(val reason: String) : VerificationPhase()
    data class Failed(val reason: String) : VerificationPhase()

    val isActive: Boolean get() = this != Idle
    val isRunning: Boolean
        get() = when (this) {
            is Incoming, is Requesting, Starting, is Emojis, is Decimals, Confirming -> true
            else -> false
        }
    val isComparing: Boolean get() = this is Emojis || this is Decimals || this == Confirming
}

/**
 * Emoji verification of this device or another person, started here or by the other side
 * (ios VerificationCenter). One per account.
 */
class VerificationCenter private constructor(private val account: MatrixAccount) {
    companion object {
        private val centers = mutableMapOf<String, VerificationCenter>()

        fun of(account: MatrixAccount): VerificationCenter {
            centers[account.id]?.takeIf { it.account === account }?.let { return it }
            return VerificationCenter(account).also { centers[account.id] = it }
        }
    }

    var phase by mutableStateOf<VerificationPhase>(VerificationPhase.Idle)
        private set
    private var controller: SessionVerificationController? = null

    private val delegate = object : SessionVerificationControllerDelegate {
        override fun didReceiveVerificationRequest(details: SessionVerificationRequestDetails) {
            val userId = details.senderProfile.userId
            post {
                handleRequest(VerificationRequest(userId, details.senderProfile.displayName ?: userId, details.deviceId, details.deviceDisplayName, details.flowId))
            }
        }
        override fun didAcceptVerificationRequest() = post {
            if (phase == VerificationPhase.Idle) return@post
            phase = VerificationPhase.Starting
            account.scope.launch { startSas() }
        }
        override fun didStartSasVerification() = post { if (phase.isRunning && !phase.isComparing) phase = VerificationPhase.Starting }
        override fun didReceiveVerificationData(data: SessionVerificationData) {
            val next = when (data) {
                is SessionVerificationData.Emojis -> VerificationPhase.Emojis(data.emojis.map { VerificationEmoji(it.symbol(), it.description()) })
                is SessionVerificationData.Decimals -> VerificationPhase.Decimals(data.values.map { it.toInt() })
            }
            post { if (phase != VerificationPhase.Idle) phase = next }
        }
        override fun didFail() = post { if (phase != VerificationPhase.Idle) phase = VerificationPhase.Failed("The verification failed. Try again.") }
        override fun didCancel() = post {
            val reason = controller?.sasCancelInfo()?.reason ?: controller?.requestCancelInfo()?.reason
            if (phase.isRunning) phase = VerificationPhase.Cancelled(reason ?: "The verification was cancelled.")
        }
        override fun didFinish() = post { if (phase != VerificationPhase.Idle) phase = VerificationPhase.Done }
    }

    private fun post(block: () -> Unit) {
        account.scope.launch { block() }
    }

    private fun handleRequest(request: VerificationRequest) {
        if (!phase.isRunning) phase = VerificationPhase.Incoming(request)
    }

    suspend fun start() {
        if (controller != null) return
        try {
            val made = account.client.getSessionVerificationController()
            made.setDelegate(delegate)
            controller = made
        } catch (e: Exception) {
            DiagLog.write("verification: no controller (${e.friendlyMessage})")
        }
    }

    suspend fun requestDeviceVerification() {
        if (phase.isRunning) return
        start()
        val controller = controller ?: run { phase = VerificationPhase.Failed("Verification is not ready yet. Try again in a moment."); return }
        phase = VerificationPhase.Requesting("Open Diddy or Element on another device you are signed in on and accept the request there.")
        try { controller.requestDeviceVerification() } catch (e: Exception) { phase = VerificationPhase.Failed(e.friendlyMessage) }
    }

    suspend fun requestUserVerification(userId: String) {
        if (phase.isRunning) return
        start()
        val controller = controller ?: run { phase = VerificationPhase.Failed("Verification is not ready yet. Try again in a moment."); return }
        phase = VerificationPhase.Requesting("Waiting for $userId to accept the request.")
        try { controller.requestUserVerification(userId) } catch (e: Exception) { phase = VerificationPhase.Failed(e.friendlyMessage) }
    }

    suspend fun accept() {
        val request = (phase as? VerificationPhase.Incoming)?.request ?: return
        val controller = controller ?: return
        phase = VerificationPhase.Starting
        try {
            controller.acknowledgeVerificationRequest(request.userId, request.flowId)
            controller.acceptVerificationRequest()
        } catch (e: Exception) {
            phase = VerificationPhase.Failed(e.friendlyMessage)
        }
    }

    suspend fun approve() {
        val controller = controller ?: return
        phase = VerificationPhase.Confirming
        try { controller.approveVerification() } catch (e: Exception) { phase = VerificationPhase.Failed(e.friendlyMessage) }
    }

    suspend fun decline() {
        val controller = controller ?: return
        try {
            controller.declineVerification()
            phase = VerificationPhase.Cancelled("You said the emojis do not match. Do not trust the other device.")
        } catch (e: Exception) {
            phase = VerificationPhase.Failed(e.friendlyMessage)
        }
    }

    suspend fun dismiss() {
        val running = phase
        phase = VerificationPhase.Idle
        val controller = controller ?: return
        if (!running.isRunning) return
        if (running is VerificationPhase.Incoming) runCatching { controller.acknowledgeVerificationRequest(running.request.userId, running.request.flowId) }
        runCatching { controller.cancelVerification() }
    }

    private suspend fun startSas() {
        try { controller?.startSasVerification() } catch (e: Exception) {
            // The other side may have started the comparison already; its data arrives anyway.
            DiagLog.write("verification: start sas: ${e.friendlyMessage}")
        }
    }
}
