package app.diddy.app

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import app.diddy.util.DiddyError
import java.io.File
import java.util.UUID

/**
 * The app's sounds, all from Diddy's sound pack: the MP3s the desktop and iOS apps play too
 * (cinny/public/sound/diddy, copied into the APK's assets). ios Sounds.swift.
 */
enum class Sound(val raw: String, val title: String, val detail: String, val packFile: String) {
    RINGTONE("ringtone", "Incoming call", "Rings while someone calls you.", "call_ringing"),
    RINGBACK("ringback", "Outgoing call", "Rings while you call someone, until they answer or decline.", "call_calling"),
    CALL_JOINED("call_joined", "You join", "You enter a call.", "user_join"),
    CALL_LEFT("call_left", "You leave", "You leave the call.", "disconnect"),
    USER_JOINED("user_joined", "Someone joins", "Another person joins your call.", "user_join"),
    USER_LEFT("user_left", "Someone leaves", "Another person leaves your call.", "user_leave"),
    MUTE("mute", "Microphone off", "You mute yourself.", "mute"),
    UNMUTE("unmute", "Microphone on", "You unmute yourself.", "unmute"),
    DEAFEN("deafen", "Headphones off", "You deafen yourself.", "deafen"),
    UNDEAFEN("undeafen", "Headphones on", "You undeafen yourself.", "undeafen"),
    SCREEN_SHARE_STARTED("screen_share_started", "Stream starts", "You start sharing your screen.", "stream_started"),
    SCREEN_SHARE_STOPPED("screen_share_stopped", "Stream ends", "You stop sharing your screen.", "stream_ended"),
    CAMERA_ON("camera_on", "Camera on", "You turn the camera on.", "camera_on"),
    CAMERA_OFF("camera_off", "Camera off", "You turn the camera off.", "camera_off"),
    MESSAGE("message", "New message", "A message that notifies you.", "message1"),
    MENTION("mention", "Mention", "A message that mentions you.", "mention"),
    INVITE("invite", "Invitation", "You are invited to a room.", "invite"),
    CALL_DECLINED("call_declined", "Call declined", "The person you call declines.", "call_declined"),
    NO_ANSWER("no_answer", "No answer", "The person you call does not answer.", "no_answer"),
    CONNECTION_LOST("connection_lost", "Connection lost", "Your call loses its connection.", "connection_lost"),
    MIC_CHANGE("mic_change", "Microphone changed", "You pick another microphone.", "mic_change");

    /** The group switch of older versions; its value is where a sound's own switch starts. */
    val group: String
        get() = when (this) {
            RINGTONE -> "diddy.sounds.ringing"
            MESSAGE, MENTION, INVITE -> "diddy.sounds.messages"
            else -> "diddy.sounds.calls"
        }

    /** What the sound announces, for Do Not Disturb. */
    val alert: String
        get() = when (this) {
            MESSAGE -> "message"
            MENTION -> "mention"
            INVITE -> "invite"
            RINGTONE -> "incomingCall"
            else -> "other"
        }

    val enabledKey: String get() = "diddy.sound.enabled.$raw"

    /** On unless switched off. Like on the desktop, the invitation sound starts off. */
    val isEnabled: Boolean
        get() {
            if (Prefs.has(enabledKey)) return Prefs.bool(enabledKey)
            if (Prefs.has(group)) return Prefs.bool(group, true)
            return this != INVITE
        }

    fun setEnabled(on: Boolean) = Prefs.setBool(enabledKey, on)

    companion object {
        /** The groups of Settings > Sounds, in the desktop's order. */
        val groups: List<Pair<String, List<Sound>>> = listOf(
            "Messages" to listOf(MESSAGE, MENTION, INVITE),
            "Calls" to listOf(RINGTONE, RINGBACK, CALL_JOINED, USER_JOINED, USER_LEFT, CALL_LEFT, CALL_DECLINED, NO_ANSWER, CONNECTION_LOST),
            "Your controls" to listOf(MUTE, UNMUTE, DEAFEN, UNDEAFEN, CAMERA_ON, CAMERA_OFF, SCREEN_SHARE_STARTED, SCREEN_SHARE_STOPPED, MIC_CHANGE),
        )
    }
}

object Sounds {
    private lateinit var context: Context
    /** The chat on screen, which has no need to announce its own messages. */
    var openRoomId: String? = null
    /** A call owns the audio then; sounds play as call audio so they reach the earpiece or headset. */
    var inCall = false

    private val players = mutableListOf<MediaPlayer>()
    private var looping: MediaPlayer? = null
    private var lastAlert = 0L
    private val lastPlayed = mutableMapOf<Sound, Long>()

    fun init(context: Context) {
        this.context = context.applicationContext
    }

