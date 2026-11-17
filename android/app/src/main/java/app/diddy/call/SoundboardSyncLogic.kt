package app.diddy.call

import app.diddy.util.obj
import app.diddy.util.str

/** Account-data wire format shared with cinny/utils/soundboardSync and iOS. No audio or URLs. */
object SoundboardSyncLogic {
    const val TYPE = "app.diddy.soundboard"
    const val LIMIT = 200
    const val REMOVED_LIMIT = 100
    const val KEEP_MS = 30L * 24 * 60 * 60 * 1000
    data class Sound(val path: String, val name: String, val addedTs: Long)
    data class Removed(val path: String, val removedTs: Long)
    data class State(val sounds: List<Sound> = emptyList(), val removed: List<Removed> = emptyList()) {
        fun json(): Map<String, Any?> = mapOf(
            "version" to 1,
            "sounds" to sounds.map { mapOf("path" to it.path, "name" to it.name, "added_ts" to it.addedTs) },
            "removed" to removed.map { mapOf("path" to it.path, "removed_ts" to it.removedTs) },
        )
    }

    private fun timestamp(value: Any?): Long? = (value as? Number)?.toDouble()
        ?.takeIf { it.isFinite() && it >= 0 && it < Long.MAX_VALUE.toDouble() }?.toLong()
    private fun name(value: Any?) = value.str()?.replace(Regex("\\s+"), " ")?.trim()?.take(40).orEmpty()

    fun merge(now: Long, vararg contents: Map<String, Any?>?): State {
        val sounds = mutableMapOf<String, Sound>()
        val removed = mutableMapOf<String, Removed>()
        for (content in contents) {
            for (raw in content?.get("sounds") as? List<*> ?: emptyList<Any>()) {
                val item = raw.obj() ?: continue
                val path = item["path"].str()?.takeIf(MyInstantsParser::isSoundPath) ?: continue
                val title = name(item["name"]).takeIf { it.isNotEmpty() } ?: continue
                val ts = timestamp(item["added_ts"]) ?: continue
                if (ts > (sounds[path]?.addedTs ?: -1)) sounds[path] = Sound(path, title, ts)
            }
            for (raw in content?.get("removed") as? List<*> ?: emptyList<Any>()) {
                val item = raw.obj() ?: continue
                val path = item["path"].str()?.takeIf(MyInstantsParser::isSoundPath) ?: continue
                val ts = timestamp(item["removed_ts"]) ?: continue
                if (ts > (removed[path]?.removedTs ?: -1)) removed[path] = Removed(path, ts)
            }
        }
        return State(
            sounds.values.filter { it.addedTs > (removed[it.path]?.removedTs ?: -1) }
                .sortedWith(compareByDescending<Sound> { it.addedTs }.thenBy { it.path }).take(LIMIT),
            removed.values.filter { it.removedTs >= (sounds[it.path]?.addedTs ?: -1) && now - it.removedTs <= KEEP_MS }
                .sortedWith(compareByDescending<Removed> { it.removedTs }.thenBy { it.path }).take(REMOVED_LIMIT),
        )
    }

    fun add(state: State, path: String, title: String, now: Long): State {
        if (!MyInstantsParser.isSoundPath(path) || state.sounds.any { it.path == path } || state.sounds.size >= LIMIT) return state
        val ts = maxOf(now, (state.removed.find { it.path == path }?.removedTs ?: -1) + 1)
        return merge(now, state.json(), State(listOf(Sound(path, name(title).ifEmpty { "sound" }, ts))).json())
    }

    fun remove(state: State, path: String, now: Long): State {
        if (!MyInstantsParser.isSoundPath(path)) return state
        val ts = maxOf(now, (state.sounds.find { it.path == path }?.addedTs ?: -1) + 1,
            (state.removed.find { it.path == path }?.removedTs ?: -1) + 1)
        // A local removal must survive offline, even if the original add has not reached the server.
        return merge(now, state.json(), State(removed = listOf(Removed(path, ts))).json())
    }
}
