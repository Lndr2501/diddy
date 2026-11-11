import MatrixRustSDK
import SwiftUI

// Explore: the featured rooms and servers, and the public room directory of your server and others
// (pages/client/explore on desktop), and the preview shown before joining.

extension PublicRoomEntry {
    /// A channel of a server you have not joined yet, as the preview shows it.
    init(spaceRoom: SpaceRoom) {
        let rule: String?
        switch spaceRoom.joinRule {
        case .public?: rule = "public"
        case .invite?: rule = "invite"
        case .knock?: rule = "knock"
        default: rule = nil
        }
        self.init(
            roomId: spaceRoom.roomId,
            name: spaceRoom.displayName,
            topic: spaceRoom.topic,
            canonicalAlias: spaceRoom.canonicalAlias,
            avatarUrl: spaceRoom.avatarUrl,
            memberCount: Int(spaceRoom.numJoinedMembers),
            roomType: spaceRoom.roomType == .space ? "m.space" : nil,
            joinRule: rule
        )
    }
}

struct ExploreView: View {
    @ObservedObject var account: MatrixAccount
    @Environment(\.dismiss) private var dismiss

    private enum Source: Hashable {
        case featured
        case server(String)
    }

    private struct SearchKey: Hashable {
        let source: Source
        let term: String
        let filter: PublicRoomTypeFilter
    }

    private struct FeaturedItem: Identifiable {
        let alias: String
        let isSpace: Bool
        var entry: PublicRoomEntry?
        var id: String { alias }
    }

    @State private var source: Source = .featured
    @State private var term = ""
    @State private var filter: PublicRoomTypeFilter = .all
    @State private var results: [PublicRoomEntry] = []
    @State private var nextBatch: String?
    @State private var loading = false
    @State private var error: String?
    @State private var featured: [FeaturedItem] = []
    @State private var customServer = ""
    @State private var customServers: [String] = []
    @State private var previewing: Preview?

    private struct Preview: Identifiable {
        let entry: PublicRoomEntry
        let via: [String]
        var id: String { entry.roomId }
    }

    private var servers: [String] {
        var list = [account.ownServerName]
        for server in RoomDirectory.otherServers(own: account.ownServerName) + customServers where !list.contains(server) {
            list.append(server)
        }
        return list
    }

    private var key: SearchKey { SearchKey(source: source, term: term.trimmingCharacters(in: .whitespacesAndNewlines), filter: filter) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Where", selection: $source) {
                        Text("Featured").tag(Source.featured)
                        ForEach(servers, id: \.self) { server in
                            Text(server == account.ownServerName ? "\(server) (your server)" : server).tag(Source.server(server))
                        }
                    }
                    HStack {
                        TextField("Another server, like matrix.org", text: $customServer)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onSubmit { addCustomServer() }
                        Button("Browse") { addCustomServer() }
                            .disabled(RoomDirectory.cleanServerName(customServer) == nil)
                    }
                }
                switch source {
                case .featured:
                    featuredSections
                case .server:
                    Section {
                        Picker("Show", selection: $filter) {
                            ForEach(PublicRoomTypeFilter.allCases) { Text($0.title).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear)
                    }
                    Section {
                        ForEach(results) { entry in
                            entryRow(entry, via: serverVia)
                        }
                        if loading { HStack { Spacer(); ProgressView(); Spacer() }.listRowBackground(Color.clear) }
                        if !loading && results.isEmpty && error == nil {
                            Text("No public rooms or servers found.").foregroundStyle(Theme.muted).listRowBackground(Color.clear)
                        }
                        if let error { Text(error).foregroundStyle(Theme.danger).listRowBackground(Color.clear) }
                        if nextBatch != nil && !loading {
                            Button("Load more") { Task { await load(more: true) } }
                                .listRowBackground(Color.clear)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .searchable(text: $term, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search public rooms")
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .navigationTitle("Explore")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task(id: key) {
                guard case .server = source else { return }
                if !key.term.isEmpty { try? await Task.sleep(nanoseconds: 400_000_000) } // wait for a pause in typing
                guard !Task.isCancelled else { return }
                await load(more: false)
            }
            .task { await loadFeatured() }
            .sheet(item: $previewing) { PublicRoomPreviewSheet(account: account, entry: $0.entry, via: $0.via) }
        }
    }

    private var serverVia: [String] {
        if case .server(let server) = source { return [server] }
        return []
    }

    @ViewBuilder
    private var featuredSections: some View {
        let spaces = featured.filter(\.isSpace)
        let rooms = featured.filter { !$0.isSpace }
        if !spaces.isEmpty {
            Section("Featured Spaces") {
                ForEach(spaces) { item in featuredRow(item) }
            }
        }
        if !rooms.isEmpty {
            Section("Featured Rooms") {
                ForEach(rooms) { item in featuredRow(item) }
            }
        }
    }

    @ViewBuilder
    private func featuredRow(_ item: FeaturedItem) -> some View {
        if let entry = item.entry {
            entryRow(entry, via: [], target: item.alias)
        } else {
            HStack {
                Text(item.alias).foregroundStyle(Theme.muted)
                Spacer()
                ProgressView()
            }
            .listRowBackground(Color.clear)
        }
    }

    private func entryRow(_ entry: PublicRoomEntry, via: [String], target: String? = nil) -> some View {
        Button {
            previewing = Preview(entry: entry, via: via)
        } label: {
            HStack(spacing: 12) {
                AvatarView(url: entry.avatarUrl, name: entry.displayName, size: 40, cornerRadius: entry.isSpace ? 12 : nil, account: account)
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.displayName).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(1)
                    if let topic = entry.topic {
                        Text(topic).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                    }
                    Text("\(entry.memberCount) members").font(.caption2).foregroundStyle(Theme.faint)
                }
                Spacer()
                if account.summary(for: entry.roomId)?.isJoined == true {
                    Text("Joined").font(.caption.weight(.semibold)).foregroundStyle(Theme.online)
                }
            }
        }
        .listRowBackground(Color.clear)
    }

    private func addCustomServer() {
        guard let server = RoomDirectory.cleanServerName(customServer) else { return }
        if !servers.contains(server) { customServers.append(server) }
        source = .server(server)
        customServer = ""
    }

    private func load(more: Bool) async {
        guard case .server(let server) = source else { return }
        loading = true
        if !more { error = nil }
        defer { loading = false }
        do {
            let page = try await account.publicRooms(
                server: server,
                term: key.term,
                filter: filter,
                since: more ? nextBatch : nil
            )
            guard !Task.isCancelled else { return }
            results = more ? results + page.rooms : page.rooms
            nextBatch = page.nextBatch
        } catch {
            guard !Task.isCancelled else { return }
            if !more { results = [] }
            nextBatch = nil
            self.error = error.friendlyMessage
        }
    }

    /// The rooms and servers desktop's config.json features, with their names and topics.
    private func loadFeatured() async {
        guard featured.isEmpty else { return }
        featured = RoomDirectory.featuredSpaces.map { FeaturedItem(alias: $0, isSpace: true) }
            + RoomDirectory.featuredRooms.map { FeaturedItem(alias: $0, isSpace: false) }
        for index in featured.indices {
            let alias = featured[index].alias
            let entry = await account.roomPreview(alias)
            guard !Task.isCancelled, featured.indices.contains(index), featured[index].alias == alias else { return }
            if let entry {
                featured[index].entry = entry
            } else {
                // Unknown to the server: still offered, joined by its address.
                featured[index].entry = PublicRoomEntry(
                    roomId: alias, name: nil, topic: nil, canonicalAlias: alias, avatarUrl: nil,
                    memberCount: 0, roomType: featured[index].isSpace ? "m.space" : nil, joinRule: nil
                )
            }
        }
    }
}

