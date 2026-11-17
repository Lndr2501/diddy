package app.diddy.app

import android.content.Context
import android.os.Build
import app.diddy.BuildConfig
import java.io.File
import java.util.concurrent.Executors

/**
 * The app's log file, like `diag.rs` on the desktop and DiagLog.swift on iOS: one plain text file of
 * technical events (start, calls, connection problems, crashes), rotated at 2 MB. Settings > About
 * Diddy > Export Diagnostics shares it. It never contains message texts or keys.
 */
object DiagLog {
    private const val MAX_LINE = 600
    private const val MAX_BYTES = 2L * 1024 * 1024
    private val queue = Executors.newSingleThreadExecutor()
    private var directory: File? = null

    private val file get() = File(directory, "app.log")
    private val oldFile get() = File(directory, "app.log.old")

    fun setUp(context: Context) {
        directory = File(context.filesDir, "logs").apply { mkdirs() }
        write("---- Diddy ${BuildConfig.VERSION_NAME} started (${systemDescription}) ----")
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            // The process is about to die: write synchronously, the queue would never run.
            appendNow("CRASH ${error.javaClass.name}: ${error.message} at ${error.stackTrace.take(8).joinToString(" < ")}")
            previous?.uncaughtException(thread, error)
        }
    }

    /** Appends one line (newlines removed, length limited) with a Unix timestamp. */
    fun write(line: String) {
        queue.execute { appendNow(line) }
    }

    @Synchronized
    private fun appendNow(line: String) {
        val dir = directory ?: return
        dir.mkdirs()
        if (file.exists() && file.length() > MAX_BYTES) {
            oldFile.delete()
            file.renameTo(oldFile)
        }
        val text = line.replace(Regex("[\\r\\n]+"), " ").take(MAX_LINE)
        val stamped = String.format(java.util.Locale.US, "%.3f ", System.currentTimeMillis() / 1000.0) + text + "\n"
        try { file.appendText(stamped) } catch (_: Exception) {}
    }

    /** One text file with what a bug report needs: device, version and the log files. */
    fun export(context: Context): File {
        val out = File(context.cacheDir, "diddy-diagnostics.txt")
        val builder = StringBuilder()
        builder.append("Diddy Android ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\n")
        builder.append("Device: $systemDescription\n\n")
        queue.submit {
            if (oldFile.exists()) builder.append(oldFile.readText())
            if (file.exists()) builder.append(file.readText())
        }.get()
        out.writeText(builder.toString())
        return out
    }

    val systemDescription: String
        get() = "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
}
