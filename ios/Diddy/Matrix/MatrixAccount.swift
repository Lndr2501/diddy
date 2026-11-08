import Foundation
import MatrixRustSDK

/// A room as the channel list and server rail need it.
struct RoomSummary: Identifiable, Hashable {
    let id: String
    var name: String
    var avatarUrl: String?
    var isDirect: Bool
    var isSpace: Bool
    var unread: UInt64
    var mentions: UInt64
    /// Unread messages your notification settings say should alert you.
    var notifications: UInt64
    var hasCall: Bool
    var callParticipants: [String]
    var isEncrypted: Bool
    var membership: Membership
    var topic: String?
    var canonicalAlias: String?
    var memberCount: UInt64
    var inviterName: String?
    var lastMessage: String?
    var isVoiceRoom = false

    var isJoined: Bool { membership == .joined }
    var isInvite: Bool { membership == .invited }
    /// The number on the room's red badge. A call notification mentions the room without being an
    /// unread message, so a direct message counts whichever is higher.
    var badge: UInt64 { isDirect ? max(unread, mentions) : mentions }
}

/// Name and avatar of a user, as the call roster, member list and profile sheet show them.
struct UserSummary: Hashable {
    var name: String
    var avatarUrl: String?
}

/// Discord-style category: a sub-space of a server, or the server's own top-level rooms.
struct ChannelCategory: Identifiable, Hashable {
    let id: String
    var name: String
    var channels: [SpaceRoom]
}

extension Error {
    /// What the server said, instead of the SDK's whole error dump.
    var friendlyMessage: String {
        if let error = self as? ClientError {
            if case .MatrixApi(_, _, let message, _) = error { return message }
            if case .Generic(let message, _) = error { return message }
        }
        if let error = self as? ClientBuildError, case .ServerUnreachable = error {
            return "The server could not be reached. Check your connection and try again."
        }
        return localizedDescription
    }
}

/// A refused client API call, with the Matrix error code (`M_FORBIDDEN`, ...).
struct ClientAPIError: LocalizedError {
    let errcode: String?
    let message: String
    var errorDescription: String? { message }
}

extension SpaceRoom: Identifiable {
    public var id: String { roomId }

    var isSubspace: Bool { roomType == .space }
    var isJoined: Bool { state == .joined }
}

@MainActor
final class MatrixAccount: ObservableObject, Identifiable {
    let record: AccountRecord
    let client: Client
    nonisolated var id: String { record.id }

