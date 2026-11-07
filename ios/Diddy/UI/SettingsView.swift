import MatrixRustSDK
import PhotosUI
import SwiftUI

struct SettingsView: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var icon = AppIconChoice.current
    @State private var iconError: String?
    @State private var confirmLogout: MatrixAccount?
    @State private var showRecovery = false

    var body: some View {
        NavigationStack {
            List {
                ProfileSection(account: account)

                Section("Accounts") {
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
                        Label("Add an account on another server", systemImage: "plus.circle.fill")
                    }
                }

                Section {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 64), spacing: 14)], spacing: 14) {
                        ForEach(AppIconChoice.allCases) { choice in
                            Button {
                                Task {
                                    do {
                                        try await choice.apply()
                                        icon = choice
                                    } catch { iconError = error.friendlyMessage }
                                }
                            } label: {
                                VStack(spacing: 6) {
                                    Image(choice.previewImage)
                                        .resizable()
                                        .frame(width: 60, height: 60)
                                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                .stroke(icon == choice ? Theme.accent : .clear, lineWidth: 3)
                                        )
                                    Text(choice.title).font(.caption).foregroundStyle(icon == choice ? Theme.text : Theme.muted)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 6)
                    if let iconError { Text(iconError).font(.footnote).foregroundStyle(Theme.danger) }
                } header: {
                    Text("App Icon")
                } footer: {
                    Text("Changes the icon on your home screen.")
                }

                Section {
                    NavigationLink("Sounds") { SoundSettingsView() }
                }

                Section("Security") {
                    LabeledContent("Session", value: account.verificationState == .verified ? "Verified" : "Not verified")
                    LabeledContent("Device ID", value: account.deviceId)
                    Button("Enter recovery key") { showRecovery = true }
                }

                Section {
                    Button("Log Out of \(account.record.serverName)", role: .destructive) { confirmLogout = account }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .confirmationDialog(
                "Log out of \(confirmLogout?.title ?? "")?",
                isPresented: Binding(get: { confirmLogout != nil }, set: { if !$0 { confirmLogout = nil } }),
                titleVisibility: .visible
            ) {
                Button("Log Out", role: .destructive) {
                    if let target = confirmLogout {
                        Task {
                            await app.logout(target)
                            if target.id == account.id { dismiss() }
                        }
                    }
                }
            } message: {
                Text("Encrypted messages can only be read again with your recovery key or another verified device.")
            }
            .sheet(isPresented: $showRecovery) { RecoveryView(account: account) }
        }
    }
}

/// What Diddy may play, and a place to hear each sound.
private struct SoundSettingsView: View {
    var body: some View {
        List {
            Section {
                ForEach(SoundSetting.allCases) { SoundToggle(setting: $0) }
            } footer: {
                Text("Diddy can only ring while it is open. The ringtone follows the silent switch and also vibrates.")
            }
            Section("Listen") {
                ForEach(Sound.allCases) { sound in
                    Button { Sounds.shared.preview(sound) } label: {
                        HStack {
                            Text(sound.title).foregroundStyle(Theme.text)
                            Spacer()
                            Image(systemName: "play.circle.fill").foregroundStyle(Theme.accent)
                        }
                    }
                    .accessibilityLabel("Play \(sound.title)")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Sounds")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { Sounds.shared.stopLoop() }
    }
}

private struct SoundToggle: View {
    let setting: SoundSetting
    @AppStorage private var isOn: Bool

    init(setting: SoundSetting) {
        self.setting = setting
        _isOn = AppStorage(wrappedValue: true, setting.rawValue)
    }

    var body: some View {
        Toggle(setting.title, isOn: $isOn)
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
        Section("Profile") {
            HStack(spacing: 14) {
                PhotosPicker(selection: $photo, matching: .images) {
                    AvatarView(url: account.avatarUrl, name: account.title, size: 60, account: account)
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "pencil.circle.fill")
                                .foregroundStyle(.white, Theme.accent)
                                .font(.title3)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Change profile picture")
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Display name", text: $name)
                        .font(.headline)
                        .submitLabel(.done)
                        .onSubmit { saveName() }
                    Text(account.userId).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                }
                if saving { ProgressView() }
            }
            if name != (account.displayName ?? "") && !name.trimmingCharacters(in: .whitespaces).isEmpty {
                Button("Save Name") { saveName() }.disabled(saving)
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
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
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("EsTc 1234 …", text: $key, axis: .vertical)
                        .font(.system(.body, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Recovery key")
                } footer: {
                    Text("The recovery key (or security key) you saved when you set up encryption, for example in Diddy desktop or Element. It unlocks your message history on this device.")
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
                Button {
                    busy = true
                    Task {
                        do {
                            try await account.recover(with: key)
                            dismiss()
                        } catch { self.error = error.friendlyMessage }
                        busy = false
                    }
                } label: {
                    HStack { if busy { ProgressView() }; Text("Verify") }
                }
                .disabled(key.isEmpty || busy)
            }
            .navigationTitle("Verify this device")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
