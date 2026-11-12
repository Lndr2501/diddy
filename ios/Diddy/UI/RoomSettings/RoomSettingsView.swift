import MatrixRustSDK
import PhotosUI
import SwiftUI

/// Settings of a channel or a server (space), like the desktop room and space settings:
/// profile (name, topic, avatar), options (access, history, encryption, directory), addresses,
/// roles and permissions, members (banned, invited, knocking) and the room upgrade.
/// Open it with `RoomSettingsView(roomId:account:)`; it brings its own NavigationStack.
/// `onOpenRoom` is called with the new room's id when the upgrade link is followed.
struct RoomSettingsView: View {
    let roomId: String
    @ObservedObject var account: MatrixAccount
    var onOpenRoom: ((String) -> Void)?
    @StateObject private var model: RoomSettingsModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var topic = ""
    @State private var photo: PhotosPickerItem?
    @State private var confirmEncryption = false
    @State private var confirmRemoveAvatar = false
    @State private var showUpgrade = false
    @State private var askDiscard = false

    init(roomId: String, account: MatrixAccount, onOpenRoom: ((String) -> Void)? = nil) {
        self.roomId = roomId
        self.account = account
        self.onOpenRoom = onOpenRoom
        _model = StateObject(wrappedValue: RoomSettingsModel(roomId: roomId, account: account))
    }

