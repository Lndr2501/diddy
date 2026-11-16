package app.diddy.call

import app.diddy.util.Json
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import java.util.Base64

/**
 * The MatrixRTC rules of a Diddy call, the same as ios CallSession and Element Call 0.20 (legacy
 * session members `org.matrix.msc3401.call.member`, per-participant media keys over encrypted
 * to-device messages). Pure, so the tests can check them.
 */
object CallLogic {
    const val MEMBER_EVENT_TYPE = "org.matrix.msc3401.call.member"
    const val KEYS_EVENT_TYPE = "io.element.call.encryption_keys"
    const val NOTIFICATION_EVENT_TYPE = "org.matrix.msc4075.rtc.notification"
    const val MEMBERSHIP_EXPIRY_MS = 4L * 60 * 60 * 1000
    const val RING_LIFETIME_MS = 30_000L

    data class Transport(val serviceUrl: String, val alias: String)

    /**
     * One `call.member` state event: its state key, content, when the server got it and who sent
     * it (null when the source does not say).
     */
    data class MemberEvent(val stateKey: String, val content: Map<String, Any?>, val originTs: Long? = null, val sender: String? = null)

    /** One device in the call according to Matrix. */
    data class MemberDevice(val userId: String, val deviceId: String) {
        val identity: String get() = identity(userId, deviceId)
    }

    fun stateKey(userId: String, deviceId: String) = "_${userId}_${deviceId}_m.call"

    fun identity(userId: String, deviceId: String) = "$userId:$deviceId"

    /** `@user:server:DEVICE` into user and device; null when it is not one. */
    fun split(identity: String): Pair<String, String>? {
        val index = identity.lastIndexOf(':')
        if (index < 0 || !identity.startsWith("@")) return null
        val userId = identity.substring(0, index)
        val deviceId = identity.substring(index + 1)
        if (!userId.contains(':') || deviceId.isEmpty()) return null
        return userId to deviceId
    }

    /** Joins the voice server the oldest live membership uses (`focus_selection: oldest_membership`). */
    fun oldestTransport(events: List<MemberEvent>, ownStateKey: String, roomId: String, now: Long): Transport? {
        var best: Triple<Long, String, String>? = null
        for (event in events) {
            val content = event.content
            if (content["application"].str() != "m.call") continue
            val focus = content["foci_preferred"].objectsLenient().firstOrNull { it["type"].str() == "livekit" } ?: continue
            val url = focus["livekit_service_url"].str() ?: continue
            // Without created_ts (Element Call, a first join) the membership started when it was sent.
            val created = content["created_ts"].long() ?: event.originTs ?: now
            val expires = content["expires"].long() ?: MEMBERSHIP_EXPIRY_MS
            if (created + expires < now) continue
            if (event.stateKey == ownStateKey) continue
            if (best == null || created < best.first) best = Triple(created, url, focus["livekit_alias"].str() ?: roomId)
        }
        return best?.let { Transport(it.second, it.third) }
    }

    /** Our own membership; `createdTs` is set on refreshes so the original join time stays. */
    fun membershipContent(userId: String, deviceId: String, transport: Transport, now: Long, createdTs: Long?): Map<String, Any?> {
        val created = createdTs ?: now
        val content = linkedMapOf<String, Any?>(
            "application" to "m.call",
            "call_id" to "",
            "scope" to "m.room",
            "device_id" to deviceId,
            "membershipID" to identity(userId, deviceId),
            "expires" to (now - created) + MEMBERSHIP_EXPIRY_MS,
            "focus_active" to mapOf("type" to "livekit", "focus_selection" to "oldest_membership"),
            "foci_preferred" to listOf(mapOf("type" to "livekit", "livekit_service_url" to transport.serviceUrl, "livekit_alias" to transport.alias)),
        )
        if (createdTs != null) content["created_ts"] = created
        return content
    }

    /** Element Call's `rtc.notification`: a ring in a DM, a quiet notice elsewhere. */
    fun notificationContent(membershipEventId: String, isDirect: Boolean, now: Long): Map<String, Any?> = mapOf(
        "m.mentions" to mapOf("user_ids" to emptyList<String>(), "room" to true),
        "notification_type" to if (isDirect) "ring" else "notification",
        "m.relates_to" to mapOf("event_id" to membershipEventId, "rel_type" to "m.reference"),
        "sender_ts" to now,
        "lifetime" to RING_LIFETIME_MS,
        "m.call.intent" to "audio",
    )

    /** The to-device message with our media key. */
    fun keysContent(roomId: String, userId: String, deviceId: String, key: ByteArray, index: Int, now: Long): Map<String, Any?> = mapOf(
        "keys" to mapOf("index" to index, "key" to Base64.getEncoder().encodeToString(key)),
        "room_id" to roomId,
        "member" to mapOf("claimed_device_id" to deviceId, "id" to identity(userId, deviceId)),
        "session" to mapOf("call_id" to "", "application" to "m.call", "scope" to "m.room"),
        "sent_ts" to now,
    )

