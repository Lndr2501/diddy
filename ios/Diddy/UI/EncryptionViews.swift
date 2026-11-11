import MatrixRustSDK
import SwiftUI

/// Settings > Encryption: verification of this session, recovery key, key backup and identity
/// reset. Mirrors the desktop's Settings > Devices (verification, recovery, backup).
struct EncryptionSettingsView: View {
    @ObservedObject var account: MatrixAccount
    @State private var showRecoveryEntry = false
    @State private var showSetup = false
    @State private var showChange = false
    @State private var showReset = false
    @State private var backupInfo: KeyBackupInfo?
    @State private var backupChecked = false
    @State private var backupError: String?
    @State private var backupBusy = false

    private var recoveryText: String {
        switch account.recoveryState {
        case .enabled: return "On"
        case .disabled: return "Off"
        case .incomplete: return "Needs your recovery key"
        case .unknown: return "Checking…"
        }
    }

    private var backupText: String {
        switch account.backupStateNow() {
        case .enabled: return "On"
        case .creating, .enabling, .resuming: return "Starting…"
        case .downloading: return "Restoring…"
        case .disabling: return "Turning off…"
        case .unknown: return backupInfo == nil && backupChecked ? "Off" : "Not unlocked on this device"
        }
    }

    var body: some View {
        List {
            Section {
                LabeledContent("This session", value: account.verificationState == .verified ? "Verified" : "Not verified")
                if account.verificationState != .verified {
                    Button { Task { await VerificationCenter.of(account).requestDeviceVerification() } } label: {
                        Label("Verify with another device", systemImage: "iphone.and.arrow.forward")
                    }
                    Button { showRecoveryEntry = true } label: {
                        Label("Enter recovery key", systemImage: "key.fill")
                    }
                }
            } header: {
                Text("Device Verification")
            } footer: {
                Text(account.verificationState == .verified
                     ? "Other people can trust this session, and it can read your encrypted history."
                     : "Verify this session to read your encrypted messages and let others trust it.")
            }

            Section {
                LabeledContent("Recovery", value: recoveryText)
                switch account.recoveryState {
                case .disabled:
                    Button { showSetup = true } label: { Label("Set up recovery", systemImage: "key.viewfinder") }
                case .enabled, .incomplete:
                    Button { showChange = true } label: { Label("Change recovery key", systemImage: "arrow.triangle.2.circlepath") }
                case .unknown:
                    EmptyView()
                }
            } header: {
                Text("Recovery Key")
            } footer: {
                Text("A recovery key lets you verify a new session and read your history if you have no other device. Keep it somewhere safe.")
            }

            Section {
                LabeledContent("Backup", value: backupText)
                if let backupInfo {
                    LabeledContent("Version", value: backupInfo.version)
                    if let count = backupInfo.count { LabeledContent("Keys on server", value: String(count)) }
                }
                if let backupError { Text(backupError).font(.footnote).foregroundStyle(Theme.danger) }
                if backupInfo != nil && account.backupStateNow() != .enabled {
                    Button { showRecoveryEntry = true } label: { Label("Restore backup", systemImage: "arrow.down.circle") }
                }
                if backupChecked && backupInfo == nil && account.backupStateNow() != .enabled {
                    Button { Task { await createBackup() } } label: {
                        HStack {
                            Label("Create backup", systemImage: "externaldrive.badge.icloud")
                            if backupBusy { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(backupBusy)
                }
            } header: {
                Text("Encryption Backup")
            } footer: {
                Text("The backup keeps your message keys on the server, encrypted, so a new session can read old messages. Restoring needs your recovery key.")
            }

            Section {
                Button(role: .destructive) { showReset = true } label: {
                    Label("Reset device verification", systemImage: "exclamationmark.octagon.fill")
                }
            } footer: {
                Text("Starts your encryption over. Only do this if you lost your recovery key and every other verified device.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Encryption")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadBackup() }
        .refreshable { await loadBackup() }
        .verificationSheet(account: account)
        .sheet(isPresented: $showRecoveryEntry, onDismiss: { Task { await loadBackup() } }) { RecoveryView(account: account) }
        .sheet(isPresented: $showSetup) { RecoveryKeySheet(account: account, mode: .setup) }
        .sheet(isPresented: $showChange) { RecoveryKeySheet(account: account, mode: .change) }
        .sheet(isPresented: $showReset, onDismiss: { Task { await loadBackup() } }) { ResetIdentitySheet(account: account) }
    }

    private func loadBackup() async {
        do {
            backupInfo = try await account.keyBackupInfo()
            backupError = nil
        } catch {
            backupError = error.friendlyMessage
        }
        backupChecked = true
    }

    private func createBackup() async {
        backupBusy = true
        defer { backupBusy = false }
        do {
            try await account.enableKeyBackup()
            await loadBackup()
        } catch {
            backupError = error.friendlyMessage
        }
    }
}

/// A recovery key, hidden behind stars until you show it, with copy and share.
struct RecoveryKeyDisplay: View {
    let recoveryKey: String
    @State private var shown = false
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(shown ? recoveryKey : AccountInfo.masked(recoveryKey))
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(Theme.text)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Theme.input, in: RoundedRectangle(cornerRadius: 10))
            HStack {
                Button(shown ? "Hide" : "Show") { shown.toggle() }
                Button(copied ? "Copied" : "Copy") {
                    // Only on this device, and gone from the clipboard after two minutes.
                    UIPasteboard.general.setItems(
                        [["public.utf8-plain-text": recoveryKey]],
                        options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)]
                    )
                    copied = true
                }
                ShareLink(item: recoveryKey) { Text("Save") }
            }
            .buttonStyle(.bordered)
        }
    }
}

