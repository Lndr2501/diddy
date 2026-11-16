import Foundation

/// Extensions have their own bundle and defaults, so resolve bundled translations using the iOS
/// system language. App-imported languages and the in-app override are not available here.
enum ExtensionLanguage {
    private static let texts: [String: [String: String]] = {
        guard let folder = Bundle.main.url(forResource: "locales", withExtension: nil),
              let urls = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return [:] }
        var result: [String: [String: String]] = [:]
        for url in urls where url.pathExtension == "json" {
            guard let data = try? Data(contentsOf: url),
                  let tree = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            result[url.deletingPathExtension().lastPathComponent] = LocaleRules.flatten(tree)
        }
        return result
    }()

    static func text(_ key: String, _ values: [String: String] = [:]) -> String {
        let codes = texts.keys.sorted()
        let selected = Locale.preferredLanguages.compactMap { identifier -> String? in
            let base = identifier.split(separator: "-").first.map(String.init) ?? identifier
            return codes.first { $0.caseInsensitiveCompare(identifier) == .orderedSame }
                ?? codes.first { $0.caseInsensitiveCompare(base) == .orderedSame }
                ?? codes.first { $0.split(separator: "-").first?.lowercased() == base.lowercased() }
        }.first ?? "en"
        return LocaleRules.resolve(key, selected: texts[selected] ?? [:], english: texts["en"] ?? [:], values: values)
    }
}
