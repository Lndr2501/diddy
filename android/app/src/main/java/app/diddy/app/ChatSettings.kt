package app.diddy.app

import android.text.format.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The chat options under Settings > Chat, stored on this device like the desktop's settings. */
object ChatSettings {
    enum class TimeFormat(val raw: String, val title: String) {
        SYSTEM("system", "System"), TWELVE("twelve", "12-hour"), TWENTY_FOUR("twentyFour", "24-hour")
    }

    /** Desktop's Message Layout, with the same numbers. */
    enum class MessageLayout(val raw: Int, val title: String) {
        MODERN(0, "Modern"), COMPACT(1, "Compact"), BUBBLE(2, "Bubble")
    }

    /** Desktop's Message Spacing: the gap above a message that starts a group. */
    enum class MessageSpacing(val raw: String, val title: String, val points: Float) {
        NONE("0", "None", 0f), ULTRA_SMALL("100", "Ultra Small", 2f), EXTRA_SMALL("200", "Extra Small", 4f),
        SMALL("300", "Small", 8f), NORMAL("400", "Normal", 12f), LARGE("500", "Large", 16f)
    }

    const val TIME_FORMAT_KEY = "chat.timeFormat"
    const val DATE_FORMAT_KEY = "chat.dateFormat"
    const val SHOW_MEMBERSHIP_KEY = "chat.showMembershipEvents"
    const val HIDE_PROFILE_CHANGES_KEY = "chat.hideProfileChanges"
    const val SHOW_HIDDEN_EVENTS_KEY = "chat.showHiddenEvents"
    const val SHARE_ACTIVITY_KEY = "chat.shareTypingAndReceipts"
    const val AUTO_LOAD_MEDIA_KEY = "chat.autoLoadMedia"
    const val ENTER_FOR_NEWLINE_KEY = "chat.enterForNewline"
    const val MARKDOWN_KEY = "chat.markdown"
    const val EDITOR_TOOLBAR_KEY = "chat.editorToolbar"
    const val URL_PREVIEWS_KEY = "chat.urlPreviews"
    const val ENCRYPTED_URL_PREVIEWS_KEY = "chat.encryptedUrlPreviews"
    const val MESSAGE_LAYOUT_KEY = "chat.messageLayout"
    const val MESSAGE_SPACING_KEY = "chat.messageSpacing"
    const val LEGACY_USERNAME_COLOR_KEY = "chat.legacyUsernameColor"

    lateinit var appContext: android.content.Context

    val timeFormat: TimeFormat get() = TimeFormat.entries.firstOrNull { it.raw == Prefs.string(TIME_FORMAT_KEY) } ?: TimeFormat.SYSTEM
    val showMembership: Boolean get() = Prefs.bool(SHOW_MEMBERSHIP_KEY, true)
    /** Others see that you are typing and how far you have read. Off, receipts are private. */
    val shareActivity: Boolean get() = Prefs.bool(SHARE_ACTIVITY_KEY, true)
    val autoLoadMedia: Boolean get() = Prefs.bool(AUTO_LOAD_MEDIA_KEY, true)
    val hideProfileChanges: Boolean get() = Prefs.bool(HIDE_PROFILE_CHANGES_KEY, true)
    val showHiddenEvents: Boolean get() = Prefs.bool(SHOW_HIDDEN_EVENTS_KEY, false)
    val enterForNewline: Boolean get() = Prefs.bool(ENTER_FOR_NEWLINE_KEY, false)
    val markdown: Boolean get() = Prefs.bool(MARKDOWN_KEY, true)
    val editorToolbar: Boolean get() = Prefs.bool(EDITOR_TOOLBAR_KEY, false)
    val urlPreviews: Boolean get() = Prefs.bool(URL_PREVIEWS_KEY, true)
    /** Link previews in encrypted chats: the app reads the pages itself, the homeserver never learns the links. */
    val encryptedUrlPreviews: Boolean get() = Prefs.bool(ENCRYPTED_URL_PREVIEWS_KEY, true)
    fun urlPreviews(encrypted: Boolean): Boolean = if (encrypted) encryptedUrlPreviews else urlPreviews
    val messageLayout: MessageLayout
        get() = if (Prefs.has(MESSAGE_LAYOUT_KEY)) MessageLayout.entries.firstOrNull { it.raw == Prefs.int(MESSAGE_LAYOUT_KEY, 0) } ?: MessageLayout.MODERN else MessageLayout.MODERN
    val messageSpacing: MessageSpacing get() = MessageSpacing.entries.firstOrNull { it.raw == Prefs.string(MESSAGE_SPACING_KEY) } ?: MessageSpacing.NORMAL
    val legacyUsernameColor: Boolean get() = Prefs.bool(LEGACY_USERNAME_COLOR_KEY, false)

    val dateFormat: String get() = Prefs.string(DATE_FORMAT_KEY)?.ifEmpty { null } ?: DateFormatRules.DEFAULT_FORMAT

    fun date(date: Date): String = DateFormatRules.string(date, dateFormat)

    fun time(date: Date): String = when (timeFormat) {
        TimeFormat.SYSTEM -> DateFormat.getTimeFormat(appContext).format(date)
        TimeFormat.TWELVE -> SimpleDateFormat(DateFormat.getBestDateTimePattern(Locale.getDefault(), "hmma"), Locale.getDefault()).format(date)
        TimeFormat.TWENTY_FOUR -> SimpleDateFormat(DateFormat.getBestDateTimePattern(Locale.getDefault(), "HHmm"), Locale.getDefault()).format(date)
    }

    /** "Today at 10:15", "Yesterday at 9:00" or the date and time. */
    fun chatTimestamp(date: Date): String {
        val time = time(date)
        return when (app.diddy.matrix.TimelineLayout.day(date)) {
            app.diddy.matrix.TimelineLayout.Day.TODAY -> "Today at $time"
            app.diddy.matrix.TimelineLayout.Day.YESTERDAY -> "Yesterday at $time"
            else -> "${date(date)} $time"
        }
    }
}