/// Sets up recovery, or makes a new recovery key, and shows it once.
struct RecoveryKeySheet: View {
    enum Mode { case setup, change }

    @ObservedObject var account: MatrixAccount
    let mode: Mode
    @Environment(\.dismiss) private var dismiss
    @State private var passphrase = ""
    @State private var busy = false
    @State private var progress: String?
    @State private var error: String?
    @State private var recoveryKey: String?
    @State private var confirmChange = false

    var body: some View {
        NavigationStack {
            Form {
                if let recoveryKey {
                    Section {
                        RecoveryKeyDisplay(recoveryKey: recoveryKey)
                    } header: {
                        Text("Your recovery key")
                    } footer: {
                        Text("Save it now, for example in a password manager. Diddy cannot show it again.")
                    }
                } else {
                    Section {
                        if mode == .setup {
                            SecureField("Passphrase (optional)", text: $passphrase)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                    } footer: {
                        Text(mode == .setup
                             ? "Generates a recovery key for verifying your identity when you have no other device. A passphrase is a memorable alternative."
                             : "Makes a new recovery key. The old one stops working, and so does any passphrase.")
                    }
                    if let error { Text(error).foregroundStyle(Theme.danger) }
                    Section {
                        Button {
                            if mode == .change { confirmChange = true } else { Task { await run() } }
                        } label: {
                            HStack {
                                Text(mode == .setup ? "Continue" : "Make new recovery key")
                                if busy { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(busy)
                        if let progress, busy { Text(progress).font(.footnote).foregroundStyle(Theme.muted) }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle(mode == .setup ? "Set up recovery" : "Change recovery key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(recoveryKey == nil ? "Cancel" : "Done") { dismiss() }
                }
            }
            .confirmationDialog("Make a new recovery key?", isPresented: $confirmChange, titleVisibility: .visible) {
                Button("Make New Key", role: .destructive) { Task { await run() } }
            } message: {
                Text("Your old recovery key stops working.")
            }
        }
        .interactiveDismissDisabled(busy)
    }

    private func run() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            switch mode {
            case .setup:
                let key = try await account.enableRecovery(passphrase: passphrase) { text in
                    Task { @MainActor in progress = text }
                }
                recoveryKey = key
            case .change:
                recoveryKey = try await account.changeRecoveryKey()
            }
            passphrase = ""
        } catch {
            self.error = error.friendlyMessage
        }
    }
}

/// Resets your encryption identity: cross-signing keys, backup and recovery key.
struct ResetIdentitySheet: View {
    enum Step {
        case warn
        case busy
        case password(session: String)
        case approve(url: URL?, session: String)
        case done
    }

    @ObservedObject var account: MatrixAccount
    @Environment(\.dismiss) private var dismiss
    @State private var step: Step = .warn
    @State private var password = ""
    @State private var error: String?
    @State private var handle: IdentityResetHandle?

    private var finished: Bool {
        if case .done = step { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                switch step {
                case .warn:
                    Section {
                        Text("Resetting device verification is permanent.").fontWeight(.semibold)
                        Text("Anyone you have verified with will see security alerts and your encryption backup will be lost. You almost certainly do not want to do this, unless you have lost your Recovery Key or Recovery Passphrase and every device you can verify from.")
                            .foregroundStyle(Theme.muted)
                    }
                    if let error { Text(error).foregroundStyle(Theme.danger) }
                    Section {
                        Button("Reset", role: .destructive) { Task { await begin() } }
                    }
                case .busy:
                    Section { HStack { ProgressView(); Text("Resetting…").foregroundStyle(Theme.muted) } }
                case .password(let session):
                    Section {
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                    } header: {
                        Text("Confirm it is you")
                    } footer: {
                        Text("Your server asks for your account password to reset the keys.")
                    }
                    if let error { Text(error).foregroundStyle(Theme.danger) }
                    Section {
                        Button("Reset", role: .destructive) { Task { await submitPassword(session: session) } }
                            .disabled(password.isEmpty)
                    }
                case .approve(let url, let session):
                    Section {
                        if let url {
                            Link(destination: url) { Label("Approve in your browser", systemImage: "safari") }
                        }
                        Text("Approve the reset on your account page, then come back and continue.")
                            .foregroundStyle(Theme.muted)
                    }
                    if let error { Text(error).foregroundStyle(Theme.danger) }
                    Section {
                        Button("I approved it") { Task { await finishApproval(session: session) } }
                    }
                case .done:
                    Section {
                        Label("Your device verification was reset.", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Theme.text)
                        Text("Set up recovery again to get a new recovery key.").foregroundStyle(Theme.muted)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle("Reset device verification")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(finished ? "Done" : "Cancel") { close() }
                }
            }
        }
    }

    private func close() {
        let pending = handle
        handle = nil
        password = ""
        if !finished, let pending { Task { await pending.cancel() } }
        dismiss()
    }

    private func begin() async {
        step = .busy
        error = nil
        do {
            guard let started = try await account.client.encryption().resetIdentity() else {
                step = .done
                return
            }
            handle = started
            switch started.authType() {
            case .uiaa(let info): step = .password(session: info.session)
            case .oAuth(let info): step = .approve(url: URL(string: info.approvalUrl), session: info.session)
            }
        } catch {
            self.error = error.friendlyMessage
            step = .warn
        }
    }

    private func submitPassword(session: String) async {
        guard let handle else { return }
        let details = AuthDataPasswordDetails(identifier: account.userId, password: password, session: session)
        step = .busy
        error = nil
        do {
            try await handle.reset(auth: .password(passwordDetails: details))
            password = ""
            self.handle = nil
            step = .done
        } catch {
            self.error = error.friendlyMessage
            step = .password(session: session)
        }
    }

    private func finishApproval(session: String) async {
        guard let handle else { return }
        step = .busy
        error = nil
        do {
            try await handle.reset(auth: .oAuth(session: session))
            self.handle = nil
            step = .done
        } catch {
            self.error = error.friendlyMessage
            step = .approve(url: nil, session: session)
        }
    }
}
