package app.diddy.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UnifiedPushLogicTest {
    @Test fun gatewayAndPayload() {
        assertEquals("https://ntfy.sh/_matrix/push/v1/notify", UnifiedPushLogic.gatewayCandidate("https://ntfy.sh/upAbC123?up=1"))
        assertEquals("https://push.me:8443/_matrix/push/v1/notify", UnifiedPushLogic.gatewayCandidate("https://push.me:8443/x"))
        assertNull(UnifiedPushLogic.gatewayCandidate("http://insecure/x"))
        assertTrue(UnifiedPushLogic.isMatrixGateway(mapOf("unifiedpush" to mapOf("gateway" to "matrix"))))
        assertFalse(UnifiedPushLogic.isMatrixGateway(mapOf("ok" to true)))
        assertEquals("!r:x" to "\$e", UnifiedPushLogic.parse("""{"notification":{"room_id":"!r:x","event_id":"${'$'}e","counts":{"unread":1}}}""".toByteArray()))
        assertNull(UnifiedPushLogic.parse("{}".toByteArray()))
        @Suppress("UNCHECKED_CAST") val data = UnifiedPushLogic.pusherBody("https://e", "https://g", "Pixel")["data"] as Map<String, Any?>
        assertEquals("event_id_only", data["format"])
    }
}
