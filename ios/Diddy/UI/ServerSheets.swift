import MatrixRustSDK
import SwiftUI

/// The rail's plus button, as on Discord: make a server or join one.
struct AddServerView: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var topic = ""
    @State private var isPublic = false
    @State private var address = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Address or link", text: $address)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Join Server") { run { try await join() } }
                        .disabled(address.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                } header: {
                    Text("Join a server")
                } footer: {
                    Text("For example #community:matrix.org or a matrix.to link.")
                }
                Section {
                    TextField("Server name", text: $name)
                    TextField("What is it about? (optional)", text: $topic)
                    Toggle("Anyone with the address can join", isOn: $isPublic)
                    Button("Create Server") { run { try await create() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                } header: {
                    Text("Create your own")
                } footer: {
                    Text(isPublic ? "Channels are not encrypted, so new members can read the history." : "Only people you invite can join. Text channels are end-to-end encrypted.")
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
                if busy { HStack { Spacer(); ProgressView(); Spacer() } }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("Add a Server")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
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

    private func join() async throws {
        let id = try await account.joinServer(from: address)
        dismiss()
        if account.spaces.contains(where: { $0.roomId == id }) {
            navigator.server = id
        } else {
            navigator.open(id, account: account)
        }
    }

    private func create() async throws {
        let id = try await account.createServer(
            name: name.trimmingCharacters(in: .whitespaces),
            topic: topic.trimmingCharacters(in: .whitespaces),
            isPublic: isPublic
        )
        navigator.server = id
        dismiss()
    }
}

struct CreateChannelView: View {
    @ObservedObject var account: MatrixAccount
    let spaceId: String
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var topic = ""
    @State private var isVoice = false
    @State private var encrypted = true
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Channel type") {
                    Picker("Type", selection: $isVoice) {
                        Label("Text", systemImage: "number").tag(false)
                        Label("Voice", systemImage: "speaker.wave.2.fill").tag(true)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                Section("Channel name") {
                    TextField(isVoice ? "Lounge" : "new-channel", text: $name)
                    TextField("Topic (optional)", text: $topic)
                }
                Section {
                    Toggle("End-to-end encrypted", isOn: $encrypted)
                } footer: {
                    Text("Every member of this server can join the channel. This cannot be turned off later.")
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("Create Channel")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Create") { create() }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
    }

    private func create() {
        busy = true
        error = nil
        Task {
            do {
                let id = try await account.createChannel(
                    in: spaceId,
                    name: name.trimmingCharacters(in: .whitespaces),
                    topic: topic.trimmingCharacters(in: .whitespaces),
                    isVoice: isVoice,
                    encrypted: encrypted
                )
                dismiss()
                navigator.open(id, account: account)
            } catch { self.error = error.friendlyMessage }
            busy = false
        }
    }
}

/// Finds people on the homeserver (or takes a full `@user:server`), for invites and new DMs.
private struct UserSearch: View {
    @ObservedObject var account: MatrixAccount
    @Binding var query: String
    let action: (String) -> Void
    @State private var results: [UserProfile] = []
    @State private var status: String?

    /// A complete ID is always offered, the directory only knows some users.
    private var typedId: String? {
        let text = query.trimmingCharacters(in: .whitespaces)
        return text.hasPrefix("@") && text.contains(":") && !results.contains { $0.userId == text } ? text : nil
    }

    var body: some View {
        Group {
            if let typedId {
                Button { action(typedId) } label: {
                    PersonRow(name: MatrixAccount.localpart(typedId), subtitle: typedId, avatarUrl: nil, account: account)
                }
                .listRowBackground(Color.clear)
            }
            ForEach(results, id: \.userId) { user in
                Button { action(user.userId) } label: {
                    PersonRow(name: user.displayName ?? MatrixAccount.localpart(user.userId), subtitle: user.userId, avatarUrl: user.avatarUrl, account: account)
                }
                .listRowBackground(Color.clear)
            }
            if let status, typedId == nil {
                Text(status).font(.footnote).foregroundStyle(Theme.muted).listRowBackground(Color.clear)
            }
            // SwiftUI never runs a task on an empty view, so the search hangs off a row that is always there.
            Color.clear.frame(height: 0)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .task(id: query) { await search() }
        }
    }

    private func search() async {
        let term = query.trimmingCharacters(in: .whitespaces)
        status = nil
        guard term.count >= 2 else { results = []; return }
        try? await Task.sleep(nanoseconds: 300_000_000) // wait for a pause in typing
        guard !Task.isCancelled else { return }
        do {
            let found = try await account.searchUsers(term)
            guard !Task.isCancelled else { return }
            results = found
            status = found.isEmpty ? "No one found. You can also enter a full ID like @friend:matrix.org." : nil
        } catch {
            guard !Task.isCancelled else { return }
            results = []
            status = error.friendlyMessage
        }
    }
}

struct NewMessageView: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(Theme.danger).listRowBackground(Color.clear) }
                UserSearch(account: account, query: $query) { start($0) }
                if query.count < 2 {
                    Text("Search by name, or enter a full ID like @friend:matrix.org.")
                        .font(.footnote).foregroundStyle(Theme.muted).listRowBackground(Color.clear)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .overlay { if busy { ProgressView() } }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Find someone")
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .navigationTitle("New Message")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func start(_ userId: String) {
        busy = true
        Task {
            do {
                let id = try await account.directMessage(with: userId)
                try await account.waitForRoom(id)
                dismiss()
                navigator.open(id, account: account)
            } catch { self.error = error.friendlyMessage }
            busy = false
        }
    }
}

struct InviteView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var link: String?
    @State private var invited: Set<String> = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let link, let url = URL(string: link) {
                    Section {
                        ShareLink(item: url) { Label("Share invite link", systemImage: "square.and.arrow.up") }
                            .listRowBackground(Color.clear)
                        Button { UIPasteboard.general.string = link } label: { Label("Copy invite link", systemImage: "link") }
                            .listRowBackground(Color.clear)
                    }
                }
                if !invited.isEmpty {
                    Section("Invited") {
                        ForEach(Array(invited), id: \.self) { userId in
                            Label(userId, systemImage: "checkmark.circle.fill").foregroundStyle(Theme.online)
                                .listRowBackground(Color.clear)
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.danger).listRowBackground(Color.clear) }
                Section {
                    UserSearch(account: account, query: $query) { invite($0) }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Name or @user:server")
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .navigationTitle("Invite People")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { link = try? await account.room(roomId)?.matrixToPermalink() }
        }
    }

    private func invite(_ userId: String) {
        Task {
            do {
                try await account.room(roomId)?.inviteUserById(userId: userId)
                invited.insert(userId)
                query = ""
                error = nil
            } catch { self.error = error.friendlyMessage }
        }
    }
}

/// Opened by tapping a channel's name: topic, members, leave, and editing for those allowed to.
struct ChannelInfoView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var showMembers = false
    @State private var showInvite = false
    @State private var confirmLeave = false
    @State private var canEdit = false
    @State private var name = ""
    @State private var topic = ""
    @State private var error: String?

    private var summary: RoomSummary? { account.summary(for: roomId) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        AvatarView(url: summary?.avatarUrl, name: summary?.name ?? "?", size: 52, cornerRadius: 14, account: account)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(summary?.name ?? "").font(.headline)
                            if let alias = summary?.canonicalAlias { Text(alias).font(.caption).foregroundStyle(Theme.muted) }
                            if summary?.isEncrypted == true {
                                Label("End-to-end encrypted", systemImage: "lock.fill").font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    if !canEdit, let text = summary?.topic, !text.isEmpty {
                        Text(text).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }
                if canEdit {
                    Section("Edit") {
                        TextField("Name", text: $name)
                        TextField("Topic", text: $topic, axis: .vertical)
                        Button("Save Changes") { save() }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || (name == summary?.name && topic == (summary?.topic ?? "")))
                    }
                }
                Section {
                    Button { showMembers = true } label: {
                        LabeledContent {
                            Text("\(summary?.memberCount ?? 0)")
                        } label: {
                            Label("Members", systemImage: "person.2.fill")
                        }
                    }
                    if summary?.isDirect != true {
                        Button { showInvite = true } label: { Label("Invite People", systemImage: "person.badge.plus") }
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
                Section {
                    Button(role: .destructive) { confirmLeave = true } label: {
                        Label(summary?.isDirect == true ? "Close Conversation" : "Leave Channel", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(isPresented: $showMembers) { MembersView(account: account, roomId: roomId) }
            .sheet(isPresented: $showInvite) { InviteView(account: account, roomId: roomId) }
            .confirmationDialog("Leave \(summary?.name ?? "this channel")?", isPresented: $confirmLeave, titleVisibility: .visible) {
                Button("Leave", role: .destructive) { leave() }
            }
            .task {
                name = summary?.name ?? ""
                topic = summary?.topic ?? ""
                if summary?.isDirect != true, let levels = try? await account.room(roomId)?.getPowerLevels() {
                    canEdit = levels.canOwnUserSendState(stateEvent: .roomName)
                }
            }
        }
    }

    private func save() {
        Task {
            do {
                guard let room = account.room(roomId) else { return }
                if name != summary?.name { try await room.setName(name: name.trimmingCharacters(in: .whitespaces)) }
                if topic != (summary?.topic ?? "") { try await room.setTopic(topic: topic) }
                await account.loadAllChannels()
                dismiss()
            } catch { self.error = error.friendlyMessage }
        }
    }

    private func leave() {
        Task {
            do {
                try await account.leave(roomId: roomId)
                dismiss()
                navigator.destination = nil
            } catch { self.error = error.friendlyMessage }
        }
    }
}
