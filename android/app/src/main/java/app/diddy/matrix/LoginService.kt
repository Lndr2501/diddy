package app.diddy.matrix

import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.BuildConfig
import app.diddy.util.DiddyError
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import org.matrix.rustcomponents.sdk.Client
import org.matrix.rustcomponents.sdk.OAuthConfiguration
import org.matrix.rustcomponents.sdk.OAuthPrompt
import java.util.UUID

/**
 * The browser hand-over of an OAuth login: LoginService opens the server's page in a Custom Tab,
 * MainActivity hands the redirect (`io.github.lndr2501:/oauth/callback?...`) back here.
 */
object OAuthRedirects {
    const val SCHEME = "io.github.lndr2501"
    private var pending: CompletableDeferred<String?>? = null
    /** MainActivity opens this URL in a Custom Tab. */
    var open: ((String) -> Unit)? = null

    fun begin(): CompletableDeferred<String?> {
        pending?.complete(null)
        return CompletableDeferred<String?>().also { pending = it }
    }

    /** The redirect arrived. */
    fun deliver(url: String): Boolean {
        val waiting = pending ?: return false
        pending = null
        waiting.complete(url)
        return true
    }

    /** The user came back without finishing (closed the tab). */
    fun cancel() {
        pending?.complete(null)
        pending = null
    }

    val isWaiting: Boolean get() = pending != null
}

/**
 * Signs in to a homeserver (ios LoginService.swift). Each login gets a fresh AccountRecord (and
 * therefore its own data store), so adding a second server never touches an existing account.
 */
class LoginService {
    enum class Method { PASSWORD, OAUTH }

    var homeserver by mutableStateOf("matrix.org")
        private set
    var username by mutableStateOf("")
        private set
    var password by mutableStateOf("")
        private set
    var method by mutableStateOf<Method?>(null)
        private set
    var resolvedServer by mutableStateOf<String?>(null)
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    private var record: AccountRecord? = null
    private var client: Client? = null

    fun updateHomeserver(value: String) { if (value != homeserver) clearStaleError(); homeserver = value }
    fun updateUsername(value: String) { if (value != username) clearStaleError(); username = value }
    fun updatePassword(value: String) { if (value != password) clearStaleError(); password = value }

    /** An error stays up only until you start correcting it. */
    private fun clearStaleError() {
        if (!busy) error = null
    }

    fun reset() {
        record?.removeDirectories(SessionStore.context)
        record?.let { SessionStore.delete(it.id) }
        record = null
        client = null
        method = null
        resolvedServer = null
        error = null
    }

    /** Step 1: find the homeserver (server name or URL, .well-known is followed) and its login types. */
    suspend fun discover() {
        error = null
        val input = homeserver.trim()
        if (input.isEmpty()) { error = "Enter a homeserver."; return }
        insecureServerProblem(input)?.let { error = it; return }
        busy = true
        record?.removeDirectories(SessionStore.context)
        val fresh = AccountRecord(id = UUID.randomUUID().toString().lowercase(), userId = "", homeserver = input)
        try {
            // Discovery (.well-known, versions) gives up after 8 s, like desktop.
            val client = withTimeout(HOMESERVER_TIMEOUT_MS) {
                ClientFactory.builder(fresh).serverNameOrHomeserverUrl(input).build()
            }
            val details = withTimeout(HOMESERVER_TIMEOUT_MS) { client.homeserverLoginDetails() }
            insecureServerProblem(details.url())?.let {
                fresh.removeDirectories(SessionStore.context)
                error = it
                return
            }
            this.record = fresh
            this.client = client
            resolvedServer = details.url()
            when {
                details.supportsOauthLogin() -> method = Method.OAUTH
                details.supportsPasswordLogin() -> method = Method.PASSWORD
                else -> error = "This server only offers login types Diddy does not support yet (SSO without OAuth)."
            }
        } catch (e: TimeoutCancellationException) {
            fresh.removeDirectories(SessionStore.context)
            error = "The homeserver did not respond in time. Check the address and your connection, then try again."
        } catch (e: Exception) {
            fresh.removeDirectories(SessionStore.context)
            error = describe(e, input)
        } finally {
            busy = false
        }
    }

