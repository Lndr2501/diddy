package app.diddy.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import app.diddy.matrix.AccountList
import app.diddy.matrix.AccountRecord
import app.diddy.matrix.ClientFactory
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.RoomSummary
import app.diddy.matrix.SessionStore
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.Client
import org.matrix.rustcomponents.sdk.ClientBuildException

/**
 * All logins on this device and which one is shown (ios AppModel.swift). Like Discord's account
 * switcher, every account keeps its own session and data; switching only changes what is on screen.
 */
object AppModel {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    var accounts by mutableStateOf<List<MatrixAccount>>(emptyList())
        private set
    var activeAccountId by mutableStateOf<String?>(null)
        private set
    var restoring by mutableStateOf(true)
        private set
    var addingAccount by mutableStateOf(false)
    var restoreErrors by mutableStateOf<List<String>>(emptyList())
    /** A room to show, from a tapped notification. The main screen of that account opens it. */
    var openRequest by mutableStateOf<Pair<String, String>?>(null)
    /** Saved logins whose server cannot be reached right now. They stay signed in. */
    var unreachable by mutableStateOf<List<AccountRecord>>(emptyList())
        private set

    val activeAccount: MatrixAccount?
        get() = accounts.firstOrNull { it.id == activeAccountId } ?: accounts.firstOrNull()

    private var restored = false

    private fun setActive(id: String?) {
        activeAccountId = id
        AccountList.activeAccountId = id
    }

    fun restore() {
        if (restored) return
        restored = true
        scope.launch {
            val records = AccountList.load()
            // Logins that never finished (the app closed in the middle) leave data behind.
            runCatching { SessionStore.removeOrphans(records.map { it.id }.toSet()) }
            val preferred = AccountList.activeAccountId
            // The account shown first is restored first; the splash only waits for it.
            val pending = records.toMutableList()
            val index = pending.indexOfFirst { it.id == preferred }
            if (index > 0) pending.add(0, pending.removeAt(index))
            while (pending.isNotEmpty() && accounts.isEmpty()) {
                val record = pending.removeAt(0)
                if (!restoreAccount(record)) unreachable = unreachable + record
            }
            setActive(preferred?.takeIf { id -> accounts.any { it.id == id } } ?: accounts.firstOrNull()?.id)
            activeAccount?.start()
            restoring = false
            for (record in pending) if (!restoreAccount(record)) unreachable = unreachable + record
            val order = records.map { it.id }
            accounts = accounts.sortedBy { order.indexOf(it.id).let { i -> if (i < 0) Int.MAX_VALUE else i } }
        }
    }

    /** False when the server could not be reached, which is worth trying again. */
    private suspend fun restoreAccount(record: AccountRecord): Boolean {
        val session = SessionStore.load(record.id)
        if (session == null) {
            restoreErrors = restoreErrors + "${record.userId}: this device no longer has the saved login. Please sign in again."
            return true
        }
        try {
            val client = ClientFactory.builder(record).homeserverUrl(session.homeserverUrl).build()
            client.restoreSession(session)
            accounts = accounts + makeAccount(record, client)
        } catch (e: ClientBuildException.ServerUnreachable) {
            return false
        } catch (e: Exception) {
            restoreErrors = restoreErrors + "${record.userId}: ${e.friendlyMessage}"
        }
        return true
    }

    /** Tries the servers that were out of reach again; the first to answer opens up. */
    suspend fun retryUnreachable() {
        val waiting = mutableListOf<AccountRecord>()
        for (record in unreachable) if (!restoreAccount(record)) waiting += record
        unreachable = waiting
        if (activeAccountId != null) return
        val first = accounts.firstOrNull() ?: return
        setActive(first.id)
        first.start()
    }

    private fun makeAccount(record: AccountRecord, client: Client): MatrixAccount {
        val account = MatrixAccount(record, client)
        account.onRoomsChanged = { old, new ->
            Hooks.roomsChanged(account, old, new)
            announceActivity(account, old, new)
        }
        Hooks.accountAdded(account)
        return account
    }

    /** Plays one sound for what just arrived, when the app is on screen to hear about it. */
    private fun announceActivity(account: MatrixAccount, old: Map<String, RoomSummary>, new: List<RoomSummary>) {
        val foreground = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        if (!account.canRing || !foreground || Hooks.isDeafened()) return
        var sound: Sound? = null
        for (room in new) {
            if (room.isSpace || (room.isDirect && room.callParticipants.isNotEmpty())) continue
            val before = old[room.id]
            if (before == null) {
                if (room.isInvite) sound = sound ?: Sound.INVITE
                continue
            }
            if (room.isInvite && !before.isInvite) {
                sound = sound ?: Sound.INVITE
            } else if (room.isJoined && room.id != Sounds.openRoomId) {
                if (room.mentions > before.mentions) sound = Sound.MENTION
                else if (room.notifications > before.notifications) sound = sound ?: Sound.MESSAGE
            }
        }
        val chosen = sound ?: return
        if (!Hooks.silencesSound(account, chosen)) Sounds.playAlert(chosen)
    }

    suspend fun add(record: AccountRecord, client: Client) {
        val account = makeAccount(record, client)
        accounts = accounts + account
        saveAccountList()
        addingAccount = false
        setActive(account.id)
        account.start()
    }

    suspend fun open(roomId: String, accountId: String) {
        val account = accounts.firstOrNull { it.id == accountId } ?: return
        if (activeAccountId != account.id) switchTo(account)
        openRequest = accountId to roomId
    }

    suspend fun switchTo(account: MatrixAccount) {
        setActive(account.id)
        account.start()
    }

    /** Something to tell once, over everything (a logout the server did not get). */
    var notice by mutableStateOf<String?>(null)

    suspend fun logout(account: MatrixAccount) {
        Hooks.beforeLogout(account)
        account.logout()?.let { reason ->
            notice = "${account.userId} is signed out on this phone, but the server could not be told ($reason). " +
                "This device stays in your device list until you remove it in Settings > Security on another device."
        }
        accounts = accounts.filter { it.id != account.id }
        saveAccountList()
        if (activeAccountId == account.id) setActive(accounts.firstOrNull()?.id)
        activeAccount?.start()
    }

    /** Logins that are only out of reach for now have to stay on the list. */
    private fun saveAccountList() = AccountList.save(accounts.map { it.record } + unreachable)

    /** Coming back to the app: every started account picks up where sync left off. */
    fun resumeAll() {
        scope.launch { accounts.filter { it.started }.forEach { it.resume() } }
    }

    /**
     * What other parts plug in (calls, notifications, push, companion), so this file does not
     * depend on all of them. Set up in DiddyApplication.
     */
    object Hooks {
        var roomsChanged: (MatrixAccount, Map<String, RoomSummary>, List<RoomSummary>) -> Unit = { _, _, _ -> }
        var accountAdded: (MatrixAccount) -> Unit = {}
        var isDeafened: () -> Boolean = { false }
        var silencesSound: (MatrixAccount, Sound) -> Boolean = { _, _ -> false }
        var beforeLogout: suspend (MatrixAccount) -> Unit = {}
    }
}
