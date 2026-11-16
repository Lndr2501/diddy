package app.diddy.matrix

import app.diddy.util.Json
import app.diddy.util.str
import java.net.URI

/** Link previews, locations and sticker sizes the way the desktop app shows them (ios MessageEmbeds.swift). */
object LinkPreviewUrls {
    const val LIMIT = 2

    /** The web links of a message body for previews, like desktop's `URL_REG`. */
    fun find(body: String, limit: Int = LIMIT): List<String> {
        val found = mutableListOf<String>()
        var i = 0
        while (i < body.length && found.size < limit) {
            val scheme = if (body[i] == 'h' || body[i] == 'H') schemeLength(body, i) else null
            if (scheme == null) {
                i += 1
                continue
            }
            var end = i + scheme
            while (end < body.length && !body[end].isWhitespace() && body[end] != ')') {
                if (body[end] == ']' && end + 1 < body.length && body[end + 1] == '(') break
                end += 1
            }
            var last = end
            while (last > i + scheme && body[last - 1] in TRAILING) last -= 1
            if (last > i + scheme) {
                val url = body.substring(i, last)
                if (!isMatrixTo(url) && url !in found) found += url
            }
            i = maxOf(end, i + 1)
        }
        return found
    }

    private const val TRAILING = ".,:;!/?()[]"

    private fun schemeLength(text: String, i: Int): Int? {
        for (prefix in listOf("https://", "http://")) {
            if (text.regionMatches(i, prefix, 0, prefix.length, ignoreCase = true)) return prefix.length
        }
        return null
    }

    fun isMatrixTo(url: String): Boolean {
        val lower = url.lowercase()
        return lower.startsWith("https://matrix.to/") || lower.startsWith("http://matrix.to/")
    }
}

/** OpenGraph data for a link card (homeserver preview or read by the app itself). */
data class LinkPreviewData(
    val title: String?,
    val description: String?,
    val siteName: String?,
    /** An `mxc://` URL the homeserver stored, or the page's own `https://` picture. */
    val imageUrl: String?,
    /** The page's `theme-color`, the card's accent stripe. */
    val color: String? = null,
) {
    val isEmpty: Boolean get() = title == null && description == null && imageUrl == null

    companion object {
        /** The homeserver's `preview_url` answer. */
        fun fromJson(json: String): LinkPreviewData? {
            val fields = Json.obj(json) ?: return null
            fun text(key: String, limit: Int): String? {
                val trimmed = fields[key].str()?.trim() ?: return null
                if (trimmed.isEmpty()) return null
                return if (trimmed.length > limit) trimmed.take(limit) + "…" else trimmed
            }
            val data = LinkPreviewData(
                title = text("og:title", 300),
                description = text("og:description", 600),
                siteName = text("og:site_name", 100),
                imageUrl = fields["og:image"].str()?.takeIf { it.startsWith("mxc://") },
            )
            return if (data.isEmpty) null else data
        }
    }
}

/** Which links show a picture or may be read by the app itself (desktop linkEmbeds.ts). */
object LinkEmbedRules {
    private val imageExtensions = setOf("png", "jpg", "jpeg", "gif", "webp", "avif", "apng", "bmp")
    private val imageHosts = setOf("i.imgur.com", "media.tenor.com", "media.giphy.com", "i.giphy.com", "pbs.twimg.com")
    private val localSuffixes = listOf(".local", ".lan", ".home", ".internal", ".intranet", ".corp", ".home.arpa")

    fun isImageLink(raw: String): Boolean {
        val uri = try { URI(raw) } catch (_: Exception) { return false }
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != "https" && scheme != "http") return false
        val host = uri.host?.lowercase() ?: return false
        if (!isPublicHost(host)) return false
        val path = uri.path ?: ""
        val ext = path.substringAfterLast('/').substringAfterLast('.', "").lowercase()
        if (ext in imageExtensions) return true
        if (host == "pbs.twimg.com") return path.startsWith("/media/")
        return host in imageHosts && ext.length in 3..4
    }

    /** Never the user's own network (router, NAS, `localhost`), whatever a chat link says. */
    fun isPublicHost(hostname: String): Boolean {
        var host = hostname.lowercase().removePrefix("[").removeSuffix("]").removeSuffix(".")
        if (host.isEmpty() || host == "localhost" || host.endsWith(".localhost")) return false
        if (localSuffixes.any { host.endsWith(it) }) return false
        val parts = host.split(".")
        if (parts.size == 4 && parts.all { p -> p.isNotEmpty() && p.all { it.isDigit() } }) {
            val n = parts.mapNotNull { it.toIntOrNull() }
            if (n.size != 4 || n.any { it !in 0..255 }) return false
            val a = n[0]
            val b = n[1]
            if (a == 0 || a == 10 || a == 127 || a >= 224) return false
            if (a == 169 && b == 254) return false
            if (a == 172 && b in 16..31) return false
            if (a == 192 && b == 168) return false
            if (a == 100 && b in 64..127) return false
            return true
        }
        if (host.contains(":")) {
            if (host == "::" || host == "::1" || host.startsWith("::ffff:")) return false
            return listOf("fc", "fd", "fe8", "fe9", "fea", "feb").none { host.startsWith(it) }
        }
        return host.contains(".")
    }

    fun isFetchable(raw: String): Boolean {
        val uri = try { URI(raw) } catch (_: Exception) { return false }
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != "https" && scheme != "http") return false
        val host = uri.host ?: return false
        return isPublicHost(host)
    }
}

