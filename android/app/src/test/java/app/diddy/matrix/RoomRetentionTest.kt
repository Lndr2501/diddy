package app.diddy.matrix

import app.diddy.util.Json
import app.diddy.util.arr
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.str
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/** #245: the cases shared with desktop and iOS (docs/fixtures/retention.json). */
class RoomRetentionTest {
    private val file = File("../../docs/fixtures/retention.json")
    private val fixtures by lazy { Json.obj(file.readText())!! }

    @Test fun readsTheLifetimeLikeDesktopAndIos() {
        assumeTrue("docs/fixtures is outside the checkout", file.exists())
        for (case in fixtures["lifetime"].arr()!!) {
            val item = case.obj()!!
            assertEquals(item.toString(), item["lifetime"].long(), RoomRetention.lifetime(item["content"].obj()))
        }
    }

    @Test fun aMessageExpiresExactlyAtTheLifetime() {
        assumeTrue(file.exists())
        for (case in fixtures["expired"].arr()!!) {
            val item = case.obj()!!
            assertEquals(item.toString(), item["expired"], RoomRetention.isExpired(item["ts"].long()!!, item["lifetime"].long(), item["now"].long()!!))
        }
    }

    @Test fun labelsUseWholeDaysOrHours() {
        assumeTrue(file.exists())
        for (case in fixtures["label"].arr()!!) {
            val item = case.obj()!!
            val (unit, count) = RoomRetention.label(item["lifetime"].long()!!)
            assertEquals(item.toString(), item["unit"].str(), unit.raw)
            assertEquals(item.toString(), item["count"].long(), count)
        }
        assertEquals(fixtures["choices"].arr()!!.map { it.long() }, RoomRetention.choices)
    }

    @Test fun offIsAnEmptyContentAndTextsAreEnglish() {
        assertEquals(emptyMap<String, Any?>(), RoomRetention.content(null))
        assertEquals(86_400_000L, RoomRetention.lifetime(RoomRetention.content(86_400_000L)))
        assertEquals(null, RoomRetention.lifetime(mapOf("max_lifetime" to true)))
        assertEquals("1 hour", RoomRetention.duration(3_600_000L))
        assertEquals("7 days", RoomRetention.duration(604_800_000L))
    }
}
