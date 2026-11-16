package app.diddy.matrix

// Temporary stand-ins until the Diddy profile port lands (ios DiddyProfiles.swift and friends).

data class DiddyProfile(val raw: Map<String, Any?> = emptyMap())
data class DiddyBadge(val id: String, val name: String)
class DiddyOptionsFeed

fun MatrixAccount.isDiddyOptionsRoom(roomId: String, topic: String?): Boolean = roomId in diddyOptionsRooms

suspend fun MatrixAccount.loadDiddyProfiles(staleAfterSeconds: Long = 0) {}
