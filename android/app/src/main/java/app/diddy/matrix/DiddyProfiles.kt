package app.diddy.matrix

import app.diddy.app.DiagLog
import app.diddy.util.ClientApiError
import app.diddy.util.DiddyError
import app.diddy.util.Json
import app.diddy.util.friendlyMessage
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.net.URLEncoder
import java.util.Date

/** What one options room holds, already reduced to trusted candidates. */
private class OptionsRoomData {
    val byKey = HashMap<String, HashMap<String, MutableList<DiddyCandidate>>>() // type → key → candidates

    fun add(type: String, key: String, candidate: DiddyCandidate) {
        byKey.getOrPut(type) { HashMap() }.getOrPut(key) { mutableListOf() } += candidate
    }

    fun newest(type: String, key: String, sender: String): DiddyCandidate? =
        byKey[type]?.get(key)?.filter { it.sender == sender }?.maxByOrNull { it.ts }
}

private class PendingMessage(val type: String, val key: String, val candidate: DiddyCandidate)

/**
 * Reads the Diddy profiles of everyone in the options rooms (ios DiddyProfiles.swift). Cheap to
 * call often: it runs at most once per `staleAfterSeconds` unless `force` is set.
 */
suspend fun MatrixAccount.loadDiddyProfiles(force: Boolean = false, staleAfterSeconds: Long = 60) {
    if (diddyLoading || rooms.isEmpty()) return
    if (!force) diddyLoadedAt?.let { if (Date().time - it.time < staleAfterSeconds * 1000) return }
    diddyLoading = true
    try {
        diddyLoadedAt = Date()
        if (!diddyMarkerChecksLoaded) {
            diddyMarkerChecksLoaded = true
            val (options, checked) = DiddyMarkerChecks.load(id)
            diddyOptionsRooms += options
            diddyCheckedRooms += checked
        }
        val candidates = rooms.filter { it.isJoined && !it.isSpace && !it.isDirect && it.id !in diddyCheckedRooms }.take(300)
        val limit = Semaphore(5)
        val answers = coroutineScope {
            candidates.map { room ->
                async {
                    limit.withPermit {
                        try {
                            clientRequest("/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(room.id)}/state/${DiddyEvents.MARKER}/")
                            room.id to true
                        } catch (e: ClientApiError) {
                            if (e.errcode == "M_NOT_FOUND") room.id to false else null
                        } catch (_: Exception) {
                            null // offline or similar: asked again on the next load
                        }
                    }
                }
            }.mapNotNull { it.await() }
        }
        for ((roomId, isOptions) in answers) {
            if (isOptions) diddyOptionsRooms += roomId
            diddyCheckedRooms += roomId
        }
        if (answers.isNotEmpty()) DiddyMarkerChecks.remember(answers, id)
        val joined = rooms.filter { it.isJoined }.map { it.id }.toSet()
        val optionsRooms = DiddyOptionsRoomLogic.sortedLikeDesktop((diddyOptionsRooms + diddyLightRoomIds).filter { it in joined })

        val loaded = mutableListOf<Triple<String, OptionsRoomData, Boolean>>()
        for (roomId in optionsRooms) loadOptionsRoom(roomId)?.let { loaded += Triple(roomId, it.first, it.second) }
        diddyPrimaryRoom = loaded.firstOrNull()?.let { it.first to it.third }

        // Profiles: the newest valid one the user wrote, in any options room (#207).
        val profiles = HashMap<String, DiddyProfile>()
        var ownRaw: Map<String, Any?>? = null
        val rejected = mutableSetOf<String>()
        val userIds = LinkedHashSet<String>()
        for (room in loaded) room.second.byKey[DiddyEvents.PROFILE]?.keys?.let { userIds += it }
        for (userId in userIds) {
            var best: Pair<DiddyProfile, DiddyCandidate>? = null
            for (room in loaded) {
                val candidate = room.second.newest(DiddyEvents.PROFILE, userId, userId) ?: continue
                if (best != null && candidate.ts <= best.second.ts) continue
                DiddyProfile.parse(candidate.content)?.let { best = it to candidate }
            }
            val picked = best
            if (picked == null) {
                rejected += userId
                continue
            }
            profiles[userId] = picked.first
            if (userId == this.userId) ownRaw = picked.second.content
        }

        // Awards: one per giver and badge, at most 200 per giver (the newest).
        data class AwardRecord(val badgeId: String, val userId: String, val by: String, val ts: Long)
        var awards = mutableListOf<AwardRecord>()
        val defCandidates = HashMap<String, MutableList<DiddyCandidate>>()
        val globalIds = DiddyBadge.global.map { it.id }.toSet()
        for (room in loaded) {
            room.second.byKey[DiddyEvents.BADGE]?.forEach { (badgeId, list) ->
                if (badgeId.length <= 64 && badgeId !in globalIds) defCandidates.getOrPut(badgeId) { mutableListOf() } += list
            }
            room.second.byKey[DiddyEvents.AWARD]?.forEach { (key, list) ->
                val (badgeId, recipient) = DiddyTrust.parseAwardKey(key) ?: return@forEach
                for (award in DiddyTrust.resolveAwards(recipient, list)) awards += AwardRecord(badgeId, recipient, award.by, award.ts)
            }
        }
        awards = DiddyTrust.capPerSender(awards, { it.by }, { it.ts }, DiddyTrust.MAX_AWARDS_PER_SENDER).toMutableList()
        val owned = HashMap<String, MutableSet<String>>()
        for (award in awards) owned.getOrPut(award.userId) { mutableSetOf() } += award.badgeId
        val awardedIds = awards.map { it.badgeId }.toSet()

        // Definitions: at most 25 per creator and 300 overall, but an awarded one is never dropped.
        data class DefinitionRecord(val badge: DiddyBadge, val ts: Long, val sender: String)
        var records = mutableListOf<DefinitionRecord>()
        for ((badgeId, list) in defCandidates) {
            val chosen = DiddyTrust.pickDefinition(badgeId, list) { candidate ->
                DiddyBadge.fromContent(badgeId, candidate.content) != null &&
                    (candidate.content["createdBy"] == null || candidate.content["createdBy"] == candidate.sender)
            } ?: continue
            val badge = DiddyBadge.fromContent(badgeId, chosen.content) ?: continue
            records += DefinitionRecord(badge, chosen.ts, chosen.sender)
        }
        records = DiddyTrust.capPerSender(records, { it.sender }, { it.ts }, DiddyTrust.MAX_CUSTOM_DEFS_PER_SENDER)
            .sortedByDescending { it.ts }.toMutableList()
        var slots = DiddyTrust.MAX_CUSTOM_DEFS - records.count { it.badge.id in awardedIds }
        val definitions = LinkedHashMap<String, DiddyBadge>()
        DiddyBadge.global.forEach { definitions[it.id] = it }
        for (record in records) {
            val badge = record.badge.copy(createdBy = record.sender)
            if (badge.id in awardedIds) definitions[badge.id] = badge
            else if (slots > 0) {
                slots -= 1
                definitions[badge.id] = badge
            }
        }
        val badges = HashMap<String, List<DiddyBadge>>()
        for ((userId, profile) in profiles) {
            val mine = owned[userId] ?: emptySet()
            val shown = profile.shownBadges.filter { it in mine }.mapNotNull { definitions[it] }
            if (shown.isNotEmpty()) badges[userId] = shown.take(4)
        }

        if (diddyProfiles != profiles) diddyProfiles = profiles
        if (diddyBadges != badges) diddyBadges = badges
        rejected.removeAll(profiles.keys)
        val summary = "diddy: options rooms=${optionsRooms.size} read=${loaded.size} encrypted=${loaded.count { it.third }} " +
            "profiles=${profiles.size} unreadable=${rejected.sorted().joinToString(",")}"
        if (summary != diddyLastSummary) {
            diddyLastSummary = summary
            DiagLog.write(summary)
        }
        val ownBadges = (owned[this.userId] ?: emptySet()).mapNotNull { definitions[it] }.sortedWith(
            compareBy<DiddyBadge> { !it.id.startsWith("g.") }.thenBy { it.name.lowercase() }
        )
        if (diddyOwnBadges != ownBadges) diddyOwnBadges = ownBadges
        val library = DiddyBadge.global + definitions.values.filter { !it.isGlobal }.sortedBy { it.name.lowercase() }
        if (diddyBadgeLibrary != library) diddyBadgeLibrary = library
        diddyOwnProfileRaw = ownRaw
        detailsChanged()
        // No options room yet: join the one of your servers, like desktop does after the first sync.
        if (diddyPrimaryRoom == null) scope.launch { joinDiddyOptionsRoomAutomatically() }
        else scope.launch { hardenDiddyBadgePower() }
    } finally {
        diddyLoading = false
    }
}

