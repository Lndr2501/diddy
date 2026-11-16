package app.diddy.call

import app.diddy.util.Json
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CallLogicTest {
    @Test fun identitiesSplitAtTheLastColon() {
        assertEquals("@a:matrix.org" to "DEVICE", CallLogic.split("@a:matrix.org:DEVICE"))
        assertEquals("@a:host:8448" to "DEV", CallLogic.split("@a:host:8448:DEV"))
        assertNull(CallLogic.split("someone"))
        assertNull(CallLogic.split("@a:"))
        assertEquals(mapOf("@a:x" to listOf("D1", "D2"), "@b:x" to listOf("E")), CallLogic.recipients(listOf("@a:x:D1", "@b:x:E", "@a:x:D2", "junk")))
    }

    @Test fun oldestLiveMembershipPicksTheServer() {
        val now = 10_000_000L
        fun member(key: String, created: Long, url: String, expires: Long = CallLogic.MEMBERSHIP_EXPIRY_MS) = CallLogic.MemberEvent(
            key,
            mapOf("application" to "m.call", "created_ts" to created, "expires" to expires,
                "foci_preferred" to listOf(mapOf("type" to "livekit", "livekit_service_url" to url, "livekit_alias" to "!r:x"))),
        )
        val events = listOf(
            member("_@b:x_B_m.call", now - 5000, "https://new"),
            member("_@c:x_C_m.call", now - 9000, "https://old"),
            member("_@d:x_D_m.call", now - 900_000_000, "https://expired", expires = 1000),
            member("_@me:x_M_m.call", now - 99_000, "https://mine"),
            CallLogic.MemberEvent("_@e:x_E_m.call", emptyMap()),
        )
        assertEquals(CallLogic.Transport("https://old", "!r:x"), CallLogic.oldestTransport(events, "_@me:x_M_m.call", "!r:x", now))
        assertNull(CallLogic.oldestTransport(emptyList(), "k", "!r:x", now))
    }

    @Test fun membershipKeepsTheJoinTimeOnRefresh() {
        val transport = CallLogic.Transport("https://lk", "!r:x")
        val first = CallLogic.membershipContent("@a:x", "D", transport, 1000, null)
        assertNull(first["created_ts"])
        assertEquals(CallLogic.MEMBERSHIP_EXPIRY_MS, first["expires"])
        val later = CallLogic.membershipContent("@a:x", "D", transport, 6000, 1000)
        assertEquals(1000L, later["created_ts"])
        assertEquals(5000 + CallLogic.MEMBERSHIP_EXPIRY_MS, later["expires"])
        assertEquals("@a:x:D", later["membershipID"])
        assertEquals("_@a:x_D_m.call", CallLogic.stateKey("@a:x", "D"))
    }

    @Test fun keysRoundTrip() {
        val key = ByteArray(16) { it.toByte() }
        val content = CallLogic.keysContent("!r:x", "@a:x", "D", key, 0, 5)
        val parsed = CallLogic.parseKeys(Json.encode(content), "@a:x", "!r:x")!!
        assertEquals("@a:x:D", parsed.participantId)
        assertArrayEquals(key, parsed.key)
        assertNull(CallLogic.parseKeys(Json.encode(content), "@a:x", "!other:x"))
        assertArrayEquals(byteArrayOf(-5, -1), CallLogic.decodeBase64("-_8"))
    }

    @Test fun onePerPersonMergesDevices() {
        val phone = CallMember("@a:x:P", "@a:x", "A", null, isLocal = false, isSpeaking = false, microphoneOn = false)
        val desk = CallMember("@a:x:D", "@a:x", "A", null, isLocal = false, isSpeaking = true, microphoneOn = true)
        val other = CallMember("@b:x:B", "@b:x", "B", null, isLocal = false, isSpeaking = false, microphoneOn = true)
        val merged = CallSession.onePerPerson(listOf(phone, other, desk))
        assertEquals(listOf("@a:x", "@b:x"), merged.map { it.userId })
        assertEquals(true, merged[0].isSpeaking)
        assertEquals(true, merged[0].microphoneOn)
    }
}
