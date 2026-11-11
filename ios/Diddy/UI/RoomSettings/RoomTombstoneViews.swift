import SwiftUI

/// Desktop `RoomTombstone`: a replaced (upgraded) room has no message field any more. The bar
/// says so and leads to the new room. Everything else shows `content`, the normal composer.
struct RoomTombstoneGate<Content: View>: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    let onOpen: (String) -> Void
    let content: Content

    @State private var replacement: String?
    @State private var message: String?

    init(account: MatrixAccount, roomId: String, onOpen: @escaping (String) -> Void, @ViewBuilder content: () -> Content) {
        self.account = account
        self.roomId = roomId
        self.onOpen = onOpen
        self.content = content()
    }

    var body: some View {
        Group {
            if let replacement {
                RoomTombstoneBar(account: account, replacement: replacement, message: message, onOpen: onOpen)
            } else {
                content
            }
        }
        .task(id: roomId) { await load() }
    }

    private func load() async {
        let found = await account.roomStateContent(roomId, type: "m.room.tombstone")
        if let target = found?["replacement_room"] as? String, !target.isEmpty {
            replacement = target
            let body = found?["body"] as? String
            message = body?.isEmpty == false ? body : nil
        } else {
            replacement = nil
            message = nil
        }
    }
}

struct RoomTombstoneBar: View {
    @ObservedObject var account: MatrixAccount
    let replacement: String
    let message: String?
    let onOpen: (String) -> Void
    @State private var joining = false
    @State private var error: String?

    private var joined: Bool { account.summary(for: replacement)?.isJoined == true }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(message ?? "This room has been replaced and is no longer active.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                if let error { Text(error).font(.caption).foregroundStyle(Theme.danger) }
            }
            Spacer(minLength: 0)
            Button {
                if joined {
                    onOpen(replacement)
                } else {
                    Task { await join() }
                }
            } label: {
                HStack(spacing: 6) {
                    if joining { ProgressView() }
                    Text(joined ? "Open New Room" : "Join New Room").font(.footnote.weight(.semibold))
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(joined ? Theme.online : Theme.accent)
            .disabled(joining)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Theme.chat)
    }

    private func join() async {
        joining = true
        error = nil
        defer { joining = false }
        var via: [String] = []
        for id in [account.userId, replacement] {
            if let server = RoomLocalAddress.server(of: id), !via.contains(server) { via.append(server) }
        }
        do {
            _ = try await account.client.joinRoomByIdOrAlias(roomIdOrAlias: replacement, serverNames: via)
            try await account.waitForRoom(replacement)
            await account.loadAllChannels()
            onOpen(replacement)
        } catch {
            self.error = error.friendlyMessage
        }
    }
}
