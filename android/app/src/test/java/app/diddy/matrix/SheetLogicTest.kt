package app.diddy.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SheetLogicTest {
    private val levels = PowerLevels(
        mapOf(
            "users" to mapOf("@admin:x" to 100L, "@mod:x" to 50L),
            "users_default" to 0L,
            "kick" to 50L,
            "ban" to 50L,
            "events" to mapOf("m.room.power_levels" to 100L),
        ),
    )

    @Test fun moderatorsKickMembersButNotAdmins() {
        assertTrue(levels.canKick("@mod:x", "@someone:x"))
        assertFalse(levels.canKick("@mod:x", "@admin:x"))
        assertFalse(levels.canKick("@someone:x", "@mod:x"))
        assertFalse(levels.canKick("@admin:x", "@admin:x"))
    }

    @Test fun onlyPowerLevelSendersChangeRoles() {
        assertTrue(levels.canChangeRole("@admin:x", "@mod:x"))
        assertFalse(levels.canChangeRole("@mod:x", "@someone:x"))
        assertEquals(listOf(0L, 50L), PowerLevels(levels.content).assignable("@mod:x"))
    }

    @Test fun creatorsOfNewRoomsAreAboveEveryone() {
        val owned = PowerLevels(levels.content, setOf("@owner:x"))
        assertEquals(Long.MAX_VALUE, owned.user("@owner:x"))
        assertTrue(owned.canBan("@owner:x", "@admin:x"))
        assertFalse(owned.canChangeRole("@admin:x", "@owner:x"))
        assertEquals(setOf("@a:x", "@b:x"), PowerLevels.creators(mapOf("sender" to "@a:x", "content" to mapOf("additional_creators" to listOf("@b:x"))), "12"))
        assertTrue(PowerLevels.creators(mapOf("sender" to "@a:x"), "11").isEmpty())
    }

    @Test fun defaultLevelIsRemovedFromUsers() {
        @Suppress("UNCHECKED_CAST")
        val users = levels.withUser("@mod:x", 0)["users"] as Map<String, Any?>
        assertNull(users["@mod:x"])
    }

    @Test fun quickSwitchPrefixesAndOrder() {
        assertEquals(QuickSwitch.Kind.DIRECTS to "lu", QuickSwitch.parse("@lu"))
        assertEquals(null to "general", QuickSwitch.parse(" general "))
        val items = listOf(
            QuickSwitch.Item("1", "off-topic general", null, QuickSwitch.Kind.ROOMS),
            QuickSwitch.Item("2", "general", null, QuickSwitch.Kind.ROOMS),
            QuickSwitch.Item("3", "random", null, QuickSwitch.Kind.ROOMS),
        )
        assertEquals(listOf("2", "1"), QuickSwitch.search("gen", items).map { it.id })
    }

    @Test fun pushRuleLevels() {
        assertEquals(NotificationLevel.LOUD, PushRuleLogic.level(listOf("notify", mapOf("set_tweak" to "sound", "value" to "default"))))
        assertEquals(NotificationLevel.SILENT, PushRuleLogic.level(listOf("notify")))
        assertEquals(NotificationLevel.OFF, PushRuleLogic.level(emptyList<Any>()))
        assertEquals(3, PushRuleLogic.actions(NotificationLevel.LOUD, true).size)
        val rules = mapOf("global" to mapOf("underride" to listOf(mapOf("rule_id" to ".m.rule.message", "actions" to listOf("notify")))))
        assertEquals("underride" to NotificationLevel.SILENT, PushRuleLogic.resolve(PushRuleLogic.allMessages[2].spec, rules))
        assertEquals("override" to NotificationLevel.SILENT, PushRuleLogic.resolve(PushRuleLogic.mentions[3].spec, rules))
        assertEquals("/_matrix/client/v3/pushrules/global/content/a%20b%C3%A4", PushRuleLogic.path("content", "a bä"))
    }

    @Test fun emailPusherState() {
        val state = PushRuleLogic.emailState(
            listOf(mapOf("medium" to "email", "address" to "a@x"), mapOf("medium" to "email", "address" to "b@x")),
            listOf(mapOf("app_id" to "m.email", "pushkey" to "b@x")),
        )
        assertEquals(PushRuleLogic.EmailState("b@x", true), state)
        assertEquals(PushRuleLogic.EmailState(null, false), PushRuleLogic.emailState(emptyList(), emptyList()))
    }

    @Test fun uiaPasswordOnly() {
        val challenge = UiaChallenge.parse(mapOf("session" to "s", "flows" to listOf(mapOf("stages" to listOf("m.login.password")))))!!
        assertTrue(challenge.acceptsPassword)
        val email = UiaChallenge.parse(mapOf("flows" to listOf(mapOf("stages" to listOf("m.login.email.identity")))))!!
        assertFalse(email.acceptsPassword)
    }
}
