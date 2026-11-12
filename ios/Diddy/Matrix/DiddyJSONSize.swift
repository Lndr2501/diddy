import Foundation

/// The size limit of Diddy events counts `JSON.stringify(content).length` on desktop (UTF-16
/// units). This computes the same number from the parsed content, without `JSONSerialization`:
/// Apple's writer prints some numbers with 17 digits (`37.3` as `37.299999999999997`), so a large
/// profile that desktop accepts could count as too large here and vanish from every card.
///
/// Foundation only, so the check tools can use it (`Tools/profile_editor_check`).
enum DiddyJSONSize {
    /// Length of `JSON.stringify(value)`, or nil when the value is no JSON (NaN, infinity, other
    /// types), like `JSONSerialization.isValidJSONObject` would say.
    static func length(_ value: Any) -> Int? {
        if value is NSNull { return 4 }
        if let text = value as? String { return quotedLength(text) }
        if let flag = value as? Bool, type(of: value) == Bool.self { return flag ? 4 : 5 }
        if let number = value as? NSNumber {
            #if canImport(ObjectiveC)
            // parsed JSON booleans are NSNumbers on Apple platforms
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue ? 4 : 5 }
            #endif
            return javaScriptNumber(number.doubleValue)?.utf16.count
        }
        if let number = value as? Int { return javaScriptNumber(Double(number))?.utf16.count }
        if let number = value as? Double { return javaScriptNumber(number)?.utf16.count }
        if let dict = value as? [String: Any] {
            var total = 2 + max(0, dict.count - 1)
            for (key, item) in dict {
                guard let size = length(item) else { return nil }
                total += quotedLength(key) + 1 + size
            }
            return total
        }
        if let array = value as? [Any] {
            var total = 2 + max(0, array.count - 1)
            for item in array {
                guard let size = length(item) else { return nil }
                total += size
            }
            return total
        }
        return nil
    }

    /// A string in quotes with JSON's escapes, counted in UTF-16 units.
    static func quotedLength(_ text: String) -> Int {
        var total = 2
        for unit in text.utf16 {
            switch unit {
            case 0x22, 0x5C, 0x08, 0x0C, 0x0A, 0x0D, 0x09: total += 2 // \" \\ \b \f \n \r \t
            case 0..<0x20: total += 6 // \u00XX
            default: total += 1
            }
        }
        return total
    }

    /// `String(n)` of JavaScript (Number::toString): the shortest digits that read back as the
    /// same number, in plain notation from 1e-6 up to below 1e21, else with an exponent.
    static func javaScriptNumber(_ value: Double) -> String? {
        guard value.isFinite else { return nil }
        if value == 0 { return "0" }
        let sign = value < 0 ? "-" : ""
        // Swift prints the shortest round-trip digits too, only formatted differently.
        let swift = "\(value.magnitude)"
        var mantissa = Substring(swift)
        var exponent = 0
        if let e = swift.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            mantissa = swift[..<e]
            exponent = Int(swift[swift.index(after: e)...]) ?? 0
        }
        let parts = mantissa.split(separator: ".", omittingEmptySubsequences: false)
        let whole = String(parts[0])
        let fraction = parts.count > 1 ? String(parts[1]) : ""
        // value = 0.digits * 10^point
        var digits = whole + fraction
        var point = whole.count + exponent
        while digits.hasPrefix("0") {
            digits.removeFirst()
            point -= 1
        }
        while digits.hasSuffix("0") { digits.removeLast() }
        guard !digits.isEmpty else { return "0" }
        let k = digits.count
        let body: String
        if k <= point && point <= 21 {
            body = digits + String(repeating: "0", count: point - k)
        } else if 0 < point && point <= 21 {
            body = String(digits.prefix(point)) + "." + String(digits.dropFirst(point))
        } else if -6 < point && point <= 0 {
            body = "0." + String(repeating: "0", count: -point) + digits
        } else {
            let e = point - 1
            let head = k == 1 ? digits : String(digits.prefix(1)) + "." + String(digits.dropFirst())
            body = head + "e" + (e < 0 ? "-" : "+") + String(e.magnitude)
        }
        return sign + body
    }
}
