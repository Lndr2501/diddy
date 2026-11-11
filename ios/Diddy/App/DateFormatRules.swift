import Foundation

/// The desktop's date formats (Settings > General > Date & Time, dayjs tokens such as
/// `D MMM YYYY`), turned into `DateFormatter` patterns so iOS shows dates the same way and both
/// apps understand the same custom format. Foundation only, checked by `Tools/dateformat_check`.
enum DateFormatRules {
    /// The desktop's presets, in its order. An empty format there means "Custom".
    static let presets = ["D MMM YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY/MM/DD", "YYYY-MM-DD"]
    static let defaultFormat = "D MMM YYYY"
    /// The desktop's custom format field takes at most 16 characters.
    static let maxLength = 16

    enum Piece: Equatable {
        /// Shown as it is.
        case text(String)
        /// A `DateFormatter` field, for example `yyyy`.
        case field(String)
        /// dayjs `d`: the day of the week as a number, Sunday = 0. No ICU field matches that.
        case weekdayNumber
    }

    /// dayjs tokens, longest first so `MMMM` wins over `MM`.
    private static let tokens: [(String, Piece)] = [
        ("YYYY", .field("yyyy")), ("MMMM", .field("MMMM")), ("dddd", .field("EEEE")),
        ("MMM", .field("MMM")), ("ddd", .field("EEE")), ("SSS", .field("SSS")),
        ("YY", .field("yy")), ("MM", .field("MM")), ("DD", .field("dd")), ("dd", .field("EEEEEE")),
        ("HH", .field("HH")), ("hh", .field("hh")), ("mm", .field("mm")), ("ss", .field("ss")), ("ZZ", .field("xx")),
        ("M", .field("M")), ("D", .field("d")), ("d", .weekdayNumber), ("H", .field("H")), ("h", .field("h")),
        ("m", .field("m")), ("s", .field("s")), ("A", .field("a")), ("a", .field("a")), ("Z", .field("xxx")),
    ]

    /// Splits a dayjs format into pieces. `[text]` is shown as it is, like in dayjs.
    static func pieces(_ format: String) -> [Piece] {
        var result: [Piece] = []
        var literal = ""
        func flush() {
            if !literal.isEmpty { result.append(.text(literal)) }
            literal = ""
        }
        let chars = Array(format)
        var index = 0
        while index < chars.count {
            if chars[index] == "[" {
                if let close = chars[(index + 1)...].firstIndex(of: "]") {
                    literal += String(chars[(index + 1)..<close])
                    index = close + 1
                    continue
                }
            }
            var matched = false
            for (token, piece) in tokens {
                let end = index + token.count
                if end <= chars.count, String(chars[index..<end]) == token {
                    flush()
                    result.append(piece)
                    index = end
                    matched = true
                    break
                }
            }
            if !matched {
                literal.append(chars[index])
                index += 1
            }
        }
        flush()
        return result
    }

    /// The `DateFormatter` pattern for the pieces. `weekday` fills dayjs `d` (Sunday = 0).
    static func pattern(_ pieces: [Piece], weekday: Int) -> String {
        var out = ""
        for piece in pieces {
            switch piece {
            case .text(let text): out += quoted(text)
            case .field(let field): out += field
            case .weekdayNumber: out += quoted(String(weekday))
            }
        }
        return out
    }

    /// Text in a pattern: letters must be quoted, a quote is doubled.
    static func quoted(_ text: String) -> String {
        guard text.contains(where: { $0.isLetter || $0 == "'" }) else { return text }
        return "'" + text.replacingOccurrences(of: "'", with: "''") + "'"
    }

    /// The date in the dayjs format, with English names like the desktop app.
    static func string(from date: Date, format: String, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let weekday = calendar.component(.weekday, from: date) - 1
        let icu = pattern(pieces(format.isEmpty ? defaultFormat : format), weekday: weekday)
        return formatter(icu, timeZone: timeZone).string(from: date)
    }

    private static let lock = NSLock()
    private static var formatters: [String: DateFormatter] = [:]

    private static func formatter(_ pattern: String, timeZone: TimeZone) -> DateFormatter {
        let key = pattern + "|" + timeZone.identifier
        lock.lock()
        defer { lock.unlock() }
        if let cached = formatters[key] { return cached }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = pattern
        if formatters.count > 32 { formatters.removeAll() }
        formatters[key] = formatter
        return formatter
    }
}
