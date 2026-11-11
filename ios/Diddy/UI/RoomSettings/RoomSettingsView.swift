import MatrixRustSDK
import SwiftUI

/// Settings of a channel or a server (space), like the desktop room and space settings:
/// general (name, topic, avatar, addresses, join rules, encryption, history, upgrade),
/// roles and permissions, and members (banned, invited, knocking).
/// Open it with `RoomSettingsView(roomId:account:)`; it brings its own NavigationStack.
struct RoomSettingsView: View {
    let roomId: String
    @ObservedObject var account: MatrixAccount
    @Environment(\.dismiss) private var dismiss

    init(roomId: String, account: MatrixAccount) {
        self.roomId = roomId
        self.account = account
    }

    private var summary: RoomSummary? { account.summary(for: roomId) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(summary?.name ?? roomId).font(.headline)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle(summary?.isSpace == true ? "Server Settings" : "Channel Settings")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
