import MatrixRustSDK
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
                                    } catch { iconError = error.localizedDescription }
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

private struct AccountRow: View {
    @ObservedObject var account: MatrixAccount
    let isActive: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(spacing: 12) {
                AvatarView(url: account.avatarUrl, name: account.title, size: 38)
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
                        } catch { self.error = error.localizedDescription }
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
