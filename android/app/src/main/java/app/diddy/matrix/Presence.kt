package app.diddy.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.Prefs
import app.diddy.util.Http
import app.diddy.util.bool
import app.diddy.util.double
import app.diddy.util.str
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.coroutines.coroutineContext
import kotlin.math.pow

/** What a status dot shows; the same four states and colours as desktop (ios PresenceLogic.swift). */
enum class PresenceState(val title: String, val hex: Long) {
    ONLINE("Online", 0x23A55A), IDLE("Idle", 0xF0B232), DND("Do Not Disturb", 0xF23F43), OFFLINE("Offline", 0x80848E)
}

/** One answer of `GET /presence/{userId}/status`. */
data class MatrixPresence(
    val presence: String,
    val statusMsg: String? = null,
    val lastActiveAgo: Long? = null,
    val currentlyActive: Boolean? = null,
    val receivedAt: Long,
) {
    val lastActive: Long? get() = lastActiveAgo?.let { receivedAt - it }

    fun showsSame(other: MatrixPresence?): Boolean =
        other != null && presence == other.presence && statusMsg == other.statusMsg && (lastActive == null) == (other.lastActive == null)

    val isInformative: Boolean
        get() = when (presence) {
            "online", "unavailable" -> true
            "offline" -> lastActive != null
            else -> false
        }

    companion object {
        fun parse(json: Map<String, Any?>, receivedAt: Long): MatrixPresence? {
            val presence = json["presence"].str() ?: return null
            val ago = json["last_active_ago"].double()?.takeIf { it.isFinite() && it >= 0 && it < 1e15 }?.toLong()
            return MatrixPresence(presence, json["status_msg"].str(), ago, json["currently_active"].bool(), receivedAt)
        }
    }
}

object PresenceLogic {
    const val DND_STATUS_MESSAGE = "Do not disturb"

    fun isDndMessage(message: String?) = message?.trim()?.lowercase() == DND_STATUS_MESSAGE.lowercase()

    fun resolve(matrix: MatrixPresence?, chosen: String?): PresenceState? {
        if (matrix == null) return null
        val picked = chosen?.takeIf { it in listOf("online", "idle", "dnd", "invisible") }
        when (matrix.presence) {
            "offline" -> return if (matrix.lastActive != null) PresenceState.OFFLINE else null
            "online", "unavailable" -> {}
            else -> return null
        }
        if (picked == "invisible") return PresenceState.OFFLINE
        if (picked == "dnd") return PresenceState.DND
        if (picked == null && isDndMessage(matrix.statusMsg)) return PresenceState.DND
        if (matrix.presence == "unavailable" || picked == "idle") return PresenceState.IDLE
        return PresenceState.ONLINE
    }

    fun message(statusMsg: String?): String? {
        val message = statusMsg?.trim()?.ifEmpty { null } ?: return null
        if (isDndMessage(message)) return null
        return message.take(128)
    }

    fun shown(matrix: MatrixPresence?, chosen: String?, serverHasPresence: Boolean?): PresenceState? {
        resolve(matrix, chosen)?.let { return it }
        if (serverHasPresence != false) return null
        return when (chosen) {
            "online" -> PresenceState.ONLINE
            "idle" -> PresenceState.IDLE
            "dnd" -> PresenceState.DND
            else -> null
        }
    }

    fun own(chosen: String?): PresenceState = when (chosen) {
        "idle" -> PresenceState.IDLE
        "dnd" -> PresenceState.DND
        "invisible" -> PresenceState.OFFLINE
        else -> PresenceState.ONLINE
    }

    data class Announcement(val presence: String, val statusMsg: String? = null) {
        val body: Map<String, Any?> get() = buildMap { put("presence", presence); statusMsg?.let { put("status_msg", it) } }
    }

    fun announcement(chosen: String?, foreground: Boolean): Announcement = when (chosen) {
        "invisible" -> Announcement("offline")
        "idle" -> Announcement("unavailable")
        "dnd" -> Announcement(if (foreground) "online" else "unavailable", DND_STATUS_MESSAGE)
        else -> Announcement(if (foreground) "online" else "unavailable")
    }
}

