package app.diddy.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** A file another app shared, read right away (the permission to read it does not last). */
class SharedFile(val name: String, val mime: String, val data: ByteArray)

/** What another app shared with Diddy: text, links and files. */
class IncomingShare(val text: String, val files: List<SharedFile>) {
    val id = System.nanoTime()
}

/**
 * Shares from other apps (Android's share sheet): held until you pick a chat, then handed to that
 * chat's composer as draft text and attachments (ios ShareInbox).
 */
object ShareInbox {
    /** Waiting for a chat to be picked. */
    var incoming by mutableStateOf<IncomingShare?>(null)
        private set
    private val staged = mutableMapOf<String, IncomingShare>()
    /** A matrix.to or matrix: link opened from outside, for the account screen to show. */
    var link by mutableStateOf<String?>(null)

    const val MAX_FILE_BYTES = 100L * 1024 * 1024

    /** Reads a share intent; true when it was one. */
    suspend fun handle(context: Context, intent: Intent): Boolean {
        val action = intent.action
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return false
        val text = listOfNotNull(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
            .filter { it.isNotBlank() }.distinct().joinToString("\n")
        val uris = mutableListOf<Uri>()
        if (action == Intent.ACTION_SEND) streamExtra(intent)?.let { uris += it }
        else streamListExtra(intent)?.let { uris += it }
        val files = withContext(Dispatchers.IO) { uris.take(10).mapNotNull { read(context, it) } }
        if (text.isEmpty() && files.isEmpty()) return true
        incoming = IncomingShare(text, files)
        return true
    }

    @Suppress("DEPRECATION")
    private fun streamExtra(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun streamListExtra(intent: Intent): List<Uri>? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)

    private fun read(context: Context, uri: Uri): SharedFile? = try {
        val resolver = context.contentResolver
        var name = uri.lastPathSegment ?: "file"
        var size = -1L
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                cursor.getString(0)?.let { name = it }
                if (!cursor.isNull(1)) size = cursor.getLong(1)
            }
        }
        if (size > MAX_FILE_BYTES) null
        else resolver.openInputStream(uri)?.use { SharedFile(name, resolver.getType(uri) ?: "application/octet-stream", it.readBytes()) }
    } catch (e: Exception) {
        DiagLog.write("share: could not read a file (${e.message})")
        null
    }

    /** The chat was picked: its composer takes the share when it opens. */
    fun stage(roomId: String) {
        val share = incoming ?: return
        staged[roomId] = share
        incoming = null
    }

    fun take(roomId: String): IncomingShare? = staged.remove(roomId)

    fun cancel() {
        incoming = null
    }
}
