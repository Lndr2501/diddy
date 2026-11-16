package app.diddy.app

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The desktop's date formats (dayjs tokens such as `D MMM YYYY`), turned into SimpleDateFormat
 * patterns so Android shows dates the same way (ios DateFormatRules.swift).
 */
object DateFormatRules {
    val presets = listOf("D MMM YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY/MM/DD", "YYYY-MM-DD")
    const val DEFAULT_FORMAT = "D MMM YYYY"
    const val MAX_LENGTH = 16

    sealed class Piece {
        data class Text(val text: String) : Piece()
        data class Field(val field: String) : Piece()
        data object WeekdayNumber : Piece()
    }

    /** dayjs tokens, longest first so `MMMM` wins over `MM`. */
    private val tokens: List<Pair<String, Piece>> = listOf(
        "YYYY" to Piece.Field("yyyy"), "MMMM" to Piece.Field("MMMM"), "dddd" to Piece.Field("EEEE"),
        "MMM" to Piece.Field("MMM"), "ddd" to Piece.Field("EEE"), "SSS" to Piece.Field("SSS"),
        "YY" to Piece.Field("yy"), "MM" to Piece.Field("MM"), "DD" to Piece.Field("dd"), "dd" to Piece.Field("EE"),
        "HH" to Piece.Field("HH"), "hh" to Piece.Field("hh"), "mm" to Piece.Field("mm"), "ss" to Piece.Field("ss"), "ZZ" to Piece.Field("XX"),
        "M" to Piece.Field("M"), "D" to Piece.Field("d"), "d" to Piece.WeekdayNumber, "H" to Piece.Field("H"), "h" to Piece.Field("h"),
        "m" to Piece.Field("m"), "s" to Piece.Field("s"), "A" to Piece.Field("a"), "a" to Piece.Field("a"), "Z" to Piece.Field("XXX"),
    )

    fun pieces(format: String): List<Piece> {
        val result = mutableListOf<Piece>()
        val literal = StringBuilder()
        fun flush() {
            if (literal.isNotEmpty()) result += Piece.Text(literal.toString())
            literal.clear()
        }
        var index = 0
        while (index < format.length) {
            if (format[index] == '[') {
                val close = format.indexOf(']', index + 1)
                if (close >= 0) {
                    literal.append(format, index + 1, close)
                    index = close + 1
                    continue
                }
            }
            var matched = false
            for ((token, piece) in tokens) {
                if (format.startsWith(token, index)) {
                    flush()
                    result += piece
                    index += token.length
                    matched = true
                    break
                }
            }
            if (!matched) {
                literal.append(format[index])
                index += 1
            }
        }
        flush()
        return result
    }

    fun pattern(pieces: List<Piece>, weekday: Int): String = buildString {
        for (piece in pieces) {
            when (piece) {
                is Piece.Text -> append(quoted(piece.text))
                is Piece.Field -> append(piece.field)
                Piece.WeekdayNumber -> append(quoted(weekday.toString()))
            }
        }
    }

    /** Text in a pattern: letters must be quoted, a quote is doubled. */
    fun quoted(text: String): String {
        if (text.none { it.isLetter() || it == '\'' }) return text
        return "'" + text.replace("'", "''") + "'"
    }

    /** The date in the dayjs format, with English names like the desktop app. */
    fun string(date: Date, format: String, timeZone: TimeZone = TimeZone.getDefault()): String {
        val calendar = Calendar.getInstance(timeZone).apply { time = date }
        val weekday = calendar.get(Calendar.DAY_OF_WEEK) - 1
        val pattern = pattern(pieces(format.ifEmpty { DEFAULT_FORMAT }), weekday)
        return try {
            SimpleDateFormat(pattern, Locale.US).apply { this.timeZone = timeZone }.format(date)
        } catch (_: Exception) {
            SimpleDateFormat("d MMM yyyy", Locale.US).apply { this.timeZone = timeZone }.format(date)
        }
    }
}