object PresenceSchedule {
    const val TICK = 10.0
    const val REFRESH = 60.0
    const val ON_DEMAND_REFRESH = 15.0
    const val NO_PRESENCE_REFRESH = 15 * 60.0
    const val MAX_PER_ROUND = 6
    const val MAX_DIRECT_PARTNERS = 25
    const val STALE_AFTER = 10 * 60.0
    const val SLOW_HEARTBEAT = 4 * 60.0
    const val FAST_HEARTBEAT = 20.0
    const val OWN_CHECK_DELAY = 35.0
    const val MAX_BACKOFF = 30 * 60.0

    fun heartbeat(serverKeepsPresence: Boolean?) = if (serverKeepsPresence == false) FAST_HEARTBEAT else SLOW_HEARTBEAT

    data class Entry(val fetchedAt: Long? = null, val failures: Int = 0, val retryAt: Long? = null)

    sealed class Outcome {
        data object Ok : Outcome()
        data class RateLimited(val retryAfter: Double?) : Outcome()
        data object Refused : Outcome()
        data object Failed : Outcome()
    }

    fun backoff(failures: Int): Double {
        if (failures <= 0) return 0.0
        return minOf(REFRESH * 2.0.pow(minOf(failures - 1, 10)), MAX_BACKOFF)
    }

    fun rateLimitWait(retryAfter: Double?) = (retryAfter ?: REFRESH).coerceIn(5.0, MAX_BACKOFF)

    fun update(entry: Entry, outcome: Outcome, now: Long): Entry = when (outcome) {
        Outcome.Ok -> Entry(now, 0, null)
        is Outcome.RateLimited -> entry.copy(retryAt = now + (rateLimitWait(outcome.retryAfter) * 1000).toLong())
        Outcome.Refused -> entry.copy(failures = entry.failures + 1, retryAt = now + (MAX_BACKOFF * 1000).toLong())
        Outcome.Failed -> (entry.failures + 1).let { entry.copy(failures = it, retryAt = now + (backoff(it) * 1000).toLong()) }
    }

    fun isDue(entry: Entry?, now: Long, maxAge: Double): Boolean {
        if (entry == null) return true
        if (entry.retryAt != null && now < entry.retryAt) return false
        val fetched = entry.fetchedAt ?: return true
        return now - fetched >= maxAge * 1000
    }

    fun pick(ordered: List<String>, entries: Map<String, Entry>, now: Long, maxAge: Double, limit: Int = MAX_PER_ROUND): List<String> =
        ordered.distinct().filter { isDue(entries[it], now, maxAge) }.take(limit)

    fun shouldAnnounce(wanted: PresenceLogic.Announcement, last: PresenceLogic.Announcement?, lastAt: Long?, now: Long, heartbeat: Double): Boolean {
        if (last == null || lastAt == null || last != wanted) return true
        if (wanted.presence != "online") return false
        return now - lastAt >= heartbeat * 1000
    }

    fun outcome(status: Int, errcode: String?): Outcome = when (status) {
        200 -> Outcome.Ok
        429 -> Outcome.RateLimited(null)
        403, 404 -> Outcome.Refused
        else -> if (errcode == "M_LIMIT_EXCEEDED") Outcome.RateLimited(null) else Outcome.Failed
    }
}

/**
 * Online status of people, read and announced through the client API, because Simplified Sliding
 * Sync delivers no presence (ios PresenceStore.swift).
 */
class PresenceStore private constructor(private val account: MatrixAccount) {
    companion object {
        private val stores = HashMap<String, PresenceStore>()

        fun of(account: MatrixAccount): PresenceStore {
            stores[account.id]?.let { if (it.account === account) return it }
            return PresenceStore(account).also { stores[account.id] = it }
        }
    }

    var presences by mutableStateOf<Map<String, MatrixPresence>>(emptyMap())
        private set
    var serverHasPresence by mutableStateOf<Boolean?>(null)
        private set
    private var uninformativeInARow = 0
    private val entries = HashMap<String, PresenceSchedule.Entry>()
    private val watchers = HashMap<String, Int>()
    private val inFlight = HashSet<String>()
    private var pausedUntil: Long? = null
    private var kickScheduled = false
    private var foregroundSince: Long? = null
    private var runGeneration = 0
    private var lastAnnounced: PresenceLogic.Announcement? = null
    private var lastAnnouncedAt: Long? = null
    private var announcePausedUntil: Long? = null
    private var announcing = false
    private var serverKeepsPresence: Boolean? = null
    private var ownCheckRetryAt: Long? = null