/** Whether your own profile can be changed here without losing what desktop wrote. */
val MatrixAccount.canEditDiddyProfile: Boolean
    get() {
        val primary = diddyPrimaryRoom ?: return false
        if (!primary.second || diddyOwnProfileRaw != null) return true
        return diddyFeeds[primary.first]?.isCompleteFor(userId) == true
    }

/** Changes some fields of your Diddy profile and keeps all others. `null` removes a field. */
suspend fun MatrixAccount.updateDiddyProfile(changes: Map<String, Any?>) = updateDiddyProfileWith { stored ->
    val content = stored.toMutableMap()
    for ((key, value) in changes) if (value == null) content.remove(key) else content[key] = value
    content
}

/** Writes your profile as `build` makes it from the stored one, read again right before. */
suspend fun MatrixAccount.updateDiddyProfileWith(build: (Map<String, Any?>) -> Map<String, Any?>) {
    reloadDiddyProfilesForWrite()
    if (diddyPrimaryRoom == null || !canEditDiddyProfile) {
        throw DiddyError("No Diddy Options room was found. Set one up in the profile editor first.")
    }
    val content = build(diddyOwnProfileRaw ?: emptyMap()).toMutableMap()
    content["v"] = 1
    writeDiddyData(DiddyEvents.PROFILE, userId, content)
    loadDiddyProfiles(force = true)
}

