package app.diddy.media

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import app.diddy.app.Prefs
import app.diddy.app.VoiceWaveform
import app.diddy.matrix.MatrixAccount
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.AudioMessageContent
import org.matrix.rustcomponents.sdk.MediaSource

/** What the timeline needs to show an `m.audio` message (voice message or audio file). */
class AudioAttachment(content: AudioMessageContent) {
    val source: MediaSource = content.source
    val filename: String = content.filename
    val mimeType: String? = content.info?.mimetype
    /** Remote content is untrusted: the duration is clamped. */
    val duration: Double? = (content.audio?.duration ?: content.info?.duration)?.let { it.toMillis() / 1000.0 }
        ?.takeIf { it.isFinite() && it >= 0 }?.coerceAtMost(24 * 3600.0)
    /** Bar heights 0...1; empty when the sender gave no waveform. */
    val waveform: List<Float> = VoiceWaveform.normalized(content.audio?.waveform?.map { it.toInt() } ?: emptyList())
    val isVoice: Boolean = content.voice != null
}

object VoiceFormat {
    /** `0:07`, `12:30`, `1:02:03` */
    fun time(seconds: Double): String {
        val total = Math.round(if (seconds.isFinite()) maxOf(0.0, seconds) else 0.0).toInt()
        val h = total / 3600
        val m = total / 60 % 60
        val s = total % 60
        return if (h > 0) String.format(java.util.Locale.US, "%d:%02d:%02d", h, m, s) else String.format(java.util.Locale.US, "%d:%02d", m, s)
    }
}

/** Playback speed of voice messages: 1x, 1.5x, 2x, then 1x, remembered on this device. */
object VoiceRate {
    val steps = listOf(1f, 1.5f, 2f)
    const val KEY = "diddyVoiceRate"

    fun parse(value: Float?): Float = if (value != null && value in steps) value else 1f
    fun next(rate: Float): Float = steps[(steps.indexOf(parse(rate)).coerceAtLeast(0) + 1) % steps.size]
    fun label(rate: Float): String {
        val value = parse(rate)
        return if (value == Math.round(value).toFloat()) "${value.toInt()}×" else "$value×"
    }
}

/** Plays one voice message at a time; starting another stops the first (ios VoicePlayer). */
object VoicePlayer {
    var currentId by mutableStateOf<String?>(null)
        private set
    var isPlaying by mutableStateOf(false)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var failedId by mutableStateOf<String?>(null)
        private set
    var rate by mutableFloatStateOf(1f)
        private set
    var time by mutableDoubleStateOf(0.0)
        private set
    var duration by mutableDoubleStateOf(0.0)
        private set
    val fraction: Double get() = if (duration > 0) (time / duration).coerceIn(0.0, 1.0) else 0.0

    private lateinit var appContext: Context
    private var player: ExoPlayer? = null
    private var loading: Job? = null
    private var ticker: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    fun init(context: Context) {
        appContext = context.applicationContext
        rate = VoiceRate.parse(if (Prefs.has(VoiceRate.KEY)) Prefs.double(VoiceRate.KEY, 1.0).toFloat() else null)
    }

    fun toggle(id: String, audio: AudioAttachment, account: MatrixAccount) {
        val current = player
        if (currentId == id && current != null) {
            if (current.isPlaying) current.pause() else current.play()
            return
        }
        stop()
        currentId = id
        failedId = null
        isLoading = true
        time = 0.0
        duration = audio.duration ?: 0.0
        loading = scope.launch {
            val file = MediaLoader.audioFile(audio.source, audio.mimeType, account)
            if (!isActive || currentId != id) return@launch
            isLoading = false
            if (file == null) {
                currentId = null
                failedId = id
                return@launch
            }
            val exo = ExoPlayer.Builder(appContext).build()
            exo.setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),
                true,
            )
            exo.addListener(object : Player.Listener {
                override fun onIsPlayingChanged(playing: Boolean) { isPlaying = playing }
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && exo.duration > 0) duration = exo.duration / 1000.0
                    if (state == Player.STATE_ENDED) stop()
                }
                override fun onPlayerError(error: PlaybackException) {
                    failedId = id
                    stop()
                }
            })
            exo.setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(file)))
            exo.playbackParameters = PlaybackParameters(rate)
            exo.prepare()
            exo.play()
            player = exo
            ticker = scope.launch {
                while (isActive) {
                    player?.let { time = it.currentPosition / 1000.0 }
                    delay(100)
                }
            }
        }
    }

    fun seek(id: String, fraction: Double) {
        val exo = player ?: return
        if (currentId != id || duration <= 0) return
        exo.seekTo((fraction.coerceIn(0.0, 1.0) * duration * 1000).toLong())
        time = fraction * duration
    }

    fun cycleRate() {
        rate = VoiceRate.next(rate)
        Prefs.setDouble(VoiceRate.KEY, rate.toDouble())
        player?.playbackParameters = PlaybackParameters(rate)
    }

    fun stop() {
        loading?.cancel()
        loading = null
        ticker?.cancel()
        ticker = null
        player?.release()
        player = null
        currentId = null
        isPlaying = false
        isLoading = false
        time = 0.0
    }
}
