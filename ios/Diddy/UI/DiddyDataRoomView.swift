import SwiftUI

/// Settings > Diddy Profile > Data Room: which rooms this device reads profiles, badges and name
/// styles from, and a way to add another one at any time (desktop can use a room it only
/// remembers locally, which the iPhone cannot find by itself). Rooms used in message mode on this
/// device can be dropped again.
@MainActor
struct DiddyDataRoomView: View {
    @ObservedObject var account: MatrixAccount
    @State private var refreshing = false

    private struct UsedRoom: Identifiable {
        let id: String
        let name: String
        let encrypted: Bool
        let messageMode: Bool
        let primary: Bool
    }

    private var used: [UsedRoom] {
        let light = account.diddyLightRoomIds
        let joined = account.rooms.filter(\.isJoined)
        let ids = DiddyOptionsRoomLogic.sortedLikeDesktop(account.diddyOptionsRooms.union(light).filter { id in
            joined.contains { $0.id == id }
        })
        return ids.map { id in
            let room = joined.first { $0.id == id }
            return UsedRoom(id: id, name: room?.name ?? id, encrypted: room?.isEncrypted ?? false,
                            messageMode: light.contains(id), primary: account.diddyPrimaryRoom?.id == id)
        }
    }

    var body: some View {
        Form {
            Section {
                if used.isEmpty {
                    Text("No data room yet. Add one below.").foregroundStyle(Theme.muted)
                }
                ForEach(used) { room in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(room.name).foregroundStyle(Theme.text)
                        Text(room.id).font(.caption2.monospaced()).foregroundStyle(Theme.faint).textSelection(.enabled)
                        Text(details(room)).font(.caption).foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 2)
                    .swipeActions {
                        if room.messageMode {
                            Button("Stop Using", role: .destructive) { Task { await stopUsing(room.id) } }
                        }
                    }
                }
                Button {
                    Task { await refresh() }
                } label: {
                    HStack {
                        Label("Read Again", systemImage: "arrow.clockwise")
                        if refreshing { Spacer(); ProgressView() }
                    }
                }
                .disabled(refreshing)
            } header: {
                Text("In Use")
            } footer: {
                Text("\(account.diddyProfiles.count) profiles loaded. Profiles come from all of these rooms; your own changes go to the first one. Desktop can use a room it only remembers on that computer: add the same room here so both read from the same place.")
            }
            DiddyOptionsSetupView(account: account, title: "Add a Data Room") {
                Task { await refresh() }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Data Room")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func details(_ room: UsedRoom) -> String {
        var parts: [String] = []
        if room.primary { parts.append("your changes go here") }
        parts.append(room.encrypted ? "encrypted" : "not encrypted")
        if room.messageMode { parts.append("chosen on this device, swipe to stop using") }
        return parts.joined(separator: " · ")
    }

    private func refresh() async {
        refreshing = true
        await account.loadDiddyProfiles(force: true)
        refreshing = false
    }

    private func stopUsing(_ roomId: String) async {
        DiddyLightRooms.remove(roomId, for: account.id)
        await refresh()
    }
}