    fun state(userId: String): PresenceState? {
        if (userId == account.userId) return PresenceLogic.own(ownStatus)
        val chosen = account.diddyProfiles[userId]?.status
        var matrix = presences[userId]
        val fetched = entries[userId]?.fetchedAt
        if (fetched != null && System.currentTimeMillis() - fetched > PresenceSchedule.STALE_AFTER * 1000) matrix = null
        return PresenceLogic.shown(matrix, chosen, serverHasPresence)
    }

    fun message(userId: String): String? = if (userId == account.userId) null else PresenceLogic.message(presences[userId]?.statusMsg)

    fun watch(userId: String) {
        watchers[userId] = (watchers[userId] ?: 0) + 1
        if (userId !in entries) kick()
    }

    fun unwatch(userId: String) {
        val count = watchers[userId] ?: return
        if (count > 1) watchers[userId] = count - 1 else watchers.remove(userId)
    }

    suspend fun refreshNow(userId: String) {
        if (userId == account.userId || foregroundSince == null) return
        pausedUntil?.let { if (System.currentTimeMillis() < it) return }
        if (!PresenceSchedule.isDue(entries[userId], System.currentTimeMillis(), maxAge(true))) return
        fetch(userId)
    }

    /** Runs while the app is in the foreground; ends when the coroutine is cancelled. */
    suspend fun runForeground() {
        runGeneration += 1
        val generation = runGeneration
        foregroundSince = System.currentTimeMillis()
        announcePausedUntil = null
        try {
            while (coroutineContext.isActive) {
                announce(true)
                checkOwnPresence()
                pollRound()
                delay((PresenceSchedule.TICK * 1000).toLong())
            }
        } finally {
            if (runGeneration == generation) foregroundSince = null
        }
    }

    suspend fun enterBackground() {
        runGeneration += 1
        foregroundSince = null
        repeat(30) { if (announcing) delay(100) }
        announcePausedUntil = null
        announce(false)
    }

    suspend fun ownStatusChanged() {
        if (foregroundSince == null) return
        announce(true)
    }

    private val ownStatusKey: String get() = "diddy.presence.status.${account.id}"

    /** The status you picked in Diddy. Null while it cannot be known yet. */
    val ownStatus: String?
        get() {
            account.diddyProfiles[account.userId]?.status?.let { return it }
            val cached = Prefs.string(ownStatusKey)
            if (account.diddyLoadedAt != null && !account.diddyLoading) return cached ?: "online"
            if (cached != null) return cached
            val since = foregroundSince
            if (since != null && System.currentTimeMillis() - since > 30_000) return "online"
            return null
        }

    private suspend fun announce(foreground: Boolean) {
        if (announcing) return
        val chosen = ownStatus ?: return
        account.diddyProfiles[account.userId]?.status?.let { Prefs.setString(ownStatusKey, it) }
        val now = System.currentTimeMillis()
        announcePausedUntil?.let { if (now < it) return }
        val wanted = PresenceLogic.announcement(chosen, foreground)
        if (!PresenceSchedule.shouldAnnounce(wanted, lastAnnounced, lastAnnouncedAt, now, PresenceSchedule.heartbeat(serverKeepsPresence))) return
        announcing = true
        try {
            val response = request("PUT", statusPath(account.userId), wanted.body)
            when (val outcome = PresenceSchedule.outcome(response.first, response.second)) {
                PresenceSchedule.Outcome.Ok -> {
                    lastAnnounced = wanted
                    lastAnnouncedAt = System.currentTimeMillis()
                }
                is PresenceSchedule.Outcome.RateLimited -> announcePausedUntil = System.currentTimeMillis() + (PresenceSchedule.rateLimitWait(outcome.retryAfter) * 1000).toLong()
                PresenceSchedule.Outcome.Refused -> announcePausedUntil = System.currentTimeMillis() + (PresenceSchedule.MAX_BACKOFF * 1000).toLong()
                PresenceSchedule.Outcome.Failed -> announcePausedUntil = System.currentTimeMillis() + (PresenceSchedule.REFRESH * 1000).toLong()
            }
        } finally {
            announcing = false
        }
    }

