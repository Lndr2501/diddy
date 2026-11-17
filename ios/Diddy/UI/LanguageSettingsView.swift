import SwiftUI
import UniformTypeIdentifiers

struct LanguageSettingsView: View {
    @ObservedObject private var language = AppLanguage.shared
    @State private var importing = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                option("system", title: L("settings.language.systemWith", ["name": language.name(language.activeCode)]))
                ForEach(language.codes, id: \.self) { code in
                    option(code, title: L("settings.language.option", [
                        "name": language.name(code), "percent": String(language.percent(code))
                    ]) + (language.custom[code] == nil ? "" : " · " + L("settings.language.ownFile")))
                }
            } footer: {
                Text(L("settings.language.description"))
            }
            Section {
                Button(L("settings.language.load")) { importing = true }
                ForEach(language.codes.filter { language.custom[$0] != nil }, id: \.self) { code in
                    Button(role: .destructive) {
                        do { try language.remove(code) }
                        catch { self.error = error.localizedDescription }
                    } label: {
                        Text(L("settings.language.remove") + " · " + language.name(code))
                    }
                }
            }
        }
        .navigationTitle(L("settings.language.title"))
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            do { try language.importFile(result.get()) }
            catch { self.error = error.localizedDescription }
        }
        .alert(L("settings.language.invalid"), isPresented: Binding(
            get: { error != nil }, set: { if !$0 { error = nil } }
        )) {
            Button(L("ios.common.ok")) { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private func option(_ code: String, title: String) -> some View {
        Button { language.select(code) } label: {
            HStack {
                Text(title).foregroundStyle(Theme.text)
                Spacer()
                if language.preference == code { Image(systemName: "checkmark") }
            }
        }
    }
}
