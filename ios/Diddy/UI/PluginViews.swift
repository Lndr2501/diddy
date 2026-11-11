import SwiftUI
import UniformTypeIdentifiers
import WebKit

// Plugins (#132): the card that runs one plugin, the panel that shows the enabled ones (the iOS
// counterpart of the desktop's Plugins tab/dock) and Settings > Plugins. Logic lives in
// Plugins/PluginHost.swift, PluginStore.swift and PluginProtocol.swift.

/// Puts the plugin's WKWebView into SwiftUI.
private struct PluginWebContainer: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// One plugin, live: the sandboxed page at the height the plugin asks for, a status line and a
/// reload button. `previewHtml` shows code that is not saved yet (no plugin storage).
struct PluginCardView: View {
    let plugin: UserPlugin?
    var previewHtml: String?
    var showsTitle = true
    @Environment(\.colorScheme) private var scheme
    @ObservedObject private var store = PluginStore.shared
    @StateObject private var host = PluginHost()
    @State private var started = false

    private var themeName: String { scheme == .light ? "light" : "dark" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if showsTitle, let plugin {
                    Text(plugin.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(1)
                }
                Spacer()
                Button { host.reload() } label: {
                    Image(systemName: "arrow.clockwise").foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Reload")
            }
            PluginWebContainer(webView: host.webView)
                .frame(height: host.height)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if !host.isReady && !host.isSilent && !host.crashed { ProgressView().padding(8) }
                }
            if let status { Text(status).font(.caption).foregroundStyle(Theme.faint) }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.elevated))
        .onAppear(perform: start)
        .onChange(of: scheme) { _ in host.theme = themeName }
        .onChange(of: plugin?.customCss) { host.customCss = $0 }
    }

    private var status: String? {
        if host.crashed { return "The plugin stopped. Tap reload to start it again." }
        if !host.isReady { return host.isSilent ? "This page does not talk to Diddy. It is shown as a plain page." : "Loading plugin…" }
        return host.pluginDescription
    }

    private func start() {
        guard !started else { return }
        started = true
        host.theme = themeName
        host.customCss = plugin?.customCss
        host.log = { DiagLog.shared.write("plugin: \($0)") }
        host.openLink = { UIApplication.shared.open($0) }
        if let previewHtml {
            host.load(.html(previewHtml))
        } else if let plugin {
            let id = plugin.id
            host.readStorage = { PluginStore.shared.pluginValue(id, key: $0) }
            host.writeStorage = { PluginStore.shared.setPluginValue(id, key: $0, value: $1) }
            host.load(store.source(for: plugin))
        }
    }
}

// MARK: - Panel (opened from the user panel)

/// The enabled plugins, one card each.
struct PluginsPanelView: View {
    @ObservedObject private var store = PluginStore.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(store.activePlugins) { plugin in
                        PluginCardView(plugin: plugin)
                    }
                    if store.activePlugins.isEmpty {
                        Text("No plugins are turned on. Add some in Settings > Plugins.")
                            .font(.subheadline).foregroundStyle(Theme.muted).padding(.top, 40)
                    }
                }
                .padding(16)
            }
            .background(Theme.sidebar)
            .navigationTitle("Plugins")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

/// Button for the user panel: shows up as soon as at least one plugin is on (like the desktop's tab).
struct PluginsPanelButton: View {
    @ObservedObject private var store = PluginStore.shared
    @State private var showing = false

    var body: some View {
        if !store.activePlugins.isEmpty {
            Button { showing = true } label: {
                Image(systemName: "puzzlepiece.extension.fill").foregroundStyle(Theme.muted)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Plugins")
            .sheet(isPresented: $showing) { PluginsPanelView() }
        }
    }
}

// MARK: - Settings > Plugins

struct PluginSettingsView: View {
    @ObservedObject private var store = PluginStore.shared
    @State private var error: String?

