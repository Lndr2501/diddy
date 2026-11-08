import SwiftUI

/// Settings > Chat: how messages look and what others see of you, like the desktop app's General
/// settings. Stored on this device.
struct ChatSettingsView: View {
    @AppStorage(ChatSettings.timeFormatKey) private var timeFormat = ChatSettings.TimeFormat.system.rawValue
    @AppStorage(ChatSettings.showMembershipKey) private var showMembership = true
    @AppStorage(ChatSettings.shareActivityKey) private var shareActivity = true
    @AppStorage(ChatSettings.autoLoadMediaKey) private var autoLoadMedia = true

    var body: some View {
        List {
            Section {
                Picker("Time format", selection: $timeFormat) {
                    ForEach(ChatSettings.TimeFormat.allCases) { Text($0.title).tag($0.rawValue) }
                }
            } footer: {
                Text("Example: \(Date().chatTimestamp)")
            }
            Section {
                Toggle("Show join and leave messages", isOn: $showMembership)
            } footer: {
                Text("Takes effect the next time you open a chat.")
            }
            Section {
                Toggle("Load pictures automatically", isOn: $autoLoadMedia)
            } footer: {
                Text("When off, pictures in chats load only when you tap them. Saves mobile data.")
            }
            Section {
                Toggle("Share typing and read status", isOn: $shareActivity)
            } footer: {
                Text("When off, others do not see when you are typing or how far you have read. Your own unread counts still clear.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Chat")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// People you blocked, with a way to unblock them.
struct BlockedUsersView: View {
    @ObservedObject var account: MatrixAccount
    @State private var userIds: [String] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(Theme.danger) }
            if !loading && userIds.isEmpty && error == nil {
                Text("You have not blocked anyone.").foregroundStyle(Theme.muted)
            }
            ForEach(userIds, id: \.self) { userId in
                HStack {
                    PersonRow(name: account.name(of: userId), subtitle: userId, avatarUrl: account.profiles[userId]?.avatarUrl, account: account)
                    Button("Unblock") { Task { await unblock(userId) } }
                        .buttonStyle(.bordered)
                }
            }
        }
        .overlay { if loading { ProgressView() } }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Blocked Users")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        defer { loading = false }
        do {
            userIds = try await account.client.ignoredUsers().sorted()
            account.resolveProfiles(userIds, in: "")
            error = nil
        } catch { self.error = error.friendlyMessage }
    }

    private func unblock(_ userId: String) async {
        do {
            try await account.client.unignoreUser(userId: userId)
            userIds.removeAll { $0 == userId }
        } catch { self.error = error.friendlyMessage }
    }
}

/// The sessions of your account, as the server lists them.
struct DevicesView: View {
    @ObservedObject var account: MatrixAccount
    @State private var devices: [Device] = []
    @State private var loading = true
    @State private var error: String?
    @State private var renaming: Device?
    @State private var newName = ""

    struct Device: Identifiable, Hashable {
        let id: String
        let name: String?
        let lastSeen: Date?
    }

    private var current: [Device] { devices.filter { $0.id == account.deviceId } }
    private var others: [Device] { devices.filter { $0.id != account.deviceId } }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(Theme.danger) }
            if !current.isEmpty {
                Section("This Device") { ForEach(current) { row($0) } }
            }
            if !others.isEmpty {
                Section {
                    ForEach(others) { row($0) }
                } header: {
                    Text("Other Devices")
                } footer: {
                    Text("Signing out other devices needs your password, which this app does not ask for. Use Diddy desktop for that.")
                }
            }
        }
        .overlay { if loading { ProgressView() } }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Devices")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .alert("Rename device", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $newName)
            Button("Save") { if let device = renaming { Task { await rename(device) } } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Other people in encrypted chats can see this name.")
        }
    }

    private func row(_ device: Device) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(device.name ?? device.id).foregroundStyle(Theme.text)
            Text(device.lastSeen.map { "\(device.id) · last seen \($0.formatted(.relative(presentation: .named)))" } ?? device.id)
                .font(.caption).foregroundStyle(Theme.faint)
        }
        .contextMenu {
            Button { newName = device.name ?? ""; renaming = device } label: { Label("Rename", systemImage: "pencil") }
            Button { UIPasteboard.general.string = device.id } label: { Label("Copy Device ID", systemImage: "doc.on.doc") }
        }
    }

    private func load() async {
        defer { loading = false }
        do {
            let json = try await account.clientRequest("/_matrix/client/v3/devices")
            devices = (json["devices"] as? [[String: Any]] ?? []).compactMap { item in
                guard let id = item["device_id"] as? String else { return nil }
                let seen = (item["last_seen_ts"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) }
                return Device(id: id, name: item["display_name"] as? String, lastSeen: seen)
            }
            .sorted { ($0.lastSeen ?? .distantPast) > ($1.lastSeen ?? .distantPast) }
            error = nil
        } catch { self.error = error.friendlyMessage }
    }

    private func rename(_ device: Device) async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, let encoded = device.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return }
        do {
            _ = try await account.clientRequest("/_matrix/client/v3/devices/\(encoded)", body: ["display_name": name], method: "PUT")
            await load()
        } catch { self.error = error.friendlyMessage }
    }
}

/// Version, account and where to report problems.
struct AboutView: View {
    @ObservedObject var account: MatrixAccount

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    var body: some View {
        List {
            Section {
                LabeledContent("Version", value: version)
                LabeledContent("Server", value: account.record.serverName)
                LabeledContent("Matrix ID") {
                    Text(account.userId).textSelection(.enabled)
                }
                Button { UIPasteboard.general.string = account.userId } label: { Label("Copy Matrix ID", systemImage: "doc.on.doc") }
            }
            Section {
                if let repo = URL(string: "https://github.com/Lndr2501/diddy") {
                    Link(destination: repo) { Label("Diddy on GitHub", systemImage: "chevron.left.forwardslash.chevron.right") }
                }
                if let issues = URL(string: "https://github.com/Lndr2501/diddy/issues") {
                    Link(destination: issues) { Label("Report a problem", systemImage: "ladybug.fill") }
                }
            } footer: {
                Text("Diddy for iOS is built with matrix-rust-sdk and LiveKit.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}
