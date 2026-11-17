package app.diddy.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.util.friendlyMessage
import org.matrix.rustcomponents.sdk.MembershipState
import org.matrix.rustcomponents.sdk.PowerLevel
import org.matrix.rustcomponents.sdk.RoomMember
import uniffi.matrix_sdk.RoomMemberRole

/** The groups of the member list, in the desktop's order. */
enum class MemberGroup(val title: String) {
    OWNER("Owner"), ADMIN("Admins"), MODERATOR("Moderators"), MEMBER("Members"), INVITED("Invited");

    /** The label on someone's profile card. */
    val role: String?
        get() = when (this) {
            OWNER -> "Owner"
            ADMIN -> "Admin"
            MODERATOR -> "Moderator"
            else -> null
        }
}

data class MemberEntry(
    val userId: String,
    val name: String,
    val avatarUrl: String?,
    val group: MemberGroup,
    val powerLevel: Long,
    val isOwner: Boolean,
) {
    companion object {
        fun of(member: RoomMember): MemberEntry {
            val role = member.suggestedRoleForPowerLevel
            val group = if (member.membership is MembershipState.Invite) MemberGroup.INVITED else when (role) {
                RoomMemberRole.CREATOR -> MemberGroup.OWNER
                RoomMemberRole.ADMINISTRATOR -> MemberGroup.ADMIN
                RoomMemberRole.MODERATOR -> MemberGroup.MODERATOR
                else -> MemberGroup.MEMBER
            }
            return MemberEntry(
                userId = member.userId,
                name = member.displayName ?: MatrixAccount.localpart(member.userId),
                avatarUrl = member.avatarUrl,
                group = group,
                powerLevel = (member.powerLevel as? PowerLevel.Value)?.value ?: Long.MAX_VALUE,
                isOwner = role == RoomMemberRole.CREATOR,
            )
        }
    }
}

/** The members of one room, for the member list and the mention suggestions. */
class MemberStore {
    var members by mutableStateOf<List<MemberEntry>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    suspend fun load(account: MatrixAccount, roomId: String) {
        val room = account.room(roomId) ?: run {
            error = "This room is not available yet."
            return
        }
        loading = true
        try {
            val iterator = try { room.members() } catch (_: Exception) { room.membersNoSync() }
            val result = mutableListOf<MemberEntry>()
            val people = mutableListOf<Triple<String, String?, String?>>()
            while (true) {
                val chunk = iterator.nextChunk(500u) ?: break
                if (chunk.isEmpty()) break
                for (member in chunk) {
                    if (member.isServiceMember) continue
                    if (member.membership !is MembershipState.Join && member.membership !is MembershipState.Invite) continue
                    result += MemberEntry.of(member)
                    people += Triple(member.userId, member.displayName, member.avatarUrl)
                }
            }
            account.remember(people)
            members = result.sortedBy { it.name.lowercase() }
            error = null
        } catch (e: Exception) {
            error = e.friendlyMessage
        } finally {
            loading = false
        }
    }
}
