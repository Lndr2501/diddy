package app.diddy.media

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Plays the 30 second preview of a shared song (Apple's or Spotify's audio host only). */
object MusicPreviewPlayer {
    var current by mutableStateOf<String?>(null)
        private set
    var isPlaying by mutableStateOf(false)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var progress by mutableFloatStateOf(0f)
        private set

    private lateinit var appContext: Context
    private var player: ExoPlayer? = null
    private var ticker: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun toggle(url: String) {
        val exo = player
        if (current == url && exo != null) {
            if (exo.isPlaying) exo.pause() else exo.play()
            return
        }
        stop()
        VoicePlayer.stop()
        current = url
        isLoading = true
        val created = ExoPlayer.Builder(appContext).build()
        created.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
                if (playing) isLoading = false
            }
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) stop()
            }
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) = stop()
        })
        created.setMediaItem(MediaItem.fromUri(url))
        created.prepare()
        created.play()
        player = created
        ticker = scope.launch {
            while (isActive) {
                player?.let { if (it.duration > 0) progress = it.currentPosition.toFloat() / it.duration }
                delay(200)
            }
        }
    }

    fun stop() {
        ticker?.cancel()
        player?.release()
        player = null
        current = null
        isPlaying = false
        isLoading = false
        progress = 0f
    }
}
