package app.diddy.call

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchTogetherLogicTest {
    @Test fun youtubeLinks() {
        assertEquals("dQw4w9WgXcQ" to 43.0, WatchYouTube.parseUrl("https://youtu.be/dQw4w9WgXcQ?t=43"))
        assertEquals("dQw4w9WgXcQ" to 90.0, WatchYouTube.parseUrl("www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"))
        assertEquals("dQw4w9WgXcQ" to 0.0, WatchYouTube.parseUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ" to 0.0, WatchYouTube.parseUrl("dQw4w9WgXcQ"))
        assertNull(WatchYouTube.parseUrl("https://vimeo.com/123"))
        assertTrue(WatchYouTube.embedUrl("dQw4w9WgXcQ", WatchYouTube.EMBED_ORIGIN, 12.7)!!.contains("start=12"))
    }

    @Test fun protocolRoundTrip() {
        val shared = SharedWatch("ABCDEFGH12345678", "dQw4w9WgXcQ", WatchPlayback.PLAYING, 10.0, 1.0, 1000.0, 3, "@a:x")
        val content = WatchProtocol.stateContent("!r:x", shared)
        val parsed = WatchProtocol.parse(content) as WatchMessage.State
        assertEquals(3L, parsed.state.seq)
        assertEquals(WatchMessage.Request("!r:x"), WatchProtocol.parse(WatchProtocol.requestContent("!r:x")))
        assertNull(WatchProtocol.parse(content + ("rate" to 5.0)))
        assertEquals(15.0, WatchProtocol.expectedPosition(shared, 6000.0), 0.001)
        val next = WatchProtocol.nextChange(shared, WatchPatch(state = WatchPlayback.PAUSED), "@b:x", 6000.0)
        assertEquals(4L, next.seq)
        assertTrue(WatchProtocol.isNewer(next, shared))
        assertEquals(mapOf("@b:x" to listOf("D")), WatchProtocol.recipients(listOf(WatchDevice("@a:x", "A"), WatchDevice("@b:x", "D"), WatchDevice("@b:x", "D")), "@a:x"))
    }

    @Test fun controllerSeeksAndSkips() {
        val controller = WatchController()
        val shared = SharedWatch("ABCDEFGH12345678", "dQw4w9WgXcQ", WatchPlayback.PLAYING, 30.0, 1.0, 0.0, 1, "@a:x")
        controller.setShared(shared)
        val far = controller.tick(WatchPlayerSample(5.0, WatchPlayerState.PLAYING, 1.0, 600.0, 0.0), 0.0)
        assertEquals(listOf<WatchPlayerCommand>(WatchPlayerCommand.Seek(30.0)), far.commands)
        val segments = listOf(WatchSkipSegment(40.0, 60.0, "sponsor", "u1"))
        val skip = controller.tick(WatchPlayerSample(41.0, WatchPlayerState.PLAYING, 1.0, 600.0, 11_000.0), 11_000.0, segments)
        assertEquals(WatchSkipSegment(40.0, 60.0, "sponsor", "u1"), skip.skipped)
        val body = listOf(mapOf("videoID" to "dQw4w9WgXcQ", "segments" to listOf(mapOf("category" to "sponsor", "segment" to listOf(5.0, 20.0), "UUID" to "x"))))
        assertEquals(1, WatchSponsorBlock.selectSegments(body, "dQw4w9WgXcQ", listOf("sponsor")).size)
        assertEquals(4, WatchSponsorBlock.hashPrefix("dQw4w9WgXcQ").length)
        assertEquals(WatchPrefs(volume = 40, categories = listOf("intro")), WatchPrefs.decode(WatchPrefs(volume = 40, categories = listOf("intro", "bogus")).encode()))
    }
}