    /** Plays a sound unless it is switched off. The same sound twice within a moment plays once. */
    fun play(sound: Sound) {
        if (!sound.isEnabled) return
        val now = System.currentTimeMillis()
        if ((lastPlayed[sound] ?: 0) > now - 400) return
        lastPlayed[sound] = now
        start(sound, loop = false)
    }

    /** Plays a sound regardless of its switch, for trying it out in Settings. */
    fun preview(sound: Sound) {
        stopLoop()
        start(sound, loop = false)
    }

    /** New messages can arrive in bursts; one sound stands for all of them. */
    fun playAlert(sound: Sound) {
        val now = System.currentTimeMillis()
        if (now - lastAlert <= 1000) return
        lastAlert = now
        play(sound)
    }

    fun startRinging() {
        stopLoop()
        if (!Sound.RINGTONE.isEnabled) return
        looping = start(Sound.RINGTONE, loop = true)
        vibrator()?.let { vib ->
            val pattern = longArrayOf(0, 600, 1400)
            vib.vibrate(VibrationEffect.createWaveform(pattern, 0))
        }
    }

    fun startRingback() {
        stopLoop()
        if (!Sound.RINGBACK.isEnabled) return
        looping = start(Sound.RINGBACK, loop = true)
    }

    fun stopLoop() {
        vibrator()?.cancel()
        looping?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
            players.remove(it)
        }
        looping = null
    }

    private fun vibrator(): Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    private fun start(sound: Sound, loop: Boolean): MediaPlayer? {
        val player = MediaPlayer()
        try {
            val usage = when {
                sound == Sound.RINGTONE -> AudioAttributes.USAGE_NOTIFICATION_RINGTONE
                inCall -> AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
                sound == Sound.MESSAGE || sound == Sound.MENTION || sound == Sound.INVITE -> AudioAttributes.USAGE_NOTIFICATION
                else -> AudioAttributes.USAGE_ASSISTANCE_SONIFICATION
            }
            player.setAudioAttributes(AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            val custom = CustomSounds.file(sound)
            if (custom != null) {
                player.setDataSource(custom.absolutePath)
            } else {
                context.assets.openFd("sound/diddy/${sound.packFile}.mp3").use { fd ->
                    player.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
                }
            }
            player.isLooping = loop
            player.setOnCompletionListener {
                if (!loop) {
                    it.release()
                    players.remove(it)
                }
            }
            player.setOnPreparedListener { it.start() }
            player.prepareAsync()
            players += player
            return player
        } catch (e: Exception) {
            player.release()
            DiagLog.write("sound: ${sound.raw} failed ${e.message}")
            return null
        }
    }
}

/** Own audio files that replace Diddy's sounds (Settings > Sounds > Replace), at most 800 KB. */
object CustomSounds {
    const val MAX_BYTES = 800 * 1024
    private fun nameKey(sound: Sound) = "diddy.sound.custom.${sound.raw}"
    private fun fileKey(sound: Sound) = "diddy.sound.customFile.${sound.raw}"
    private lateinit var folder: File

    fun init(context: Context) {
        folder = File(context.filesDir, "custom-sounds")
    }

    fun name(sound: Sound): String? = if (file(sound) != null) Prefs.string(nameKey(sound)) else null

    fun file(sound: Sound): File? {
        val name = Prefs.string(fileKey(sound)) ?: return null
        val file = File(folder, name)
        return if (file.exists()) file else null
    }

    fun set(context: Context, sound: Sound, uri: Uri, displayName: String) {
        val data = try {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: throw DiddyError("The file could not be read.")
        } catch (e: DiddyError) {
            throw e
        } catch (_: Exception) {
            throw DiddyError("The file could not be read.")
        }
        if (data.size > MAX_BYTES) throw DiddyError("The file is too big. Use an audio file up to 800 KB.")
        if (data.isEmpty()) throw DiddyError("Please choose an audio file (MP3, WAV, M4A).")
        folder.mkdirs()
        val ext = displayName.substringAfterLast('.', "audio").lowercase().takeIf { it.length <= 5 && it.all(Char::isLetterOrDigit) } ?: "audio"
        val name = "${sound.raw}-${UUID.randomUUID()}.$ext"
        File(folder, name).writeBytes(data)
        removeFile(sound)
        Prefs.setString(fileKey(sound), name)
        Prefs.setString(nameKey(sound), displayName)
    }

    fun reset(sound: Sound) {
        removeFile(sound)
        Prefs.remove(fileKey(sound))
        Prefs.remove(nameKey(sound))
    }

    private fun removeFile(sound: Sound) {
        Prefs.string(fileKey(sound))?.let { File(folder, it).delete() }
    }
}
