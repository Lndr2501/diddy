package app.diddy.media

import android.content.Context
import android.os.Build
import app.diddy.app.DiagLog
import app.diddy.matrix.MatrixAccount
import app.diddy.util.friendlyMessage
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.decode.DataSource
import coil3.decode.ImageSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.SourceFetchResult
import coil3.gif.AnimatedImageDecoder
import coil3.gif.GifDecoder
import coil3.key.Keyer
import coil3.memory.MemoryCache
import coil3.request.Options
import coil3.svg.SvgDecoder
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okio.Buffer
import org.matrix.rustcomponents.sdk.MediaSource
import java.io.File
import java.security.MessageDigest

/**
 * A picture from the homeserver, loaded through the SDK of the account it was seen in
 * (authenticated media, encrypted attachments). `size` asks for a server thumbnail of about that
 * many pixels; null loads the original (ios MediaLoader.swift).
 */
data class MxcImage(val account: MatrixAccount, val source: MediaSource, val size: Int?) {
    val key: String get() = "${account.id}|${source.url()}#${size ?: 0}"

    companion object {
        fun of(account: MatrixAccount, url: String?, size: Int?): MxcImage? {
            val usable = app.diddy.matrix.AvatarChoice.usable(url) ?: return null
            if (!usable.startsWith("mxc://")) return null
            return try { MxcImage(account, MediaSource.fromUrl(usable), size) } catch (_: Exception) { null }
        }
    }
}

class MxcKeyer : Keyer<MxcImage> {
    override fun key(data: MxcImage, options: Options): String = data.key
}

class MxcFetcher(private val data: MxcImage, private val options: Options) : Fetcher {
    override suspend fun fetch(): FetchResult? {
        val client = data.account.client
        // An encrypted file is an object with key and iv; the server cannot make a thumbnail of it.
        val encrypted = data.source.toJson().startsWith("{")
        var failure = ""
        var bytes: ByteArray? = null
        if (data.size != null && !encrypted) {
            try {
                bytes = client.getMediaThumbnail(data.source, data.size.toULong(), data.size.toULong())
            } catch (e: Exception) {
                failure = "thumbnail: ${e.friendlyMessage}; "
            }
        }
        if (bytes == null || bytes.isEmpty()) {
            try {
                bytes = client.getMediaContent(data.source)
            } catch (e: Exception) {
                failure += "content: ${e.friendlyMessage}"
                MediaLoader.logFailure(failure)
                throw e
            }
        }
        val buffer = Buffer().write(bytes!!)
        return SourceFetchResult(
            source = ImageSource(buffer, options.fileSystem),
            mimeType = null,
            dataSource = DataSource.NETWORK,
        )
    }

    class Factory : Fetcher.Factory<MxcImage> {
        override fun create(data: MxcImage, options: Options, imageLoader: ImageLoader): Fetcher = MxcFetcher(data, options)
    }
}

object MediaLoader {
    private lateinit var appContext: Context
    private var loggedFailures = 0
    private val audioLock = Mutex()
    private val audioInFlight = HashMap<String, Deferred<File?>>()
    private const val MAX_AUDIO_BYTES = 100 * 1024 * 1024

    /** Coil's loader for the whole app: homeserver pictures, GIF/WebP animations, SVG. */
    fun install(context: Context) {
        appContext = context.applicationContext
        SingletonImageLoader.setSafe { platformContext: PlatformContext ->
            ImageLoader.Builder(platformContext)
                .memoryCache { MemoryCache.Builder().maxSizePercent(platformContext, 0.2).build() }
                .components {
                    add(MxcKeyer())
                    add(MxcFetcher.Factory())
                    if (Build.VERSION.SDK_INT >= 28) add(AnimatedImageDecoder.Factory()) else add(GifDecoder.Factory())
                    add(SvgDecoder.Factory())
                }
                .build()
        }
    }

    fun logFailure(text: String) {
        if (loggedFailures >= 30) return
        loggedFailures += 1
        DiagLog.write("media: image load failed $text")
    }

    /** A voice message or audio file, downloaded (and decrypted) once into the cache folder. */
    suspend fun audioFile(source: MediaSource, mimeType: String?, account: MatrixAccount): File? {
        val key = "${account.id}|${source.url()}"
        val digest = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).take(16).joinToString("") { "%02x".format(it) }
        val folder = File(appContext.cacheDir, "voice").apply { mkdirs() }
        val file = File(folder, "$digest.${audioExtension(mimeType)}")
        if (file.exists() && file.length() > 0) return file
        val task = audioLock.withLock {
            audioInFlight[key] ?: coroutineScope {
                async {
                    try {
                        val data = account.client.getMediaContent(source)
                        if (data.size > MAX_AUDIO_BYTES) return@async null
                        val temp = File(folder, "$digest.part")
                        temp.writeBytes(data)
                        temp.renameTo(file)
                        file
                    } catch (_: Exception) {
                        null
                    }
                }
            }.also { audioInFlight[key] = it }
        }
        val result = task.await()
        audioLock.withLock { audioInFlight.remove(key) }
        return result
    }

    /** A file of any attachment, for opening or saving: downloaded and decrypted by the SDK. */
    suspend fun file(source: MediaSource, filename: String, account: MatrixAccount): File? = try {
        val data = account.client.getMediaContent(source)
        val folder = File(appContext.cacheDir, "files/${System.nanoTime()}").apply { mkdirs() }
        val safe = filename.replace(Regex("[/\\\\:*?\"<>|]"), "_").ifBlank { "file" }
        File(folder, safe).apply { writeBytes(data) }
    } catch (_: Exception) {
        null
    }

    fun audioExtension(mimeType: String?): String =
        when (mimeType?.split(";")?.firstOrNull()?.trim()?.lowercase()) {
            "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac" -> "m4a"
            "audio/mpeg", "audio/mp3" -> "mp3"
            "audio/ogg", "audio/opus" -> "ogg"
            "audio/webm" -> "webm"
            "audio/wav", "audio/x-wav", "audio/wave" -> "wav"
            "audio/flac", "audio/x-flac" -> "flac"
            else -> "audio"
        }
}
