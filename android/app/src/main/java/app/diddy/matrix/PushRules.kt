package app.diddy.matrix

import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str

/**
 * The desktop's notification levels (Settings > Notifications): Sound, Silent or Off per push
 * rule, read from and written to the account's push rules exactly like desktop (ios PushRuleLogic).
 */
enum class NotificationLevel(val raw: String, val shortTitle: String, val title: String) {
    LOUD("NotifyLoud", "Sound", "Notify Loud"),
    SILENT("Notify", "Silent", "Notify Silent"),
    OFF("OFF", "Off", "Disable"),
}

object PushRuleLogic {
    val kinds = listOf("override", "content", "room", "sender", "underride")

    const val ONE_TO_ONE = ".m.rule.room_one_to_one"
    const val ENCRYPTED_ONE_TO_ONE = ".m.rule.encrypted_room_one_to_one"
    const val MESSAGE = ".m.rule.message"
    const val ENCRYPTED = ".m.rule.encrypted"
    const val IS_USER_MENTION = ".m.rule.is_user_mention"
    const val CONTAINS_DISPLAY_NAME = ".m.rule.contains_display_name"
    const val CONTAINS_USER_NAME = ".m.rule.contains_user_name"
    const val IS_ROOM_MENTION = ".m.rule.is_room_mention"
    const val AT_ROOM = ".m.rule.roomnotif"

    data class Rule(val kind: String, val ruleId: String, val level: NotificationLevel, val pattern: String?, val isDefault: Boolean)

    data class Spec(val ruleId: String, val kind: String, val fallback: NotificationLevel, val highlight: Boolean)

    data class Row(val title: String, val spec: Spec)

    val allMessages = listOf(
        Row("1-to-1 Chats", Spec(ONE_TO_ONE, "underride", NotificationLevel.LOUD, false)),
        Row("1-to-1 Chats (Encrypted)", Spec(ENCRYPTED_ONE_TO_ONE, "underride", NotificationLevel.LOUD, false)),
        Row("Rooms", Spec(MESSAGE, "underride", NotificationLevel.LOUD, false)),
        Row("Rooms (Encrypted)", Spec(ENCRYPTED, "underride", NotificationLevel.LOUD, false)),
    )

    val mentions = listOf(
        Row("Mention User ID", Spec(IS_USER_MENTION, "override", NotificationLevel.LOUD, true)),
        Row("Contains Display Name", Spec(CONTAINS_DISPLAY_NAME, "override", NotificationLevel.LOUD, true)),
        Row("Contains Username", Spec(CONTAINS_USER_NAME, "content", NotificationLevel.LOUD, true)),
        Row("Mention @room", Spec(IS_ROOM_MENTION, "override", NotificationLevel.SILENT, true)),
        Row("Contains @room", Spec(AT_ROOM, "override", NotificationLevel.SILENT, true)),
    )

    /** Desktop's `getNotificationMode`: notify plus a sound tweak is Sound, notify alone Silent. */
    fun level(actions: List<*>): NotificationLevel {
        var notify = false
        var sound = false
        for (action in actions) {
            if (action == "notify") notify = true
            if ((action as? Map<*, *>)?.get("set_tweak") == "sound") sound = true
        }
        return when {
            notify && sound -> NotificationLevel.LOUD
            notify -> NotificationLevel.SILENT
            else -> NotificationLevel.OFF
        }
    }

    /** Desktop's `getNotificationModeActions`. */
    fun actions(level: NotificationLevel, highlight: Boolean): List<Any> {
        if (level == NotificationLevel.OFF) return emptyList()
        val actions = mutableListOf<Any>("notify")
        if (level == NotificationLevel.LOUD) actions += mapOf("set_tweak" to "sound", "value" to "default")
        if (highlight) actions += mapOf("set_tweak" to "highlight", "value" to true)
        return actions
    }

    fun find(ruleId: String, rules: Map<String, Any?>): Rule? {
        val global = rules["global"].obj() ?: return null
        for (kind in kinds) {
            val raw = global[kind].objectsLenient().firstOrNull { it["rule_id"].str() == ruleId } ?: continue
            return rule(raw, kind)
        }
        return null
    }

