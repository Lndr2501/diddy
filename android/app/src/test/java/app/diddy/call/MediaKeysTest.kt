package app.diddy.call

import app.diddy.util.Json
import org.junit.Assert.*
import org.junit.Test

class MediaKeysTest {
    private fun member(device: String = "D", created: Long = 9000, expires: Long = 1000) = mapOf(
        "type" to CallLogic.MEMBER_EVENT_TYPE, "sender" to "@a:x", "state_key" to CallLogic.stateKey("@a:x", device),
        "origin_server_ts" to created,
        "content" to mapOf("application" to "m.call", "scope" to "m.room", "call_id" to "", "device_id" to device, "expires" to expires),
    )
    private val joined = mapOf("type" to "m.room.member", "state_key" to "@a:x", "content" to mapOf("membership" to "join"))

    @Test fun onlyJoinedUnexpiredMatrixDevicesAreAuthorized() {
        assertEquals(setOf("@a:x:D"), CallLogic.authorizedDevices(listOf(joined, member()), 9500))
        assertTrue(CallLogic.authorizedDevices(listOf(member()), 9500).isEmpty())
        assertTrue(CallLogic.authorizedDevices(listOf(joined, member()), 10000).isEmpty())
        assertTrue(CallLogic.authorizedDevices(listOf(joined, member(created = 1000000)), 9500).isEmpty())
        assertTrue(CallLogic.authorizedDevices(listOf(joined, member(expires = -1)), 9500).isEmpty())
    }

    @Test fun mediaKeysRejectInvalidIndicesSizesAndClaimedIdentity() {
        val valid = CallLogic.keysContent("!r:x", "@a:x", "D", ByteArray(16), 255, 1)
        assertNotNull(CallLogic.parseKeys(Json.encode(valid), "@a:x", "!r:x"))
        val other = CallLogic.parseKeys(Json.encode(valid), "@b:x", "!r:x")!!
        // The authenticated sender defines the identity; the claimed member ID is validated
        // against its current Matrix membership before installation (Element uses random IDs).
        assertEquals("@b:x:D", other.participantId)
        assertNotEquals(other.participantId, other.memberId)
        assertNull(CallLogic.parseKeys(Json.encode(valid + ("keys" to mapOf("index" to 256, "key" to java.util.Base64.getEncoder().encodeToString(ByteArray(16))))), "@a:x", "!r:x"))
        assertNull(CallLogic.parseKeys(Json.encode(valid + ("keys" to mapOf("index" to 0, "key" to "eA=="))), "@a:x", "!r:x"))
        assertNull(CallLogic.parseKeys(Json.encode(valid + ("session" to mapOf("application" to "other"))), "@a:x", "!r:x"))
    }

    @Test fun leavingMatrixRotatesEvenWhenTheSfuStillListsTheDevice() {
        val before = setOf("@a:x:D", "@b:x:E")
        val plan = CallLogic.keyPlan(before, before, setOf("@a:x:D"), before)
        assertTrue(plan.rotate)
        assertEquals(setOf("@a:x:D"), plan.recipients)
    }

    @Test fun joiningSfuWithoutAMatrixMembershipNeverReceivesKeys() {
        val allowed = setOf("@a:x:D")
        val plan = CallLogic.keyPlan(allowed, allowed, allowed, allowed + "@evil:x:E")
        assertFalse(plan.rotate)
        assertEquals(allowed, plan.recipients)
        assertTrue(CallLogic.keyPlan(allowed, allowed, allowed, emptySet()).rotate)
    }
}
