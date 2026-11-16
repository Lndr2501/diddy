package app.diddy.app

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.media.VoicePlayer
import app.diddy.util.Json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import kotlin.math.roundToInt

/**
 * Pure helpers for the waveform of a voice message, the same numbers as the desktop
 * (`plugins/voiceMessage.ts`): 64 bars, integers 0...1024 with the loudest at 1024, at most 256 sent.
 */
object VoiceWaveform {
    const val BINS = 64
    const val MAX_VALUE = 1024
    const val MAX_LENGTH = 256
    const val MIN_DURATION = 0.5
    const val MAX_DURATION = 15 * 60.0

    fun wire(levels: List<Float>, bins: Int = BINS): List<Int> {
        val clean = levels.map { if (it.isFinite()) it.coerceIn(0f, 1f) else 0f }
        if (clean.isEmpty() || bins <= 0) return emptyList()
        val averaged = (0 until bins).map { i ->
            val from = i * clean.size / bins
            val to = maxOf(from + 1, (i + 1) * clean.size / bins)
            val part = clean.subList(from, minOf(to, clean.size))
            if (part.isEmpty()) 0f else part.sum() / part.size
        }
        val peak = averaged.maxOrNull() ?: 0f
        if (peak <= 0f) return averaged.map { 0 }
        return averaged.map { (it / peak * MAX_VALUE).roundToInt() }
    }

    /** Received values (untrusted) as bar heights 0...1. */
    fun normalized(wire: List<Int>): List<Float> = wire.take(MAX_LENGTH).map { minOf(maxOf(it, 0), MAX_VALUE).toFloat() / MAX_VALUE }

    /** `count` bar heights for drawing; a missing waveform becomes a flat line of small bars. */
    fun bars(values: List<Float>, count: Int): List<Float> {
        if (count <= 0) return emptyList()
        if (values.isEmpty()) return List(count) { 0.15f }
        return (0 until count).map { i ->
            val from = i * values.size / count
            val to = maxOf(from + 1, (i + 1) * values.size / count)
            val part = values.subList(from, minOf(to, values.size))
            (part.sum() / maxOf(part.size, 1)).coerceIn(0.08f, 1f)
        }
    }

    /** The extra content fields desktop and Element read (MSC3245 voice, MSC1767 audio). */
    fun contentJson(durationSeconds: Double, wire: List<Int>): String = Json.encode(
        mapOf(
            "org.matrix.msc3245.voice" to emptyMap<String, Any?>(),
            "org.matrix.msc1767.audio" to mapOf(
                "duration" to (durationSeconds * 1000).roundToInt(),
                "waveform" to wire.take(MAX_LENGTH),
            ),
        )
    )
}

/** A finished recording, ready to send. */
class VoiceRecording(val file: File, val duration: Double, val waveform: List<Int>, val size: Long)

/**
 * Records a voice message as AAC in an m4a file (`audio/mp4`, like the iOS app and Safari) and
 * samples the loudness every 100 ms for the waveform, like the desktop.
 */
class VoiceRecorder(private val context: Context) {
    enum class State { IDLE, STARTING, RECORDING }

    var state by mutableStateOf(State.IDLE)
        private set
    var elapsed by mutableDoubleStateOf(0.0)
        private set
    var levels by mutableStateOf<List<Float>>(emptyList())
        private set
    var error by mutableStateOf<String?>(null)
    var pending by mutableStateOf<VoiceRecording?>(null)
        private set

    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var collected = mutableListOf<Float>()
    private var ticker: Job? = null
    private var startedAt = 0L
    private val scope = CoroutineScope(Dispatchers.Main)

    val isActive: Boolean get() = state == State.RECORDING || pending != null

    /** The caller has checked the microphone permission. */
    fun start() {
        if (state != State.IDLE) return
        state = State.STARTING
        error = null
        // A voice message that is still playing would end up in the recording.
        VoicePlayer.stop()
        val target = File(context.cacheDir, "voice-${UUID.randomUUID()}.m4a")
        val recorder = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioSamplingRate(44_100)
            recorder.setAudioChannels(1)
            recorder.setAudioEncodingBitRate(64_000)
            recorder.setOutputFile(target.absolutePath)
            recorder.prepare()
            recorder.start()
        } catch (e: Exception) {
            recorder.release()
            state = State.IDLE
            error = "Could not start recording."
            DiagLog.write("voice: record failed ${e.message}")
            return
        }
        this.recorder = recorder
        file = target
        collected = mutableListOf()
        levels = emptyList()
        elapsed = 0.0
        pending = null
        startedAt = System.currentTimeMillis()
        state = State.RECORDING
        ticker = scope.launch {
            while (isActive && state == State.RECORDING) {
                delay(100)
                tick()
            }
        }
    }

    private fun tick() {
        val recorder = recorder ?: return
        val amplitude = try { recorder.maxAmplitude } catch (_: Exception) { 0 }
        // 0...32767 to a 0...1 level with the same feel as iOS's peak power.
        val level = (amplitude / 32767f).coerceIn(0f, 1f)
        collected += level
        levels = collected.takeLast(120)
        elapsed = (System.currentTimeMillis() - startedAt) / 1000.0
        if (elapsed >= VoiceWaveform.MAX_DURATION) finish(true)?.let { pending = it }
    }

    /** Ends the recording. Null when it was too short or something went wrong. */
    fun stop(): VoiceRecording? {
        pending?.let {
            pending = null
            return it
        }
        if (state != State.RECORDING) return null
        return finish(true)
    }

    /** Puts a recording back after sending it failed, so it is not lost. */
    fun restore(recording: VoiceRecording) {
        if (state != State.IDLE || pending != null) {
            recording.file.delete()
            return
        }
        pending = recording
        elapsed = recording.duration
    }

    fun cancel() {
        pending?.file?.delete()
        pending = null
        if (state == State.RECORDING) finish(false)
    }

    private fun finish(keep: Boolean): VoiceRecording? {
        ticker?.cancel()
        ticker = null
        val duration = (System.currentTimeMillis() - startedAt) / 1000.0
        try { recorder?.stop() } catch (_: Exception) {}
        recorder?.release()
        recorder = null
        state = State.IDLE
        elapsed = duration
        val target = file
        file = null
        val samples = collected.toList()
        collected = mutableListOf()
        levels = emptyList()
        if (!keep || target == null) {
            target?.delete()
            return null
        }
        val size = target.length()
        if (duration < VoiceWaveform.MIN_DURATION || size <= 0) {
            target.delete()
            error = "Hold on a little longer to record a voice message."
            return null
        }
        return VoiceRecording(target, duration, VoiceWaveform.wire(samples), size)
    }
}
