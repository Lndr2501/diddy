import Foundation
import SwiftUI

/// Import of sounds from myinstants.com into the soundboard (#134), like the desktop's
/// (`cinny/src/app/plugins/myinstants.ts`, `src-tauri/src/myinstants.rs`): search, preview, pick
/// several, import. Parsing lives in `MyInstantsParser.swift`.

/// The only two kinds of requests the app makes to MyInstants: a page and a sound file. https on
/// myinstants.com only, also after redirects; sizes are limited; a sound must really be audio.
enum MyInstantsClient {
    static let maxHTMLBytes = 3 * 1024 * 1024
    static let maxAudioBytes = 8 * 1024 * 1024
    private static let maxRedirects = 5

    struct Failure: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 60
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration)
    }()

    static func isAllowed(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && MyInstantsParser.hosts.contains(url.host?.lowercased() ?? "")
    }

    static func fetchText(_ url: URL) async throws -> String {
        let data = try await get(url, limit: maxHTMLBytes, audio: false)
        return String(decoding: data, as: UTF8.self)
    }

    static func fetchAudio(_ url: URL) async throws -> Data {
        try await get(url, limit: maxAudioBytes, audio: true)
    }

    private static func get(_ url: URL, limit: Int, audio: Bool) async throws -> Data {
        guard isAllowed(url) else { throw Failure("Only https://myinstants.com links are allowed.") }
        var request = URLRequest(url: url)
        request.setValue("Diddy/1.0 (soundboard import)", forHTTPHeaderField: "User-Agent")
        let (bytes, response) = try await session.bytes(for: request, delegate: RedirectGuard(maxRedirects: maxRedirects))
        guard let http = response as? HTTPURLResponse else { throw Failure("MyInstants did not answer properly.") }
        guard (200..<300).contains(http.statusCode) else { throw Failure("MyInstants answered \(http.statusCode).") }
        if let final = http.url, !isAllowed(final) { throw Failure("Only https://myinstants.com links are allowed.") }
        if audio, !(http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased().hasPrefix("audio/") {
            throw Failure("This is not an audio file.")
        }
        if http.expectedContentLength > Int64(limit) { throw Failure("The file is too large.") }
        var data = Data()
        data.reserveCapacity(max(0, min(Int(http.expectedContentLength), limit)))
        for try await byte in bytes {
            data.append(byte)
            if data.count > limit { throw Failure("The file is too large.") }
        }
        return data
    }

    /// Redirects have to stay on myinstants.com over https.
    private final class RedirectGuard: NSObject, URLSessionTaskDelegate {
        let maxRedirects: Int
        private var followed = 0
        init(maxRedirects: Int) { self.maxRedirects = maxRedirects }

        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            followed += 1
            if followed <= maxRedirects, let url = request.url, MyInstantsClient.isAllowed(url) {
                completionHandler(request)
            } else {
                completionHandler(nil)   // the 3xx answer then fails as "MyInstants answered 3xx"
            }
        }
    }
}

@MainActor
final class MyInstantsModel: ObservableObject {
    @Published var input = ""
    @Published private(set) var results: [MyInstantsParser.Item] = []
    @Published var selected: Set<String> = []
    @Published private(set) var searching = false
    @Published private(set) var loadingMore = false
    @Published private(set) var canLoadMore = false
    @Published private(set) var importing = false
    @Published private(set) var loadingPreview: String?
    @Published private(set) var status: String?
    @Published private(set) var error: String?

    private let board = Soundboard.shared
    private var term: String?
    private var nextPage = 1
    /// Bumped by each new search, so an answer to an older search is dropped.
    private var searchID = 0
    private var audio: [String: Data] = [:]
    private var importTask: Task<Void, Never>?
    /// The preview being downloaded; cancelled by a second tap, another preview or closing (#205).
    private var previewTask: Task<Void, Never>?

