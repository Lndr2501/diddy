package app.diddy.call

import app.diddy.util.Json
import app.diddy.util.obj
import org.junit.Assert.*
import org.junit.Test

class SoundboardSyncTest {
    private val a = "/media/sounds/bruh.mp3"
    private val b = "/media/sounds/boom.mp3"
    private val now = 100L * 24 * 60 * 60 * 1000

    @Test fun deletionWinsCrossedWritesAndClockSkewDoesNotPreventReadding() {
        val initial = SoundboardSyncLogic.add(SoundboardSyncLogic.State(), a, "Bruh", now)
        val removed = SoundboardSyncLogic.remove(initial, a, now - 100)
        val crossed = SoundboardSyncLogic.merge(now, initial.json(), removed.json())
        assertTrue(crossed.sounds.isEmpty())
        assertEquals(now + 1, crossed.removed.single().removedTs)
        val again = SoundboardSyncLogic.add(crossed, a, "Bruh", now - 100)
        assertEquals(now + 2, again.sounds.single().addedTs)
        assertTrue(again.removed.isEmpty())
    }

    @Test fun offlineRemovalWithoutUploadedAddIsRetained() {
        val removed = SoundboardSyncLogic.remove(SoundboardSyncLogic.State(), a, now)
        val old = SoundboardSyncLogic.add(SoundboardSyncLogic.State(), a, "Bruh", now - 10)
        assertTrue(SoundboardSyncLogic.merge(now, old.json(), removed.json()).sounds.isEmpty())
        assertEquals(a, removed.removed.single().path)
    }

    @Test fun mergeIsBoundedAndDeterministic() {
        val input = mapOf("sounds" to (0..250).map { mapOf("path" to "/media/sounds/$it.mp3", "name" to "$it", "added_ts" to 10) })
        val state = SoundboardSyncLogic.merge(now, input)
        assertEquals(200, state.sounds.size)
        assertEquals(state, SoundboardSyncLogic.merge(now, state.json(), input))
        assertTrue(SoundboardSyncLogic.merge(now + SoundboardSyncLogic.KEEP_MS + 1,
            SoundboardSyncLogic.remove(SoundboardSyncLogic.State(), b, now).json()).removed.isEmpty())
    }

    @Test fun malformedPathsAndTimestampsNeverTriggerDownloads() {
        for (path in listOf("https://evil/x", "/media/sounds/../x", "/media/sounds/x?y", "/media/sounds/a\\b")) {
            assertTrue(SoundboardSyncLogic.add(SoundboardSyncLogic.State(), path, "x", now).sounds.isEmpty())
        }
        val bad = mapOf("sounds" to listOf(mapOf("path" to a, "name" to "x", "added_ts" to Double.NaN)))
        assertTrue(SoundboardSyncLogic.merge(now, bad).sounds.isEmpty())
    }

    @Test fun sharedDesktopFixtureHasIdenticalWireFormat() {
        val text = javaClass.getResource("/soundboard-sync.json")!!.readText()
        for (raw in Json.arr(text)!!) {
            val fixture = raw.obj()!!
            val contents = (fixture["inputs"] as List<*>).map { it.obj() }.toTypedArray()
            val state = SoundboardSyncLogic.merge((fixture["now"] as Number).toLong(), *contents)
            // Normalize JSON numbers before comparing.
            assertEquals(fixture["name"].toString(), Json.encode(fixture["expected"]), Json.encode(state.json()))
        }
    }
}
