import MatrixRustSDK
import SwiftUI

/// The notification level of a room as a choice list (desktop's RoomNotificationModeSwitcher).
/// Put it into a `Menu`; the chosen level shows a check mark.
struct RoomNotifyPicker: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    var onError: (String) -> Void = { _ in }

    var body: some View {
        Picker("Notifications", selection: Binding(
            get: { account.notifyLevel(for: roomId) },
            set: { level in
                Task {
                    do { try await account.setNotifyLevel(level, roomId: roomId) } catch { onError(error.friendlyMessage) }
                }
            }
        )) {
            ForEach(RoomNotifyLevel.allCases) { level in
                Label(level.title, systemImage: level.systemImage).tag(level)
            }
        }
        .pickerStyle(.inline)
    }
}

/// The bell in a chat's header: opens the same notification choices.
struct RoomNotifyMenuButton: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    @State private var error: String?

    var body: some View {
        Menu {
            RoomNotifyPicker(account: account, roomId: roomId) { error = $0 }
        } label: {
            Image(systemName: account.notifyLevel(for: roomId).systemImage)
        }
        .accessibilityLabel("Notifications")
        .task { await account.refreshNotifyLevels() }
        .alert("Notifications", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }
}

/// Long press on a room in the list, like desktop's room menu (features/room-nav/RoomNavItem.tsx).
struct RoomContextMenu: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    var onInvite: (String) -> Void
    var onSettings: (String) -> Void
    var onLeave: (String) -> Void
    var onError: (String) -> Void

    var body: some View {
        let summary = account.summary(for: roomId)
        let favourite = summary?.isFavourite ?? false
        Button {
            Task {
                do { try await account.setFavourite(roomId, !favourite) } catch { onError(error.friendlyMessage) }
            }
        } label: {
            Label(
                favourite ? "Remove from Favourites" : "Add to Favourites",
                systemImage: favourite ? "star.slash" : "star"
            )
        }
        Button {
            Task { await account.markRoomAsRead(roomId) }
        } label: {
            Label("Mark as Read", systemImage: "checkmark.circle")
        }
        .disabled((summary?.unread ?? 0) == 0 && (summary?.mentions ?? 0) == 0)
        Menu {
            RoomNotifyPicker(account: account, roomId: roomId, onError: onError)
        } label: {
            Label("Notifications", systemImage: account.notifyLevel(for: roomId).systemImage)
        }
        if summary?.isDirect != true {
            Button { onInvite(roomId) } label: { Label("Invite", systemImage: "person.badge.plus") }
        }
        Button {
            Task {
                if let link = await account.roomLink(roomId) { UIPasteboard.general.string = link }
            }
        } label: {
            Label("Copy Link", systemImage: "link")
        }
        Button { onSettings(roomId) } label: { Label("Room Settings", systemImage: "gearshape") }
        Divider()
        Button(role: .destructive) { onLeave(roomId) } label: {
            Label(summary?.isDirect == true ? "Close Conversation" : "Leave Room", systemImage: "rectangle.portrait.and.arrow.right")
        }
    }
}