    func search() {
        guard !searching else { return }
        error = nil
        status = nil
        guard let target = MyInstantsParser.parseInput(input) else {
            error = "Enter a search term or a myinstants.com link."
            return
        }
        stopPreview()
        searchID += 1
        let id = searchID
        searching = true
        selected = []
        audio = [:]
        Task {
            defer { if id == searchID { searching = false } }
            do {
                switch target {
                case .search(let name, let page):
                    guard let url = MyInstantsParser.searchURL(name: name, page: page) else { throw MyInstantsClient.Failure("Invalid search.") }
                    let parsed = MyInstantsParser.parseSearch(html: try await MyInstantsClient.fetchText(url))
                    guard id == searchID else { return }
                    term = name
                    nextPage = page + 1
                    results = parsed.items
                    canLoadMore = parsed.hasNext && !parsed.items.isEmpty
                    if parsed.items.isEmpty { status = "No sounds found." }
                case .instant(let url):
                    let html = try await MyInstantsClient.fetchText(url)
                    guard id == searchID else { return }
                    term = nil
                    canLoadMore = false
                    if let item = MyInstantsParser.parseInstantPage(html: html, url: url) {
                        results = [item]
                    } else {
                        results = []
                        status = "No sound found on that page."
                    }
                }
            } catch {
                guard id == searchID else { return }
                results = []
                canLoadMore = false
                self.error = error.friendlyMessage
            }
        }
    }

    func loadMore() {
        guard let term, canLoadMore, !loadingMore, !searching, !importing,
              let url = MyInstantsParser.searchURL(name: term, page: nextPage) else { return }
        let id = searchID
        loadingMore = true
        error = nil
        Task {
            defer { loadingMore = false }
            do {
                let parsed = MyInstantsParser.parseSearch(html: try await MyInstantsClient.fetchText(url))
                guard id == searchID else { return }
                let known = Set(results.map(\.path))
                let fresh = parsed.items.filter { !known.contains($0.path) }
                results += fresh
                nextPage += 1
                canLoadMore = parsed.hasNext && !fresh.isEmpty
            } catch {
                guard id == searchID else { return }
                canLoadMore = false
                self.error = error.friendlyMessage
            }
        }
    }

    func toggle(_ item: MyInstantsParser.Item) {
        if selected.contains(item.path) { selected.remove(item.path) } else { selected.insert(item.path) }
    }

    func toggleAll() {
        selected = selected.count == results.count ? [] : Set(results.map(\.path))
    }

    private func data(for item: MyInstantsParser.Item) async throws -> Data {
        if let cached = audio[item.path] { return cached }
        guard let url = MyInstantsParser.soundURL(path: item.path) else { throw MyInstantsClient.Failure("Invalid sound link.") }
        let data = try await MyInstantsClient.fetchAudio(url)
        // Previews and the import after them share one download; keep only a few in memory.
        if audio.count >= 5 { audio = [:] }
        audio[item.path] = data
        return data
    }

    /// Tap on a result: plays it, or stops it when it is the one loading or playing. Another
    /// result replaces the current preview, also while that one is still downloading.
    func togglePreview(_ item: MyInstantsParser.Item) {
        let same = board.previewing == item.path || loadingPreview == item.path
        stopPreview()
        if same { return }
        error = nil
        loadingPreview = item.path
        previewTask = Task {
            do {
                let bytes = try await data(for: item)
                // Stopped or replaced while downloading: never start late.
                guard !Task.isCancelled, loadingPreview == item.path else { return }
                loadingPreview = nil
                try board.preview(data: bytes, id: item.path)
            } catch {
                guard !Task.isCancelled, loadingPreview == item.path else { return }
                loadingPreview = nil
                self.error = error.friendlyMessage
            }
        }
    }

    /// Stops the preview (loading or playing) without touching soundboard clips in a call.
    func stopPreview() {
        previewTask?.cancel()
        previewTask = nil
        loadingPreview = nil
        board.stopPreview()
    }

