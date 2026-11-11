import SwiftUI

struct SearchEventTarget: Equatable, Identifiable {
    let roomId: String
    let eventId: String
    var id: String { roomId + "|" + eventId }
}

struct MessageSearchView: View {
    @ObservedObject var account: MatrixAccount
    var roomId: String?
    var onOpen: (() -> Void)? = nil
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @StateObject private var store = MessageSearchStore()
    @State private var term = ""
    @State private var global = false
    @State private var order = MessageSearch.Order.recent

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    TextField("Search for keyword", text: $term)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.search).onSubmit { search() }
                    Button(action: search) { Image(systemName: "magnifyingglass") }
                        .accessibilityLabel("Search messages")
                }.padding()
                if roomId != nil { Toggle("Search all rooms", isOn: $global).padding(.horizontal) }
                Picker("Order", selection: $order) {
                    ForEach(MessageSearch.Order.allCases) { Text($0.title).tag($0) }
                }.pickerStyle(.segmented).padding()
                Text("Encrypted messages cannot be searched on the server.")
                    .font(.footnote).foregroundStyle(Theme.muted).padding(.horizontal)
                List {
                    ForEach(store.groups) { group in
                        Section(account.summary(for: group.roomId)?.name ?? group.roomId) {
                            ForEach(group.items, id: \.originalEventId) { item in
                                Button {
                                    navigator.searchTarget = SearchEventTarget(roomId: group.roomId, eventId: item.originalEventId)
                                    navigator.open(group.roomId, account: account)
                                    navigator.destination = .text(group.roomId)
                                    dismiss()
                                    onOpen?()
                                } label: {
                                    SearchEventRow(event: item.event, highlights: store.highlights)
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                    if store.loading { HStack { Spacer(); ProgressView(); Spacer() } }
                    if let error = store.error {
                        Text(error).foregroundStyle(Theme.danger)
                        Button("Retry") { Task { await store.load(account: account) } }
                    } else if store.nextBatch != nil && !store.loading {
                        Button("Load more") { Task { await store.load(account: account) } }
                    } else if store.searched && store.groups.isEmpty && !store.loading {
                        Text("No results found").foregroundStyle(Theme.muted)
                    }
                }.listStyle(.insetGrouped)
            }
            .background(Theme.chat)
            .navigationTitle("Search Messages")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .onChange(of: order) { _ in search() }
            .onChange(of: global) { _ in search() }
        }
    }

    private func search() {
        let rooms = !global ? roomId.map { [$0] } : nil
        Task { await store.search(account: account, term: term, order: order, rooms: rooms) }
    }
}

private struct SearchEventRow: View {
    let event: MessageSearchEvent
    var highlights: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(event.sender).font(.caption.weight(.semibold)).lineLimit(1)
                Spacer()
                Text(Date(timeIntervalSince1970: Double(event.timestamp) / 1000), style: .date).font(.caption2)
                Text(Date(timeIntervalSince1970: Double(event.timestamp) / 1000), style: .time).font(.caption2)
            }.foregroundStyle(Theme.muted)
            highlighted.foregroundColor(Theme.text).multilineTextAlignment(.leading)
        }.padding(.vertical, 4)
    }

    private var highlighted: Text {
        MessageSearch.highlightSegments(event.body, highlights: highlights).reduce(Text("")) { result, part in
            result + (part.highlighted ? Text(part.text).bold().foregroundColor(Theme.accent) : Text(part.text))
        }
    }
}

/// Local quick switcher, with the same # rooms, @ direct messages and * servers prefixes.
struct QuickSwitchView: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var messages = false

    private var results: [QuickSwitch.Item] {
        let rooms = account.rooms.filter { $0.isJoined && !$0.isSpace && !$0.isDirect }.map {
            QuickSwitch.Item(id: $0.id, name: $0.name, dmUsername: nil, kind: .rooms)
        }
        let directs = account.directMessages.map {
            QuickSwitch.Item(id: $0.id, name: $0.name,
                dmUsername: $0.dmUserId.map { String($0.dropFirst().prefix { $0 != ":" }) }, kind: .directs)
        }
        let spaces = account.spaces.map {
            QuickSwitch.Item(id: $0.roomId, name: $0.displayName, dmUsername: nil, kind: .spaces)
        }
        let parsed = QuickSwitch.parse(query)
        if parsed.query.isEmpty {
            let activity = Dictionary(uniqueKeysWithValues: account.rooms.enumerated().map { ($0.element.id, $0.offset) })
            return QuickSwitch.recent(parsed.kind, rooms: rooms, directs: directs, spaces: spaces, activity: activity)
        }
        return QuickSwitch.search(parsed.query, in: QuickSwitch.targets(parsed.kind, rooms: rooms, directs: directs, spaces: spaces))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button("Search Messages") { messages = true }
                }
                Section("Rooms, people and servers") {
                    ForEach(results) { item in
                        Button {
                            if item.kind == .spaces {
                                navigator.server = item.id
                                navigator.destination = nil
                            } else { navigator.open(item.id, account: account) }
                            dismiss()
                        } label: {
                            Label(item.name, systemImage: item.kind == .spaces ? "square.stack.3d.up" : item.kind == .directs ? "person" : "number")
                        }
                    }
                    if results.isEmpty { Text("No results found").foregroundStyle(Theme.muted) }
                }
            }
            .searchable(text: $query, prompt: "Search (# rooms, @ people, * servers)")
            .navigationTitle("Search")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .sheet(isPresented: $messages) { MessageSearchView(account: account, onOpen: { dismiss() }) }
        }
    }
}

/// Older hits remain readable even when they are outside the SDK's live timeline window.
struct SearchContextView: View {
    @ObservedObject var account: MatrixAccount
    let target: SearchEventTarget
    @Environment(\.dismiss) private var dismiss
    @State private var events: [MessageSearchEvent] = []
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                List(events, id: \.eventId) { event in
                    SearchEventRow(event: event)
                        .listRowBackground(event.eventId == target.eventId ? Theme.accent.opacity(0.15) : Theme.chat)
                        .id(event.eventId)
                }
                .onChange(of: events.count) { _ in proxy.scrollTo(target.eventId, anchor: .center) }
                .overlay { if loading { ProgressView() } }
            }
            .navigationTitle("Message context")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .safeAreaInset(edge: .bottom) {
                if let error { Text(error).foregroundStyle(Theme.danger).padding() }
            }
            .task {
                defer { loading = false }
                do {
                    let json = try await account.clientRequest(MessageSearch.contextPath(roomId: target.roomId, eventId: target.eventId, limit: 30))
                    let context = MessageSearch.contextEvents(json, roomId: target.roomId)
                    let hits = context.filter { $0.type == "m.room.message" }.map { MessageSearchHit(rank: 0, event: $0) }
                    var extra = context
                    for ref in MessageSearch.missingBundledEdits(context, known: context) {
                        if let json = try? await account.clientRequest(MessageSearch.eventPath(roomId: ref.roomId, eventId: ref.eventId)),
                           let event = MessageSearchEvent(json: json, roomId: ref.roomId) { extra.append(event) }
                    }
                    events = MessageSearch.resolveHits(hits + extra.filter { MessageSearch.isReplaceEvent($0) }.map { MessageSearchHit(rank: 0, event: $0) }, extraEvents: extra, term: "").map(\.event)
                    if !events.contains(where: { $0.eventId == target.eventId }) {
                        error = "This message is no longer available."
                    }
                } catch { self.error = error.friendlyMessage }
            }
        }
    }
}
