import Foundation
import SwiftUI

/// Language selection is local to this device. Bundled JSON is a folder reference to cinny/locales.
final class AppLanguage: ObservableObject {
    static let shared = AppLanguage()
    @Published private(set) var revision = 0
    @Published private(set) var preference: String = UserDefaults.standard.string(forKey: "diddy-language") ?? "system"
    private(set) var bundled: [String: [String: Any]] = [:]
    private(set) var custom: [String: [String: Any]] = [:]
    private let customDirectory: URL

    private init() {
        customDirectory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("DiddyLanguages", isDirectory: true)
        if let folder = Bundle.main.url(forResource: "locales", withExtension: nil),
           let urls = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) {
            for url in urls where url.pathExtension == "json" {
                if let file = Self.read(url) { bundled[url.deletingPathExtension().lastPathComponent] = file }
            }
        }
        if let urls = try? FileManager.default.contentsOfDirectory(at: customDirectory, includingPropertiesForKeys: nil) {
            for url in urls where url.pathExtension == "json" {
                if let file = Self.read(url), let code = (file["_meta"] as? [String: Any])?["code"] as? String,
                   LocaleRules.validate(file, source: english) == nil {
                    custom[code] = file
                }
            }
        }
    }

    private static func read(_ url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url), data.count <= 2 * 1024 * 1024 else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    var english: [String: String] { LocaleRules.flatten(bundled["en"] ?? [:]) }
    var codes: [String] { Array(Set(bundled.keys).union(custom.keys)).sorted() }
    var activeCode: String {
        if preference != "system", codes.contains(preference) { return preference }
        for id in Locale.preferredLanguages {
            if let code = codes.first(where: { $0.caseInsensitiveCompare(id) == .orderedSame }) { return code }
            let base = id.split(separator: "-").first.map(String.init) ?? id
            if let code = codes.first(where: { $0.caseInsensitiveCompare(base) == .orderedSame }) { return code }
            if let code = codes.first(where: { $0.split(separator: "-").first?.lowercased() == base.lowercased() }) { return code }
        }
        return "en"
    }

    func name(_ code: String) -> String {
        ((custom[code] ?? bundled[code])?["_meta"] as? [String: Any])?["name"] as? String ?? code
    }

    func percent(_ code: String) -> Int {
        LocaleRules.completion(custom[code] ?? bundled[code] ?? [:], source: english)
    }

    func text(_ key: String, _ values: [String: String] = [:]) -> String {
        let code = activeCode
        let file = custom[code] ?? bundled[code] ?? [:]
        return LocaleRules.resolve(key, selected: LocaleRules.flatten(file), english: english,
                                   values: values, locale: Locale(identifier: code))
    }

    func select(_ code: String) {
        preference = code
        if code == "system" { UserDefaults.standard.removeObject(forKey: "diddy-language") }
        else { UserDefaults.standard.set(code, forKey: "diddy-language") }
        revision += 1
    }

    func importFile(_ url: URL) throws {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url)
        guard data.count <= 2 * 1024 * 1024 else { throw LanguageError.invalid(L("ios.errorsExtra.theFileIsTooBig2MbMaximum")) }
        guard let file = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            throw LanguageError.invalid(L("ios.errorsExtra.theFileIsNotValidJson"))
        }
        if let problem = LocaleRules.validate(file, source: english) { throw LanguageError.invalid(problem) }
        let code = (file["_meta"] as! [String: Any])["code"] as! String
        try FileManager.default.createDirectory(at: customDirectory, withIntermediateDirectories: true)
        try data.write(to: customDirectory.appendingPathComponent(code + ".json"), options: .atomic)
        custom[code] = file
        select(code)
    }

    func remove(_ code: String) throws {
        try FileManager.default.removeItem(at: customDirectory.appendingPathComponent(code + ".json"))
        custom.removeValue(forKey: code)
        select(bundled[code] == nil ? "system" : code)
    }

    enum LanguageError: LocalizedError {
        case invalid(String)
        var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
    }
}

/// Resolve a dotted key in the active language, falling back to the bundled English source.
func L(_ key: String, _ values: [String: String] = [:]) -> String {
    AppLanguage.shared.text(key, values)
}
