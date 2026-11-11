import Combine
import Foundation

/// A search owns its query and pagination so edits to the field cannot mix pages of two queries.
@MainActor
final class MessageSearchStore: ObservableObject {
    @Published private(set) var groups: [MessageSearchGroup] = []
    @Published private(set) var highlights: [String] = []
    @Published private(set) var loading = false
    @Published private(set) var searched = false
    @Published private(set) var nextBatch: String?
    @Published private(set) var error: String?
    private var pages: [[MessageSearchItem]] = []
    private var terms: [[String]] = []
    private var query: (term: String, order: MessageSearch.Order, rooms: [String]?)?
    private var generation = UUID()

    func search(account: MatrixAccount, term: String, order: MessageSearch.Order, rooms: [String]?) async {
        generation = UUID()
        query = (term.trimmingCharacters(in: .whitespacesAndNewlines), order, rooms)
        pages = []; terms = []; groups = []; highlights = []; nextBatch = nil; error = nil
        searched = !(query?.term.isEmpty ?? true)
        loading = false
        if searched { await load(account: account) }
    }

    func load(account: MatrixAccount) async {
        guard !loading, let query else { return }
        let current = generation
        loading = true
        error = nil
        defer { if generation == current { loading = false } }
        do {
            let json = try await account.clientRequest(MessageSearch.searchPath(nextBatch: nextBatch),
                body: MessageSearch.requestBody(term: query.term, order: query.order, rooms: query.rooms))
            let page = MessageSearch.parsePage(json)
            var extra: [MessageSearchEvent] = []
            // Search can match an edit; show its original message with the current content.
            for ref in MessageSearch.missingOriginals(page.hits) {
                if let event = try? await account.clientRequest(MessageSearch.eventPath(roomId: ref.roomId, eventId: ref.eventId)),
                   let parsed = MessageSearchEvent(json: event, roomId: ref.roomId) { extra.append(parsed) }
            }
            let originals = page.hits.map(\.event) + extra
            for ref in MessageSearch.missingBundledEdits(originals, known: originals) {
                if let event = try? await account.clientRequest(MessageSearch.eventPath(roomId: ref.roomId, eventId: ref.eventId)),
                   let parsed = MessageSearchEvent(json: event, roomId: ref.roomId) { extra.append(parsed) }
            }
            guard generation == current else { return }
            pages.append(MessageSearch.resolveHits(page.hits, extraEvents: extra, term: query.term))
            terms.append(page.highlights)
            groups = MessageSearch.mergePages(pages)
            highlights = MessageSearch.mergeHighlights(terms)
            // Defend against a broken server returning the same token indefinitely.
            nextBatch = page.nextBatch == nextBatch ? nil : page.nextBatch
        } catch {
            if generation == current { self.error = error.friendlyMessage }
        }
    }
}