    var body: some View {
        List {
            Section {
                ForEach(store.plugins) { plugin in
                    NavigationLink { PluginDetailView(pluginId: plugin.id) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(plugin.name).foregroundStyle(Theme.text)
                                Text(sourceLabel(plugin)).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(get: { plugin.enabled }, set: { store.setEnabled(plugin.id, $0) }))
                                .labelsHidden()
                        }
                    }
                    .swipeActions { Button("Remove", role: .destructive) { store.remove(plugin.id) } }
                }
                NavigationLink { AddPluginView() } label: { Label("Add Plugin", systemImage: "plus.circle.fill") }
                    .disabled(store.plugins.count >= PluginRules.maxPlugins)
            } header: {
                Text("Your plugins")
            } footer: {
                Text("Turned-on plugins appear in the puzzle button next to Settings. A plugin is a small web page that runs in a locked-down frame: no access to your account, messages or files. Only add plugins you trust.")
            }

            Section("Built-in plugins") {
                ForEach(PluginStore.builtins) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).foregroundStyle(Theme.text)
                            Text(item.description).font(.caption).foregroundStyle(Theme.faint)
                        }
                        Spacer()
                        if store.isAdded(builtin: item.slug) {
                            Image(systemName: "checkmark").foregroundStyle(Theme.online)
                        } else {
                            Button("Add") {
                                do { try store.addBuiltin(item) } catch { self.error = error.friendlyMessage }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Plugins")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Plugins", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }

    private func sourceLabel(_ plugin: UserPlugin) -> String {
        if PluginAddress.builtinSlug(plugin.url) != nil { return "Built-in" }
        if PluginAddress.localId(plugin.url) != nil { return "On this device" }
        return URL(string: plugin.url)?.host ?? plugin.url
    }
}

/// One plugin: switch, live card, where it comes from, custom CSS, remove.
struct PluginDetailView: View {
    let pluginId: String
    @ObservedObject private var store = PluginStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var css = ""
    @State private var loadedCss = false

