import MatrixRustSDK
import PhotosUI
import SwiftUI

/// Pages of the Settings sheet that are opened by value, so a new theme can rebuild the sheet and
/// still show them: the ones where you pick the theme.
enum SettingsPage: Hashable {
    case appearance, customTheme
}

/// The Settings sheet. A new theme rebuilds its pages (`diddySheetAppearance`); the path stays here,
/// outside the rebuild, so Appearance stays open while you pick.
struct SettingsSheet: View {
    let account: MatrixAccount
    @State private var path = NavigationPath()

    var body: some View {
        SettingsView(account: account, path: $path).diddySheetAppearance()
    }
}

struct SettingsView: View {
    @ObservedObject var account: MatrixAccount
    @Binding var path: NavigationPath
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmLogout: MatrixAccount?
    /// The server did not end the session: retry, or remove the account from this device anyway.
    @State private var logoutFailure: LogoutFailure?
    @State private var showRecovery = false
    @State private var showWelcome = false

    private struct LogoutFailure: Identifiable {
        let account: MatrixAccount
        let message: String
        var id: String { account.id }
    }

    private func logOut(_ target: MatrixAccount, localOnly: Bool) async {
        do {
            try await app.logout(target, localOnly: localOnly)
            if target.id == account.id { dismiss() }
        } catch {
            logoutFailure = LogoutFailure(account: target, message: error.friendlyMessage)
        }
    }

    private var isVerified: Bool { account.verificationState == .verified }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                ProfileSection(account: account)

                Section(L("settings.connectedAccounts.accounts")) {
                    ForEach(app.accounts) { other in
                        AccountRow(account: other, isActive: other.id == account.id) {
                            Task {
                                await app.switchTo(other)
                                dismiss()
                            }
                        }
                        .swipeActions {
                            Button("Log Out", role: .destructive) { confirmLogout = other }
                        }
                    }
                    Button {
                        dismiss()
                        app.addingAccount = true
                    } label: {
                        Label("Add Account", systemImage: "plus.circle.fill")
                    }
                }

                accountSection
                appSection
                helpSection

