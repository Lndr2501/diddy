package app.diddy.matrix

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.diddy.BuildConfig
import app.diddy.app.Prefs
import app.diddy.util.DiddyError
import app.diddy.util.Json
import app.diddy.util.bool
import app.diddy.util.obj
import app.diddy.util.str
import org.matrix.rustcomponents.sdk.ClientBuilder
import org.matrix.rustcomponents.sdk.ClientSessionDelegate
import org.matrix.rustcomponents.sdk.CrossProcessLockConfig
import org.matrix.rustcomponents.sdk.RequestConfig
import org.matrix.rustcomponents.sdk.Session
import org.matrix.rustcomponents.sdk.SlidingSyncVersion
import org.matrix.rustcomponents.sdk.SlidingSyncVersionBuilder
import org.matrix.rustcomponents.sdk.SqliteStoreBuilder
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * One saved login. Every account has its own SDK data and cache directory, so logins on different
 * homeservers (or several on the same one) never share a crypto store (ios SessionStore.swift).
 */
data class AccountRecord(
    val id: String,
    val userId: String,
    val homeserver: String,
    val displayName: String? = null,
) {
    val serverName: String
        get() = userId.split(":", limit = 2).getOrNull(1) ?: homeserver

    fun dataDirectory(context: Context) = File(context.filesDir, "accounts/$id/data")
    fun cacheDirectory(context: Context) = File(context.cacheDir, "accounts/$id/cache")

    fun ensureDirectories(context: Context) {
        dataDirectory(context).mkdirs()
        cacheDirectory(context).mkdirs()
    }

    fun removeDirectories(context: Context) {
        dataDirectory(context).parentFile?.deleteRecursively()
        cacheDirectory(context).parentFile?.deleteRecursively()
    }

    fun toJson(): Map<String, Any?> = buildMap {
        put("id", id); put("userId", userId); put("homeserver", homeserver)
        displayName?.let { put("displayName", it) }
    }

    companion object {
        fun fromJson(json: Map<String, Any?>): AccountRecord? {
            val id = json["id"].str() ?: return null
            return AccountRecord(id, json["userId"].str() ?: "", json["homeserver"].str() ?: "", json["displayName"].str())
        }
    }
}

/** The list of accounts (no secrets) in the preferences; sessions are encrypted (SessionStore). */
object AccountList {
    private const val KEY = "diddy.accounts"
    private const val ACTIVE_KEY = "diddy.activeAccount"

    fun load(): List<AccountRecord> =
        Json.arr(Prefs.string(KEY))?.mapNotNull { it.obj()?.let(AccountRecord::fromJson) } ?: emptyList()

    fun save(accounts: List<AccountRecord>) = Prefs.setString(KEY, Json.encode(accounts.map { it.toJson() }))

    var activeAccountId: String?
        get() = Prefs.string(ACTIVE_KEY)
        set(value) = Prefs.setString(ACTIVE_KEY, value)
}

/**
 * Secrets sealed with a key of the Android Keystore (AES-GCM, never leaves the secure hardware
 * where the phone has one). The sealed bytes live in a private preferences file that is excluded
 * from backups (res/xml/data_extraction_rules.xml).
 */
object SecretBox {
    private const val ALIAS = "diddy.sessions"
    private const val FILE = "diddy.secrets"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun put(context: Context, name: String, value: ByteArray) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(value)
        // commit, not apply: a login must be on disk before the app goes on.
        if (!prefs(context).edit().putString(name, Base64.encodeToString(sealed, Base64.NO_WRAP)).commit()) {
            throw DiddyError("The login could not be saved on this device.")
        }
    }

    fun get(context: Context, name: String): ByteArray? {
        val text = prefs(context).getString(name, null) ?: return null
        return try {
            val sealed = Base64.decode(text, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, 12))
            cipher.doFinal(sealed, 12, sealed.size - 12)
        } catch (_: Exception) {
            null
        }
    }

    fun remove(context: Context, name: String) {
        prefs(context).edit().remove(name).commit()
    }

    fun names(context: Context): Set<String> = prefs(context).all.keys
}

object SessionStore {
    lateinit var context: Context

    private fun sessionName(accountId: String) = "session.$accountId"
    private fun storeKeyName(accountId: String) = "storekey.$accountId"

