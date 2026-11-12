import SwiftUI

/// Desktop `RoomUpgradeDialog`: pick a room version (and, from version 12, the creators that stay)
/// and open the replacement room.
struct RoomUpgradeSheet: View {
    @ObservedObject var model: RoomSettingsModel
    @Environment(\.dismiss) private var dismiss
    @State private var version = ""
    @State private var creators: [String] = []
    @State private var newCreator = ""
    @State private var upgrading = false
    @State private var error: String?
    @State private var confirming = false

    private var word: String { model.isSpace ? "Space" : "Room" }
    private var allowsCreators: Bool { RoomVersionSupport.creators(version) }

    private var newCreatorId: String? {
        let id = newCreator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard id.hasPrefix("@"), id.contains(":"), id.count > 3, id != model.me, !creators.contains(id) else { return nil }
        return id
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("This can't be undone").bold().foregroundStyle(Theme.danger)
                            Text("A new \(word.lowercased()) replaces this one. Members have to join the new \(word.lowercased()); this one stays readable.")
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                        }
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger)
                    }
                }
                Section("Options") {
                    Picker("\(word) Version", selection: $version) {
                        ForEach(model.roomVersions, id: \.self) { value in Text(value).tag(value) }
                    }
                    .disabled(upgrading)
                }
                if allowsCreators {
                    Section {
                        ForEach(creators, id: \.self) { id in
                            HStack {
                                Text(id).font(.callout).lineLimit(1)
                                Spacer()
                                Button {
                                    creators.removeAll { $0 == id }
                                } label: {
                                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                                }
                                .buttonStyle(.borderless)
                                .disabled(upgrading)
                                .accessibilityLabel("Remove \(id)")
                            }
                        }
                        HStack {
                            TextField("@user:server", text: $newCreator)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            Button("Add") {
                                if let id = newCreatorId {
                                    creators.append(id)
                                    newCreator = ""
                                }
                            }
                            .buttonStyle(.borderless)
                            .disabled(newCreatorId == nil || upgrading)
                        }
                    } header: {
                        Text("Additional Creators")
                    } footer: {
                        Text("Creators have all permissions and can only be changed during an upgrade.")
                    }
                }
                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(Theme.danger)
                    }
                }
                Section {
                    Button(role: .destructive) {
                        confirming = true
                    } label: {
                        HStack {
                            if upgrading { ProgressView() }
                            Text("Upgrade \(word)")
                        }
                    }
                    .disabled(upgrading || version.isEmpty)
                    .confirmationDialog("Upgrade this \(word.lowercased()) to version \(version)?", isPresented: $confirming, titleVisibility: .visible) {
                        Button("Upgrade \(word)", role: .destructive) { Task { await upgrade() } }
                    } message: {
                        Text("This can't be undone.")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("\(word) Upgrade")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .interactiveDismissDisabled(upgrading)
            .onAppear {
                if version.isEmpty { version = model.defaultRoomVersion }
                if creators.isEmpty {
                    creators = RoomUpgradeRequest.defaultAdditionalCreators(model.state?.creators ?? [], me: model.me)
                }
            }
        }
    }

    private func upgrade() async {
        upgrading = true
        error = nil
        defer { upgrading = false }
        do {
            _ = try await model.upgrade(version: version, additionalCreators: creators)
            dismiss()
        } catch {
            self.error = error.friendlyMessage
        }
    }
}