                Section {
                    Button(L("ios.settings.logOutServer", ["name": account.record.serverName]), role: .destructive) { confirmLogout = account }
                } footer: {
                    Text(L("ios.settings.signedInUser", ["name": account.userId]))
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle(L("settings.page.settings"))
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: SettingsPage.self) { page in
                switch page {
                case .appearance: AppearanceSettingsView()
                case .customTheme: CustomThemeView()
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(L("call.companionDialog.done")) { dismiss() } }
            }
            .confirmationDialog(
                L("ios.settings.confirmLogOut", ["name": confirmLogout?.title ?? ""]),
                isPresented: Binding(get: { confirmLogout != nil }, set: { if !$0 { confirmLogout = nil } }),
                titleVisibility: .visible
            ) {
                Button("Log Out", role: .destructive) {
                    if let target = confirmLogout { Task { await logOut(target, localOnly: false) } }
                }
            } message: {
                Text(L("ios.settings.encryptedMessagesCanOnlyBeReadAgainWithYourRecoveryKeyOrAnotherVerifiedDevice"))
            }
            .alert(
                "Could not log out",
                isPresented: Binding(get: { logoutFailure != nil }, set: { if !$0 { logoutFailure = nil } }),
                presenting: logoutFailure
            ) { failure in
                Button(L("ios.settings.tryAgain")) { Task { await logOut(failure.account, localOnly: false) } }
                Button(L("ios.settings.removeFromThisDeviceAnyway"), role: .destructive) {
                    Task { await logOut(failure.account, localOnly: true) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { failure in
                Text(L("ios.settings.logoutFailure", ["error": failure.message]))
            }
            .sheet(isPresented: $showRecovery) { RecoveryView(account: account).diddySheetAppearance() }
        }
        // The guide brings its own navigation stack, so it opens as a sheet rather than a pushed page.
        .sheet(isPresented: $showWelcome) {
            DiddyWelcomeView(account: account, onFinish: { showWelcome = false }).diddySheetAppearance()
        }
    }

    // MARK: Sections

    private var accountSection: some View {
        Section {
            if !isVerified {
                Button { showRecovery = true } label: {
                    SettingsRowLabel(title: L("ios.settings.enterRecoveryKey"), systemImage: "key.fill", color: .orange)
                }
            }
            NavigationLink { DevicesView(account: account) } label: {
                SettingsRowLabel(title: "Devices", systemImage: "iphone", color: .gray)
            }
            NavigationLink { EncryptionSettingsView(account: account) } label: {
                SettingsRowLabel(
                    title: "Encryption", systemImage: "lock.fill", color: .green,
                    value: isVerified ? "Verified" : "Not Verified",
                    valueColor: isVerified ? Theme.muted : Theme.danger)
            }
            NavigationLink { ContactInfoView(account: account) } label: {
                SettingsRowLabel(title: "Contact Information", systemImage: "envelope.fill", color: .blue)
            }
            NavigationLink { BlockedUsersView(account: account) } label: {
                SettingsRowLabel(title: "Blocked Users", systemImage: "hand.raised.fill", color: .red)
            }
        } header: {
            Text(L("settings.page.account"))
        } footer: {
            if !isVerified {
                Text(L("ios.settings.thisDeviceIsNotVerifiedYetEnterYourRecoveryKeyOrVerifyItFromAnotherDeviceToReadYourEncryptedMessages"))
            }
        }
    }

    private var appSection: some View {
        Section(L("ios.settings.app")) {
            NavigationLink(value: SettingsPage.appearance) {
                SettingsRowLabel(title: L("ios.settings.appearance"), systemImage: "paintpalette.fill", color: .pink)
            }
            NavigationLink { LanguageSettingsView() } label: {
                SettingsRowLabel(title: L("settings.language.title"), systemImage: "globe", color: .blue)
            }
            NavigationLink { ChatSettingsView() } label: {
                SettingsRowLabel(title: L("ios.settings.chat"), systemImage: "bubble.left.and.bubble.right.fill", color: .blue)
            }
            NavigationLink { NotificationSettingsView(account: account) } label: {
                SettingsRowLabel(title: "Notifications", systemImage: "bell.badge.fill", color: .red)
            }
            NavigationLink { SoundSettingsView() } label: {
                SettingsRowLabel(title: L("ios.settings.sounds"), systemImage: "speaker.wave.2.fill", color: .pink)
            }
            NavigationLink { CallSettingsView() } label: {
                SettingsRowLabel(title: L("ios.settings.calls"), systemImage: "phone.fill", color: .green)
            }
            NavigationLink { WatchTogetherSettingsView() } label: {
                SettingsRowLabel(title: L("ios.settings.watchTogether"), systemImage: "play.rectangle.fill", color: .red)
            }
            NavigationLink { PluginSettingsView() } label: {
                SettingsRowLabel(title: "Plugins", systemImage: "puzzlepiece.extension.fill", color: .purple)
            }
        }
    }

    private var helpSection: some View {
        Section(L("ios.settings.help")) {
            Button { showWelcome = true } label: {
                SettingsRowLabel(title: L("ios.settings.welcomeGuide"), systemImage: "hand.wave.fill", color: .orange)
            }
            NavigationLink { AboutView(account: account) } label: {
                SettingsRowLabel(title: L("ios.settings.aboutDiddy"), systemImage: "info.circle.fill", color: .gray)
            }
            NavigationLink { DeveloperToolsView(account: account) } label: {
                SettingsRowLabel(title: "Developer Tools", systemImage: "hammer.fill", color: .gray)
            }
        }
    }
}

/// A settings row like the iOS Settings app: an SF Symbol in a coloured rounded square, the
/// title, and an optional value on the trailing side.
struct SettingsRowLabel: View {
    let title: String
    let systemImage: String
    let color: Color
    var value: String? = nil
    var valueColor: Color = Theme.muted

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: 29, height: 29)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(color))
                .accessibilityHidden(true)
            Text(title).foregroundStyle(Theme.text)
            if let value {
                Spacer(minLength: 8)
                Text(value).foregroundStyle(valueColor).lineLimit(1)
            }
        }
    }
}

/// Turns on "<name> is calling you" through the ntfy app, for when Diddy is closed
/// (Settings > Notifications > Call Alerts).
struct CallAlertSettingsView: View {
    @EnvironmentObject private var app: AppModel
    @AppStorage(CallPushSettings.enabledKey) private var enabled = false
    @AppStorage(CallPushSettings.serverKey) private var server = CallPushSettings.defaultServer
    @State private var testResult: String?
    @State private var testing = false
    @State private var copied = false

    private var serverAllowed: Bool { CallPushTarget.isAllowed(server: CallPushSettings.server) }

    var body: some View {
        List {
            Section {
                Toggle(L("ios.settings.ntfyAlerts"), isOn: $enabled)
            } footer: {
                Text("When someone calls you from Diddy while it is closed, the ntfy app shows \u{201C}Name is calling you\u{201D}. Calls from other apps do not send this.")
            }
            if enabled {
                Section {
                    LabeledContent("Server") {
                        TextField(CallPushSettings.defaultServer, text: $server)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .onSubmit { if serverAllowed { publish() } }
                    }
                    Button {
                        UIPasteboard.general.string = CallPushSettings.topic
                        copied = true
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(copied ? "Topic copied" : "Topic")
                            // Monospaced and unhyphenated, so it can be typed off the screen too.
                            Text(CallPushSettings.topic)
                                .font(.footnote.monospaced())
                                .foregroundStyle(Theme.muted)
                                .textSelection(.enabled)
                        }
                    }
                    .accessibilityHint("Copies the topic")
                    Button(testing ? "Sending\u{2026}" : "Send Test Alert") {
                        testing = true
                        Task {
                            testResult = await CallPush.shared.sendTest()
                                ? "Sent. It should appear in ntfy within a few seconds."
                                : "Could not reach the server."
                            testing = false
                        }
                    }
                    .disabled(testing || !serverAllowed)
                } header: {
                    Text("ntfy")
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        if !serverAllowed { Text("The server must start with https://.").foregroundStyle(Theme.danger) }
                        if let testResult { Text(testResult) }
                        Text("Install ntfy from the App Store, tap +, and subscribe to this topic on this server. Keep the topic to yourself: anyone who knows it can send you alerts.")
                        Text("The topic is stored in your direct messages, where the other person and their server can read it.")
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("ios.settings.callAlerts"))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: enabled) { _ in publish() }
        // Written to the rooms once typing is done, not on every keystroke.
        .onChange(of: server) { _ in testResult = nil }
        .onDisappear { if serverAllowed { publish() } }
    }

