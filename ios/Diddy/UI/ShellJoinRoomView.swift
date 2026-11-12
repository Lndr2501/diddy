import MatrixRustSDK
import SwiftUI

struct ShellRoomLink: Identifiable {
    let address: String
    let via: [String]
    var eventId: String?
    var id: String { address + (eventId ?? "") }
}

struct ShellJoinRoomView: View {
    @ObservedObject var account: MatrixAccount
    let link: ShellRoomLink
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Room") { Text(account.summary(for: link.address)?.name ?? link.address).textSelection(.enabled) }
                if let event = link.eventId { Section("Message") { Text(event).font(.caption).textSelection(.enabled) } }
                Button(account.summary(for: link.address)?.isJoined == true ? "Open Room" : "Join Room") { open() }.disabled(busy)
                if busy { ProgressView() }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle("Open Matrix room")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
    private func open() {
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do {
                let id: String
                if account.summary(for: link.address)?.isJoined == true { id = link.address }
                else {
                    // Signature already used by MatrixAccount.join(_:).
                    let room = try await account.client.joinRoomByIdOrAlias(roomIdOrAlias: link.address, serverNames: link.via)
                    id = room.id()
                    await account.loadAllChannels()
                }
                navigator.open(id, account: account)
                if let eventId = link.eventId {
                    navigator.searchTarget = SearchEventTarget(roomId: id, eventId: eventId)
                    navigator.destination = .text(id)
                }
                dismiss()
            } catch { self.error = error.friendlyMessage }
        }
    }
}