/** Reads a page's OpenGraph data (with Twitter card, `<title>` and description fallbacks). */
object LinkPageMeta {
    private const val HEAD_LIMIT = 2 * 1024 * 1024

    fun parse(html: String, pageUrl: String): LinkPreviewData? {
        var head = html.take(HEAD_LIMIT)
        val end = Regex("</head|<body", RegexOption.IGNORE_CASE).find(head)
        if (end != null) head = head.substring(0, end.range.first)
        val meta = mutableMapOf<String, String>()
        for (tag in Regex("<meta\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(head)) {
            val attrs = attributes(tag.value)
            val key = (attrs["property"] ?: attrs["name"] ?: attrs["itemprop"] ?: "").lowercase()
            val content = attrs["content"]
            if (key.isNotEmpty() && content != null && key !in meta) meta[key] = content
        }
        val titleTag = Regex("<title[^>]*>([\\s\\S]*?)</title>", RegexOption.IGNORE_CASE).find(head)?.groupValues?.get(1)
        var data = LinkPreviewData(
            title = clean(meta["og:title"] ?: meta["twitter:title"] ?: titleTag, 300),
            description = clean(meta["og:description"] ?: meta["twitter:description"] ?: meta["description"], 600),
            siteName = clean(meta["og:site_name"] ?: meta["application-name"], 100),
            imageUrl = absoluteHttp(meta["og:image"] ?: meta["og:image:url"] ?: meta["og:image:secure_url"] ?: meta["twitter:image"], pageUrl),
        )
        val color = meta["theme-color"]?.trim()
        if (color != null && Regex("^#[0-9a-fA-F]{3,8}$").matches(color)) data = data.copy(color = color)
        return if (data.isEmpty) null else data
    }

    fun decodeEntities(text: String): String = HtmlTree.decodeEntities(text)

    private fun clean(value: String?, limit: Int): String? {
        if (value == null) return null
        val text = decodeEntities(value).split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
        if (text.isEmpty()) return null
        return if (text.length > limit) text.take(limit) + "…" else text
    }

    private fun absoluteHttp(value: String?, base: String): String? {
        if (value == null) return null
        return try {
            val url = URI(base).resolve(decodeEntities(value.trim()).replace(" ", "%20"))
            val scheme = url.scheme?.lowercase()
            if ((scheme == "https" || scheme == "http") && url.host != null && LinkEmbedRules.isPublicHost(url.host)) url.toString() else null
        } catch (_: Exception) {
            null
        }
    }

    private fun attributes(tag: String): Map<String, String> {
        val found = mutableMapOf<String, String>()
        val re = Regex("""([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))""")
        for (m in re.findAll(tag)) {
            val name = m.groupValues[1].lowercase()
            found[name] = m.groups[3]?.value ?: m.groups[4]?.value ?: m.groups[5]?.value ?: ""
        }
        return found
    }
}

/** `m.location` (desktop `MLocation`): `geo:52.52,13.40;u=35`. */
data class GeoLocation(val latitude: Double, val longitude: Double) {
    val openStreetMapUrl: String get() = "https://www.openstreetmap.org/?mlat=$latitude&mlon=$longitude#map=16/$latitude/$longitude"

    /** The `geo:` link Android's map apps open. */
    fun geoUri(label: String?): String =
        "geo:$latitude,$longitude?q=$latitude,$longitude" + (label?.let { "(" + java.net.URLEncoder.encode(it, "UTF-8") + ")" } ?: "")

    companion object {
        fun parse(geoUri: String): GeoLocation? {
            val trimmed = geoUri.trim()
            if (!trimmed.lowercase().startsWith("geo:")) return null
            val coordinates = trimmed.drop(4).split(";", limit = 2).first()
            val parts = coordinates.split(",")
            if (parts.size < 2) return null
            val latitude = parts[0].trim().toDoubleOrNull() ?: return null
            val longitude = parts[1].trim().toDoubleOrNull() ?: return null
            if (!latitude.isFinite() || !longitude.isFinite() || latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return null
            return GeoLocation(latitude, longitude)
        }
    }
}

object MessageMediaSize {
    /** Desktop's `MSticker`: 152 wide, the height to scale, at least 48 (at most three widths). */
    fun sticker(width: Double?, height: Double?): Pair<Double, Double> {
        val w = if ((width ?: 0.0) > 0) width!! else 152.0
        val h = if ((height ?: 0.0) > 0) height!! else 152.0
        val scaled = 152 / w * h
        if (!scaled.isFinite()) return 152.0 to 152.0
        return 152.0 to scaled.coerceIn(48.0, 456.0)
    }

    /** Width over height of a picture or video, sane when the sender gave odd or no sizes. */
    fun aspect(width: Double?, height: Double?): Double {
        if (width == null || height == null || width <= 0 || height <= 0) return 4.0 / 3.0
        val ratio = width / height
        if (!ratio.isFinite()) return 4.0 / 3.0
        return ratio.coerceIn(0.4, 3.0)
    }
}