    private suspend fun checkOwnPresence() {
        if (serverKeepsPresence != null || lastAnnounced?.presence != "online") return
        val at = lastAnnouncedAt ?: return
        if (System.currentTimeMillis() - at < PresenceSchedule.OWN_CHECK_DELAY * 1000) return
        ownCheckRetryAt?.let { if (System.currentTimeMillis() < it) return }
        val response = request("GET", statusPath(account.userId), null)
        val own = if (response.first == 200) response.third?.let { MatrixPresence.parse(it, System.currentTimeMillis()) } else null
        if (own == null) {
            ownCheckRetryAt = System.currentTimeMillis() + (PresenceSchedule.REFRESH * 1000).toLong()
            return
        }
        val hasPresence = own.isInformative
        serverHasPresence = hasPresence
        uninformativeInARow = 0
        serverKeepsPresence = !hasPresence || own.presence != "offline"
        if (serverKeepsPresence == false) {
            lastAnnouncedAt = null
            announce(foregroundSince != null)
        }
    }

    private fun maxAge(onDemand: Boolean): Double = when {
        serverHasPresence == false -> PresenceSchedule.NO_PRESENCE_REFRESH
        onDemand -> PresenceSchedule.ON_DEMAND_REFRESH
        else -> PresenceSchedule.REFRESH
    }

    private fun kick() {
        if (kickScheduled || foregroundSince == null) return
        kickScheduled = true
        account.scope.launch {
            delay(600)
            kickScheduled = false
            pollRound()
        }
    }

    private suspend fun pollRound() {
        if (foregroundSince == null) return
        pausedUntil?.let { if (System.currentTimeMillis() < it) return }
        val me = account.userId
        val watched = watchers.keys.sorted()
        val partners = account.directMessages.mapNotNull { it.dmUserId }.take(PresenceSchedule.MAX_DIRECT_PARTNERS)
        val ordered = (watched + partners).filter { it != me && it.startsWith("@") && it.contains(":") }
        for (userId in PresenceSchedule.pick(ordered, entries, System.currentTimeMillis(), maxAge(false))) {
            if (foregroundSince == null) return
            pausedUntil?.let { if (System.currentTimeMillis() < it) return }
            fetch(userId)
        }
    }

    private suspend fun fetch(userId: String) {
        if (!inFlight.add(userId)) return
        try {
            val response = request("GET", statusPath(userId), null)
            var outcome = PresenceSchedule.outcome(response.first, response.second)
            if (outcome is PresenceSchedule.Outcome.RateLimited) {
                outcome = PresenceSchedule.Outcome.RateLimited(response.fourth)
                pausedUntil = System.currentTimeMillis() + (PresenceSchedule.rateLimitWait(response.fourth) * 1000).toLong()
            }
            if (outcome == PresenceSchedule.Outcome.Ok) {
                val presence = response.third?.let { MatrixPresence.parse(it, System.currentTimeMillis()) }
                if (presence != null) {
                    if (!presence.showsSame(presences[userId])) presences = presences + (userId to presence)
                    if (presence.isInformative) {
                        serverHasPresence = true
                        uninformativeInARow = 0
                    } else if (serverHasPresence != true) {
                        uninformativeInARow += 1
                        if (uninformativeInARow >= 8) serverHasPresence = false
                    }
                } else outcome = PresenceSchedule.Outcome.Failed
            } else if (response.second == "M_UNRECOGNIZED" && serverHasPresence != true) {
                serverHasPresence = false
            }
            entries[userId] = PresenceSchedule.update(entries[userId] ?: PresenceSchedule.Entry(), outcome, System.currentTimeMillis())
        } finally {
            inFlight.remove(userId)
        }
    }

    private fun statusPath(userId: String) = "/_matrix/client/v3/presence/${MatrixAccount.pathComponent(userId)}/status"

    private data class Response(val first: Int, val second: String?, val third: Map<String, Any?>?, val fourth: Double?)

    /** Never throws: status 0 means no answer. */
    private suspend fun request(method: String, path: String, body: Map<String, Any?>?): Response = try {
        val session = account.client.session()
        val answer = Http.request(
            session.homeserverUrl.trimEnd('/') + path,
            method = method,
            json = body,
            headers = mapOf("Authorization" to "Bearer ${session.accessToken}"),
        )
        val json = answer.json
        val retry = (json?.get("retry_after_ms") as? Number)?.toDouble()?.takeIf { it >= 0 }?.div(1000)
        Response(answer.status, json?.get("errcode").str(), json, retry)
    } catch (_: Exception) {
        Response(0, null, null, null)
    }
}

/** Do Not Disturb mutes sounds and notifications for messages, mentions and invites (desktop #71). */
object DoNotDisturb {
    fun silencesSound(alert: String, status: String?): Boolean = status == "dnd" && alert in listOf("message", "mention", "invite", "incomingCall")
    fun silencesNotification(status: String?): Boolean = status == "dnd"
}
