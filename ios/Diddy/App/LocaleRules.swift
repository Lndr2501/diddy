import Foundation

/// Shared JSON format with cinny/locales. No SwiftUI dependency so the rules can run under swiftc.
enum LocaleRules {
    static let suffixes = ["zero", "one", "two", "few", "many", "other"]

    static func flatten(_ tree: [String: Any]) -> [String: String] {
        var result: [String: String] = [:]
        func visit(_ node: [String: Any], _ prefix: String) {
            for (name, value) in node where name != "_meta" || !prefix.isEmpty {
                let key = prefix.isEmpty ? name : "\(prefix).\(name)"
                if let text = value as? String { result[key] = text }
                else if let group = value as? [String: Any] { visit(group, key) }
            }
        }
        visit(tree, "")
        return result
    }

    static func placeholders(_ text: String) -> Set<String> {
        let pattern = try! NSRegularExpression(pattern: #"\{\{\s*([A-Za-z0-9_]+)\s*\}\}"#)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return Set(pattern.matches(in: text, range: range).compactMap { match in
            Range(match.range(at: 1), in: text).map { String(text[$0]) }
        })
    }

    static func base(_ key: String) -> String {
        for suffix in suffixes where key.hasSuffix("_\(suffix)") {
            return String(key.dropLast(suffix.count + 1))
        }
        return key
    }

    static func validate(_ file: [String: Any], source: [String: String]) -> String? {
        guard let meta = file["_meta"] as? [String: Any],
              let code = meta["code"] as? String,
              code.range(of: #"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$"#, options: .regularExpression) != nil,
              let name = meta["name"] as? String, !name.trimmingCharacters(in: .whitespaces).isEmpty,
              let englishName = meta["englishName"] as? String, !englishName.isEmpty,
              meta["authors"] as? [String] != nil else { return "_meta: Invalid language details." }
        func checkTree(_ node: [String: Any], _ path: String) -> String? {
            for (name, value) in node where name != "_meta" || !path.isEmpty {
                let key = path.isEmpty ? name : "\(path).\(name)"
                if let group = value as? [String: Any] {
                    if let error = checkTree(group, key) { return error }
                } else if !(value is String) { return "\(key): Expected text or a group of texts." }
            }
            return nil
        }
        if let error = checkTree(file, "") { return error }
        for (key, value) in flatten(file) {
            let english = source[key] ?? source["\(base(key))_other"]
            guard let english else { return "\(key): Not found in en.json." }
            let wanted = placeholders(english)
            let have = placeholders(value)
            let plural = base(key) != key || source["\(key)_other"] != nil
            if !have.subtracting(wanted).isEmpty || !wanted.subtracting(have).subtracting(plural ? ["count"] : []).isEmpty {
                return "\(key): Placeholders do not match en.json."
            }
        }
        return nil
    }

    static func completion(_ file: [String: Any], source: [String: String]) -> Int {
        let units = Set(source.keys.map(base))
        guard !units.isEmpty else { return 100 }
        let translated = Set(flatten(file).filter { !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            (source[$0.key] != nil || source["\(base($0.key))_other"] != nil) }.keys.map(base))
        return units.intersection(translated).count * 100 / units.count
    }

    static func resolve(_ key: String, selected: [String: String], english: [String: String],
                        values: [String: String] = [:], locale: Locale = .current) -> String {
        func lookup(_ texts: [String: String]) -> String? {
            if let count = values["count"], let number = Double(count) {
                let category: String
                // one/other fallback for languages without platform plural categories.
                category = number == 1 ? "one" : "other"
                return texts["\(key)_\(category)"] ?? texts["\(key)_other"] ?? texts[key]
            }
            return texts[key]
        }
        let template = lookup(selected) ?? lookup(english) ?? english[key] ?? ""
        return values.reduce(template) { text, pair in
            text.replacingOccurrences(of: "{{\(pair.key)}}", with: pair.value)
        }
    }
}