/**
 * Writes one Diddy event (`writeDiddyData` of desktop): state in an unencrypted marked room, else a
 * normal event carrying the key (message mode), encrypted when the room is.
 */
suspend fun MatrixAccount.writeDiddyData(type: String, key: String, content: Map<String, Any?>) {
    val primary = diddyPrimaryRoom ?: throw DiddyError("No Diddy Options room found.")
    val body = content.toMutableMap()
    body.remove(DiddyEvents.KEY_FIELD)
    val size = DiddyJsonSize.length(body + (DiddyEvents.KEY_FIELD to key))
        ?: throw DiddyError("Your data could not be saved: it contains a value that is not valid JSON.")
    if (size > DiddyEvents.MAX_CONTENT_BYTES) {
        throw DiddyError("Too much data to save ($size of ${DiddyEvents.MAX_CONTENT_BYTES} characters). Shorten links or texts.")
    }
    val path = "/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(primary.first)}/state/${MatrixAccount.pathComponent(type)}/${MatrixAccount.pathComponent(key)}"
    val messageOnly = primary.first in diddyLightRoomIds && primary.first !in diddyOptionsRooms
    var asState = !primary.second && !messageOnly
    if (asState) {
        try {
            clientRequest(path, body, "PUT")
        } catch (e: ClientApiError) {
            if (e.errcode == "M_FORBIDDEN") asState = false else throw e
        }
    }
    if (!asState) {
        val room = room(primary.first) ?: throw DiddyError("The Diddy Options room is not available yet.")
        body[DiddyEvents.KEY_FIELD] = key
        try {
            room.sendRaw(type, Json.encode(body), null)
        } catch (e: Exception) {
            throw DiddyError("Could not send your data to the Diddy Options room: ${e.friendlyMessage}")
        }
        diddyFeeds[primary.first]?.addLocal(type, userId, body)
    }
}

