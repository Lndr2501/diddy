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
                            Text(L("ios.finalUI.thisCanTBeUndone")).bold().foregroundStyle(Theme.danger)
                            Text(L("ios.lastDynamic.upgradeDescription", ["kind": word.lowercased()]))
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                        }
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger)
                    }
                }
                Section(L("settings.about.options")) {
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
                                .accessibilityLabel(L("ios.lastDynamic.removeId", ["id": id]))
                            }
                        }
                        HStack {
                            TextField(L("settings.ignoredUserList.userServer"), text: $newCreator)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            Button(L("settings.connectedAccounts.add")) {
                                if let id = newCreatorId {
                                    creators.append(id)
                                    newCreator = ""
                                }
                            }
                            .buttonStyle(.borderless)
                            .disabled(newCreatorId == nil || upgrading)
                        }
                    } header: {
                        Text(L("ios.finalUI.additionalCreators"))
                    } footer: {
                        Text(L("ios.finalUI.creatorsHaveAllPermissionsAndCanOnlyBeChangedDuringAnUpgr"))
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
                            Text(L("ios.lastDynamic.upgradeKind", ["kind": word]))
                        }
                    }
                    .disabled(upgrading || version.isEmpty)
                    .confirmationDialog(L("ios.lastDynamic.upgradeConfirm", ["kind": word.lowercased(), "version": version]), isPresented: $confirming, titleVisibility: .visible) {
                        Button(L("ios.lastDynamic.upgradeKind", ["kind": word]), role: .destructive) { Task { await upgrade() } }
                    } message: {
                        Text(L("ios.finalUI.thisCanTBeUndone"))
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("\(word) Upgrade")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("settings.deviceTile.cancel")) { dismiss() } } }
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