    /** Writes the session in place: a failed write never removes the previously saved session. */
    fun save(session: Session, accountId: String) {
        val stored = mapOf(
            "accessToken" to session.accessToken,
            "refreshToken" to session.refreshToken,
            "userId" to session.userId,
            "deviceId" to session.deviceId,
            "homeserverUrl" to session.homeserverUrl,
            "oauthData" to session.oauthData,
            "nativeSlidingSync" to (session.slidingSyncVersion == SlidingSyncVersion.NATIVE),
        )
        SecretBox.put(context, sessionName(accountId), Json.encode(stored).toByteArray())
    }

    fun load(accountId: String): Session? {
        val bytes = SecretBox.get(context, sessionName(accountId)) ?: return null
        val stored = Json.obj(String(bytes)) ?: return null
        return Session(
            accessToken = stored["accessToken"].str() ?: return null,
            refreshToken = stored["refreshToken"].str(),
            userId = stored["userId"].str() ?: return null,
            deviceId = stored["deviceId"].str() ?: return null,
            homeserverUrl = stored["homeserverUrl"].str() ?: return null,
            oauthData = stored["oauthData"].str(),
            slidingSyncVersion = if (stored["nativeSlidingSync"].bool() == true) SlidingSyncVersion.NATIVE else SlidingSyncVersion.NONE,
        )
    }

    fun delete(accountId: String) {
        SecretBox.remove(context, sessionName(accountId))
        SecretBox.remove(context, storeKeyName(accountId))
    }

    /**
     * Removes SDK data, caches and sealed secrets of accounts that are not on the list any more,
     * for example after the app was closed in the middle of a login. Run before any login starts.
     */
    fun removeOrphans(known: Set<String>) {
        val dataRoot = java.io.File(context.filesDir, "accounts")
        val cacheRoot = java.io.File(context.cacheDir, "accounts")
        for (root in listOf(dataRoot, cacheRoot)) {
            for (id in orphanIds(root.list()?.toList() ?: emptyList(), known)) java.io.File(root, id).deleteRecursively()
        }
        for (id in orphanIds(SecretBox.names(context).mapNotNull(::accountOfSecret), known)) delete(id)
    }

    /** `session.<id>` and `storekey.<id>` to `<id>`. */
    fun accountOfSecret(name: String): String? = listOf("session.", "storekey.").firstNotNullOfOrNull { prefix ->
        name.takeIf { it.startsWith(prefix) }?.removePrefix(prefix)?.takeIf { it.isNotEmpty() }
    }

    fun orphanIds(present: List<String>, known: Set<String>): List<String> = present.distinct().filter { it !in known && it.isNotBlank() }

    /**
     * The key the account's SDK databases are encrypted with: 32 random bytes made once per
     * account and sealed by the Keystore. iOS relies on the file protection of the Keychain.
     */
    fun storeKey(accountId: String): ByteArray {
        SecretBox.get(context, storeKeyName(accountId))?.let { return it }
        val key = ByteArray(32).also { SecureRandom().nextBytes(it) }
        SecretBox.put(context, storeKeyName(accountId), key)
        return key
    }
}

/** Keeps refreshed OAuth tokens: the SDK hands every new token pair to this delegate. */
class AccountSessionDelegate(private val accountId: String) : ClientSessionDelegate {
    override fun retrieveSessionFromKeychain(userId: String): Session =
        SessionStore.load(accountId) ?: throw org.matrix.rustcomponents.sdk.ClientException.Generic("No saved session for $userId.", null)

    override fun saveSessionInKeychain(session: Session) {
        // The SDK gives this callback no way to fail. If the write fails, the previously saved
        // session stays (save never deletes first).
        try {
            SessionStore.save(session, accountId)
        } catch (_: Exception) {
        }
    }
}

object ClientFactory {
    fun builder(record: AccountRecord): ClientBuilder {
        val context = SessionStore.context
        record.ensureDirectories(context)
        val store = SqliteStoreBuilder(
            dataPath = record.dataDirectory(context).absolutePath,
            cachePath = record.cacheDirectory(context).absolutePath,
        ).journalSizeLimit((25 * 1024 * 1024).toUInt()).key(SessionStore.storeKey(record.id))
        return ClientBuilder()
            .sqliteStore(store)
            .setSessionDelegate(AccountSessionDelegate(record.id))
            .slidingSyncVersionBuilder(SlidingSyncVersionBuilder.DISCOVER_NATIVE)
            .autoEnableCrossSigning(true)
            .autoEnableBackups(true)
            .crossProcessLockConfig(CrossProcessLockConfig.SingleProcess)
            .requestConfig(RequestConfig(retryLimit = 3uL, timeout = 30_000uL, maxConcurrentRequests = null, maxRetryTime = null))
            .userAgent("Diddy Android/${BuildConfig.VERSION_NAME}")
    }
}
