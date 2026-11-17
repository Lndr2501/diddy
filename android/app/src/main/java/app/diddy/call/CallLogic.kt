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

    /** One `call.member` state event: its state key, content and when the server got it. */
    data class MemberEvent(val stateKey: String, val content: Map<String, Any?>, val originTs: Long? = null)

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

    data class ReceivedKey(val participantId: String, val key: ByteArray, val index: Int, val memberId: String?)

    /** A key someone sent us for this room, mapped to their LiveKit identity like Element Call does. */
    fun parseKeys(json: String, senderId: String, roomId: String): ReceivedKey? {
        val content = Json.obj(json) ?: return null
        if (content["room_id"].str() != roomId) return null
        val keys = content["keys"].obj() ?: return null
        val key = decodeBase64(keys["key"].str() ?: return null) ?: return null
        if (key.size != 16 && key.size != 32) return null
        val index = keys["index"].long()?.takeIf { it in 0..255 }?.toInt() ?: return null
        val device = content["member"].obj()?.get("claimed_device_id").str() ?: return null
        if (device.isBlank()) return null
        val claimedId = content["member"].obj()?.get("id").str()
        val session = content["session"].obj() ?: return null
        if (session["application"].str() != "m.call" || session["scope"].str() != "m.room" || session["call_id"].str() != "") return null
        return ReceivedKey("$senderId:$device", key, index, claimedId)
    }

    /** Only current Matrix memberships authorize media keys. SFU identities alone never do. */
    fun authorizedDevices(events: List<Map<String, Any?>>, now: Long) = authorizedMemberships(events, now).keys

    fun authorizedMemberships(events: List<Map<String, Any?>>, now: Long): Map<String, String> {
        val joined = events.filter { it["type"] == "m.room.member" && it["content"].obj()?.get("membership") == "join" }
            .mapNotNull { it["state_key"].str() }.toSet()
        return events.filter { it["type"] == MEMBER_EVENT_TYPE }.mapNotNull { event ->
            val sender = event["sender"].str()?.takeIf { it in joined } ?: return@mapNotNull null
            val content = event["content"].obj() ?: return@mapNotNull null
            if (content["application"] != "m.call" || content["scope"] != "m.room" || content["call_id"] != "") return@mapNotNull null
            val device = content["device_id"].str()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val created = content["created_ts"].long() ?: event["origin_server_ts"].long() ?: return@mapNotNull null
            val expires = content["expires"].long()?.takeIf { it > 0 } ?: return@mapNotNull null
            if (created > now + 60_000 || now - created >= expires) return@mapNotNull null
            identity(sender, device) to (content["membershipID"].str() ?: identity(sender, device))
        }.toMap()
    }

    data class KeyPlan(val recipients: Set<String>, val rotate: Boolean)
    fun keyPlan(previousMembers: Set<String>, previousRecipients: Set<String>, members: Set<String>, live: Set<String>): KeyPlan {
        val recipients = members.intersect(live)
        return KeyPlan(recipients, (previousMembers - members).isNotEmpty() || (previousRecipients - recipients).isNotEmpty())
    }

    /** Standard or URL-safe base64, with or without padding. */
    fun decodeBase64(text: String): ByteArray? {
        var padded = text.replace('-', '+').replace('_', '/')
        while (padded.length % 4 != 0) padded += "="
        return runCatching { Base64.getDecoder().decode(padded) }.getOrNull()
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
