import MatrixRustSDK
import SwiftUI

// Creating a room or a server with the options of the desktop app (features/create-room and
// features/create-space): access (restricted, private, public), address, topic, encryption,
// knocking, federation and room version. With a parent the new room or server is listed in it.

struct CreateRoomView: View {
    @ObservedObject var account: MatrixAccount
    var parentId: String?

    var body: some View {
        NewRoomForm(account: account, parentId: parentId, isSpace: false)
    }
}

struct CreateSpaceView: View {
    @ObservedObject var account: MatrixAccount
    var parentId: String?

    var body: some View {
        NewRoomForm(account: account, parentId: parentId, isSpace: true)
    }
}

private struct NewRoomForm: View {
    @ObservedObject var account: MatrixAccount
    let parentId: String?
    let isSpace: Bool
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var topic = ""
    @State private var alias = ""
    @State private var access: NewRoomAccess = .private
    @State private var isVoice = false
    @State private var encryption = true
    @State private var knock = false
    @State private var federation = true
    @State private var advanced = false
    @State private var version: String?
    @State private var availableVersions: [String] = []
    @State private var busy = false
    @State private var error: String?

    private var request: NewRoomRequest {
        var request = NewRoomRequest(name: name.trimmingCharacters(in: .whitespacesAndNewlines))
        request.topic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        request.isSpace = isSpace
        request.isVoice = isVoice && !isSpace
        request.parentId = parentId
        request.access = access
        request.aliasLocalPart = alias
        request.encryption = encryption
        request.knock = knock
        request.allowFederation = federation
        request.roomVersion = version
        return request
    }

    private var accessChoices: [NewRoomAccess] {
        let canRestrict = parentId != nil && RoomVersionSupport.restricted(version)
        return NewRoomAccess.allCases.filter { $0 != .restricted || canRestrict }
    }

    private var noun: String { isSpace ? "Server" : "Room" }

    var body: some View {
        NavigationStack {
            Form {
                if !isSpace {
                    Section("Type") {
                        Picker("Type", selection: $isVoice) {
                            Label("Text", systemImage: "number").tag(false)
                            Label("Voice", systemImage: "speaker.wave.2.fill").tag(true)
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                }
                Section {
                    Picker("Access", selection: $access) {
                        ForEach(accessChoices) { choice in Text(choice.title).tag(choice) }
                    }
                } header: {
                    Text("Access")
                } footer: {
                    Text(access.detail)
                }
                Section("Name") {
                    TextField(isSpace ? "My Server" : (isVoice ? "Lounge" : "new-room"), text: $name)
                }
                Section("Topic (Optional)") {
                    TextField("What is it about?", text: $topic, axis: .vertical)
                }
                if request.effectiveAccess == .public {
                    Section {
                        TextField("address", text: $alias)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    } header: {
                        Text("Address")
                    } footer: {
                        Text("#\(alias.isEmpty ? "address" : alias):\(account.ownServerName)")
                    }
                }
                if !isSpace && request.effectiveAccess != .public {
                    Section {
                        Toggle("End-to-End Encryption", isOn: $encryption)
                    } footer: {
                        Text("Once this feature is enabled, it can't be disabled after the room is created.")
                    }
                }
                Section {
                    DisclosureGroup("Advanced Options", isExpanded: $advanced) {
                        if request.effectiveAccess != .public && (RoomVersionSupport.knock(version)) {
                            Toggle("Knock to Join", isOn: $knock)
                            Text("Anyone can send request to join this \(noun.lowercased()).")
                                .font(.footnote).foregroundStyle(Theme.muted)
                        }
                        Toggle("Allow Federation", isOn: $federation)
                        Text("Users from other servers can join.")
                            .font(.footnote).foregroundStyle(Theme.muted)
                        if !availableVersions.isEmpty {
                            Picker("Room Version", selection: Binding(get: { version ?? availableVersions[0] }, set: { version = $0 })) {
                                ForEach(availableVersions, id: \.self) { Text($0).tag($0) }
                            }
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("Create \(noun)")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Create") { create() }
                            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .task {
                if parentId != nil { access = .restricted }
                let choices = await account.roomVersionChoices()
                availableVersions = choices.available
                version = choices.defaultVersion
                // A server without the restricted rule falls back to private, as on desktop.
                if !accessChoices.contains(access) { access = .private }
            }
        }
    }

    private func create() {
        busy = true
        error = nil
        let request = self.request
        Task {
            do {
                let id = try await account.createRoom(request)
                if isSpace && parentId == nil {
                    // Every top-level server starts with a place to talk, like on Discord.
                    let encrypted = request.effectiveAccess != .public
                    _ = try? await account.createChannel(in: id, name: "general", topic: "", isVoice: false, encrypted: encrypted)
                    _ = try? await account.createChannel(in: id, name: "General", topic: "", isVoice: true, encrypted: encrypted)
                    await account.loadChannels(spaceId: id)
                }
                dismiss()
                if isSpace {
                    if parentId == nil { navigator.server = id }
                } else {
                    navigator.open(id, account: account)
                }
            } catch { self.error = error.friendlyMessage }
            busy = false
        }
    }
}
