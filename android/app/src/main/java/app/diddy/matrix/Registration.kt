package app.diddy.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.util.Http
import app.diddy.util.str
import java.net.URLEncoder
import java.util.Locale
import java.util.UUID

/**
 * Creates an account with user name and password on a server without its own sign-in page
 * (ios Registration.swift). Runs the steps the server asks for: dummy and terms right away or
 * after a tap, a registration token or an email link through the login screen, anything else
 * (reCAPTCHA) on the server's own page. When `step` is `Done`, the login screen signs in.
 */
class Registration {
    sealed class Step {
        data object Form : Step()
        data object Token : Step()
        data class Terms(val policies: List<RegistrationLogic.Policy>) : Step()
        data object Email : Step()
        data class WaitingForEmail(val address: String) : Step()
        data class Web(val url: String) : Step()
        /** The account exists; `userId` is what the server answered (null: build it from the name). */
        data class Done(val userId: String?) : Step()
    }

    sealed class Availability {
        data object Free : Availability()
        data class Problem(val text: String) : Availability()
    }

    var step by mutableStateOf<Step>(Step.Form)
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
    var availability by mutableStateOf<Availability?>(null)
        private set

    private var homeserver: String? = null
    private var username = ""
    private var password = ""
    private var deviceName = "Diddy"
    private var session: String? = null
    private var flow: List<String> = emptyList()
    private var completed: List<String> = emptyList()
    private var pendingToken: String? = null
    private var emailAddress: String? = null
    private var emailSid: String? = null
    private var latestCheck = ""
    private val clientSecret = UUID.randomUUID().toString().replace("-", "")

    fun reset(homeserver: String?) {
        this.homeserver = homeserver?.trimEnd('/')
        step = Step.Form
        busy = false
        error = null
        availability = null
        session = null
        flow = emptyList()
        completed = emptyList()
        pendingToken = null
        emailAddress = null
        emailSid = null
    }

    /** Asks the server whether the name is free. Call it shortly after typing stops. */
    suspend fun checkAvailability(input: String) {
        val name = RegistrationLogic.localpart(input)
        latestCheck = name
        if (name.isEmpty()) { availability = null; return }
        RegistrationLogic.usernameProblem(name)?.let { availability = Availability.Problem(it); return }
        val homeserver = homeserver ?: return
        val answer = try {
            Http.request("$homeserver/_matrix/client/v3/register/available?username=" + URLEncoder.encode(name, "UTF-8"))
        } catch (_: Exception) {
            availability = null
            return
        }
        // The answer of an older input must not replace that of the current one.
        if (latestCheck != name) return
        if (answer.status == 200) {
            availability = Availability.Free
        } else {
            val json = answer.json
            val code = json?.get("errcode").str()
            availability = if (code in listOf("M_USER_IN_USE", "M_INVALID_USERNAME", "M_EXCLUSIVE")) {
                Availability.Problem(RegistrationLogic.message(code, json?.get("error").str()))
            } else null
        }
    }

    suspend fun start(usernameInput: String, password: String, deviceName: String) {
        val name = RegistrationLogic.localpart(usernameInput)
        RegistrationLogic.usernameProblem(name)?.let { error = it; return }
        if (password.isEmpty()) { error = "Choose a password."; return }
        username = name
        this.password = password
        this.deviceName = deviceName
        session = null
        flow = emptyList()
        completed = emptyList()
        send(null)
    }

    suspend fun submitToken(token: String) {
        val trimmed = token.trim()
        if (trimmed.isEmpty()) { error = "Enter the registration token."; return }
        pendingToken = trimmed
        advance()
    }

    suspend fun acceptTerms() = send(mapOf("type" to RegistrationLogic.TERMS))

    suspend fun sendEmail(address: String) {
        val trimmed = address.trim()
        val homeserver = homeserver
        if (!trimmed.contains("@") || homeserver == null) { error = "Enter your email address."; return }
        error = null
        busy = true
        try {
            val body = mapOf("client_secret" to clientSecret, "email" to trimmed, "send_attempt" to System.currentTimeMillis() / 1000)
            val answer = post(homeserver, "/_matrix/client/v3/register/email/requestToken", body) ?: return
            val json = answer.json
            val sid = json?.get("sid").str()
            if (answer.status != 200 || sid == null) {
                error = RegistrationLogic.message(json?.get("errcode").str(), json?.get("error").str())
                return
            }
            emailAddress = trimmed
            emailSid = sid
            step = Step.WaitingForEmail(trimmed)
        } finally {
            busy = false
        }
    }

