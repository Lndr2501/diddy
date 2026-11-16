package app.diddy.matrix

import app.diddy.util.Json
import app.diddy.util.arr
import app.diddy.util.obj
import app.diddy.util.str
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * The bot card cases shared with the desktop app (docs/fixtures/bot-cards.json): every client
 * reads each case the same way. cinny/tests/botCardFixtures.test.cjs checks the desktop side.
 */
class BotCardFixturesTest {
    private val file = File("../../docs/fixtures/bot-cards.json")

    /** The fields a fixture can check, read from this parser's result (same names as the desktop). */
    private fun summary(card: BotCard?, expect: Map<String, Any?>): Map<String, Any?>? {
        if (card == null) return null
        val fields: Map<String, Any?> = when (card) {
            is BotCard.Track -> mapOf("kind" to "track", "state" to card.track.state.raw, "title" to card.track.title, "actions" to card.track.actions.size)
            is BotCard.Queue -> mapOf("kind" to "queue", "items" to card.items.size, "total" to card.total, "actions" to card.actions.size)
            is BotCard.Help -> mapOf("kind" to "help", "groups" to card.groups.size)
            is BotCard.ListCard -> mapOf("kind" to "list", "title" to card.title, "items" to card.items.size, "actions" to card.actions.size)
            is BotCard.Stats -> mapOf("kind" to "stats", "title" to card.title, "charts" to card.charts.size, "actions" to card.actions.size)
            is BotCard.Note -> mapOf("kind" to "note", "text" to card.text, "tone" to card.tone.raw)
        }
        return expect.keys.associateWith { fields[it] }
    }

    /** JSON numbers come back as Int or Long; the fixtures only use whole numbers. */
    private fun normalized(map: Map<String, Any?>?): Map<String, Any?>? = map?.mapValues { (_, v) -> if (v is Number) v.toLong() else v }

    @Test fun everySharedCaseReadsLikeOnTheDesktop() {
        assumeTrue("docs/fixtures is outside the checkout", file.exists())
        val cases = Json.obj(file.readText())?.get("cases").arr() ?: emptyList()
        assert(cases.size >= 10)
        for (raw in cases) {
            val case = raw.obj() ?: continue
            val name = case["name"].str()
            val content = case["content"].obj()
            val expect = case["expect"].obj()
            val event = Json.encode(mapOf("content" to content))
            val actual = summary(BotCardParser.card(event, null), expect ?: emptyMap())
            assertEquals(name, normalized(expect), normalized(actual))
        }
    }
}