    private var summary: RoomSummary? { account.summary(for: roomId) }
    private var typeWord: String { model.isSpace ? "space" : "room" }
    /// Name or topic typed but not saved yet.
    private var hasProfileChanges: Bool {
        guard let state = model.state else { return false }
        return profileChanged(state, canName: model.canSendState("m.room.name"), canTopic: model.canSendState("m.room.topic"))
    }
    /// Whether the Save of the profile section would be enabled.
    private var canSaveProfile: Bool {
        !model.busy && !(model.canSendState("m.room.name") && name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error = model.actionError {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(Theme.danger)
                    }
                }
                if let state = model.state {
                    profileSection(state)
                    optionsSection(state)
                    Section {
                        NavigationLink {
                            RoomAddressesView(model: model)
                        } label: {
                            Label("Addresses", systemImage: "number")
                        }
                        NavigationLink {
                            RoomPermissionsView(model: model)
                        } label: {
                            Label("Roles & Permissions", systemImage: "lock.shield")
                        }
                        NavigationLink {
                            RoomMembersAdminView(model: model)
                        } label: {
                            Label("Members", systemImage: "person.2")
                        }
                    } header: {
                        Text("Manage")
                    } footer: {
                        Text("Addresses, roles and the members who are invited, banned or have left.")
                    }
                    Section("Advanced") { upgradeRows(state) }
                } else if let error = model.loadError {
                    Section {
                        VStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.title2)
                                .foregroundStyle(Theme.danger)
                            Text("Couldn't load the settings")
                                .font(.headline)
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                                .multilineTextAlignment(.center)
                            Button("Try Again") { Task { await reload() } }
                                .buttonStyle(.borderedProminent)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                } else {
                    Section {
                        HStack(spacing: 10) {
                            Spacer()
                            ProgressView()
                            Text("Loading settings").foregroundStyle(Theme.muted)
                            Spacer()
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle(model.isSpace ? "Server Settings" : "Channel Settings")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        if hasProfileChanges { askDiscard = true } else { dismiss() }
                    }
                }
            }
            .interactiveDismissDisabled(hasProfileChanges)
            .discardChangesDialog(isPresented: $askDiscard, saveTitle: canSaveProfile ? "Save" : nil, onSave: {
                guard let state = model.state else { return false }
                return await saveProfile(state, canName: model.canSendState("m.room.name"), canTopic: model.canSendState("m.room.topic"))
            }, onLeave: { dismiss() })
            .task { await reload() }
            .refreshable { await reload() }
            .onChange(of: photo) { item in
                guard let item else { return }
                photo = nil
                Task { await uploadAvatar(item) }
            }
            .confirmationDialog("Enable Encryption", isPresented: $confirmEncryption, titleVisibility: .visible) {
                Button("Enable E2E Encryption") {
                    Task {
                        await model.perform { try await model.sendState("m.room.encryption", content: RoomEncryptionRule.content) }
                    }
                }
            } message: {
                Text("Are you sure? Once enabled, encryption cannot be disabled!")
            }
            .confirmationDialog("Remove the picture?", isPresented: $confirmRemoveAvatar, titleVisibility: .visible) {
                Button("Remove", role: .destructive) {
                    Task {
                        await model.perform {
                            try await model.sendState("m.room.avatar", content: [:])
                            await model.refreshLists()
                        }
                    }
                }
            }
            .sheet(isPresented: $showUpgrade) { RoomUpgradeSheet(model: model) }
        }
    }

    private func reload() async {
        await model.load()
        await model.loadDirectoryVisibility()
        await model.loadRoomVersions()
        name = model.state?.name ?? ""
        topic = model.state?.topic ?? ""
    }

    // MARK: Profile

    @ViewBuilder
    private func profileSection(_ state: RoomStateSnapshot) -> some View {
        let canAvatar = model.canSendState("m.room.avatar")
        let canName = model.canSendState("m.room.name")
        let canTopic = model.canSendState("m.room.topic")
        Section {
            HStack(spacing: 12) {
                AvatarView(url: state.avatarUrl, name: (state.name ?? summary?.name ?? "?"), size: 64, cornerRadius: 16, account: account)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.name ?? summary?.name ?? roomId).font(.headline)
                    if let topic = state.topic, !topic.isEmpty {
                        Text(topic).font(.caption).foregroundStyle(Theme.muted).lineLimit(3)
                    }
                }
            }
            if canAvatar {
                PhotosPicker(selection: $photo, matching: .images) {
                    Label(state.avatarUrl == nil ? "Add Picture" : "Change Picture", systemImage: "photo")
                }
                .disabled(model.busy)
                if state.avatarUrl != nil {
                    Button(role: .destructive) { confirmRemoveAvatar = true } label: {
                        Label("Remove Picture", systemImage: "trash")
                    }
                    .disabled(model.busy)
                }
            }
            TextField("Name", text: $name).disabled(!canName)
            TextField("Topic", text: $topic, axis: .vertical).lineLimit(1...6).disabled(!canTopic)
            if profileChanged(state, canName: canName, canTopic: canTopic) {
                Button("Save") { Task { await saveProfile(state, canName: canName, canTopic: canTopic) } }
                    .disabled(model.busy || (canName && name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                Button("Discard Changes", role: .destructive) {
                    name = state.name ?? ""
                    topic = state.topic ?? ""
                }
                .disabled(model.busy)
            }
        } header: {
            Text("Profile")
        } footer: {
            if !canName || !canTopic || !canAvatar {
                Text("Some fields are locked because your role can't change them.")
            } else {
                Text("Name and topic are saved with Save; the picture changes right away.")
            }
        }
    }

    private func profileChanged(_ state: RoomStateSnapshot, canName: Bool, canTopic: Bool) -> Bool {
        (canName && name.trimmingCharacters(in: .whitespacesAndNewlines) != (state.name ?? ""))
            || (canTopic && topic.trimmingCharacters(in: .whitespacesAndNewlines) != (state.topic ?? ""))
    }

    @discardableResult
    private func saveProfile(_ state: RoomStateSnapshot, canName: Bool, canTopic: Bool) async -> Bool {
        let newName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let newTopic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        let worked = await model.perform {
            if canName && newName != (state.name ?? "") {
                try await model.sendState("m.room.name", content: ["name": newName])
            }
            if canTopic && newTopic != (state.topic ?? "") {
                try await model.sendState("m.room.topic", content: ["topic": newTopic])
            }
            await model.refreshLists()
        }
        if worked {
            name = model.state?.name ?? newName
            topic = model.state?.topic ?? newTopic
        }
        return worked
    }

    private func uploadAvatar(_ item: PhotosPickerItem) async {
        await model.perform {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw DiddyError("This picture could not be read.")
            }
            let limit = await account.diddyUploadLimit()
            let file = try DiddyMediaPrep.picture(data, limit: limit)
            let mxc = try await account.uploadDiddyMedia(file.data, mimeType: file.mimeType, filename: "avatar.\(file.ext)")
            try await model.sendState("m.room.avatar", content: ["url": mxc])
            await model.refreshLists()
        }
    }

    // MARK: Options

    @ViewBuilder
    private func optionsSection(_ state: RoomStateSnapshot) -> some View {
        let locked = !model.canSendState("m.room.join_rules")
            || !model.canSendState("m.room.history_visibility")
            || (!state.isEncrypted && !model.canSendState("m.room.encryption"))
        Section {
            joinRuleRow(state)
            historyRow(state)
            encryptionRow(state)
            publishRow(state)
        } header: {
            Text("Options")
        } footer: {
            if locked {
                Text("Changes here apply right away. Greyed out options need a higher role.")
            } else {
                Text("Changes here apply right away.")
            }
        }
    }

    /// The parents of the room that are known to the app: its server.
    private var knownParents: [String] {
        account.server(of: roomId).map { [$0] } ?? []
    }

    private func joinRuleRow(_ state: RoomStateSnapshot) -> some View {
        var options = RoomJoinRuleKind.options(roomVersion: state.roomVersion, inSpace: !knownParents.isEmpty)
        if !options.contains(state.joinRule) { options.insert(state.joinRule, at: 0) }
        let binding = Binding<RoomJoinRuleKind>(
            get: { state.joinRule },
            set: { rule in
                guard rule != state.joinRule else { return }
                let allowed = RoomJoinRules.allowedSpaces(spaceParents: state.spaceParents, knownParents: knownParents)
                Task {
                    await model.perform {
                        try await model.sendState("m.room.join_rules", content: RoomJoinRules.content(rule, allowedSpaces: allowed))
                    }
                }
            }
        )
        return VStack(alignment: .leading, spacing: 4) {
            Picker(model.isSpace ? "Space Access" : "Room Access", selection: binding) {
                ForEach(options) { rule in Text(rule.label).tag(rule) }
            }
            .disabled(!model.canSendState("m.room.join_rules") || model.busy)
            Text("Change how people can join the \(typeWord).").font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private func historyRow(_ state: RoomStateSnapshot) -> some View {
        let binding = Binding<RoomHistoryVisibilityKind>(
            get: { state.historyVisibility },
            set: { kind in
                guard kind != state.historyVisibility else { return }
                Task {
                    await model.perform {
                        try await model.sendState("m.room.history_visibility", content: ["history_visibility": kind.rawValue])
                    }
                }
            }
        )
        return VStack(alignment: .leading, spacing: 4) {
            Picker("Message History Visibility", selection: binding) {
                ForEach(RoomHistoryVisibilityKind.menu) { kind in Text(kind.label).tag(kind) }
            }
            .disabled(!model.canSendState("m.room.history_visibility") || model.busy)
            Text("Changes to history visibility will only apply to future messages. The visibility of existing history will have no effect.")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private func encryptionRow(_ state: RoomStateSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Room Encryption")
                Spacer()
                if state.isEncrypted {
                    Text("Enabled")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(Theme.online.opacity(0.25)))
                        .foregroundStyle(Theme.online)
                } else {
                    Button("Enable") { confirmEncryption = true }
                        .disabled(!model.canSendState("m.room.encryption") || model.busy)
                }
            }
            Text(state.isEncrypted
                 ? "Messages in this room are protected by end-to-end encryption."
                 : "Once enabled, encryption cannot be disabled!")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private func publishRow(_ state: RoomStateSnapshot) -> some View {
        let binding = Binding<Bool>(
            get: { model.directoryPublished ?? false },
            set: { published in
                Task { await model.perform { try await model.setDirectoryVisibility(published) } }
            }
        )
        let enabled = model.directoryPublished != nil && state.joinRule.allowsDirectory
            && model.canSendState("m.room.canonical_alias") && !model.busy
        return VStack(alignment: .leading, spacing: 4) {
            Toggle("Publish to Directory", isOn: binding).disabled(!enabled)
            Text("List the \(typeWord) in the public directory to make it discoverable by others.")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }

    // MARK: Upgrade

    @ViewBuilder
    private func upgradeRows(_ state: RoomStateSnapshot) -> some View {
        let tombstone = state.tombstone
        VStack(alignment: .leading, spacing: 4) {
            Text(model.isSpace ? "Upgrade Space" : "Upgrade Room")
            Text(tombstone != nil
                 ? (tombstone?.body ?? "This \(typeWord) has been replaced!")
                 : "Current version: \(state.roomVersion).")
                .font(.caption).foregroundStyle(Theme.muted)
        }
        if let old = state.predecessor {
            Button(model.isSpace ? "Open Previous Space" : "Open Previous Room") {
                dismiss()
                onOpenRoom?(old)
            }
            .disabled(account.room(old) == nil)
        }
        if let tombstone {
            Button(model.isSpace ? "Open New Space" : "Open New Room") {
                dismiss()
                onOpenRoom?(tombstone.replacement)
            }
            .disabled(account.room(tombstone.replacement) == nil)
        } else {
            Button("Upgrade") { showUpgrade = true }
                .disabled(!model.canSendState("m.room.tombstone") || model.busy)
        }
    }
}
