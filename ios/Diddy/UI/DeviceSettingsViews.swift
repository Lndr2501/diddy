import MatrixRustSDK
import SwiftUI

/// The sessions of your account, as the server lists them, with their verification, IP address
/// and key fingerprint, and a way to sign them out (desktop: Settings > Devices).
struct DevicesView: View {
    @ObservedObject var account: MatrixAccount
    @Environment(\.openURL) private var openURL
    @State private var devices: [AccountDevice] = []
    @State private var trust: [String: DeviceTrust] = [:]
    @State private var keys: [String: String] = [:]
    @State private var ownKey: String?
    @State private var oidc = false
    @State private var loading = true
    @State private var error: String?
    @State private var renaming: AccountDevice?
    @State private var newName = ""
    @State private var confirmSignOut: SignOutRequest?
    @State private var passwordRequest: SignOutRequest?
    @State private var challenge: UIAChallenge?

    struct SignOutRequest: Identifiable {
        let id = UUID()
        let ids: [String]
    }

    private var current: [AccountDevice] { devices.filter { $0.id == account.deviceId } }
    private var others: [AccountDevice] { devices.filter { $0.id != account.deviceId } }

    /// The desktop's badge: Unverified, "N Unverified" or Verified.
    private var summary: String {
        if account.verificationState != .verified { return "Unverified" }
        let count = CrossSigningCheck.unverifiedCount(trust, otherDevices: others.map(\.id))
        return count > 0 ? "\(count) Unverified" : "Verified"
    }