    suspend fun confirmEmail() {
        val sid = emailSid ?: run { step = Step.Email; return }
        val creds = mapOf("sid" to sid, "client_secret" to clientSecret)
        send(mapOf("type" to RegistrationLogic.EMAIL, "threepid_creds" to creds, "threepidCreds" to creds))
    }

    /** The server's page was completed (or closed): asks the server whether that step is done. */
    suspend fun fallbackDone() = send(emptyMap())

    private suspend fun send(auth: Map<String, Any?>?) {
        val homeserver = homeserver ?: run { error = "Choose a server first."; return }
        error = null
        busy = true
        try {
            var authDict = auth
            if (authDict != null && session != null) authDict = authDict + ("session" to session)
            val body = RegistrationLogic.registerBody(username, password, deviceName, authDict)
            val answer = post(homeserver, "/_matrix/client/v3/register", body) ?: return
            val json = answer.json
            if (answer.status == 200) {
                step = Step.Done(json?.get("user_id").str())
                return
            }
            val challenge = if (answer.status == 401) RegistrationLogic.parseChallenge(answer.text, language) else null
            if (challenge != null) {
                session = challenge.session ?: session
                if (flow.isEmpty() || flow !in challenge.flows) {
                    val picked = RegistrationLogic.pickFlow(challenge.flows)
                    if (picked == null) {
                        error = "This server does not offer a way to create an account here."
                        step = Step.Form
                        return
                    }
                    flow = picked
                }
                completed = challenge.completed
                if (auth != null && challenge.errcode != null) {
                    error = stageError(challenge.errcode, challenge.error, step)
                }
                busy = false
                advance(challenge.policies, retry = auth != null && challenge.errcode == null)
                return
            }
            error = RegistrationLogic.message(json?.get("errcode").str(), json?.get("error").str())
            step = Step.Form
        } finally {
            busy = false
        }
    }

    private suspend fun advance(policies: List<RegistrationLogic.Policy> = emptyList(), retry: Boolean = false) {
        val next = RegistrationLogic.nextStage(flow, completed)
        if (next == null) {
            if (!retry) send(emptyMap()) else {
                error = "The server did not finish the registration. Try again."
                step = Step.Form
            }
            return
        }
        when (next) {
            RegistrationLogic.DUMMY -> send(mapOf("type" to next))
            RegistrationLogic.TOKEN, RegistrationLogic.TOKEN_UNSTABLE -> {
                val token = pendingToken
                if (token != null) {
                    pendingToken = null
                    send(mapOf("type" to next, "token" to token))
                } else step = Step.Token
            }
            RegistrationLogic.TERMS -> {
                val current = step
                step = if (current is Step.Terms && policies.isEmpty()) current else Step.Terms(policies)
            }
            RegistrationLogic.EMAIL -> {
                val address = emailAddress
                step = if (address != null && emailSid != null) Step.WaitingForEmail(address) else Step.Email
            }
            else -> {
                val homeserver = homeserver
                val session = session
                if (homeserver == null || session == null) {
                    error = "The server asked for a step Diddy cannot show."
                    step = Step.Form
                    return
                }
                if (step is Step.Web && retry) error = "That step is not done yet. Open the page again and complete it."
                step = Step.Web(RegistrationLogic.fallbackUrl(homeserver, next, session))
            }
        }
    }

    private suspend fun post(homeserver: String, path: String, body: Map<String, Any?>) = try {
        Http.request(homeserver + path, method = "POST", json = body)
    } catch (e: Exception) {
        error = "The server could not be reached: ${e.message}"
        null
    }

    private fun stageError(code: String, message: String?, step: Step): String = when (step) {
        is Step.Token -> "The server did not accept this token."
        is Step.WaitingForEmail -> "The email link has not been opened yet."
        else -> RegistrationLogic.message(code, message)
    }

    private val language: String get() = Locale.getDefault().language.take(2).ifEmpty { "en" }
}