    /** Step 2a: user name and password. */
    suspend fun loginWithPassword(): Pair<AccountRecord, Client>? {
        val client = client ?: return null
        val record = record ?: return null
        if (username.isBlank() || password.isEmpty()) {
            error = "Enter your username and password."
            return null
        }
        error = null
        busy = true
        return try {
            client.login(username.trim(), password, deviceName, null)
            password = ""
            finish(client, record)
        } catch (e: Exception) {
            error = e.friendlyMessage
            null
        } finally {
            busy = false
        }
    }

    /**
     * Step 2b: the homeserver's own login page (Matrix Authentication Service), in a Custom Tab.
     * With `create` the page opens on "create account" (OAuth `prompt=create`).
     */
    suspend fun loginWithOAuth(create: Boolean = false): Pair<AccountRecord, Client>? {
        val client = client ?: return null
        val record = record ?: return null
        error = null
        busy = true
        try {
            val data = client.urlForOauth(oauthConfiguration, if (create) OAuthPrompt.Create else null, null, null, null)
            val waiting = OAuthRedirects.begin()
            val open = OAuthRedirects.open ?: throw DiddyError("The login page could not be opened.")
            open(data.loginUrl())
            val callback = waiting.await()
            if (callback == null) {
                client.abortOauthAuth(data)
                return null
            }
            client.loginWithOauthCallback(callback)
            return finish(client, record)
        } catch (e: Exception) {
            error = e.friendlyMessage
            return null
        } finally {
            busy = false
        }
    }

    /** After Registration created the account: signs in with the same name and password. */
    suspend fun loginAfterRegistration(userId: String?, username: String, password: String): Pair<AccountRecord, Client>? {
        this.username = userId ?: username
        this.password = password
        return loginWithPassword()
    }

    private fun finish(client: Client, record: AccountRecord): Pair<AccountRecord, Client> {
        val session = client.session()
        val done = record.copy(userId = session.userId, homeserver = session.homeserverUrl)
        SessionStore.save(session, done.id)
        this.record = null
        this.client = null
        method = null
        return done to client
    }

    companion object {
        /** Desktop's limit for discovery (cinny/src/app/utils/requestTimeout.ts). */
        const val HOMESERVER_TIMEOUT_MS = 8_000L

        /**
         * OAuth (MAS) client metadata. Native clients must use a private-use scheme that is the
         * reversed host of `clientUri` (the same as the iOS app).
         */
        val oauthConfiguration = OAuthConfiguration(
            clientName = "Diddy",
            redirectUri = "${OAuthRedirects.SCHEME}:/oauth/callback",
            clientUri = "https://lndr2501.github.io/diddy",
            logoUri = null,
            tosUri = null,
            policyUri = null,
            staticRegistrations = emptyMap(),
        )

        /** Name of the session a new account starts with. */
        val deviceName: String
            get() {
                val model = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Android"
                return "Diddy Android ($model)"
            }

        /**
         * Access tokens and passwords only go over HTTPS. A bare server name is fine: the SDK
         * resolves it to https://. Debug builds also accept http://localhost and the emulator's
         * host address (10.0.2.2) for a homeserver on the developer's machine.
         */
        fun insecureServerProblem(input: String): String? {
            val lowered = input.lowercase()
            if (!lowered.contains("://")) return null
            if (lowered.startsWith("https://")) return null
            if (BuildConfig.DEBUG && lowered.startsWith("http://")) {
                val host = try { java.net.URI(input).host?.lowercase() } catch (_: Exception) { null }
                if (host in listOf("localhost", "127.0.0.1", "::1", "[::1]", "10.0.2.2")) return null
            }
            if (lowered.startsWith("http://")) {
                return "Diddy only connects over HTTPS. Enter the server name (like matrix.org) or an https:// address."
            }
            return "Enter the server name (like matrix.org) or an https:// address."
        }

        private fun describe(error: Throwable, server: String): String {
            val text = error.friendlyMessage
            if (text.contains("sliding sync", ignoreCase = true)) {
                return "$server does not support Simplified Sliding Sync (MSC4186), which the Android app needs. Synapse 1.114+ and Continuwuity have it."
            }
            return text
        }
    }
}
