package app.diddy.call

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaPlayer
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.util.DiddyError
import app.diddy.util.Json
import app.diddy.util.str
import io.livekit.android.audio.MixerAudioBufferCallback
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/**
 * Short sounds you play into the call (ios Soundboard): copied to this device, decoded to PCM and
 * mixed into your microphone stream, and played for you too.
 */
@SuppressLint("StaticFieldLeak") // the application context
object Soundboard {
    data class Clip(val id: String, val name: String, val file: String)

    const val MAX_SECONDS = 20.0
    private const val CLIPS_KEY = "soundboardClips"
    private const val VOLUME_KEY = "soundboardVolume"

    private lateinit var context: Context
    private lateinit var folder: File
    var clips by mutableStateOf<List<Clip>>(emptyList())
        private set
    var playing by mutableStateOf<String?>(null)
        private set
    var volume by mutableStateOf(0.8)
        private set
    private val localPlayers = mutableListOf<MediaPlayer>()

    fun init(context: Context) {
        this.context = context.applicationContext
        folder = File(context.filesDir, "soundboard").apply { mkdirs() }
        volume = Prefs.double(VOLUME_KEY, 0.8).coerceIn(0.0, 1.0)
        ClipMixer.gain = volume.toFloat()
        val stored = Json.arr(Prefs.string(CLIPS_KEY))?.mapNotNull { raw ->
            val o = raw as? Map<*, *> ?: return@mapNotNull null
            Clip(o["id"].str() ?: return@mapNotNull null, o["name"].str() ?: return@mapNotNull null, o["file"].str() ?: return@mapNotNull null)
        } ?: emptyList()
        clips = stored.filter { File(folder, it.file).exists() }
    }

    fun changeVolume(value: Double) {
        volume = value.coerceIn(0.0, 1.0)
        Prefs.setDouble(VOLUME_KEY, volume)
        ClipMixer.gain = volume.toFloat()
        localPlayers.forEach { runCatching { it.setVolume(volume.toFloat(), volume.toFloat()) } }
    }

    private fun save() = Prefs.setString(CLIPS_KEY, Json.encode(clips.map { mapOf("id" to it.id, "name" to it.name, "file" to it.file) }))

    /** Copies an audio file in; throws a message for the user if it is not audio or too long. */
    fun add(uri: Uri) {
        val resolver = context.contentResolver
        var name = "Sound"
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0)?.let { name = it } }
        val ext = name.substringAfterLast('.', "audio").lowercase().takeIf { it.length <= 5 && it.all(Char::isLetterOrDigit) } ?: "audio"
        val id = UUID.randomUUID().toString()
        val target = File(folder, "$id.$ext")
        resolver.openInputStream(uri)?.use { input -> target.outputStream().use { input.copyTo(it) } } ?: throw DiddyError("The file could not be read.")
        val seconds = durationSeconds(target)
        if (seconds == null) {
            target.delete()
            throw DiddyError("Choose an audio file (mp3, wav, m4a …).")
        }
        if (seconds > MAX_SECONDS) {
            target.delete()
            throw DiddyError("Clips can be at most ${MAX_SECONDS.toInt()} seconds long.")
        }
        clips = clips + Clip(id, name.substringBeforeLast('.').take(40).ifBlank { "Sound" }, target.name)
        save()
    }

    fun remove(clip: Clip) {
        File(folder, clip.file).delete()
        clips = clips.filter { it.id != clip.id }
        ClipMixer.forget(clip.id)
        save()
    }

    /** Plays a clip into the call (when the microphone is on) and for you. */
    fun play(clip: Clip) {
        val file = File(folder, clip.file)
        if (!file.exists()) return
        playing = clip.id
        ClipMixer.play(clip.id, file)
        runCatching {
            val player = MediaPlayer()
            player.setDataSource(file.absolutePath)
            player.setVolume(volume.toFloat(), volume.toFloat())
            player.setOnCompletionListener {
                it.release()
                localPlayers.remove(it)
                if (localPlayers.isEmpty()) playing = null
            }
            player.prepare()
            player.start()
            localPlayers += player
        }
    }

    fun stopAll() {
        ClipMixer.stop()
        localPlayers.forEach { runCatching { it.stop(); it.release() } }
        localPlayers.clear()
        playing = null
    }

    private fun durationSeconds(file: File): Double? = try {
        val extractor = MediaExtractor()
        extractor.setDataSource(file.absolutePath)
        val format = (0 until extractor.trackCount).map { extractor.getTrackFormat(it) }.firstOrNull { it.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
        extractor.release()
        format?.takeIf { it.containsKey(MediaFormat.KEY_DURATION) }?.getLong(MediaFormat.KEY_DURATION)?.div(1_000_000.0)
    } catch (_: Exception) {
        null
    }
}

/**
 * Mixes playing clips into the microphone buffers LiveKit hands over (16-bit PCM, the track's rate
 * and channels). Decoding happens on first use at the call's sample rate and is cached.
 */
