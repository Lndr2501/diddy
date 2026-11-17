package app.diddy.util

import org.matrix.rustcomponents.sdk.ClientBuildException
import org.matrix.rustcomponents.sdk.ClientException

/** An error with a message for the screen. */
class DiddyError(message: String) : Exception(message)

/** A refused client API call, with the Matrix error code (`M_FORBIDDEN`, ...). */
class ClientApiError(val errcode: String?, message: String, val status: Int = 0) : Exception(message)

/** What the server said, instead of the SDK's whole error dump. */
val Throwable.friendlyMessage: String
    get() = when (this) {
        is ClientException.MatrixApi -> msg
        is ClientException.Generic -> msg
        is ClientBuildException.ServerUnreachable -> "The server could not be reached. Check your connection and try again."
        is java.net.UnknownHostException -> "The server could not be reached. Check your connection and try again."
        is java.net.SocketTimeoutException -> "The server did not answer in time. Try again."
        else -> message ?: toString()
    }
