package app.diddy.matrix

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.matrix.rustcomponents.sdk.Client
import java.util.concurrent.TimeUnit

/**
 * Link cards like the desktop's `UrlPreviewCard` (ios LinkPreviewStore.swift): chats without
 * encryption ask the homeserver first; encrypted chats never send the link to the homeserver, the
 * app reads the page itself. Answers are kept per account and link; failures are not kept.
 */
object LinkPreviewStore {
    private sealed class Outcome {
        data class Found(val data: LinkPreviewData) : Outcome()
        data object Empty : Outcome()
        data object Failed : Outcome()
    }

    private val answers = LinkedHashMap<String, Outcome>()
    private val inFlight = HashMap<String, CompletableDeferred<Outcome>>()
    private val lock = Mutex()
    private const val MAX_ANSWERS = 300

    suspend fun preview(url: String, accountId: String, client: Client, encrypted: Boolean = false): LinkPreviewData? {
        val key = "$accountId|${if (encrypted) "local" else "server"}|$url"
        val (known, waiting, mine) = lock.withLock {
            answers[key]?.let { return@withLock Triple(it, null, null) }
            inFlight[key]?.let { return@withLock Triple(null, it, null) }
            val deferred = CompletableDeferred<Outcome>()
            inFlight[key] = deferred
            Triple(null, null, deferred)
        }
        val outcome = known ?: waiting?.await() ?: run {
            var result: Outcome? = null
            if (!encrypted) {
                try {
                    client.getUrlPreview(url, null)?.let(LinkPreviewData::fromJson)?.let { result = Outcome.Found(it) }
                } catch (_: Exception) {}
            }
            val final = result ?: when (val meta = LinkPageFetcher.meta(url)) {
                null -> Outcome.Failed
                else -> meta.value?.let { Outcome.Found(it) } ?: Outcome.Empty
            }
            lock.withLock {
                inFlight.remove(key)
                if (final !is Outcome.Failed) {
                    if (answers.size >= MAX_ANSWERS) answers.clear()
                    answers[key] = final
                }
            }
            mine?.complete(final)
            final
        }
        return (outcome as? Outcome.Found)?.data
    }
}

/**
 * The app's own reading of web pages and pictures behind chat links, with the same limits as the
 * desktop shells: only public hosts, also after redirects; pages only as HTML and at most 2 MB
 * (reading stops at `</head>`), pictures at most 8 MB.
 */
object LinkPageFetcher {
    private const val MAX_PAGE_BYTES = 2 * 1024 * 1024
    private const val MAX_IMAGE_BYTES = 8 * 1024 * 1024
    private const val USER_AGENT = "Mozilla/5.0 (compatible; Diddy/1.0; +https://github.com/Lndr2501/diddy) facebookexternalhit/1.1"

    private val client: OkHttpClient = OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    /** Holder so "no answer" (null) and "nothing for a card" (Some(null)) differ. */
    class Some<T>(val value: T)

    /** Follows up to five redirects, each to a public host only. */
    private fun open(url: String, accept: String?): okhttp3.Response? {
        var target = url
        repeat(6) {
            if (!LinkEmbedRules.isFetchable(target)) return null
            val builder = Request.Builder().url(target).header("User-Agent", USER_AGENT)
            accept?.let { builder.header("Accept", it) }
            val response = client.newCall(builder.build()).execute()
            if (response.isRedirect) {
                val location = response.header("Location")
                response.close()
                target = location?.let { response.request.url.resolve(it)?.toString() } ?: return null
                return@repeat
            }
            return response
        }
        return null
    }

    /** `null` when the page could not be read, `Some(null)` when it has nothing for a card. */
    suspend fun meta(url: String): Some<LinkPreviewData?>? = withContext(Dispatchers.IO) {
        if (!LinkEmbedRules.isFetchable(url)) return@withContext Some(null)
        try {
            open(url, "text/html,application/xhtml+xml")?.use { response ->
                if (!response.isSuccessful || !(response.header("Content-Type") ?: "").lowercase().contains("html")) {
                    return@withContext Some(null)
                }
                val source = response.body?.byteStream() ?: return@withContext Some(null)
                val data = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(16 * 1024)
                while (data.size() < MAX_PAGE_BYTES) {
                    val read = source.read(buffer)
                    if (read <= 0) break
                    data.write(buffer, 0, read)
                    if (containsHeadEnd(buffer, read)) break
                }
                Some(LinkPageMeta.parse(String(data.toByteArray()), response.request.url.toString()))
            }
        } catch (_: Exception) {
            null
        }
    }

    /** A picture from the web (a picture link or a card's picture). */
    suspend fun image(url: String): Bitmap? = withContext(Dispatchers.IO) {
        try {
            open(url, null)?.use { response ->
                if (!response.isSuccessful) return@withContext null
                val length = response.body?.contentLength() ?: -1
                if (length > MAX_IMAGE_BYTES) return@withContext null
                val bytes = response.body?.byteStream()?.readNBytesCompat(MAX_IMAGE_BYTES + 1) ?: return@withContext null
                if (bytes.size > MAX_IMAGE_BYTES) return@withContext null
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        while (out.size() < limit) {
            val read = read(buffer)
            if (read <= 0) break
            out.write(buffer, 0, minOf(read, limit - out.size()))
        }
        return out.toByteArray()
    }

    private fun containsHeadEnd(buffer: ByteArray, length: Int): Boolean =
        String(buffer, 0, length, Charsets.ISO_8859_1).contains("</head>", ignoreCase = true)
}
