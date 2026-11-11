import Foundation

/// REST operations use the account's authenticated client; message and media sending stays in
/// the SDK so encrypted rooms retain the same encryption and send queue as other messages.
@MainActor
enum ComposerServices {
    static func path(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? value
    }

    static func packs(account: MatrixAccount, roomId: String) async -> [ImagePack] {
        let userPath = "/_matrix/client/v3/user/\(path(account.userId))/account_data/"
        var packs: [ImagePack] = []
        if let content = try? await account.clientRequest(userPath + "im.ponies.user_emotes"),
           let pack = ImagePack.parse(id: "user", content: content) { packs.append(pack) }
        let global = try? await account.clientRequest(userPath + "im.ponies.emote_rooms")
        var rooms = ImagePack.globalPacks(global)
        // Current room and its parent spaces contribute every pack, regardless of global selection.
        var localRooms = [roomId]
        if let state = try? await account.clientRequestArray("/_matrix/client/v3/rooms/\(path(roomId))/state") {
            for event in state where event["type"] as? String == "m.space.parent" {
                if let id = event["state_key"] as? String { localRooms.append(id) }
            }
        }
        for id in localRooms { rooms[id] = nil }
        for id in Set(localRooms + Array(rooms.keys)).sorted() {
            guard let state = try? await account.clientRequestArray("/_matrix/client/v3/rooms/\(path(id))/state") else { continue }
            for event in state where event["type"] as? String == "im.ponies.room_emotes" {
                guard let key = event["state_key"] as? String,
                      localRooms.contains(id) || rooms[id]?.contains(key) == true,
                      let content = event["content"] as? [String: Any],
                      let pack = ImagePack.parse(id: id + "|" + key, content: content) else { continue }
                packs.append(pack)
            }
        }
        return packs
    }

    static func run(_ command: SlashCommand, draft: String, account: MatrixAccount, roomId: String) async throws {
        let payload = SlashCommand.trim(command, from: draft)
        let split = SlashCommand.splitFlags(payload)
        let flags = SlashCommand.parseFlags(split.flags)
        var users = SlashCommand.users(in: split.content)
        let base = "/_matrix/client/v3/rooms/\(path(roomId))"
        let userBase = "/_matrix/client/v3/user/\(path(account.userId))/account_data/"
        if command == .kick || command == .ban || command == .delete {
            let servers = SlashCommand.servers(in: split.content)
            if !servers.isEmpty {
                let response = try await account.clientRequest(base + "/members")
                for event in response["chunk"] as? [[String: Any]] ?? [] {
                    guard let id = event["state_key"] as? String,
                          servers.contains(where: { id.hasSuffix(":" + $0) }),
                          !users.contains(id) else { continue }
                    let member = event["content"] as? [String: Any]
                    if command == .kick, member?["membership"] as? String == "ban" { continue }
                    users.append(id)
                }
            }
        }
        switch command {
        case .leave:
            let rooms = payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [roomId] : MatrixIdRules.splitWithSpace(payload).filter(MatrixIdRules.isRoomId)
            for id in rooms { try await account.leave(roomId: id) }
        case .join:
            for id in MatrixIdRules.splitWithSpace(payload) where MatrixIdRules.isRoomId(id) || MatrixIdRules.isRoomAlias(id) {
                _ = try await account.clientRequest("/_matrix/client/v3/join/\(path(id))", body: [:])
            }
        case .startdm:
            guard let user = users.first else { throw DiddyError("Enter a user ID.") }
            _ = try await account.directMessage(with: user)
        case .invite, .kick, .disinvite, .ban, .unban:
            guard !users.isEmpty else { throw DiddyError("Enter a user ID.") }
            let action = command == .disinvite ? "kick" : command.rawValue
            for user in users {
                var body: [String: Any] = ["user_id": user]
                if let reason = flags["r"] { body["reason"] = reason }
                _ = try await account.clientRequest(base + "/" + action, body: body)
            }
        case .myroomnick, .myroomavatar:
            var content = try await account.stateContent(of: roomId, type: "m.room.member", stateKey: account.userId)
            content[command == .myroomnick ? "displayname" : "avatar_url"] = payload.isEmpty ? nil : payload
            _ = try await account.clientRequest(base + "/state/m.room.member/\(path(account.userId))", body: content, method: "PUT")
        case .ignore, .unignore:
            guard !users.isEmpty else { throw DiddyError("Enter a user ID.") }
            var content = (try? await account.clientRequest(userBase + "m.ignored_user_list")) ?? [:]
            var ignored = content["ignored_users"] as? [String: Any] ?? [:]
            for user in users { ignored[user] = command == .ignore ? [:] : nil }
            content["ignored_users"] = ignored
            _ = try await account.clientRequest(userBase + "m.ignored_user_list", body: content, method: "PUT")
        case .converttodm, .converttoroom:
            let raw = (try? await account.clientRequest(userBase + "m.direct")) ?? [:]
            let current = raw.compactMapValues { $0 as? [String] }
            var content = SlashCommand.removingDirect(current, roomId: roomId)
            if command == .converttodm {
                let members = try await account.joinedMembers(of: roomId)
                guard let user = members.first(where: { $0 != account.userId }) else { throw DiddyError("No other member in this room.") }
                content = SlashCommand.addingDirect(current, roomId: roomId, userId: user)
            }
            _ = try await account.clientRequest(userBase + "m.direct", body: content, method: "PUT")
        case .delete:
            guard let date = SlashCommand.pastDate(flags["past"] ?? ""), !users.isEmpty else { throw DiddyError("Enter users or servers and -past 1d|2h|5m|30s.") }
            let timestamp = Int64(date.timeIntervalSince1970 * 1000)
            let result = try await account.clientRequest(base + "/timestamp_to_event?ts=\(timestamp)&dir=f")
            guard let eventId = result["event_id"] as? String else { return }
            let context = try await account.clientRequest(base + "/context/\(path(eventId))?limit=0")
            var token = context["start"] as? String
            let types = MatrixIdRules.splitWithSpace(flags["t"] ?? "")
            var seen = Set<String>()
            while let from = token, seen.insert(from).inserted {
                let encoded = from.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? from
                let response = try await account.clientRequest(base + "/messages?dir=f&limit=20&from=" + encoded)
                let events = response["chunk"] as? [[String: Any]] ?? []
                for event in events {
                    guard let sender = event["sender"] as? String, users.contains(sender),
                          let id = event["event_id"] as? String,
                          types.isEmpty || types.contains(event["type"] as? String ?? ""),
                          (event["unsigned"] as? [String: Any])?["redacted_because"] == nil else { continue }
                    var body: [String: Any] = [:]
                    if let reason = flags["r"] { body["reason"] = reason }
                    _ = try await account.clientRequest(base + "/redact/\(path(id))/\(UUID().uuidString)", body: body, method: "PUT")
                    try await Task.sleep(nanoseconds: 100_000_000)
                }
                token = events.isEmpty ? nil : response["end"] as? String
            }
        case .acl:
            let content = (try? await account.stateContent(of: roomId, type: "m.room.server_acl", stateKey: "")) ?? [:]
            _ = try await account.clientRequest(base + "/state/m.room.server_acl/", body: SlashCommand.updatedAcl(content, flags: flags), method: "PUT")
        default: throw DiddyError("This command is not available here yet.")
        }
    }
}
