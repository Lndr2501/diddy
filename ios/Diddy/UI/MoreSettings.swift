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
                TextField(L("settings.ignoredUserList.userServer"), text: $newUserId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
                Button {
                    Task { await block() }
                } label: {
                    HStack { Text(L("settings.ignoredUserList.block")); if blocking { Spacer(); ProgressView() } }
                }
                .disabled(!AccountInfo.isUserId(newUserId.trimmingCharacters(in: .whitespaces)) || blocking)
            } header: {
                Text(L("settings.ignoredUserList.blockUser"))
            } footer: {
                Text(L("settings.ignoredUserList.preventReceivingMessagesOr"))
            }
            if let error {
                Section {
                    Text(error).font(.footnote).foregroundStyle(Theme.danger)
                    Button(L("ios.settings.tryAgain")) { Task { await load() } }
                }
            }
            Section {
                if loading && userIds.isEmpty {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if userIds.isEmpty && error == nil {
                    Text(L("ios.extraSettings.noBlockedUsers")).foregroundStyle(Theme.muted)
                }
                ForEach(userIds, id: \.self) { userId in
                    HStack {
                        PersonRow(name: account.name(of: userId), subtitle: userId, avatarUrl: account.profiles[userId]?.avatarUrl, account: account)
                        Button(L("settings.ignoredUserList.unblock")) { Task { await unblock(userId) } }
                            .buttonStyle(.bordered)
                    }
                }
            } header: {
                Text(L("ios.extraSettings.blocked"))
            } footer: {
                if !userIds.isEmpty {
                    Text(L("ios.extraSettings.blockedHelp"))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("settings.ignoredUserList.blockedUsers"))
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
            Section("Diddy") {
                LabeledContent(L("common.createRoom.version"), value: version)
                LabeledContent(L("ios.extraSettings.server"), value: account.record.serverName)
                LabeledContent(L("settings.matrixId.matrixId")) {
                    Text(account.userId).textSelection(.enabled)
                }
                Button { UIPasteboard.general.string = account.userId } label: { Label(L("ios.extraSettings.copyMatrixId"), systemImage: "doc.on.doc") }
            }
            Section {
                if let repo = URL(string: "https://github.com/Lndr2501/diddy") {
                    Link(destination: repo) { Label(L("ios.extraSettings.diddyOnGithub"), systemImage: "chevron.left.forwardslash.chevron.right") }
                }
                if let issues = URL(string: "https://github.com/Lndr2501/diddy/issues") {
                    Link(destination: issues) { Label(L("ios.extraSettings.reportProblem"), systemImage: "ladybug.fill") }
                }
            } footer: {
                Text(L("ios.extraSettings.aboutTech"))
            }
            Section {
                if let exported {
                    ShareLink(item: exported) { Label(L("ios.extraSettings.shareDiagnostics"), systemImage: "square.and.arrow.up") }
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
                Text(L("settings.about.diagnostics"))
            } footer: {
                Text(L("ios.extraSettings.diagnosticsHelp"))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("ios.settings.aboutDiddy"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