/** Hidden from channel lists like on desktop. */
fun MatrixAccount.isDiddyOptionsRoom(roomId: String, topic: String?): Boolean =
    roomId in diddyOptionsRooms || roomId in diddyLightRoomIds || topic?.contains(DiddyEvents.TOPIC_TAG) == true

/** Reads the profiles again for a write, after a load that is still running. */
suspend fun MatrixAccount.reloadDiddyProfilesForWrite() {
    var waited = 0
    while (diddyLoading && waited < 200) {
        delay(100)
        waited += 1
    }
    loadDiddyProfiles(force = true)
}

private suspend fun MatrixAccount.loadOptionsRoom(roomId: String): Pair<OptionsRoomData, Boolean>? {
    val base = "/_matrix/client/v3/rooms/${MatrixAccount.pathComponent(roomId)}"
    val state = try { clientRequestArray("$base/state") } catch (_: Exception) { return null }
    val joined = HashSet<String>()
    var encrypted = false
    for (event in state) {
        val type = event["type"].str() ?: continue
        if (type == "m.room.member" && event["content"].obj()?.get("membership").str() == "join") event["state_key"].str()?.let { joined += it }
        if (type == "m.room.encryption") encrypted = true
    }
    val data = OptionsRoomData()
    val now = System.currentTimeMillis()

    fun trusted(type: String, key: String?, sender: String?, ts: Long?, content: Map<String, Any?>?): PendingMessage? {
        if (type !in DiddyOptionsFeed.types) return null
        if (key.isNullOrEmpty() || key.length > 300) return null
        if (sender == null || sender !in joined) return null
        if (ts == null || ts > now + 86_400_000) return null
        val body = content?.toMutableMap() ?: return null
        val size = DiddyEvents.jsonLength(body)
        if (size == null || size > DiddyEvents.MAX_CONTENT_BYTES) {
            if (type == DiddyEvents.PROFILE) DiagLog.write("diddy: profile dropped user=$sender room=$roomId size=${size ?: "invalid"}")
            return null
        }
        if (type == DiddyEvents.PROFILE && key != sender) return null
        if (type == DiddyEvents.AWARD && DiddyTrust.parseAwardKey(key) == null) return null
        body.remove(DiddyEvents.KEY_FIELD)
        return PendingMessage(type, key, DiddyCandidate(body, ts, sender))
    }

    for (event in state) {
        val type = event["type"].str() ?: continue
        val pending = trusted(type, event["state_key"].str(), event["sender"].str(), event["origin_server_ts"].long(), event["content"].obj()) ?: continue
        data.add(pending.type, pending.key, pending.candidate)
    }

    val messages = mutableListOf<PendingMessage>()
    if (encrypted) {
        val feed = diddyFeeds[roomId] ?: DiddyOptionsFeed(roomId).also { created ->
            created.onChange = { scope.launch { loadDiddyProfiles(force = true) } }
            diddyFeeds[roomId] = created
        }
        room(roomId)?.let { feed.start(it) }
        for (event in feed.events) {
            trusted(event.type, event.content[DiddyEvents.KEY_FIELD].str(), event.sender, event.ts, event.content)?.let { messages += it }
        }
    } else {
        val filter = """{"types":["app.diddy.profile","app.diddy.badge","app.diddy.badge_award"]}"""
        try {
            val page = clientRequest("$base/messages?dir=b&limit=300&filter=" + URLEncoder.encode(filter, "UTF-8"))
            for (event in page["chunk"].objectsLenient()) {
                if (event.containsKey("state_key")) continue
                val content = event["content"].obj()
                val type = event["type"].str() ?: continue
                trusted(type, content?.get(DiddyEvents.KEY_FIELD).str(), event["sender"].str(), event["origin_server_ts"].long(), content)?.let { messages += it }
            }
        } catch (_: Exception) {}
    }
    for (pending in DiddyTrust.trimMessages(messages, { it.candidate.sender }, { it.candidate.ts })) {
        data.add(pending.type, pending.key, pending.candidate)
    }
    return data to encrypted
}
