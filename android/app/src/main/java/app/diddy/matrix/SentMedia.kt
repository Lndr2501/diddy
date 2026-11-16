package app.diddy.matrix

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Size and a small preview of a picture or video before it is sent, so other apps show the preview
 * and load the original only when it is opened (ios SentMedia.swift).
 */
object SentMedia {
    const val THUMBNAIL_MAX_PIXEL = 800

    class Picture(val width: Int, val height: Int, val thumbnail: ByteArray?, val thumbnailWidth: Int, val thumbnailHeight: Int)

    class Video(
        val width: Int?,
        val height: Int?,
        val durationMs: Long?,
        val thumbnail: ByteArray?,
        val thumbnailWidth: Int,
        val thumbnailHeight: Int,
    )

    /** EXIF orientations 5 to 8 turn the picture by 90 degrees. */
    fun shownSize(width: Int, height: Int, orientation: Int): Pair<Int, Int> =
        if (orientation in 5..8) height to width else width to height

    fun needsThumbnail(width: Int, height: Int, animated: Boolean) = !animated && maxOf(width, height) > THUMBNAIL_MAX_PIXEL

    /** Null when the data is no picture Android can read. Call it off the main thread. */
    fun picture(data: ByteArray, mime: String): Picture? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val orientation = try {
            ExifInterface(ByteArrayInputStream(data)).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1)
        } catch (_: Exception) {
            1
        }
        val (width, height) = shownSize(bounds.outWidth, bounds.outHeight, orientation)
        val animated = mime == "image/gif"
        if (!needsThumbnail(width, height, animated)) return Picture(width, height, null, 0, 0)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= THUMBNAIL_MAX_PIXEL) sample *= 2
        val decoded = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return Picture(width, height, null, 0, 0)
        val scaled = scaleAndRotate(decoded, orientation)
        val jpeg = jpeg(scaled)
        if (jpeg.size >= data.size) return Picture(width, height, null, 0, 0)
        return Picture(width, height, jpeg, scaled.width, scaled.height)
    }

    /** Size, length and first frame of a video. Nil fields when something cannot be read. */
    fun video(context: Context, uri: Uri): Video {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(context, uri)
            readVideo(retriever)
        } catch (_: Exception) {
            Video(null, null, null, null, 0, 0)
        } finally {
            retriever.release()
        }
    }

    fun video(file: File): Video {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            readVideo(retriever)
        } catch (_: Exception) {
            Video(null, null, null, null, 0, 0)
        } finally {
            retriever.release()
        }
    }

    private fun readVideo(retriever: MediaMetadataRetriever): Video {
        var width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
        var height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
        val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        if (rotation == 90 || rotation == 270) {
            val w = width
            width = height
            height = w
        }
        val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        val frame = retriever.getFrameAtTime(0)
        var thumbnail: ByteArray? = null
        var tw = 0
        var th = 0
        if (frame != null) {
            val scaled = scaleAndRotate(frame, 1)
            thumbnail = jpeg(scaled)
            tw = scaled.width
            th = scaled.height
        }
        return Video(width, height, duration, thumbnail, tw, th)
    }

    private fun scaleAndRotate(bitmap: Bitmap, orientation: Int): Bitmap {
        val longest = maxOf(bitmap.width, bitmap.height)
        val scale = if (longest > THUMBNAIL_MAX_PIXEL) THUMBNAIL_MAX_PIXEL.toFloat() / longest else 1f
        val matrix = Matrix().apply {
            postScale(scale, scale)
            when (orientation) {
                3, 4 -> postRotate(180f)
                5, 6 -> postRotate(90f)
                7, 8 -> postRotate(270f)
            }
            if (orientation == 2 || orientation == 4 || orientation == 5 || orientation == 7) postScale(-1f, 1f)
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun jpeg(bitmap: Bitmap): ByteArray = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }.toByteArray()
}