    func importSelected() {
        let items = results.filter { selected.contains($0.path) }
        guard !items.isEmpty, !importing else { return }
        stopPreview()
        importing = true
        error = nil
        importTask = Task {
            var added = 0, existing = 0, failed = 0
            for (index, item) in items.enumerated() {
                if Task.isCancelled { break }
                status = "Importing \(index + 1) of \(items.count) …"
                do {
                    let bytes = try await data(for: item)
                    let ext = (item.path as NSString).pathExtension.lowercased()
                    if try board.add(data: bytes, name: item.name, ext: ext.isEmpty ? "mp3" : ext) { added += 1 } else { existing += 1 }
                } catch {
                    failed += 1
                }
                // Be gentle with the site, like the desktop.
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            var parts = ["\(added) added"]
            if existing > 0 { parts.append("\(existing) already there") }
            if failed > 0 { parts.append("\(failed) failed (too long or not loadable)") }
            status = (Task.isCancelled ? "Stopped: " : "Done: ") + parts.joined(separator: ", ") + "."
            selected = []
            importing = false
        }
    }

    func cancelImport() { importTask?.cancel() }

    func close() {
        importTask?.cancel()
        stopPreview()
    }
}

/// Search MyInstants, listen, tick the sounds you want, import them.
struct MyInstantsSheet: View {
    @StateObject private var model = MyInstantsModel()
    @ObservedObject private var board = Soundboard.shared
    @Environment(\.dismiss) private var dismiss
    @FocusState private var searchFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchField
                content
                footer
            }
            .background(Theme.sidebar)
            .navigationTitle("MyInstants")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                if !model.results.isEmpty {
                    ToolbarItem(placement: .primaryAction) {
                        Button(model.selected.count == model.results.count ? "Select none" : "Select all") { model.toggleAll() }
                            .disabled(model.importing)
                    }
                }
            }
        }
        .onDisappear { model.close() }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            TextField("Search sounds or paste a link", text: $model.input)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.webSearch)
                .submitLabel(.search)
                .focused($searchFocused)
                .onSubmit { searchFocused = false; model.search() }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.input))
            Button { searchFocused = false; model.search() } label: { Image(systemName: "magnifyingglass") }
                .disabled(model.searching || model.input.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityLabel("Search")
        }
        .padding([.horizontal, .top])
        .padding(.bottom, 8)
    }

    @ViewBuilder private var content: some View {
        if model.searching {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.results.isEmpty {
            Text(model.status ?? "Search for a sound, or paste the link of a MyInstants search or sound.")
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List {
                ForEach(model.results) { item in row(item) }
                if model.canLoadMore {
                    Button { model.loadMore() } label: {
                        HStack {
                            Spacer()
                            if model.loadingMore { ProgressView() } else { Text("Load more") }
                            Spacer()
                        }
                    }
                    .disabled(model.loadingMore || model.importing)
                    .listRowBackground(Theme.sidebar)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func row(_ item: MyInstantsParser.Item) -> some View {
        let isSelected = model.selected.contains(item.path)
        let have = board.hasClip(named: item.name)
        return HStack(spacing: 12) {
            Button { model.toggle(item) } label: {
                HStack(spacing: 12) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(isSelected ? Theme.accent : Theme.faint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name).foregroundStyle(Theme.text).lineLimit(2)
                        if have { Text("Already in your soundboard").font(.caption).foregroundStyle(Theme.muted) }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(model.importing)
            Button { model.togglePreview(item) } label: {
                if model.loadingPreview == item.path {
                    ProgressView()
                } else {
                    Image(systemName: board.previewing == item.path ? "stop.circle.fill" : "play.circle.fill").font(.title2)
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.accent)
            .accessibilityLabel(board.previewing == item.path ? "Stop preview" : "Preview \(item.name)")
        }
        .listRowBackground(Theme.sidebar)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if let error = model.error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
            if let status = model.status, !model.results.isEmpty { Text(status).font(.footnote).foregroundStyle(Theme.muted) }
            if model.importing {
                Button(role: .cancel) { model.cancelImport() } label: { Text("Stop").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
            } else if !model.selected.isEmpty {
                Button { model.importSelected() } label: { Text("Import \(model.selected.count) selected").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
            }
            Text("Sounds are uploaded by MyInstants users. Only import what you may use. Clips are limited to \(Int(Soundboard.maxSeconds)) seconds.")
                .font(.caption2)
                .foregroundStyle(Theme.faint)
                .multilineTextAlignment(.center)
        }
        .padding()
        .background(Theme.sidebar)
    }
}