    var body: some View {
        if let plugin = store.plugins.first(where: { $0.id == pluginId }) {
            List {
                Section {
                    Toggle("Turned on", isOn: Binding(get: { plugin.enabled }, set: { store.setEnabled(plugin.id, $0) }))
                }
                Section("Preview") {
                    PluginCardView(plugin: plugin, showsTitle: false)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                if let id = PluginAddress.localId(plugin.url) {
                    Section("Content") { localInfo(id) }
                } else if PluginAddress.builtinSlug(plugin.url) == nil {
                    Section("Address") { Text(plugin.url).font(.footnote).foregroundStyle(Theme.muted).textSelection(.enabled) }
                }
                Section {
                    TextEditor(text: $css)
                        .font(.system(.footnote, design: .monospaced))
                        .frame(minHeight: 90)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: css) { store.setCustomCss(plugin.id, $0) }
                } header: {
                    Text("Custom CSS")
                } footer: {
                    Text("Sent to the plugin, which decides whether to apply it (up to \(PluginRules.maxCustomCSS) characters). Reload the preview to see it.")
                }
                Section {
                    Button("Remove Plugin", role: .destructive) {
                        store.remove(plugin.id)
                        dismiss()
                    }
                } footer: {
                    Text("Removing also deletes what the plugin saved on this device.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle(plugin.name)
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if !loadedCss { css = plugin.customCss ?? ""; loadedCss = true }
            }
        } else {
            Text("This plugin was removed.").foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder
    private func localInfo(_ id: String) -> some View {
        if let record = store.localRecord(id) {
            LabeledContent("Source", value: sourceText(record))
            LabeledContent("Size", value: "\(max(1, Int((Double(record.size) / 1024).rounded()))) KB")
            LabeledContent("SHA-256", value: String(record.sha256.prefix(12)))
        } else {
            Text("Content missing on this device. Remove the plugin and add it again.").foregroundStyle(Theme.danger)
        }
    }

    private func sourceText(_ record: PluginStore.LocalRecord) -> String {
        switch record.origin {
        case .file: return record.fileName.map { "File \($0)" } ?? "File"
        case .paste: return "Pasted code"
        case .github, .gist: return record.rawUrl.flatMap { URL(string: $0)?.lastPathComponent } ?? "GitHub"
        }
    }
}

// MARK: - Add a plugin

struct AddPluginView: View {
    private enum Kind: String, CaseIterable, Identifiable {
        case address = "Address", code = "Code", file = "File", github = "GitHub"
        var id: String { rawValue }
    }

    @ObservedObject private var store = PluginStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var kind = Kind.address
    @State private var name = ""
    @State private var address = ""
    @State private var code = ""
    @State private var fileName: String?
    @State private var githubLink = ""
    @State private var fetched: (link: PluginSourceLink, html: String)?
    @State private var busy = false
    @State private var importing = false
    @State private var previewing = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                Picker("Source", selection: $kind) {
                    ForEach(Kind.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            Section {
                TextField(kind == .address ? "Name" : "Name (optional)", text: $name)
            }
            switch kind {
            case .address:
                Section {
                    TextField("https://example.com/plugin.html", text: $address)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                } footer: {
                    Text("A web page that follows the plugin contract (docs/plugins.md). Only https addresses work on iOS.")
                }
            case .code:
                Section {
                    TextEditor(text: $code)
                        .font(.system(.footnote, design: .monospaced))
                        .frame(minHeight: 160)
                        .autocorrectionDisabled().textInputAutocapitalization(.never)
                    Button("Preview") { previewing = true }.disabled(code.isEmpty)
                } header: { Text("HTML code") } footer: {
                    Text("One self-contained HTML file, at most \(PluginRules.maxLocalBytes / 1024) KB. It is saved on this device.")
                }
            case .file:
                Section {
                    Button { importing = true } label: { Label(fileName ?? "Choose an .html file", systemImage: "doc") }
                    if !code.isEmpty { Button("Preview") { previewing = true } }
                } footer: {
                    Text("The file is saved on this device.")
                }
            case .github:
                Section {
                    TextField("github.com/user/repo/blob/main/plugin.html", text: $githubLink)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button { Task { await importFromGitHub() } } label: {
                        if busy { ProgressView() } else { Text(fetched == nil ? "Import" : "Import again") }
                    }
                    .disabled(busy || githubLink.isEmpty)
                    if fetched != nil { Button("Preview") { previewing = true } }
                } footer: {
                    Text("Link to a single .html file in a public repository, or to a public Gist. It is loaded once and saved on this device.")
                }
            }
            Section {
                Button("Add Plugin") { add() }.disabled(!canAdd || busy)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Add Plugin")
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(isPresented: $importing, allowedContentTypes: [.html], allowsMultipleSelection: false) { result in
            readFile(result)
        }
        .sheet(isPresented: $previewing) {
            NavigationStack {
                ScrollView { PluginCardView(plugin: nil, previewHtml: previewHtml).padding(16) }
                    .background(Theme.sidebar)
                    .navigationTitle("Preview")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { previewing = false } } }
            }
        }
        .alert("Plugins", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }

    private var previewHtml: String {
        kind == .github ? (fetched?.html ?? "") : code
    }

    private var canAdd: Bool {
        switch kind {
        case .address: return !address.isEmpty
        case .code, .file: return !code.isEmpty
        case .github: return fetched != nil
        }
    }

    private func add() {
        do {
            switch kind {
            case .address:
                try store.addRemote(name: name, address: address)
            case .code:
                try store.addLocal(name: name, html: code, origin: .paste)
            case .file:
                try store.addLocal(name: name, html: code, origin: .file, fileName: fileName)
            case .github:
                guard let fetched else { return }
                try store.addLocal(name: name, html: fetched.html, origin: fetched.link.kind == .gist ? .gist : .github, link: fetched.link, sourceUrl: githubLink)
            }
            dismiss()
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private func importFromGitHub() async {
        busy = true
        defer { busy = false }
        do {
            let link = try PluginGitHub.rawURL(from: githubLink).get()
            let html = try await PluginGitHubFetcher.fetch(link)
            fetched = (link, html)
            if name.isEmpty { name = PluginContent.title(of: html) }
        } catch {
            fetched = nil
            self.error = error.friendlyMessage
        }
    }

    private func readFile(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if size > PluginRules.maxLocalBytes { throw PluginError("The plugin is too large (at most \(PluginRules.maxLocalBytes / 1024) KB).") }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else { throw PluginError("This is not an HTML page.") }
            code = try PluginContent.validate(text).get()
            fileName = url.lastPathComponent
            if name.isEmpty { name = PluginContent.title(of: code).isEmpty ? PluginContent.name(fromFileName: url.lastPathComponent) : PluginContent.title(of: code) }
        } catch {
            self.error = error.friendlyMessage
        }
    }
}