object ClipMixer : MixerAudioBufferCallback() {
    @Volatile var gain = 0.8f
    private class Voice(val samples: ShortArray, var position: Int = 0)
    private val voices = mutableListOf<Voice>()
    private val cache = mutableMapOf<String, ShortArray>()
    @Volatile private var sampleRate = 48000
    private const val MAX_VOICES = 8

    fun play(id: String, file: File) {
        val rate = sampleRate
        Thread {
            val samples = synchronized(cache) { cache["$id@$rate"] } ?: decode(file, rate)?.also { synchronized(cache) { cache["$id@$rate"] = it } } ?: return@Thread
            synchronized(voices) {
                if (voices.size >= MAX_VOICES) voices.removeAt(0)
                voices += Voice(samples)
            }
        }.start()
    }

    fun stop() = synchronized(voices) { voices.clear() }

    fun forget(id: String) = synchronized(cache) { cache.keys.removeAll { it.startsWith("$id@") } }

    override fun onBufferRequest(originalBuffer: ByteBuffer, audioFormat: Int, channelCount: Int, sampleRate: Int, bytesRead: Int, captureTimeNs: Long): BufferResponse? {
        this.sampleRate = sampleRate
        if (audioFormat != AudioFormat.ENCODING_PCM_16BIT && audioFormat != AudioFormat.ENCODING_DEFAULT) return null
        val active = synchronized(voices) { if (voices.isEmpty()) return null else voices.toList() }
        val frames = bytesRead / 2 / channelCount.coerceAtLeast(1)
        val out = ByteBuffer.allocateDirect(bytesRead).order(ByteOrder.nativeOrder())
        val shorts = out.asShortBuffer()
        val g = gain
        for (frame in 0 until frames) {
            var sum = 0
            for (voice in active) if (voice.position < voice.samples.size) sum += voice.samples[voice.position++].toInt()
            val value = (sum * g).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            for (c in 0 until channelCount) shorts.put(value)
        }
        synchronized(voices) { voices.removeAll { it.position >= it.samples.size } }
        return BufferResponse(out)
    }

    /** The clip as 16-bit mono at `rate`, or null when it cannot be read. */
    fun decode(file: File, rate: Int): ShortArray? = try {
        val extractor = MediaExtractor()
        extractor.setDataSource(file.absolutePath)
        val track = (0 until extractor.trackCount).firstOrNull { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
            ?: return null
        extractor.selectTrack(track)
        val format = extractor.getTrackFormat(track)
        val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
        codec.configure(format, null, null, 0)
        codec.start()
        val pcm = java.io.ByteArrayOutputStream()
        var outRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var outChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        val info = MediaCodec.BufferInfo()
        var inputDone = false
        var outputDone = false
        while (!outputDone) {
            if (!inputDone) {
                val index = codec.dequeueInputBuffer(10_000)
                if (index >= 0) {
                    val buffer = codec.getInputBuffer(index)!!
                    val size = extractor.readSampleData(buffer, 0)
                    if (size < 0) {
                        codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        inputDone = true
                    } else {
                        codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
                        extractor.advance()
                    }
                }
            }
            val index = codec.dequeueOutputBuffer(info, 10_000)
            when {
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    outRate = codec.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    outChannels = codec.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                }
                index >= 0 -> {
                    val buffer = codec.getOutputBuffer(index)!!
                    val bytes = ByteArray(info.size)
                    buffer.position(info.offset)
                    buffer.get(bytes)
                    pcm.write(bytes)
                    codec.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                    if (pcm.size() > 60 * 48000 * 4) outputDone = true
                }
            }
        }
        codec.stop()
        codec.release()
        extractor.release()
        val raw = ByteBuffer.wrap(pcm.toByteArray()).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val interleaved = ShortArray(raw.remaining()).also { raw.get(it) }
        resample(toMono(interleaved, outChannels), outRate, rate)
    } catch (e: Exception) {
        DiagLog.write("soundboard: could not decode (${e.message})")
        null
    }

    fun toMono(samples: ShortArray, channels: Int): ShortArray {
        if (channels <= 1) return samples
        val frames = samples.size / channels
        return ShortArray(frames) { f -> (0 until channels).sumOf { samples[f * channels + it].toInt() }.div(channels).toShort() }
    }

    /** Linear resampling, good enough for short effects. */
    fun resample(samples: ShortArray, from: Int, to: Int): ShortArray {
        if (from == to || samples.isEmpty()) return samples
        val length = (samples.size.toLong() * to / from).toInt()
        return ShortArray(length) { i ->
            val pos = i.toDouble() * from / to
            val a = pos.toInt().coerceAtMost(samples.size - 1)
            val b = (a + 1).coerceAtMost(samples.size - 1)
            val t = pos - a
            (samples[a] * (1 - t) + samples[b] * t).toInt().toShort()
        }
    }
}
