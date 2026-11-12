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

/// Words for a room in menus and dialogs: a channel inside a server, a room outside, or a direct message.
enum RoomMenuWording {
    static func noun(isDirect: Bool, inServer: Bool) -> String {
        if isDirect { return "Conversation" }
        return inServer ? "Channel" : "Room"
    }

    static func leaveTitle(isDirect: Bool, inServer: Bool) -> String {
        isDirect ? "Close Conversation" : "Leave \(noun(isDirect: false, inServer: inServer))"
    }
}

/// Long press on a room in the list, like desktop's room menu (features/room-nav/RoomNavItem.tsx).
/// Grouped as on iOS: reading state first, sharing next, settings, and leaving last in red.
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
        let isDirect = summary?.isDirect == true
        let inServer = account.server(of: roomId) != nil
        Button {
            Task { await account.markRoomAsRead(roomId) }
        } label: {
            Label("Mark as Read", systemImage: "checkmark.circle")
        }
        .disabled((summary?.unread ?? 0) == 0 && (summary?.mentions ?? 0) == 0)
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
        Menu {
            RoomNotifyPicker(account: account, roomId: roomId, onError: onError)
        } label: {
            Label("Notifications", systemImage: account.notifyLevel(for: roomId).systemImage)
        }
        Divider()
        if !isDirect {
            Button { onInvite(roomId) } label: { Label("Invite People", systemImage: "person.badge.plus") }
        }
        Button {
            Task {
                if let link = await account.roomLink(roomId) { UIPasteboard.general.string = link }
            }
        } label: {
            Label("Copy Link", systemImage: "link")
        }
        Button { onSettings(roomId) } label: {
            Label("\(RoomMenuWording.noun(isDirect: isDirect, inServer: inServer)) Settings", systemImage: "gearshape")
        }
        Divider()
        Button(role: .destructive) { onLeave(roomId) } label: {
            Label(RoomMenuWording.leaveTitle(isDirect: isDirect, inServer: inServer), systemImage: "rectangle.portrait.and.arrow.right")
        }
    }
}
