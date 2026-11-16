package app.diddy.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/** Pictures picked on the phone, made ready for the homeserver. */
object ImageTools {
    /** The picture as JPEG, at most `maxSide` pixels on its long side (avatars, banners). */
    suspend fun jpegForUpload(context: Context, uri: Uri, maxSide: Int = 1024, quality: Int = 85): ByteArray? = withContext(Dispatchers.IO) {
        val bitmap = decode(context, uri) ?: return@withContext null
        val scale = maxSide.toFloat() / maxOf(bitmap.width, bitmap.height)
        val sized = if (scale < 1f) Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true) else bitmap
        ByteArrayOutputStream().also { sized.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
    }

    /** The raw bytes and type of a picked file, for pictures that must keep their format (GIF avatars). */
    suspend fun bytes(context: Context, uri: Uri): Pair<ByteArray, String>? = withContext(Dispatchers.IO) {
        val data = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return@withContext null
        data to (context.contentResolver.getType(uri) ?: "application/octet-stream")
    }

    private fun decode(context: Context, uri: Uri): Bitmap? = runCatching {
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, _, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        }
    }.getOrNull()
}
