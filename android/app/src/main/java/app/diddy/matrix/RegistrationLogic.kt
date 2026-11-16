package app.diddy.matrix

import app.diddy.util.Json
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import app.diddy.util.strings
import java.net.URI
import java.net.URLEncoder

/**
 * Creating an account with user name and password (`POST /_matrix/client/v3/register` with
 * user-interactive authentication). Pure logic (ios RegistrationLogic.swift).
 */
object RegistrationLogic {
    const val DUMMY = "m.login.dummy"
    const val TOKEN = "m.login.registration_token"
    const val TOKEN_UNSTABLE = "org.matrix.msc3231.login.registration_token"
    const val TERMS = "m.login.terms"
    const val EMAIL = "m.login.email.identity"
    const val RECAPTCHA = "m.login.recaptcha"

    data class Policy(val id: String, val name: String, val url: String)

    data class Challenge(
        val session: String?,
        val flows: List<List<String>>,
        val completed: List<String>,
        val policies: List<Policy>,
        val errcode: String?,
        val error: String?,
    )

    /** Reads a 401 answer of /register. Null when it is no user-interactive challenge. */
    fun parseChallenge(text: String, language: String = "en"): Challenge? {
        val json = Json.obj(text) ?: return null
        val rawFlows = json["flows"] as? List<*> ?: return null
        val flows = rawFlows.mapNotNull { it.obj()?.get("stages").strings() }
        val params = json["params"].obj() ?: emptyMap()
        return Challenge(
            session = json["session"].str(),
            flows = flows,
            completed = json["completed"].strings() ?: emptyList(),
            policies = policies(params, language),
            errcode = json["errcode"].str(),
            error = json["error"].str(),
        )
    }

    /** The flow to follow: without email when allowed, then the one with the fewest steps. */
    fun pickFlow(flows: List<List<String>>): List<String>? =
        flows.withIndex().minWithOrNull { a, b ->
            val aMail = EMAIL in a.value
            val bMail = EMAIL in b.value
            when {
                aMail != bMail -> if (!aMail) -1 else 1
                a.value.size != b.value.size -> a.value.size.compareTo(b.value.size)
                else -> a.index.compareTo(b.index)
            }
        }?.value

    fun nextStage(flow: List<String>, completed: List<String>): String? = flow.firstOrNull { it !in completed }

    fun isNative(stage: String): Boolean = stage in listOf(DUMMY, TOKEN, TOKEN_UNSTABLE, TERMS, EMAIL)

    /** `params["m.login.terms"].policies`: `{ id: { version, en: { name, url }, de: { … } } }`. */
    fun policies(params: Map<String, Any?>, language: String): List<Policy> {
        val all = params[TERMS].obj()?.get("policies").obj() ?: return emptyList()
        return all.keys.sorted().mapNotNull { id ->
            val policy = all[id].obj() ?: return@mapNotNull null
            val translations = policy.mapNotNull { (k, v) -> v.obj()?.let { k to it } }.toMap()
            val chosen = translations[language] ?: translations["en"] ?: translations.keys.sorted().firstOrNull()?.let { translations[it] }
                ?: return@mapNotNull null
            val link = chosen["url"].str() ?: return@mapNotNull null
            val scheme = try { URI(link).scheme } catch (_: Exception) { null }
            if (scheme != "https" && scheme != "http") return@mapNotNull null
            val name = chosen["name"].str()?.ifEmpty { null } ?: id
            Policy(id, name, link)
        }
    }

    /** The server's page for one step of a session (Matrix spec: fallback of user-interactive auth). */
    fun fallbackUrl(homeserver: String, stage: String, session: String): String {
        val base = homeserver.trimEnd('/')
        val step = URLEncoder.encode(stage, "UTF-8").replace("+", "%20")
        return "$base/_matrix/client/v3/auth/$step/fallback/web?session=" + URLEncoder.encode(session, "UTF-8")
    }

    /** "@bob:server" or "Bob": the server only takes the local part, in lowercase. */
    fun localpart(input: String): String {
        var name = input.trim()
        if (name.startsWith("@")) name = name.drop(1)
        val colon = name.indexOf(':')
        if (colon >= 0) name = name.substring(0, colon)
        return name.lowercase()
    }

    /** Null when the server could accept the name (spec: a-z, 0-9, and . _ = - /). */
    fun usernameProblem(localpart: String): String? {
        if (localpart.isEmpty()) return "Choose a username."
        val allowed = "abcdefghijklmnopqrstuvwxyz0123456789._=-/"
        if (!localpart.all { it in allowed }) return "Use only letters, numbers and . _ = - /"
        return null
    }

    fun registerBody(username: String, password: String, deviceName: String, auth: Map<String, Any?>?): Map<String, Any?> {
        val body = linkedMapOf<String, Any?>(
            "username" to username,
            "password" to password,
            "initial_device_display_name" to deviceName,
            // The app signs in through the SDK afterwards, which sets up encryption and the store.
            "inhibit_login" to true,
        )
        if (auth != null) body["auth"] = auth
        return body
    }

    fun message(errcode: String?, error: String?): String = when (errcode) {
        "M_USER_IN_USE" -> "This username is already taken."
        "M_INVALID_USERNAME" -> "This username is not allowed. Use only letters, numbers and . _ = - /"
        "M_EXCLUSIVE" -> "This username is reserved."
        "M_WEAK_PASSWORD" -> error?.let { "Choose a stronger password: $it" } ?: "Choose a stronger password."
        "M_PASSWORD_TOO_SHORT" -> "Choose a longer password."
        "M_FORBIDDEN" -> error ?: "This server does not accept new accounts. Try another server."
        "M_LIMIT_EXCEEDED" -> "Too many attempts. Wait a moment, then try again."
        "M_THREEPID_IN_USE" -> "This email address already belongs to an account."
        "M_THREEPID_DENIED" -> "This server does not accept this email address."
        else -> error ?: "The server could not create the account."
    }
}
