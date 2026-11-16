package app.diddy.call

import app.diddy.util.DiddyError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** Reads myinstants.com search pages and sound pages (ios MyInstantsParser). Pure. */
object MyInstantsParser {
    const val ORIGIN = "https://www.myinstants.com"
    val hosts = setOf("www.myinstants.com", "myinstants.com")
    const val FULL_PAGE = 20
    private val soundPath = Regex("""^/media/sounds/[^?#\s'"<>\\]+$""")

    data class Item(val path: String, val name: String)
    data class SearchPage(val items: List<Item>, val hasNext: Boolean)

    sealed class Target {
        data class Search(val name: String, val page: Int) : Target()
        data class Instant(val url: String) : Target()
    }

    fun parseInput(input: String): Target? {
        val text = input.trim()
        if (text.isEmpty()) return null
        val lower = text.lowercase()
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) return Target.Search(text.take(100), 1)
        val uri = runCatching { URI(text) }.getOrNull() ?: return null
        if (uri.host?.lowercase() !in hosts) return null
        val path = uri.rawPath ?: ""
        if (path.endsWith("/search") || path.endsWith("/search/")) {
            val query = (uri.rawQuery ?: "").split("&").mapNotNull { pair ->
                val parts = pair.split("=", limit = 2)
                if (parts.size == 2) parts[0] to runCatching { URLDecoder.decode(parts[1], "UTF-8") }.getOrDefault(parts[1]) else null
            }.toMap()
            val name = query["name"]?.trim()?.ifEmpty { null } ?: return null
            return Target.Search(name.take(100), maxOf(1, query["page"]?.toIntOrNull() ?: 1))
        }
        if (path.contains("/instant/")) return Target.Instant(ORIGIN + path)
        return null
    }

    fun searchUrl(name: String, page: Int) = "$ORIGIN/en/search/?name=${URLEncoder.encode(name, "UTF-8")}&page=${maxOf(1, page)}"

    fun isSoundPath(path: String) = !path.contains("..") && path.toByteArray().size <= 300 && soundPath.matches(path)

    fun soundUrl(path: String): String? = if (isSoundPath(path)) ORIGIN + path.replace(" ", "%20") else null

    fun parseSearch(html: String): SearchPage {
        val items = mutableListOf<Item>()
        val seen = mutableSetOf<String>()
        for (block in html.split("<div class=\"instant\"").drop(1)) {
            val part = block.take(4000)
            val path = Regex("""play\('([^']+)'""").find(part)?.groupValues?.get(1) ?: continue
            if (!isSoundPath(path)) continue
            val nameHtml = Regex("""<a [^>]*class="[^"]*instant-link[^"]*"[^>]*>(.*?)</a>""", RegexOption.DOT_MATCHES_ALL).find(part)?.groupValues?.get(1) ?: continue
            val name = cleanName(nameHtml)
            if (name.isEmpty() || !seen.add(path)) continue
            items += Item(path, name)
        }
        return SearchPage(items, html.contains("rel=\"next\"") || items.size >= FULL_PAGE)
    }

    fun parseInstantPage(html: String, url: String): Item? {
        val path = Regex("""play\('(/media/sounds/[^']+)'""").find(html)?.groupValues?.get(1)?.takeIf(::isSoundPath) ?: return null
        var name = Regex("""<h1[^>]*>(.*?)</h1>""", RegexOption.DOT_MATCHES_ALL).find(html)?.groupValues?.get(1)?.let(::cleanName) ?: ""
        if (name.isEmpty()) {
            val slug = url.trimEnd('/').substringAfterLast('/').ifEmpty { "sound" }
            name = cleanName(runCatching { URLDecoder.decode(slug, "UTF-8") }.getOrDefault(slug))
        }
        return if (name.isEmpty()) null else Item(path, name)
    }

    fun clipTitle(raw: String): String = cleanName(raw).take(40).trim().ifEmpty { "Clip" }

    fun cleanName(html: String): String {
        val text = decodeEntities(html.replace(Regex("<[^>]*>"), ""))
        val kept = text.filter { c -> !Character.isISOControl(c) || c.isWhitespace() }.filter { Character.getType(it) != Character.FORMAT.toInt() }
        return kept.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
    }

    private val named = mapOf("amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ")

    fun decodeEntities(text: String): String = Regex("&(#[xX]?[0-9A-Fa-f]{1,8}|[A-Za-z]{2,6});").replace(text) { match ->
        val entity = match.groupValues[1]
        named[entity.lowercase()] ?: run {
            if (!entity.startsWith("#")) return@run match.value
            val code = if (entity.length > 1 && (entity[1] == 'x' || entity[1] == 'X')) entity.drop(2).toIntOrNull(16) else entity.drop(1).toIntOrNull()
            code?.takeIf { Character.isValidCodePoint(it) }?.let { String(Character.toChars(it)) } ?: match.value
        }
    }
}

/** Downloads from myinstants.com only, with size limits and no cookies (ios MyInstantsClient). */
object MyInstantsClient {
    private const val MAX_HTML = 3 * 1024 * 1024
    private const val MAX_AUDIO = 8 * 1024 * 1024
    private val client = OkHttpClient.Builder()
        .followRedirects(false).followSslRedirects(false)
        .callTimeout(60, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS)
        .build()

    fun isAllowed(url: String): Boolean {
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        return uri.scheme?.lowercase() == "https" && uri.host?.lowercase() in MyInstantsParser.hosts
    }

    suspend fun text(url: String): String = String(get(url, MAX_HTML, audio = false))

    suspend fun audio(url: String): Pair<ByteArray, String> {
        var type = "mp3"
        val data = get(url, MAX_AUDIO, audio = true) { contentType -> if (contentType.contains("wav")) type = "wav" else if (contentType.contains("ogg")) type = "ogg" }
        return data to type
    }

    private suspend fun get(start: String, limit: Int, audio: Boolean, onType: (String) -> Unit = {}): ByteArray = withContext(Dispatchers.IO) {
        var url = start
        repeat(6) {
            if (!isAllowed(url)) throw DiddyError("Only https://myinstants.com links are allowed.")
            val request = Request.Builder().url(url).header("User-Agent", "Diddy/1.0 (soundboard import)").build()
            client.newCall(request).execute().use { response ->
                if (response.isRedirect) {
                    url = response.header("Location")?.let { URI(url).resolve(it).toString() } ?: throw DiddyError("MyInstants answered ${response.code}.")
                    return@use
                }
                if (response.code !in 200..299) throw DiddyError("MyInstants answered ${response.code}.")
                val type = response.header("Content-Type")?.lowercase() ?: ""
                if (audio && !type.startsWith("audio/")) throw DiddyError("This is not an audio file.")
                onType(type)
                val body = response.body ?: throw DiddyError("MyInstants sent nothing.")
                if (body.contentLength() > limit) throw DiddyError("The file is too large.")
                val stream = body.byteStream()
                val out = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(32 * 1024)
                while (true) {
                    val n = stream.read(buffer)
                    if (n < 0) break
                    out.write(buffer, 0, n)
                    if (out.size() > limit) throw DiddyError("The file is too large.")
                }
                return@withContext out.toByteArray()
            }
        }
        throw DiddyError("MyInstants redirected too often.")
    }
}
