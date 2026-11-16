package app.diddy.matrix

import app.diddy.util.Json
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import java.net.URI
import java.net.URLDecoder

/**
 * A shared song, drawn like iMessage's Apple Music lyrics (ios MusicCard.swift, desktop
 * plugins/musicCard.ts). It travels in a normal text message under `app.diddy.music`.
 */
data class MusicCard(
    val title: String,
    val artist: String,
    val album: String? = null,
    /** The song on the service (opened on tap). */
    val url: String,
    /** Cover, uploaded to the homeserver (mxc://). */
    val artwork: String? = null,
    /** The 30 second preview (Apple's or Spotify's audio host only). */
    val preview: String? = null,
    val lyrics: List<String> = emptyList(),
    /** Where the first line starts in the song, in seconds. */
    val time: Double? = null,
    /** "apple", "spotify" or "other". */
    val service: String = "other",
    /** Cover on the web, only on the sending side until it is uploaded; never sent. */
    val remoteArtwork: String? = null,
) {
    /** The whole message content: the plain text every client shows, and the card. */
    fun content(): Map<String, Any?> {
        val card = linkedMapOf<String, Any?>("v" to 1, "title" to title, "artist" to artist, "url" to url, "service" to service)
        album?.let { card["album"] = it }
        artwork?.let { card["artwork"] = it }
        preview?.let { card["preview"] = it }
        if (lyrics.isNotEmpty()) card["lyrics"] = lyrics
        time?.let { card["time"] = it }
        return mapOf("msgtype" to "m.text", "body" to body, "format" to "org.matrix.custom.html", "formatted_body" to html, KEY to card)
    }

    val heading: String get() = if (artist.isEmpty()) title else "$title — $artist"

    val body: String
        get() {
            val parts = mutableListOf<String>()
            if (lyrics.isNotEmpty()) parts += "“" + lyrics.joinToString("\n") + "”"
            parts += heading
            parts += url
            return parts.joinToString("\n")
        }

    val html: String
        get() {
            val out = StringBuilder()
            if (lyrics.isNotEmpty()) out.append("<blockquote>").append(lyrics.joinToString("<br>", transform = ::escape)).append("</blockquote>")
            val link = escape(url)
            out.append("<p><b>${escape(title)}</b>")
            if (artist.isNotEmpty()) out.append(" — ${escape(artist)}")
            out.append("<br><a href=\"$link\">$link</a></p>")
            return out.toString()
        }

    companion object {
        const val KEY = "app.diddy.music"
        const val MAX_LINES = 8

        /** The card of a message content, null when missing or invalid. */
        fun fromContent(content: Map<String, Any?>): MusicCard? {
            val raw = content[KEY].obj() ?: return null
            if ((raw["v"] as? Number)?.toInt() != 1) return null
            val title = text(raw["title"], 200) ?: return null
            val url = webUrl(raw["url"]) ?: return null
            val service = raw["service"].str()
            return MusicCard(
                title = title,
                artist = text(raw["artist"], 200) ?: "",
                album = text(raw["album"], 200),
                url = url,
                artwork = raw["artwork"].str()?.takeIf(::isMxc),
                preview = webUrl(raw["preview"])?.takeIf(::previewAllowed),
                lyrics = (raw["lyrics"] as? List<*>)?.mapNotNull { text(it, 200) }?.take(MAX_LINES) ?: emptyList(),
                time = (raw["time"] as? Number)?.toDouble()?.takeIf { it.isFinite() && it >= 0 && it < 86_400 },
                service = if (service == "apple" || service == "spotify") service else "other",
            )
        }

        /** The card of a raw event as the SDK keeps it; an edit's new content wins. */
        fun card(originalJson: String?, latestEditJson: String?): MusicCard? {
            for (json in listOf(latestEditJson, originalJson)) {
                if (json == null || !json.contains(KEY)) continue
                val content = Json.obj(json)?.get("content").obj() ?: continue
                content["m.new_content"].obj()?.let { edited -> fromContent(edited)?.let { return it } }
                fromContent(content)?.let { return it }
            }
            return null
        }

        fun mightHaveCard(json: String?) = json?.contains(KEY) == true

        /** "1:05" for the time a line starts. */
        fun clock(seconds: Double): String {
            val whole = seconds.toInt()
            return "${whole / 60}:" + String.format(java.util.Locale.US, "%02d", whole % 60)
        }

        /** The song of an Apple Music link: `music.apple.com/<country>/song/<name>/<id>` or `?i=<id>`. */
        fun appleMusicSong(link: String): Pair<String, String>? {
            val uri = try { URI(link) } catch (_: Exception) { return null }
            val host = uri.host?.lowercase() ?: return null
            if (host != "music.apple.com" && host != "itunes.apple.com") return null
            val path = (uri.path ?: "").split("/").filter { it.isNotEmpty() }
            val country = path.firstOrNull()?.let { if (it.length == 2) it.lowercase() else "us" } ?: "us"
            val query = uri.rawQuery?.split("&")?.mapNotNull { pair ->
                val parts = pair.split("=", limit = 2)
                if (parts.size == 2) parts[0] to URLDecoder.decode(parts[1], "UTF-8") else null
            }?.toMap() ?: emptyMap()
            query["i"]?.takeIf(::isDigits)?.let { return it to country }
            val index = path.indexOf("song")
            val last = path.lastOrNull()
            if (index >= 0 && last != null && index < path.size - 1 && isDigits(last)) return last to country
            return null
        }

        fun lookupUrl(id: String, country: String) = "https://itunes.apple.com/lookup?id=$id&country=$country&entity=song"

        /** A card from the answer of the iTunes lookup. */
        fun fromLookup(json: Map<String, Any?>, link: String): MusicCard? {
            val results = json["results"].objectsLenient()
            val song = results.firstOrNull { it["wrapperType"].str() == "track" } ?: results.firstOrNull() ?: return null
            val title = text(song["trackName"], 200) ?: return null
            return MusicCard(
                title = title,
                artist = text(song["artistName"], 200) ?: "",
                album = text(song["collectionName"], 200),
                url = link,
                service = "apple",
                preview = webUrl(song["previewUrl"])?.takeIf(::previewAllowed),
                remoteArtwork = song["artworkUrl100"].str()?.replace("100x100bb", "600x600bb"),
            )
        }

        /** The lines someone shared together with a link, without the link and the share's extra lines. */
        fun lyrics(text: String, card: MusicCard?): List<String> {
            val lines = mutableListOf<String>()
            for (raw in text.split(Regex("\\R"))) {
                var line = raw.trim().trim('"', '“', '”', '„', '«', '»', '\'').trim()
                if (line.isEmpty() || line.lowercase().startsWith("http")) continue
                val lower = line.lowercase()
                if (lower == "apple music" || lower.endsWith("on apple music") || lower.endsWith("bei apple music")) continue
                if (card != null) {
                    val titled = lower.contains(card.title.lowercase())
                    val byArtist = card.artist.isNotEmpty() && lower.contains(card.artist.lowercase())
                    if (titled && (byArtist || line.startsWith("—") || line.startsWith("-"))) continue
                }
                lines += line.take(200)
            }
            return lines.take(MAX_LINES)
        }

        /** Preview audio may only come from the services' own audio hosts. */
        fun previewAllowed(url: String): Boolean {
            val uri = try { URI(url) } catch (_: Exception) { return false }
            if (uri.scheme != "https") return false
            val host = uri.host?.lowercase() ?: return false
            return host.endsWith(".itunes.apple.com") || host.endsWith(".mzstatic.com") || host == "p.scdn.co"
        }

        fun text(value: Any?, max: Int): String? {
            val string = value as? String ?: return null
            val trimmed = string.trim()
            if (trimmed.isEmpty()) return null
            return trimmed.take(max)
        }

        fun webUrl(value: Any?): String? {
            val string = value as? String ?: return null
            if (string.length > 2000) return null
            val uri = try { URI(string) } catch (_: Exception) { return null }
            if (uri.scheme != "https" || uri.host.isNullOrEmpty()) return null
            return string
        }

        fun isMxc(value: String) = value.startsWith("mxc://") && value.length <= 255 && value.drop(6).contains("/")

        private fun isDigits(value: String) = value.isNotEmpty() && value.all { it in '0'..'9' }

        private fun escape(text: String) = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
    }
}
