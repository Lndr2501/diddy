import Foundation

struct LocaleCheck {
    static func main() {
        let source: [String: String] = ["ios.hello": "Hello {{name}}", "ios.members_one": "{{count}} member",
                                         "ios.members_other": "{{count}} members", "ios.english": "English"]
        let selected = ["ios.hello": "Hallo {{name}}", "ios.members_one": "{{count}} Mitglied",
                        "ios.members_other": "{{count}} Mitglieder"]
        func check(_ condition: Bool, _ description: String) {
            if !condition { fatalError(description) }
        }
        check(LocaleRules.resolve("ios.hello", selected: selected, english: source, values: ["name": "Ada"]) == "Hallo Ada", "placeholder")
        check(LocaleRules.resolve("ios.members", selected: selected, english: source, values: ["count": "1"]) == "1 Mitglied", "one")
        check(LocaleRules.resolve("ios.members", selected: selected, english: source, values: ["count": "3"]) == "3 Mitglieder", "other")
        check(LocaleRules.resolve("ios.english", selected: selected, english: source) == "English", "fallback")
        let file: [String: Any] = ["_meta": ["code": "de", "name": "Deutsch", "englishName": "German", "authors": [String]()],
                                   "ios": ["hello": "Hallo {{name}}"]]
        check(LocaleRules.flatten(file)["ios.hello"] == "Hallo {{name}}", "nested lookup")
        check(LocaleRules.validate(file, source: source) == nil, "valid file")
        var bad = file
        bad["ios"] = ["hello": "Hallo {{user}}"]
        check(LocaleRules.validate(bad, source: source) != nil, "placeholder mismatch")
        print("Locale rules OK")
    }
}

LocaleCheck.main()