    data class ReceivedKey(val participantId: String, val key: ByteArray, val index: Int)

    /** A key someone sent us for this room, mapped to their LiveKit identity like Element Call does. */
    fun parseKeys(json: String, senderId: String, roomId: String): ReceivedKey? {
        val content = Json.obj(json) ?: return null
        if (content["room_id"].str() != roomId) return null
        val keys = content["keys"].obj() ?: return null
        val key = decodeBase64(keys["key"].str() ?: return null) ?: return null
        val index = keys["index"].long()?.toInt() ?: return null
        val device = content["member"].obj()?.get("claimed_device_id").str() ?: return null
        return ReceivedKey("$senderId:$device", key, index)
    }

    /** Standard or URL-safe base64, with or without padding. */
    fun decodeBase64(text: String): ByteArray? {
        var padded = text.replace('-', '+').replace('_', '/')
        while (padded.length % 4 != 0) padded += "="
        return runCatching { Base64.getDecoder().decode(padded) }.getOrNull()
    }

    /**
     * The devices with a live `call.member` membership (MatrixRTC). Only these get our media key
     * and only their keys are used, so someone who merely reaches the media server, or left the
     * call, can neither listen nor inject media. A membership counts when it is for `m.call`, has
     * not expired, names its device, and its state key belongs to the sender (state keys are
     * `_@user:server_DEVICE_m.call`; a sender cannot claim someone else's).
     */
    fun liveMembers(events: Collection<MemberEvent>, now: Long): Set<MemberDevice> {
        val result = linkedSetOf<MemberDevice>()
        for (event in events) {
            val content = event.content
            if (content["application"].str() != "m.call") continue
            val device = content["device_id"].str()?.takeIf { it.isNotEmpty() } ?: continue
            val created = content["created_ts"].long() ?: event.originTs ?: now
            val expires = content["expires"].long() ?: MEMBERSHIP_EXPIRY_MS
            if (created + expires < now) continue
            val user = event.sender ?: event.stateKey.removePrefix("_").removeSuffix("_${device}_m.call").takeIf { it != event.stateKey.removePrefix("_") }
            if (user == null || !user.startsWith("@") || !user.contains(':')) continue
            if (event.stateKey != stateKey(user, device) && event.stateKey != "${user}_$device") continue
            result += MemberDevice(user, device)
        }
        return result
    }

    /** Devices to send our key to: in the media room and with a live membership, never ourselves. */
    fun keyRecipients(identities: List<String>, members: Set<MemberDevice>, ownIdentity: String): Map<String, List<String>> {
        val allowed = members.map { it.identity }.toSet()
        return recipients(identities.filter { it in allowed && it != ownIdentity })
    }

    /**
     * Whether a received key may be used: it came Olm-encrypted, from the device it says it is
     * for, and that device is in the call. Keys of devices whose membership has not arrived yet
     * wait (see [CallSession]); keys for anyone else are dropped.
     */
    fun keyIsFromMember(key: ReceivedKey, senderDeviceId: String?, members: Set<MemberDevice>): Boolean {
        val (user, device) = split(key.participantId) ?: return false
        if (senderDeviceId != null && senderDeviceId != device) return false
        return MemberDevice(user, device) in members
    }

    /** The next index of our own key: rotating keeps the old one usable for frames in flight. */
    fun nextKeyIndex(index: Int): Int = (index + 1) % KEY_RING_SIZE

    const val KEY_RING_SIZE = 256

    /** Element Call waits this long before sending with a new key, so everybody has it first. */
    const val USE_NEW_KEY_DELAY_MS = 5_000L

    /** Several people leaving at once rotate the key once. */
    const val ROTATE_DEBOUNCE_MS = 1_000L

    /** How the call is protected, for the badge in the call screen. */
    sealed interface Protection {
        /** The room is not encrypted, so the call is not either (like Element Call). */
        data object NotEncrypted : Protection
        /** Everyone in the call sent their key. */
        data object Encrypted : Protection
        /** Waiting for the keys of these people; their audio and video stay silent until then. */
        data class WaitingForKeys(val userIds: List<String>) : Protection
    }

    fun protection(encrypted: Boolean, remoteIdentities: List<String>, keyed: Set<String>): Protection {
        if (!encrypted) return Protection.NotEncrypted
        val missing = remoteIdentities.filter { it !in keyed }.mapNotNull { split(it)?.first }.distinct()
        return if (missing.isEmpty()) Protection.Encrypted else Protection.WaitingForKeys(missing)
    }

    /** Devices to send our key to, from LiveKit identities. */
    fun recipients(identities: List<String>): Map<String, List<String>> {
        val result = linkedMapOf<String, MutableList<String>>()
        for (identity in identities) {
            val (user, device) = split(identity) ?: continue
            result.getOrPut(user) { mutableListOf() } += device
        }
        return result
    }
}
