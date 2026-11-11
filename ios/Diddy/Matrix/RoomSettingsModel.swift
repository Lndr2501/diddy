import Foundation

/// The client API calls of the room and server settings, made through `MatrixAccount.clientRequest`
/// (the SDK has no calls for most of them). The rules live in RoomSettingsLogic.swift.
enum RoomSettingsAPI {
    /// One path segment: room ids, aliases and event types contain `!`, `#`, `:` and sometimes `/`.
    static func enc(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? value
    }

    static func rooms(_ roomId: String, _ rest: String = "") -> String {
        "/_matrix/client/v3/rooms/\(enc(roomId))" + rest
    }
}

/// A room's whole state and the changes the settings screens make to it. One per open settings screen.
@MainActor
final class RoomSettingsModel: ObservableObject {
    let roomId: String
    let account: MatrixAccount

    @Published private(set) var state: RoomStateSnapshot?
    @Published private(set) var loading = false
    @Published private(set) var loadError: String?
    /// A change is on its way to the server.
    @Published private(set) var busy = false
    @Published var actionError: String?

    /// Whether the room is listed in the public directory; nil until read.
    @Published private(set) var directoryPublished: Bool?
    /// The room's local addresses; nil until read.
    @Published private(set) var localAliases: [String]?
    @Published private(set) var localAliasError: String?
    @Published private(set) var defaultRoomVersion = "1"
    @Published private(set) var roomVersions: [String] = ["1"]

    init(roomId: String, account: MatrixAccount) {
        self.roomId = roomId
        self.account = account
    }

    var me: String { account.userId }
    var isSpace: Bool { state?.isSpace ?? account.summary(for: roomId)?.isSpace ?? false }

    /// Desktop `permissions.stateEvent(type, me)`; false until the state is read.
    func canSendState(_ type: String) -> Bool {
        state?.permissions.stateEvent(type, me) ?? false
    }

    // MARK: Loading

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let events = try await account.clientRequestArray(RoomSettingsAPI.rooms(roomId, "/state"))
            state = RoomStateSnapshot(events: events)
            loadError = nil
        } catch {
            loadError = error.friendlyMessage
        }
    }

    func loadDirectoryVisibility() async {
        guard let json = try? await account.clientRequest("/_matrix/client/v3/directory/list/room/\(RoomSettingsAPI.enc(roomId))") else { return }
        directoryPublished = json["visibility"] as? String == "public"
    }

    func loadLocalAliases() async {
        do {
            let json = try await account.clientRequest(RoomSettingsAPI.rooms(roomId, "/aliases"))
            localAliases = (json["aliases"] as? [Any] ?? []).compactMap { $0 as? String }.sorted()
            localAliasError = nil
        } catch {
            localAliasError = error.friendlyMessage
            if localAliases == nil { localAliases = [] }
        }
    }

    /// The room versions the homeserver offers (`m.room_versions` capability).
    func loadRoomVersions() async {
        guard let json = try? await account.clientRequest("/_matrix/client/v3/capabilities"),
              let capabilities = json["capabilities"] as? [String: Any],
              let versions = capabilities["m.room_versions"] as? [String: Any] else { return }
        let standard = versions["default"] as? String ?? "1"
        defaultRoomVersion = standard
        var available = (versions["available"] as? [String: Any]).map { Array($0.keys) } ?? []
        if !available.contains(standard) { available.append(standard) }
        roomVersions = RoomVersionSupport.sorted(available)
    }

    // MARK: Changes

    /// Runs a change with the busy flag and the error line; returns whether it worked.
    @discardableResult
    func perform(_ work: () async throws -> Void) async -> Bool {
        busy = true
        actionError = nil
        defer { busy = false }
        do {
            try await work()
            return true
        } catch {
            actionError = error.friendlyMessage
            return false
        }
    }

    /// `PUT /rooms/{id}/state/{type}/{key}`, then reads the state again.
    func sendState(_ type: String, key: String = "", content: [String: Any]) async throws {
        var path = RoomSettingsAPI.rooms(roomId, "/state/\(RoomSettingsAPI.enc(type))")
        if !key.isEmpty { path += "/" + RoomSettingsAPI.enc(key) }
        _ = try await account.clientRequest(path, body: content, method: "PUT")
        await load()
    }

    /// Name, topic and picture show up in the room lists a moment later; this asks them to refresh.
    func refreshLists() async {
        await account.loadAllChannels()
    }

    func setDirectoryVisibility(_ published: Bool) async throws {
        _ = try await account.clientRequest(
            "/_matrix/client/v3/directory/list/room/\(RoomSettingsAPI.enc(roomId))",
            body: ["visibility": published ? "public" : "private"],
            method: "PUT"
        )
        directoryPublished = published
    }

    func addLocalAlias(_ alias: String) async throws {
        do {
            _ = try await account.clientRequest(
                "/_matrix/client/v3/directory/room/\(RoomSettingsAPI.enc(alias))",
                body: ["room_id": roomId],
                method: "PUT"
            )
        } catch {
            // Desktop: HTTP 409 reads "Address is already in use!".
            let message = error.friendlyMessage
            if message.localizedCaseInsensitiveContains("already exist") || message.localizedCaseInsensitiveContains("in use") {
                throw DiddyError("Address is already in use!")
            }
            throw error
        }
        await loadLocalAliases()
    }

    func deleteLocalAlias(_ alias: String) async throws {
        _ = try await account.clientRequest("/_matrix/client/v3/directory/room/\(RoomSettingsAPI.enc(alias))", method: "DELETE")
        await loadLocalAliases()
    }

    /// `POST /rooms/{id}/upgrade`; returns the new room's id.
    func upgrade(version: String, additionalCreators: [String]) async throws -> String? {
        let body = RoomUpgradeRequest.body(version: version, additionalCreators: additionalCreators, me: me)
        let json = try await account.clientRequest(RoomSettingsAPI.rooms(roomId, "/upgrade"), body: body)
        await load()
        return json["replacement_room"] as? String
    }
}

extension MatrixAccount {
    /// Invite, kick, ban or unban, with the reason when given.
    func moderate(_ action: RoomModerationAction, userId: String, in roomId: String, reason: String? = nil) async throws {
        _ = try await clientRequest(
            RoomSettingsAPI.rooms(roomId, "/\(action.endpoint)"),
            body: action.body(userId: userId, reason: reason)
        )
    }
}