/// What a room or server shows before you join: topic, member count, and Join.
struct PublicRoomPreviewSheet: View {
    @ObservedObject var account: MatrixAccount
    let entry: PublicRoomEntry
    let via: [String]
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    @State private var knocked = false

    private var joined: Bool { account.summary(for: entry.roomId)?.isJoined == true }
    private var needsInvite: Bool { entry.joinRule == "invite" }
    private var canKnock: Bool { entry.joinRule == "knock" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    AvatarView(url: entry.avatarUrl, name: entry.displayName, size: 84, cornerRadius: entry.isSpace ? 24 : nil, account: account)
                    Text(entry.displayName).font(.title2.weight(.bold)).foregroundStyle(Theme.text).multilineTextAlignment(.center)
                    if let alias = entry.canonicalAlias {
                        Text(alias).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    Label("\(entry.memberCount) members", systemImage: "person.2.fill")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                    if let topic = entry.topic {
                        Text(topic).font(.body).foregroundStyle(Theme.text).frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        Text(entry.isSpace ? "This server has no description." : "This room has no topic.")
                            .font(.footnote).foregroundStyle(Theme.faint)
                    }
                    if needsInvite {
                        Text("You need an invitation to join.").font(.footnote).foregroundStyle(Theme.muted)
                    }
                    if knocked {
                        Text("Request sent. You are in once someone lets you in.").font(.footnote).foregroundStyle(Theme.online)
                    }
                    if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
                    actionButton
                }
                .padding(20)
            }
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle(entry.isSpace ? "Server" : "Room")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    @ViewBuilder
    private var actionButton: some View {
        if busy {
            ProgressView()
        } else if joined {
            Button("Open") { open(entry.roomId) }
                .buttonStyle(.borderedProminent)
        } else if canKnock {
            Button("Request to Join") { run { try await account.knockOnRoom(entry.joinTarget, via: via); knocked = true } }
                .buttonStyle(.borderedProminent)
                .disabled(knocked)
        } else if !needsInvite {
            Button("Join") {
                run {
                    let id = try await account.joinRoom(entry.joinTarget, via: via)
                    open(id)
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private func open(_ roomId: String) {
        dismiss()
        if entry.isSpace {
            navigator.server = roomId
        } else {
            navigator.open(roomId, account: account)
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do { try await work() } catch { self.error = error.friendlyMessage }
            busy = false
        }
    }
}
