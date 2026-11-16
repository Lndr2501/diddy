package app.diddy.matrix

import app.diddy.util.ClientApiError
import app.diddy.util.Http
import app.diddy.util.long
import app.diddy.util.obj
import app.diddy.util.objectsLenient
import app.diddy.util.str
import app.diddy.util.strings
import org.matrix.rustcomponents.sdk.EnableRecoveryProgress
import org.matrix.rustcomponents.sdk.EnableRecoveryProgressListener
import org.matrix.rustcomponents.sdk.SecretStorageKey
import java.util.Date

/** One session of your account, as `GET /devices` lists it. */
data class AccountDevice(val id: String, val name: String?, val lastSeen: Date?, val lastSeenIp: String?)

/** The server's key backup (`GET /room_keys/version`). */
data class KeyBackupInfo(val version: String, val count: Long?)

/** User-interactive auth: what the server wants next (ios UIAChallenge). */
data class UiaChallenge(val session: String?, val flows: List<List<String>>, val completed: List<String>) {
    /** Diddy can only ask for a password, like the desktop's ActionUIA for this case. */
    val acceptsPassword: Boolean get() = flows.any { flow -> flow.filter { it !in completed } == listOf("m.login.password") }

    companion object {
        fun parse(json: Map<String, Any?>): UiaChallenge? {
            val raw = json["flows"] as? List<*> ?: return null
            return UiaChallenge(
                json["session"].str(),
                raw.map { it.obj()?.get("stages").strings() ?: emptyList() },
                json["completed"].strings() ?: emptyList(),
            )
        }

        fun passwordAuth(userId: String, password: String, session: String?): Map<String, Any?> = buildMap {
            put("type", "m.login.password")
            put("identifier", mapOf("type" to "m.id.user", "user" to userId))
            put("password", password)
            if (session != null) put("session", session)
        }
    }
}

sealed class DeviceSignOutResult {
    data object Done : DeviceSignOutResult()
    data class NeedsPassword(val challenge: UiaChallenge, val error: String?) : DeviceSignOutResult()
    data object Unsupported : DeviceSignOutResult()
}

/** Like `clientRequest`, but hands back every status: user-interactive auth (401) and "nothing there" (404) need it. */
suspend fun MatrixAccount.securityRequest(path: String, body: Any? = null, method: String? = null): Pair<Int, Map<String, Any?>> {
    val session = client.session()
    val answer = Http.request(
        session.homeserverUrl.trimEnd('/') + path,
        method = method ?: if (body != null) "POST" else "GET",
        json = body,
        headers = mapOf("Authorization" to "Bearer ${session.accessToken}"),
    )
    return answer.status to (answer.json ?: emptyMap())
}

private fun refused(status: Int, json: Map<String, Any?>) =
    ClientApiError(json["errcode"].str(), json["error"].str() ?: "The server refused the request.", status)

suspend fun MatrixAccount.accountDevices(): List<AccountDevice> {
    val (status, json) = securityRequest("/_matrix/client/v3/devices")
    if (status != 200) throw refused(status, json)
    return json["devices"].objectsLenient().mapNotNull { item ->
        val id = item["device_id"].str() ?: return@mapNotNull null
        AccountDevice(id, item["display_name"].str(), item["last_seen_ts"].long()?.let { Date(it) }, item["last_seen_ip"].str())
    }.sortedByDescending { it.lastSeen?.time ?: 0 }
}

suspend fun MatrixAccount.renameDevice(deviceId: String, name: String) {
    clientRequest("/_matrix/client/v3/devices/${MatrixAccount.pathComponent(deviceId)}", mapOf("display_name" to name), "PUT")
}

/** Signs out of devices, asking the server for its auth flows first; pass the challenge and password on the second round. */
suspend fun MatrixAccount.signOutDevices(ids: List<String>, password: String? = null, challenge: UiaChallenge? = null): DeviceSignOutResult {
    val body = mutableMapOf<String, Any?>("devices" to ids)
    if (password != null && challenge != null) body["auth"] = UiaChallenge.passwordAuth(userId, password, challenge.session)
    val (status, json) = securityRequest("/_matrix/client/v3/delete_devices", body)
    if (status == 200) return DeviceSignOutResult.Done
    if (status == 401) {
        val next = UiaChallenge.parse(json)
        if (next != null) {
            if (!next.acceptsPassword) return DeviceSignOutResult.Unsupported
            return DeviceSignOutResult.NeedsPassword(next, if (password != null) json["error"].str() ?: "Wrong password." else null)
        }
    }
    throw refused(status, json)
}

suspend fun MatrixAccount.keyBackupInfo(): KeyBackupInfo? {
    val (status, json) = securityRequest("/_matrix/client/v3/room_keys/version")
    if (status == 404) return null
    if (status != 200) throw refused(status, json)
    val version = json["version"].str() ?: return null
    return KeyBackupInfo(version, json["count"].long())
}

suspend fun MatrixAccount.emailAddresses(): List<String> {
    val (status, json) = securityRequest("/_matrix/client/v3/account/3pid")
    if (status != 200) throw refused(status, json)
    return json["threepids"].objectsLenient().filter { it["medium"] == "email" }.mapNotNull { it["address"].str() }
}

/** The account management page of an OAuth (MAS) account, null for password accounts. */
suspend fun MatrixAccount.accountManagementUrl(): String? = runCatching { client.accountUrl(null) }.getOrNull()

/** Turns on recovery and returns the new recovery key. An empty passphrase means none. */
suspend fun MatrixAccount.enableRecovery(passphrase: String?, progress: (String) -> Unit): String {
    val key = passphrase?.takeIf { it.isNotEmpty() }?.let { SecretStorageKey.newFromPassphrase(it) }
    val listener = object : EnableRecoveryProgressListener {
        override fun onUpdate(status: EnableRecoveryProgress) {
            val text = when (status) {
                is EnableRecoveryProgress.Starting -> "Starting…"
                is EnableRecoveryProgress.CreatingBackup -> "Creating the key backup…"
                is EnableRecoveryProgress.CreatingRecoveryKey -> "Creating the recovery key…"
                is EnableRecoveryProgress.BackingUp -> "Backing up keys: ${status.backedUpCount} of ${status.totalCount}"
                is EnableRecoveryProgress.RoomKeyUploadError -> "Some keys could not be uploaded yet."
                is EnableRecoveryProgress.Done -> "Done"
            }
            progress(text)
        }
    }
    return client.encryption().enableRecovery(false, key, listener)
}

suspend fun MatrixAccount.changeRecoveryKey(): String = client.encryption().resetRecoveryKey()

suspend fun MatrixAccount.enableKeyBackup() = client.encryption().enableBackups()

/** Only for Settings > Developer Tools, behind a warning. Never log or store it. */
fun MatrixAccount.accessTokenForDeveloper(): String? = runCatching { client.session().accessToken }.getOrNull()