    private func publish() {
        for account in app.accounts { CallPush.shared.publish(account: account) }
    }
}

/// Your name and picture, as others see them.
private struct ProfileSection: View {
    @ObservedObject var account: MatrixAccount
    @State private var name = ""
    @State private var photo: PhotosPickerItem?
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        Section {
            HStack(spacing: 14) {
                PhotosPicker(selection: $photo, matching: .images) {
                    AvatarView(url: account.avatarUrl, name: account.title, size: 60, account: account)
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "pencil.circle.fill")
                                .foregroundStyle(Theme.onAccent, Theme.accent)
                                .font(.title3)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Change profile picture")
                VStack(alignment: .leading, spacing: 4) {
                    TextField(L("settings.diddyProfile.displayName"), text: $name)
                        .font(.headline)
                        .submitLabel(.done)
                        .onSubmit { saveName() }
                    Text(account.userId).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                }
                if saving { ProgressView() }
            }
            if name != (account.displayName ?? "") && !name.trimmingCharacters(in: .whitespaces).isEmpty {
                Button(L("ios.settings.saveName")) { saveName() }.disabled(saving)
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
            NavigationLink { DiddyProfileEditor(account: account) } label: {
                SettingsRowLabel(title: "Diddy Profile", systemImage: "paintbrush.fill", color: Theme.accent)
            }
        } footer: {
            Text(L("ios.settings.changePicture"))
        }
        .task(id: account.displayName) { name = account.displayName ?? "" }
        .onChange(of: photo) { item in
            guard let item else { return }
            run {
                guard let raw = try await item.loadTransferable(type: Data.self), let image = UIImage(data: raw),
                      let data = image.jpegData(compressionQuality: 0.85) else {
                    throw DiddyError("This image could not be read.")
                }
                try await account.client.uploadAvatar(mimeType: "image/jpeg", data: data)
            }
            photo = nil
        }
    }

    private func saveName() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed != account.displayName else { return }
        run { try await account.client.setDisplayName(name: trimmed) }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        saving = true
        error = nil
        Task {
            do {
                try await work()
                await account.refreshProfile()
            } catch { self.error = error.friendlyMessage }
            saving = false
        }
    }
}

private struct AccountRow: View {
    @ObservedObject var account: MatrixAccount
    let isActive: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(spacing: 12) {
                AvatarView(url: account.avatarUrl, name: account.title, size: 38, account: account)
                VStack(alignment: .leading, spacing: 2) {
                    Text(account.title).foregroundStyle(Theme.text)
                    Text(account.userId).font(.caption).foregroundStyle(Theme.faint)
                }
                Spacer()
                if isActive { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
            }
        }
    }
}

struct RecoveryView: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var calls: CallManager
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var reveal = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if calls.sharingScreen {
                    // The field is gone while the screen goes out (ScreenShareNotice).
                    Section {
                        Label(ScreenShareNotice.recoveryLocked, systemImage: "eye.slash")
                            .foregroundStyle(Theme.muted)
                    }
                } else {
                Section {
                    HStack {
                        Group {
                            if reveal {
                                TextField("EsTc 1234 …", text: $key)
                            } else {
                                SecureField("EsTc 1234 …", text: $key)
                            }
                        }
                        .font(.system(.body, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        Button { reveal.toggle() } label: {
                            Image(systemName: reveal ? "eye.slash" : "eye").foregroundStyle(Theme.muted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(reveal ? "Hide recovery key" : "Show recovery key")
                    }
                } header: {
                    Text("Recovery key or passphrase")
                } footer: {
                    Text("The recovery key (or security key) or passphrase you saved when you set up encryption, for example in Diddy desktop or Element. It unlocks your message history on this device.")
                }
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
                Button {
                    busy = true
                    Task {
                        do {
                            try await account.recover(with: key)
                            key = ""
                            dismiss()
                        } catch { self.error = error.friendlyMessage }
                        busy = false
                    }
                } label: {
                    HStack { if busy { ProgressView() }; Text(L("settings.verification.verify")) }
                }
                .disabled(key.isEmpty || busy || calls.sharingScreen)
            }
            .onChange(of: calls.sharingScreen) { sharing in if sharing { key = ""; reveal = false } }
            .navigationTitle(L("ios.settings.verifyDevice"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