    fun resolve(spec: Spec, rules: Map<String, Any?>): Pair<String, NotificationLevel> =
        find(spec.ruleId, rules)?.let { it.kind to it.level } ?: (spec.kind to spec.fallback)

    fun keywords(rules: Map<String, Any?>): List<Rule> =
        rules["global"].obj()?.get("content").objectsLenient()
            .filter { it["default"] == false && it["pattern"] is String }
            .mapNotNull { rule(it, "content") }

    private fun rule(raw: Map<String, Any?>, kind: String): Rule? {
        val ruleId = raw["rule_id"].str() ?: return null
        return Rule(kind, ruleId, level(raw["actions"] as? List<*> ?: emptyList<Any>()), raw["pattern"].str(), raw["default"] as? Boolean ?: false)
    }

    fun path(kind: String, ruleId: String) = "/_matrix/client/v3/pushrules/global/$kind/${escape(ruleId)}"

    fun escape(value: String): String {
        val out = StringBuilder()
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val c = (byte.toInt() and 0xFF).toChar()
            if (c.isLetterOrDigit() && c.code < 128 || c in "-._~") out.append(c) else out.append("%%%02X".format(byte.toInt() and 0xFF))
        }
        return out.toString()
    }

    fun keywordBody(keyword: String): Map<String, Any?> = mapOf("actions" to actions(NotificationLevel.SILENT, true), "pattern" to keyword)

    data class EmailState(val email: String?, val enabled: Boolean)

    fun emailState(threepids: List<Map<String, Any?>>, pushers: List<Map<String, Any?>>): EmailState {
        val addresses = threepids.filter { it["medium"] == "email" }.mapNotNull { it["address"].str() }
        val first = addresses.firstOrNull() ?: return EmailState(null, false)
        for (pusher in pushers) {
            if (pusher["app_id"] != "m.email") continue
            val key = pusher["pushkey"].str()
            if (!key.isNullOrEmpty() && key in addresses) return EmailState(key, true)
        }
        return EmailState(first, false)
    }

    fun emailPusherBody(email: String, enable: Boolean): Map<String, Any?> =
        if (enable) mapOf(
            "kind" to "email", "app_id" to "m.email", "pushkey" to email, "app_display_name" to "Email Notifications",
            "device_display_name" to email, "lang" to "en", "data" to mapOf("brand" to "Diddy"),
        ) else mapOf("pushkey" to email, "app_id" to "m.email", "kind" to null)
}

suspend fun MatrixAccount.pushRules(): Map<String, Any?> = clientRequest("/_matrix/client/v3/pushrules/", method = "GET")

suspend fun MatrixAccount.setPushRuleActions(kind: String, ruleId: String, actions: List<Any>) {
    clientRequest(PushRuleLogic.path(kind, ruleId) + "/actions", mapOf("actions" to actions), "PUT")
}

suspend fun MatrixAccount.addNotificationKeyword(keyword: String) {
    clientRequest(PushRuleLogic.path("content", keyword), PushRuleLogic.keywordBody(keyword), "PUT")
}

suspend fun MatrixAccount.deletePushRule(kind: String, ruleId: String) {
    clientRequest(PushRuleLogic.path(kind, ruleId), method = "DELETE")
}

suspend fun MatrixAccount.emailNotificationState(): PushRuleLogic.EmailState {
    val threepids = clientRequest("/_matrix/client/v3/account/3pid", method = "GET")["threepids"].objectsLenient()
    val pushers = clientRequest("/_matrix/client/v3/pushers", method = "GET")["pushers"].objectsLenient()
    return PushRuleLogic.emailState(threepids, pushers)
}

suspend fun MatrixAccount.setEmailNotifications(email: String, enabled: Boolean) {
    clientRequest("/_matrix/client/v3/pushers/set", PushRuleLogic.emailPusherBody(email, enabled), "POST")
}