    var body: some View {
        List {
            if let error {
                Section {
                    Text(error).font(.footnote).foregroundStyle(Theme.danger)
                    Button(L("ios.settings.tryAgain")) { Task { await load() } }
                }
            }
            Section {
                LabeledContent(L("settings.devices.deviceVerification"), value: summary)
                if account.verificationState != .verified {
                    Button { Task { await VerificationCenter.of(account).requestDeviceVerification() } } label: {
                        Label(L("ios.securityUI.verifyWithAnotherDevice"), systemImage: "iphone.and.arrow.forward")
                    }
                }
                NavigationLink { EncryptionSettingsView(account: account) } label: {
                    Label(L("ios.settings.encryption"), systemImage: "lock.shield.fill")
                }
            }
            if !current.isEmpty {
                Section(L("settings.devices.thisDevice")) { ForEach(current) { row($0, isCurrent: true) } }
            }
            if oidc {
                Section {
                    LabeledContent(L("settings.otherDevices.deviceDashboard")) {
                        Button(L("settings.connectedAccounts.open")) { Task { await openDashboard(nil) } }.buttonStyle(.bordered)
                    }
                } footer: {
                    Text(L("settings.otherDevices.manageYourDevicesOn"))
                }
            }
            if !others.isEmpty {
                Section {
                    ForEach(others) { row($0, isCurrent: false) }
                    Button(L("ios.securityUI.signOutOfAllOtherDevices"), role: .destructive) {
                        confirmSignOut = SignOutRequest(ids: others.map(\.id))
                    }
                } header: {
                    Text(L("settings.devices.otherDevices"))
                } footer: {
                    Text(oidc
                         ? "Your server manages sign-out on its dashboard."
                         : "Signing out asks for your password. Those devices need to log in again.")
                }
            }
        }
        .overlay { if loading && devices.isEmpty { ProgressView() } }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("settings.page.devices"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .verificationSheet(account: account)
        .alert(L("ios.securityUI.renameDevice"), isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField(L("settings.badgeEditor.name"), text: $newName)
            Button(L("settings.profile.save")) { if let device = renaming { Task { await rename(device) } } }
            Button(L("ios.settings.cancel"), role: .cancel) {}
        } message: {
            Text(L("ios.securityUI.otherPeopleInEncryptedChatsCanSeeThisName"))
        }
        .confirmationDialog(
            confirmSignOut.map { $0.ids.count == 1 ? "Sign out this device?" : "Sign out \($0.ids.count) devices?" } ?? "",
            isPresented: Binding(get: { confirmSignOut != nil }, set: { if !$0 { confirmSignOut = nil } }),
            titleVisibility: .visible
        ) {
            Button(L("ios.securityUI.signOut"), role: .destructive) {
                if let request = confirmSignOut { Task { await signOut(request) } }
            }
        } message: {
            Text(L("ios.securityUI.theyNeedToLogInAgainEncryptedMessagesStayReadableThereOnlyIf"))
        }
        .sheet(item: $passwordRequest, onDismiss: { challenge = nil }) { request in
            DevicePasswordSheet(count: request.ids.count) { password in
                await submitPassword(request, password: password)
            }
        }
    }

    @ViewBuilder private func row(_ device: AccountDevice, isCurrent: Bool) -> some View {
        let state: DeviceTrust = isCurrent
            ? (account.verificationState == .verified ? .verified : .unverified)
            : (trust[device.id] ?? .unknown)
        let key = isCurrent ? ownKey : keys[device.id]
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(device.name ?? device.id).foregroundStyle(Theme.text)
                Spacer()
                badge(state)
            }
            Text(device.id).font(.caption).foregroundStyle(Theme.faint)
            if let ip = device.lastSeenIP, !ip.isEmpty {
                Text(L("ios.dynamicUI.ipAddress", ["ip": ip])).font(.caption).foregroundStyle(Theme.faint)
            }
            if let seen = device.lastSeen {
                Text(L("ios.dynamicUI.lastSeen", ["date": seen.formatted(.relative(presentation: .named))])).font(.caption).foregroundStyle(Theme.faint)
            }
            if let key {
                Text(L("ios.dynamicUI.deviceKey", ["key": key])).font(.system(.caption, design: .monospaced)).foregroundStyle(Theme.faint)
                    .textSelection(.enabled)
            }
        }
        .contextMenu {
            Button { newName = device.name ?? ""; renaming = device } label: { Label(L("ios.securityUI.rename"), systemImage: "pencil") }
            Button { UIPasteboard.general.string = device.id } label: { Label(L("ios.securityUI.copyDeviceId"), systemImage: "doc.on.doc") }
            if !isCurrent {
                Button(role: .destructive) { confirmSignOut = SignOutRequest(ids: [device.id]) } label: {
                    Label(L("ios.securityUI.signOut"), systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
        .swipeActions {
            if !isCurrent {
                Button(role: .destructive) { confirmSignOut = SignOutRequest(ids: [device.id]) } label: {
                    Label(L("ios.securityUI.signOut"), systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
    }

    @ViewBuilder private func badge(_ state: DeviceTrust) -> some View {
        switch state {
        case .verified:
            Label(L("settings.verification.verified"), systemImage: "checkmark.shield.fill").font(.caption).foregroundStyle(Theme.online)
        case .unverified:
            Label(L("settings.verification.unverified"), systemImage: "exclamationmark.shield.fill").font(.caption).foregroundStyle(Theme.danger)
        case .unknown:
            EmptyView()
        }
    }

    // MARK: Actions

    private func load() async {
        defer { loading = false }
        do {
            devices = try await account.accountDevices()
            error = nil
        } catch {
            self.error = error.friendlyMessage
        }
        oidc = await account.accountManagementURL(AccountManagementAction.devicesList) != nil
        ownKey = await account.ownDeviceKey()
        let result = await account.ownDeviceTrust()
        trust = result.trust
        keys = result.keys
    }

    private func rename(_ device: AccountDevice) async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        do {
            _ = try await account.clientRequest("/_matrix/client/v3/devices/\(MatrixAccount.securityPathComponent(device.id))", body: ["display_name": name], method: "PUT")
            await load()
        } catch { self.error = error.friendlyMessage }
    }

    private func openDashboard(_ deviceId: String?) async {
        var action = AccountManagementAction.devicesList
        if let deviceId { action = AccountManagementAction.deviceDelete(deviceId: deviceId) }
        if let url = await account.accountManagementURL(action) {
            openURL(url)
        } else {
            error = L("ios.errorsExtra.theAccountPageCouldNotBeOpened")
        }
    }

    private func signOut(_ request: SignOutRequest) async {
        error = nil
        if oidc {
            await openDashboard(request.ids.count == 1 ? request.ids.first : nil)
            return
        }
        do {
            switch try await account.signOutDevices(request.ids) {
            case .done:
                await load()
            case .needsPassword(let next, _):
                challenge = next
                passwordRequest = request
            case .unsupported:
                error = "Authentication steps to perform this action are not supported by client."
            }
        } catch { self.error = error.friendlyMessage }
    }

    /// Nil when the devices are signed out, else what to tell the user.
    private func submitPassword(_ request: SignOutRequest, password: String) async -> String? {
        guard let challenge else { return "Start again." }
        do {
            switch try await account.signOutDevices(request.ids, password: password, challenge: challenge) {
            case .done:
                passwordRequest = nil
                await load()
                return nil
            case .needsPassword(let next, let message):
                self.challenge = next
                return message ?? "Wrong password."
            case .unsupported:
                return "Authentication steps to perform this action are not supported by client."
            }
        } catch {
            return error.friendlyMessage
        }
    }
}

/// Asks for your password to sign devices out. The password only goes to your server.
private struct DevicePasswordSheet: View {
    let count: Int
    let submit: (String) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField(L("settings.localBackup.password"), text: $password)
                        .textContentType(.password)
                } footer: {
                    Text(count == 1 ? "Your password confirms signing out this device." : "Your password confirms signing out \(count) devices.")
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
                Section {
                    Button(role: .destructive) {
                        busy = true
                        Task {
                            let answer = await submit(password)
                            busy = false
                            if let answer { error = answer; password = "" }
                        }
                    } label: {
                        HStack { Text(L("ios.securityUI.signOut")); if busy { Spacer(); ProgressView() } }
                    }
                    .disabled(password.isEmpty || busy)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle(L("ios.finalUI.confirmItU2019SYou"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("ios.settings.cancel")) { dismiss() } } }
        }
        .interactiveDismissDisabled(busy)
    }
}
