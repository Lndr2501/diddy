package app.diddy.plugins

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PluginLogicTest {
    @Test fun messagesHaveExactShapes() {
        assertEquals(PluginMessage.Ready(1, "Hi there", 300.0), PluginMessageParser.parse("""{"type":"diddy:ready","apiVersion":1,"manifest":{"description":" Hi  there ","height":300}}"""))
        assertNull(PluginMessageParser.parse("""{"type":"diddy:ready","extra":1}"""))
        assertEquals(PluginMessage.Resize(600.0), PluginMessageParser.parse("""{"type":"diddy:resize","height":9000}"""))
        assertNull(PluginMessageParser.parse("""{"type":"diddy:storage:set","key":"__proto__","value":"x"}"""))
        assertEquals(PluginMessage.StorageSet("notes", "x"), PluginMessageParser.parse("""{"type":"diddy:storage:set","key":"notes","value":"x"}"""))
        assertNull(PluginMessageParser.parse("""{"type":"diddy:open","url":"http://example.com"}"""))
        assertEquals(PluginMessage.Open("https://example.com/a"), PluginMessageParser.parse("""{"type":"diddy:open","url":"https://example.com/a"}"""))
    }

    @Test fun addressesAndRegistry() {
        assertEquals("https://example.com/p.html", PluginAddress.normalize("example.com/p.html"))
        assertTrue(runCatching { PluginAddress.normalize("http://example.com") }.isFailure)
        assertTrue(runCatching { PluginAddress.normalize("https://localhost/x") }.isFailure)
        val one = PluginRegistry.add(emptyList(), "Clock", "https://a.org/p", "id-1", 0.0)
        assertTrue(runCatching { PluginRegistry.add(one, "clock", "https://b.org/p", "id-2", 0.0) }.isFailure)
        val stored = one + UserPlugin("bad id!", "X", "https://c.org", true, 0.0) + UserPlugin("id-3", "Y", "diddy:local/other", true, 0.0)
        assertEquals(listOf("id-1"), PluginRegistry.sanitize(stored).map { it.id })
    }

    @Test fun storageLimits() {
        val full = (1..PluginRules.MAX_STORAGE_KEYS).associate { "k$it" to "v" }
        assertNull(PluginMessageParser.applyStorageSet(full, "new", "v"))
        assertEquals("w", PluginMessageParser.applyStorageSet(full, "k1", "w")!!["k1"])
        assertEquals("Weather", PluginContent.title("<html><title>Weather &amp;</title></html>").removeSuffix(" &"))
        assertTrue(runCatching { PluginContent.validate("just text") }.isFailure)
    }
}
