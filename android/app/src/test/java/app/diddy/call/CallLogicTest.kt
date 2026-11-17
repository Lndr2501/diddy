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
        // Without created_ts the server time counts, so an old Element Call member wins.
        val ec = CallLogic.MemberEvent("_@ec:x_E_m.call", mapOf("application" to "m.call",
            "foci_preferred" to listOf(mapOf("type" to "livekit", "livekit_service_url" to "https://ec"))), originTs = now - 50_000)
        assertEquals("https://ec", CallLogic.oldestTransport(events + ec, "_@me:x_M_m.call", "!r:x", now)?.serviceUrl)
        val dead = ec.copy(originTs = now - CallLogic.MEMBERSHIP_EXPIRY_MS - 1)
        assertEquals("https://old", CallLogic.oldestTransport(events + dead, "_@me:x_M_m.call", "!r:x", now)?.serviceUrl)
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

    @Test fun lateRingsDoNotRing() {
        assertEquals(true, CallLogic.ringIsLive(true, 2000, 0, 1000))
        assertEquals(false, CallLogic.ringIsLive(true, 2000, 0, 2000))
        assertEquals(false, CallLogic.ringIsLive(false, 2000, 0, 1000))
        // No expiry: sent time plus the ring lifetime.
        assertEquals(true, CallLogic.ringIsLive(true, 0, 1000, 1000 + CallLogic.RING_LIFETIME_MS - 1))
        assertEquals(false, CallLogic.ringIsLive(true, 0, 1000, 1000 + CallLogic.RING_LIFETIME_MS))
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

class ClipMixerTest {
    @org.junit.Test fun monoAndResample() {
        org.junit.Assert.assertArrayEquals(shortArrayOf(15, -5), ClipMixer.toMono(shortArrayOf(10, 20, -10, 0), 2))
        org.junit.Assert.assertEquals(96, ClipMixer.resample(ShortArray(48) { it.toShort() }, 24000, 48000).size)
        org.junit.Assert.assertEquals(10, ClipMixer.resample(ShortArray(10), 48000, 48000).size)
    }
}

class MyInstantsParserTest {
    @org.junit.Test fun inputsAndPages() {
        org.junit.Assert.assertEquals(MyInstantsParser.Target.Search("bruh", 1), MyInstantsParser.parseInput(" bruh "))
        org.junit.Assert.assertEquals(MyInstantsParser.Target.Search("vine boom", 2), MyInstantsParser.parseInput("https://www.myinstants.com/en/search/?name=vine+boom&page=2"))
        org.junit.Assert.assertEquals(MyInstantsParser.Target.Instant("https://www.myinstants.com/en/instant/bruh-123/"), MyInstantsParser.parseInput("https://myinstants.com/en/instant/bruh-123/"))
        org.junit.Assert.assertNull(MyInstantsParser.parseInput("https://evil.com/en/instant/x"))
        val html = """<div class="instant"><button onclick="play('/media/sounds/bruh.mp3', 'x')"></button><a href="/x" class="instant-link link-secondary">Bruh &amp; co</a></div>
            <div class="instant"><button onclick="play('/media/../etc', 'x')"></button><a class="instant-link">bad</a></div>"""
        val page = MyInstantsParser.parseSearch(html)
        org.junit.Assert.assertEquals(listOf(MyInstantsParser.Item("/media/sounds/bruh.mp3", "Bruh & co")), page.items)
        org.junit.Assert.assertEquals("Clip", MyInstantsParser.clipTitle("  "))
        org.junit.Assert.assertEquals("é", MyInstantsParser.decodeEntities("&#xE9;"))
    }
}

class CompanionProtocolTest {
    @org.junit.Test fun requestsAndState() {
        val request = CompanionProtocol.parseRequest("""{"v":1,"request_id":"r1","room_id":"!a:x","device_id":"DESK","camera":true,"room_name":" Lounge "}""")!!
        org.junit.Assert.assertEquals(CompanionProtocol.Request("r1", "!a:x", "Lounge", "DESK", CompanionProtocol.Media(true, false, false)), request)
        org.junit.Assert.assertNull(CompanionProtocol.parseRequest("""{"v":1,"request_id":"r1","room_id":"!a:x","device_id":"DESK"}"""))
        org.junit.Assert.assertNull(CompanionProtocol.parseRequest("""{"v":2,"request_id":"r1","room_id":"!a:x","device_id":"DESK","camera":true}"""))
        org.junit.Assert.assertEquals(CompanionProtocol.Control("r1", false, null, true), CompanionProtocol.parseControl("""{"v":1,"request_id":"r1","microphone":false,"end":true}"""))
        org.junit.Assert.assertTrue(CompanionProtocol.accepts("@me:x", "@me:x", true, "DESK", "PHONE"))
        org.junit.Assert.assertFalse(CompanionProtocol.accepts("@me:x", "@me:x", false, "DESK", "PHONE"))
        org.junit.Assert.assertFalse(CompanionProtocol.accepts("@other:x", "@me:x", true, "DESK", "PHONE"))
        org.junit.Assert.assertTrue(CompanionProtocol.state("r1", "PHONE", true, CompanionProtocol.Media(true, true, false)).contains("\"joined\":true"))
    }
}