    @Published private(set) var userId: String
    @Published private(set) var displayName: String?
    @Published private(set) var avatarUrl: String?
    @Published private(set) var rooms: [RoomSummary] = [] {
        didSet {
            let previous = roomsById
            roomsById = Dictionary(rooms.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            onRoomsChanged?(previous, rooms)
        }
    }
    @Published private(set) var profiles: [String: UserSummary] = [:]
    /// Servers whose channel list finished loading, so an empty server is not an endless spinner.
    @Published private(set) var loadedServers: Set<String> = []
    /// Cinny/Diddy voice channels are rooms of the MSC3417 call room type. `SpaceRoom.roomType`
    /// reports those as plain rooms, so the type is read from the server's hierarchy instead.
    @Published private(set) var voiceRoomIds: Set<String> = []
    @Published private(set) var spaces: [SpaceRoom] = []
    @Published private(set) var categories: [String: [ChannelCategory]] = [:]
    @Published private(set) var syncState: SyncServiceState = .idle
    @Published private(set) var recoveryState: RecoveryState = .unknown
    @Published private(set) var verificationState: VerificationState = .unknown
    @Published private(set) var started = false
    /// Diddy profile extras by user id, read from the options rooms (see DiddyProfiles.swift).
    @Published var diddyProfiles: [String: DiddyProfile] = [:]
    /// The badges each user shows next to their name.
    @Published var diddyBadges: [String: [DiddyBadge]] = [:]
    var diddyOptionsRooms: Set<String> = []
    var diddyCheckedRooms: Set<String> = []
    var diddyPrimaryRoom: (id: String, encrypted: Bool)?
    /// Your own profile event as written, so an edit here keeps the fields only desktop knows.
    var diddyOwnProfileRaw: [String: Any]?
    var diddyLoading = false
    var diddyLoadedAt: Date?

    private var syncService: SyncService?
    private var roomList: RoomList?
    private var roomListController: RoomListDynamicEntriesController?
    private var spaceService: SpaceService?
    private var handles: [TaskHandle] = []
    private var roomObjects: [Room] = []
    private var summaryTask: Task<Void, Never>?
    private var roomsById: [String: RoomSummary] = [:]
    /// RoomInfo subscriptions per room. The room list only fires for "notable" changes, and people
    /// joining or leaving a call are not among them, so these keep the voice rosters live.
    private var roomInfoHandles: [String: TaskHandle] = [:]
    private var resolvingProfiles: Set<String> = []
    private var knownJoinedRooms: Set<String> = []
    private var restartTask: Task<Void, Never>?
    /// Set once sync has had time to catch up, so calls and messages that are already old when the
    /// app starts are not announced as if they just happened.
    private var alertsFrom: Date?

    var onRoomsChanged: (([String: RoomSummary], [RoomSummary]) -> Void)?
    var canRing: Bool { alertsFrom.map { Date() >= $0 } ?? false }

    init(record: AccountRecord, client: Client) {
        self.record = record
        self.client = client
        self.userId = (try? client.userId()) ?? record.userId
        self.displayName = record.displayName
    }

    var deviceId: String { (try? client.deviceId()) ?? "" }

    var title: String { displayName ?? userId }

    // MARK: - Lifecycle

    func start() async {
        guard !started else { return }
        started = true
        do {
            let encryption = client.encryption()
            recoveryState = encryption.recoveryState()
            verificationState = encryption.verificationState()
            handles.append(encryption.recoveryStateListener(listener: RecoveryListener { [weak self] state in
                Task { @MainActor in self?.recoveryState = state }
            }))
            handles.append(encryption.verificationStateListener(listener: VerificationListener { [weak self] state in
                Task { @MainActor in self?.verificationState = state }
            }))

            let sync = try await client.syncService().finish()
            syncService = sync
            handles.append(sync.state(listener: SyncStateListener { [weak self] state in
                Task { @MainActor in self?.syncStateChanged(state) }
            }))

            let list = try await sync.roomListService().allRooms()
            roomList = list
            let entries = list.entriesWithDynamicAdapters(pageSize: 1000, listener: RoomEntriesListener { [weak self] updates in
                Task { @MainActor in self?.apply(updates) }
            })
            handles.append(entries.entriesStream())
            let controller = entries.controller()
            _ = controller.setFilter(kind: .all(filters: [.nonLeft, .deduplicateVersions]))
            roomListController = controller

            let spaces = await client.spaceService()
            spaceService = spaces
            self.spaces = await spaces.topLevelJoinedSpaces()
            handles.append(await spaces.subscribeToTopLevelJoinedSpaces(listener: JoinedSpacesListener { [weak self] _ in
                Task { @MainActor in await self?.reloadSpaces() }
            }))

            await sync.start()
            await refreshProfile()
        } catch {
            syncState = .error
        }
    }

    func stop() async {
        restartTask?.cancel()
        await syncService?.stop()
        handles.forEach { $0.cancel() }
        handles.removeAll()
        roomInfoHandles.values.forEach { $0.cancel() }
        roomInfoHandles.removeAll()
        started = false
    }

    /// iOS suspends the app in the background and sync ends in an error; without a restart the
    /// channel list, chats and voice rosters stay frozen until the app is killed.
    func resume() async {
        guard started else { return }
        restartTask?.cancel()
        if syncState != .running { await syncService?.start() }
        await reloadSpaces()
        await loadAllChannels()
    }

    private func syncStateChanged(_ state: SyncServiceState) {
        syncState = state
        if state == .running, alertsFrom == nil {
            alertsFrom = Date().addingTimeInterval(5)
            // Give the room list a moment to fill before looking for the Diddy Options room.
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await self?.loadDiddyProfiles()
            }
        }
        guard state == .error, started else { return }
        restartTask?.cancel()
        restartTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            await self?.syncService?.start()
        }
    }

    func logout() async {
        await stop()
        try? await client.logout()
        SessionStore.delete(accountId: record.id)
        record.removeDirectories()
    }

    func refreshProfile() async {
        displayName = try? await client.displayName()
        avatarUrl = try? await client.avatarUrl()
    }

    // MARK: - Rooms

    private func apply(_ updates: [RoomListEntriesUpdate]) {
        for update in updates { ListDiff<Room>(update).apply(to: &roomObjects) }
        subscribeToRoomInfo()
        scheduleSummaryRebuild()
    }

    private func subscribeToRoomInfo() {
        let current = Set(roomObjects.map { $0.id() })
        for (id, handle) in roomInfoHandles where !current.contains(id) {
            handle.cancel()
            roomInfoHandles[id] = nil
        }
        for room in roomObjects where roomInfoHandles[room.id()] == nil {
            roomInfoHandles[room.id()] = room.subscribeToRoomInfoUpdates(listener: RoomInfoUpdates { [weak self] info in
                Task { @MainActor in self?.apply(info) }
            })
        }
    }

    private func apply(_ info: RoomInfo) {
        guard let index = rooms.firstIndex(where: { $0.id == info.id }) else { return }
        let summary = makeSummary(info, lastMessage: rooms[index].lastMessage)
        if rooms[index] != summary { rooms[index] = summary }
        resolveProfiles(summary.callParticipants, in: info.id)
    }

    private func makeSummary(_ info: RoomInfo, lastMessage: String?) -> RoomSummary {
        var participants: [String] = []
        for userId in info.activeRoomCallParticipants where !participants.contains(userId) {
            participants.append(userId) // one entry per user, however many devices are in the call
        }
        return RoomSummary(
            id: info.id,
            name: info.displayName ?? info.rawName ?? info.canonicalAlias ?? info.id,
            avatarUrl: info.avatarUrl,
            isDirect: info.isDirect,
            isSpace: info.isSpace,
            unread: info.numUnreadMessages,
            mentions: info.numUnreadMentions,
            notifications: info.numUnreadNotifications,
            hasCall: info.hasRoomCall,
            callParticipants: participants,
            isEncrypted: info.encryptionState == .encrypted,
            membership: info.membership,
            topic: info.topic,
            canonicalAlias: info.canonicalAlias,
            memberCount: info.joinedMembersCount,
            inviterName: info.inviter.map { $0.displayName ?? $0.userId },
            lastMessage: lastMessage,
            isVoiceRoom: isVoiceChannel(info.id)
        )
    }

    private func scheduleSummaryRebuild() {
        summaryTask?.cancel()
        let snapshot = roomObjects
        summaryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            var result: [RoomSummary] = []
            result.reserveCapacity(snapshot.count)
            for room in snapshot {
                guard let self, let info = try? await room.roomInfo() else { continue }
                let last = info.isDirect ? Self.preview(of: await room.latestEvent()) : nil
                result.append(self.makeSummary(info, lastMessage: last))
            }
            guard !Task.isCancelled, let self else { return }
            self.rooms = result
            for summary in result where !summary.callParticipants.isEmpty {
                self.resolveProfiles(summary.callParticipants, in: summary.id)
            }
            let joined = Set(result.filter(\.isJoined).map(\.id))
            if joined != self.knownJoinedRooms {
                let first = self.knownJoinedRooms.isEmpty
                self.knownJoinedRooms = joined
                if !first { await self.loadAllChannels() }
            }
        }
    }

    private static func preview(of event: LatestEventValue) -> String? {
        switch event {
        case .remote(_, _, let isOwn, _, let content):
            guard let text = TimelineController.preview(of: content) else { return nil }
            return isOwn ? "You: \(text)" : text
        case .local(_, _, _, let content, _):
            return TimelineController.preview(of: content).map { "You: \($0)" }
        default:
            return nil
        }
    }

    func summary(for roomId: String) -> RoomSummary? { roomsById[roomId] }

    /// Sender and text of a room's newest message from someone else, for a notification.
    func notificationPreview(roomId: String) async -> (sender: String, text: String)? {
        guard let room = room(roomId),
              case .remote(_, let sender, let isOwn, let profile, let content) = await room.latestEvent(),
              !isOwn, let text = TimelineController.preview(of: content) else { return nil }
        if case .ready(let displayName?, _, _, _, _) = profile { return (displayName, text) }
        return (name(of: sender), text)
    }

    func room(_ roomId: String) -> Room? { try? client.getRoom(roomId: roomId) }

    var invites: [RoomSummary] { rooms.filter(\.isInvite) }

    var directMessages: [RoomSummary] { rooms.filter { $0.isDirect && !$0.isSpace && $0.isJoined } }

    /// Group rooms that are not part of any loaded server, shown under Home like Discord's DMs.
    var roomsOutsideServers: [RoomSummary] {
        let inServers = Set(categories.values.flatMap { $0.flatMap { $0.channels.map(\.roomId) } })
        return rooms.filter {
            !$0.isDirect && !$0.isSpace && $0.isJoined && !inServers.contains($0.id) && !isDiddyOptionsRoom($0.id, topic: $0.topic)
        }
    }

    private func channelIds(inSpace spaceId: String) -> Set<String> {
        Set((categories[spaceId] ?? []).flatMap { $0.channels.map(\.roomId) })
    }

    func unreadCount(inSpace spaceId: String) -> UInt64 {
        let ids = channelIds(inSpace: spaceId)
        return rooms.filter { ids.contains($0.id) }.reduce(0) { $0 + $1.unread }
    }

    func mentionCount(inSpace spaceId: String) -> UInt64 {
        let ids = channelIds(inSpace: spaceId)
        return rooms.filter { ids.contains($0.id) }.reduce(0) { $0 + $1.mentions }
    }

    func isJoined(_ channel: SpaceRoom) -> Bool {
        roomsById[channel.roomId]?.isJoined ?? channel.isJoined
    }

    func isVoiceChannel(_ roomId: String) -> Bool { voiceRoomIds.contains(roomId) }

    func destination(for roomId: String) -> Destination {
        isVoiceChannel(roomId) ? .voice(roomId) : .text(roomId)
    }

    /// The server a channel belongs to, if any.
    func server(of roomId: String) -> String? {
        categories.first { $0.value.contains { $0.channels.contains { $0.roomId == roomId } } }?.key
    }

    // MARK: - People

    func name(of userId: String) -> String {
        profiles[userId]?.name ?? Self.localpart(userId)
    }

    nonisolated static func localpart(_ userId: String) -> String {
        let trimmed = userId.hasPrefix("@") ? String(userId.dropFirst()) : userId
        return trimmed.split(separator: ":").first.map(String.init) ?? userId
    }

    /// Fills in display names and avatars for ids the UI only knows as `@user:server`.
    func resolveProfiles(_ userIds: [String], in roomId: String) {
        let missing = userIds.filter { profiles[$0] == nil && !resolvingProfiles.contains($0) }
        guard !missing.isEmpty else { return }
        resolvingProfiles.formUnion(missing)
        let room = room(roomId)
        Task { [weak self] in
            for userId in missing {
                if let member = try? await room?.member(userId: userId) {
                    self?.remember(userId: userId, name: member.displayName, avatarUrl: member.avatarUrl)
                } else if let profile = try? await self?.client.getProfile(userId: userId) {
                    self?.remember(userId: userId, name: profile.displayName, avatarUrl: profile.avatarUrl)
                }
                self?.resolvingProfiles.remove(userId)
            }
        }
    }

    func remember(userId: String, name: String?, avatarUrl: String?) {
        let summary = UserSummary(name: name ?? Self.localpart(userId), avatarUrl: avatarUrl)
        if profiles[userId] != summary { profiles[userId] = summary }
    }

    /// Opens the existing direct message with someone or starts a new one.
    func directMessage(with userId: String) async throws -> String {
        if let existing = try? client.getDmRoom(userId: userId) { return existing.id() }
        return try await client.createRoom(request: CreateRoomParameters(
            name: nil,
            isEncrypted: true,
            isDirect: true,
            visibility: .private,
            preset: .trustedPrivateChat,
            invite: [userId]
        ))
    }

    func searchUsers(_ term: String) async throws -> [UserProfile] {
        try await client.searchUsers(searchTerm: term, limit: 25).results.filter { $0.userId != userId }
    }

    func acceptInvite(_ roomId: String) async throws {
        try await room(roomId)?.join()
        await reloadSpaces()
        await loadAllChannels()
    }

    func declineInvite(_ roomId: String) async throws {
        try await room(roomId)?.leave()
    }

    func leave(roomId: String) async throws {
        try await room(roomId)?.leave()
        await loadAllChannels()
    }

    // MARK: - Spaces ("servers")

    private func reloadSpaces() async {
        guard let spaceService else { return }
        spaces = await spaceService.topLevelJoinedSpaces()
    }

    /// Loads the channels of a server: its rooms, and the rooms of each sub-space as a category.
    func loadChannels(spaceId: String) async {
        guard let spaceService else { return }
        voiceRoomIds.formUnion(await fetchVoiceRooms(inSpace: spaceId))
        let top = await children(of: spaceId, service: spaceService)
        var result: [ChannelCategory] = []
        let direct = top.filter { !$0.isSubspace }
        if !direct.isEmpty {
            result.append(ChannelCategory(id: spaceId, name: "Channels", channels: direct))
        }
        for subspace in top where subspace.isSubspace {
            let channels = await channelsInCategory(subspace.roomId, service: spaceService, depth: 0)
            result.append(ChannelCategory(id: subspace.roomId, name: subspace.displayName, channels: channels))
        }
        categories[spaceId] = result
        loadedServers.insert(spaceId)
    }

    private func fetchVoiceRooms(inSpace spaceId: String) async -> Set<String> {
        var result: Set<String> = []
        var next: String?
        let encoded = spaceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? spaceId
        for _ in 0..<10 {
            var path = "/_matrix/client/v1/rooms/\(encoded)/hierarchy?limit=200"
            if let next, let token = next.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { path += "&from=\(token)" }
            guard let json = try? await clientRequest(path) else { break }
            for room in json["rooms"] as? [[String: Any]] ?? [] where room["room_type"] as? String == "org.matrix.msc3417.call" {
                if let id = room["room_id"] as? String { result.insert(id) }
            }
            next = json["next_batch"] as? String
            if next == nil { break }
        }
        return result
    }

    /// Categories are flat like Discord's, so spaces nested deeper fold into their category.
    private func channelsInCategory(_ spaceId: String, service: SpaceService, depth: Int) async -> [SpaceRoom] {
        var result: [SpaceRoom] = []
        for child in await children(of: spaceId, service: service) {
            if !child.isSubspace {
                result.append(child)
            } else if depth < 3 {
                result += await channelsInCategory(child.roomId, service: service, depth: depth + 1)
            }
        }
        return result
    }

    func loadAllChannels() async {
        for space in spaces { await loadChannels(spaceId: space.roomId) }
    }

    private func children(of spaceId: String, service: SpaceService) async -> [SpaceRoom] {
        guard let list = try? await service.spaceRoomList(spaceId: spaceId) else { return [] }
        for _ in 0..<20 {
            if case .idle(let endReached) = list.paginationState(), endReached { break }
            do { try await list.paginate() } catch { break }
        }
        // A joined Diddy Options room is plumbing, not a channel; desktop hides it too. One you
        // have not joined stays visible, since profiles can only be read from inside it.
        return await list.rooms().filter { !(isDiddyOptionsRoom($0.roomId, topic: $0.topic) && isJoined($0)) }
    }

    func join(_ channel: SpaceRoom) async throws {
        _ = try await client.joinRoomByIdOrAlias(roomIdOrAlias: channel.roomId, serverNames: channel.via)
        if let spaceId = server(of: channel.roomId) {
            await loadChannels(spaceId: spaceId)
        }
    }

    func unjoinedChannels(inSpace spaceId: String) -> [SpaceRoom] {
        (categories[spaceId] ?? []).flatMap(\.channels).filter { !isJoined($0) }
    }

    /// The desktop app's "Join All Rooms": a Matrix server does not put you in its channels on its own.
    func joinAllChannels(inSpace spaceId: String) async -> Int {
        var failed = 0
        for channel in unjoinedChannels(inSpace: spaceId) {
            do { _ = try await client.joinRoomByIdOrAlias(roomIdOrAlias: channel.roomId, serverNames: channel.via) } catch { failed += 1 }
        }
        await loadChannels(spaceId: spaceId)
        return failed
    }

    /// Joins a server or room from an alias, room id or matrix.to link. Returns its room id.
    func joinServer(from input: String) async throws -> String {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        var via: [String] = []
        if let range = text.range(of: "matrix.to/#/") {
            text = String(text[range.upperBound...])
            if let query = text.firstIndex(of: "?") {
                via = URLComponents(string: "x:/?" + text[text.index(after: query)...])?
                    .queryItems?.filter { $0.name == "via" }.compactMap(\.value) ?? []
                text = String(text[..<query])
            }
            text = text.removingPercentEncoding ?? text
        }
        guard text.hasPrefix("#") || text.hasPrefix("!") else {
            throw DiddyError("Enter an address like #community:matrix.org or a matrix.to link.")
        }
        let room = try await client.joinRoomByIdOrAlias(roomIdOrAlias: text, serverNames: via)
        await reloadSpaces()
        await loadAllChannels()
        return room.id()
    }

    /// A server is a Matrix space, joinable by invite or, if public, by anyone with the address.
    func createServer(name: String, topic: String, isPublic: Bool) async throws -> String {
        let id = try await client.createRoom(request: CreateRoomParameters(
            name: name,
            topic: topic.isEmpty ? nil : topic,
            isEncrypted: false,
            visibility: .private,
            preset: isPublic ? .publicChat : .privateChat,
            isSpace: true
        ))
        try? await waitForRoom(id)
        await reloadSpaces()
        // Every server starts with a place to talk, like on Discord. The server already exists at
        // this point, so a failure here must not read as "try again": that would make a duplicate.
        // The empty channel list offers "Create a channel" instead.
        _ = try? await createChannel(in: id, name: "general", topic: "", isVoice: false, encrypted: !isPublic)
        _ = try? await createChannel(in: id, name: "General", topic: "", isVoice: true, encrypted: !isPublic)
        await loadChannels(spaceId: id)
        return id
    }

    /// Creates a channel any server member can join. The SDK's request type cannot set a room type,
    /// which voice channels need, so this goes to the client API directly.
    func createChannel(in spaceId: String, name: String, topic: String, isVoice: Bool, encrypted: Bool) async throws -> String {
        guard let space = room(spaceId) else { throw DiddyError("This server is not available yet.") }
        let via = [(try? client.userIdServerName()) ?? record.serverName]
        var state: [[String: Any]] = [
            [
                "type": "m.room.join_rules",
                "state_key": "",
                "content": [
                    "join_rule": "restricted",
                    "allow": [["type": "m.room_membership", "room_id": spaceId, "via": via]],
                ],
            ],
            ["type": "m.space.parent", "state_key": spaceId, "content": ["via": via, "canonical": true]],
        ]
        if encrypted {
            state.append(["type": "m.room.encryption", "state_key": "", "content": ["algorithm": "m.megolm.v1.aes-sha2"]])
        }
        var body: [String: Any] = ["name": name, "preset": "private_chat", "visibility": "private", "initial_state": state]
        if !topic.isEmpty { body["topic"] = topic }
        if isVoice {
            body["creation_content"] = ["type": "org.matrix.msc3417.call"]
            // Joining a call writes a state event; members must be allowed to.
            body["power_level_content_override"] = ["events": ["org.matrix.msc3401.call.member": 0]]
        }
        let id = try await postCreateRoom(body)
        if isVoice { voiceRoomIds.insert(id) }
        // Written directly: the SDK's addChildToSpace fails until the new room has synced.
        let child = try JSONSerialization.data(withJSONObject: ["via": via, "suggested": true])
        _ = try await space.sendStateEventRaw(
            eventType: "m.space.child",
            stateKey: id,
            content: String(decoding: child, as: UTF8.self),
            requestConfigOverride: nil
        )
        try? await waitForRoom(id)
        await loadChannels(spaceId: spaceId)
        return id
    }

    private func postCreateRoom(_ body: [String: Any]) async throws -> String {
        let json = try await clientRequest("/_matrix/client/v3/createRoom", body: body)
        guard let id = json["room_id"] as? String else { throw DiddyError("The server could not create the channel.") }
        return id
    }

    /// For the few client API calls the SDK has no way to make. A body is sent with POST unless
    /// another method is given.
    func clientRequest(_ path: String, body: [String: Any]? = nil, method: String? = nil) async throws -> [String: Any] {
        let data = try await clientRequestData(path, body: body, method: method)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    /// The same for the calls that answer with a JSON array, such as a room's whole state.
    func clientRequestArray(_ path: String) async throws -> [[String: Any]] {
        let data = try await clientRequestData(path, body: nil, method: nil)
        return (try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
    }

    private func clientRequestData(_ path: String, body: [String: Any]?, method: String?) async throws -> Data {
        let session = try client.session()
        let base = session.homeserverUrl.hasSuffix("/") ? String(session.homeserverUrl.dropLast()) : session.homeserverUrl
        guard let url = URL(string: base + path) else { throw DiddyError("Invalid homeserver URL.") }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let method { request.httpMethod = method }
        if let body {
            if method == nil { request.httpMethod = "POST" }
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let json = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
            throw ClientAPIError(
                errcode: json["errcode"] as? String,
                message: json["error"] as? String ?? "The server refused the request."
            )
        }
        return data
    }

    /// A room created or joined a moment ago reaches the client with the next sync.
    func waitForRoom(_ roomId: String) async throws {
        for _ in 0..<40 {
            if room(roomId) != nil { return }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw DiddyError("The room did not arrive from the server in time.")
    }

    /// Leaving a server leaves its channels too, as on Discord.
    func leaveServer(_ spaceId: String) async throws {
        guard let spaceService else { return }
        let handle = try await spaceService.leaveSpace(spaceId: spaceId)
        try await handle.leave(roomIds: handle.rooms().map(\.spaceRoom.roomId))
        categories[spaceId] = nil
        loadedServers.remove(spaceId)
        await reloadSpaces()
    }

    // MARK: - Encryption

    var needsRecovery: Bool {
        verificationState == .unverified || recoveryState == .incomplete
    }

    func recover(with key: String) async throws {
        try await client.encryption().recover(recoveryKey: key.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
