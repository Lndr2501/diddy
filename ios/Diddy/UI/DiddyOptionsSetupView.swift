import SwiftUI

/// Sets up the hidden Diddy Options room, like desktop's "Set up the data room" (Settings >
/// Profile): create a new one, use an existing room, or join the one of your servers. Without the
/// room a profile cannot be saved or seen by others. Shown as the sections of a form.
@MainActor
struct DiddyOptionsSetupView: View {
    @ObservedObject var account: MatrixAccount
    /// Called when a room is ready, so the editor can read the profile again.
    var onReady: () -> Void

    private enum Mode: String, CaseIterable {
        case create = "New Room"
        case existing = "Existing Room"
        case join = "My Servers"
    }

    @State private var mode = Mode.create
    @State private var roomName = DiddyOptionsRoomLogic.roomName
    @State private var spaceId = ""
    @State private var choices: [DiddyRoomChoice] = []
    @State private var choiceId = ""
    @State private var tagTopic = true
    @State private var loadingChoices = false
    @State private var serverRooms: [DiddyRoomChoice] = []
    @State private var lookedForServerRooms = false
    @State private var working = false
    @State private var error: String?
    @State private var usedWithoutAdmin = false
    @State private var done = false

    private var selected: DiddyRoomChoice? { choices.first { $0.id == choiceId } }

    var body: some View {
        Section {
            Text("Diddy needs a hidden room to share profiles, badges and name styles. Without it your customization cannot be saved or seen by others. Not an admin? Ask the admin of your server to set it up; Diddy joins it automatically.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .disabled(working)
        } header: {
            Text("Set Up the Data Room")
        }
        switch mode {
        case .create: createSection
        case .existing: existingSection
        case .join: joinSection
        }
        if let error {
            Section {
                Text(error).foregroundStyle(Theme.danger)
                if mode == .existing, let selected, selected.joined, !usedWithoutAdmin {
                    Button("Use Without Admin Rights") { Task { await useWithoutAdmin(selected) } }
                        .disabled(working)
                    Text("Everyone has to choose this same room themselves. Your profile is then stored as hidden messages in it.")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        if done {
            Section {
                Label(usedWithoutAdmin ? "Room is used in message mode. You can customize your profile now."
                                       : "Room is ready. You can customize your profile now.",
                      systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Theme.online)
            }
        }
    }

    // MARK: Modes

    @ViewBuilder
    private var createSection: some View {
        Section {
            TextField(DiddyOptionsRoomLogic.roomName, text: $roomName)
                .disabled(working)
            Picker("Create it in", selection: $spaceId) {
                Text("No space (private room)").tag("")
                ForEach(account.spaces) { space in Text(space.displayName).tag(space.roomId) }
            }
            .disabled(working)
            actionButton("Create Diddy Options Room") {
                try await account.createDiddyOptionsRoom(name: roomName, spaceId: spaceId.isEmpty ? nil : spaceId)
            }
        } footer: {
            Text("In a space, everyone in the server can join the room and Diddy does it for them.")
        }
    }

    @ViewBuilder
    private var existingSection: some View {
        Section {
            Picker("Room", selection: $choiceId) {
                Text("Choose a room…").tag("")
                ForEach(choices) { choice in Text(label(choice)).tag(choice.id) }
            }
            .disabled(working)
            if loadingChoices { HStack(spacing: 8) { ProgressView(); Text("Looking in your servers…").foregroundStyle(Theme.muted) } }
            Toggle(isOn: $tagTopic) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Let Others Find It")
                    Text("Adds [diddy-options] to the topic, so Diddy in the same server joins it automatically.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
            }
            .disabled(working)
            actionButton(selected?.joined == false ? "Join and Use" : "Use This Room", enabled: selected != nil) {
                guard let selected else { throw DiddyError("Choose a room first.") }
                try await account.adoptRoomAsDiddyOptions(roomId: selected.id, via: selected.via, tagTopic: tagTopic)
            }
            Button("Refresh") { Task { await loadChoices() } }.disabled(loadingChoices || working)
        } footer: {
            Text("The room is then hidden from the room lists in Diddy. You need permission to change its settings.")
        }
        .task { if choices.isEmpty { await loadChoices() } }
    }

    @ViewBuilder
    private var joinSection: some View {
        Section {
            if account.spaces.isEmpty {
                Text("You are not in a server yet.").foregroundStyle(Theme.muted)
            } else {
                Button { Task { await lookInServers() } } label: {
                    Label("Look in My Servers", systemImage: "magnifyingglass")
                }
                .disabled(working || loadingChoices)
                if loadingChoices { HStack(spacing: 8) { ProgressView(); Text("Looking…").foregroundStyle(Theme.muted) } }
                ForEach(serverRooms) { room in
                    Button {
                        Task { await run { try await account.connectDiddyRoom(roomId: room.id, via: room.via) } }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(room.name)
                            Text("in \(room.spaceName ?? "your server")").font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    .disabled(working)
                }
                if lookedForServerRooms && serverRooms.isEmpty && !loadingChoices {
                    Text("No Diddy Options room found in your servers. Ask an admin to set one up, or create one.")
                        .foregroundStyle(Theme.muted)
                }
            }
        } footer: {
            Text("Looks for a room named \(DiddyOptionsRoomLogic.roomName) or tagged \(DiddyEvents.topicTag) in your servers and joins it.")
        }
    }

    // MARK: Work

    private func actionButton(_ title: String, enabled: Bool = true, _ work: @escaping @MainActor () async throws -> Void) -> some View {
        Button {
            Task { await run(work) }
        } label: {
            HStack {
                if working { ProgressView() }
                Text(working ? "Working…" : title)
            }
        }
        .disabled(working || !enabled)
    }

    private func run(_ work: @MainActor () async throws -> Void) async {
        working = true
        error = nil
        usedWithoutAdmin = false
        defer { working = false }
        do {
            try await work()
            finish()
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private func useWithoutAdmin(_ choice: DiddyRoomChoice) async {
        working = true
        error = nil
        defer { working = false }
        do {
            try await account.useDiddyRoomWithoutAdmin(roomId: choice.id, via: choice.via)
            usedWithoutAdmin = true
            finish()
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private func finish() {
        if account.diddyPrimaryRoom != nil {
            done = true
            error = nil
            onReady()
        } else {
            error = "The room was set up, but it has not arrived from the server yet. Try again in a moment."
        }
    }

    private func loadChoices() async {
        loadingChoices = true
        let found = await account.diddyRoomChoices()
        choices = found
        if selected == nil { choiceId = (found.first { $0.looksLikeDiddy && $0.joined } ?? found.first { $0.looksLikeDiddy })?.id ?? "" }
        loadingChoices = false
    }

    private func lookInServers() async {
        loadingChoices = true
        serverRooms = []
        for space in account.spaces {
            if let room = await account.findDiddyRoom(ofServer: space.roomId) { serverRooms.append(room) }
        }
        lookedForServerRooms = true
        loadingChoices = false
    }

    private func label(_ choice: DiddyRoomChoice) -> String {
        var text = choice.name
        if let space = choice.spaceName { text += " (\(space))" }
        if choice.looksLikeDiddy { text += " · Diddy room" }
        return text
    }
}
