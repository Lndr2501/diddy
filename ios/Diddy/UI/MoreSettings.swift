import SwiftUI

/// People you blocked, with a way to unblock them.
struct BlockedUsersView: View {
    @ObservedObject var account: MatrixAccount
    @State private var userIds: [String] = []
    @State private var loading = true
    @State private var error: String?
    @State private var newUserId = ""
    @State private var blocking = false

    var body: some View {
        List {
            Section {
                TextField("@user:server", text: $newUserId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
                Button {
                    Task { await block() }
                } label: {
                    HStack { Text("Block"); if blocking { Spacer(); ProgressView() } }
                }
                .disabled(!AccountInfo.isUserId(newUserId.trimmingCharacters(in: .whitespaces)) || blocking)
            } header: {
                Text("Block User")
            } footer: {
                Text("Prevent receiving messages or invites from a user by adding their user ID.")
            }
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

    private func block() async {
        let userId = newUserId.trimmingCharacters(in: .whitespaces)
        guard AccountInfo.isUserId(userId) else { return }
        blocking = true
        defer { blocking = false }
        do {
            try await account.client.ignoreUser(userId: userId)
            if !userIds.contains(userId) { userIds = (userIds + [userId]).sorted() }
            account.resolveProfiles([userId], in: "")
            newUserId = ""
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

/// Version, account and where to report problems.
struct AboutView: View {
    @ObservedObject var account: MatrixAccount
    @State private var exporting = false
    @State private var exported: URL?

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
            Section {
                if let exported {
                    ShareLink(item: exported) { Label("Share Diagnostics File", systemImage: "square.and.arrow.up") }
                }
                Button {
                    exporting = true
                    Task {
                        exported = await DiagLog.shared.export()
                        exporting = false
                    }
                } label: {
                    HStack {
                        Label(exported == nil ? "Export Diagnostics" : "Export Again", systemImage: "doc.text.magnifyingglass")
                        if exporting { Spacer(); ProgressView() }
                    }
                }
                .disabled(exporting)
            } header: {
                Text("Diagnostics")
            } footer: {
                Text("A text file with Diddy's log, crash reports and your device model, to attach to a bug report. It contains no messages or keys.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}
