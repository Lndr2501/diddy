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
    var hasCall: Bool
    var callParticipants: [String]
    var isEncrypted: Bool
}

/// Discord-style category: a sub-space of a server, or the server's own top-level rooms.
struct ChannelCategory: Identifiable, Hashable {
    let id: String
    var name: String
    var channels: [SpaceRoom]
}

extension SpaceRoom: Identifiable {
    public var id: String { roomId }

    /// Cinny/Diddy voice channels are rooms of the MSC3417 call room type.
    var isVoiceChannel: Bool {
        if case .custom(let value) = roomType { return value == "org.matrix.msc3417.call" }
        return false
    }

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
    @Published private(set) var rooms: [RoomSummary] = []
    @Published private(set) var spaces: [SpaceRoom] = []
    @Published private(set) var categories: [String: [ChannelCategory]] = [:]
    @Published private(set) var syncState: SyncServiceState = .idle
    @Published private(set) var recoveryState: RecoveryState = .unknown
    @Published private(set) var verificationState: VerificationState = .unknown
    @Published private(set) var started = false

    private var syncService: SyncService?
    private var roomList: RoomList?
    private var roomListController: RoomListDynamicEntriesController?
    private var spaceService: SpaceService?
    private var handles: [TaskHandle] = []
    private var roomObjects: [Room] = []
    private var summaryTask: Task<Void, Never>?

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
                Task { @MainActor in self?.syncState = state }
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
        await syncService?.stop()
        handles.forEach { $0.cancel() }
        handles.removeAll()
        started = false
    }

    func logout() async {
        await stop()
        try? await client.logout()
        SessionStore.delete(accountId: record.id)
        record.removeDirectories()
    }

    private func refreshProfile() async {
        displayName = try? await client.displayName()
        avatarUrl = try? await client.avatarUrl()
    }

    // MARK: - Rooms

    private func apply(_ updates: [RoomListEntriesUpdate]) {
        for update in updates { ListDiff<Room>(update).apply(to: &roomObjects) }
        scheduleSummaryRebuild()
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
                guard let info = try? await room.roomInfo() else { continue }
                result.append(RoomSummary(
                    id: info.id,
                    name: info.displayName ?? info.rawName ?? info.canonicalAlias ?? info.id,
                    avatarUrl: info.avatarUrl,
                    isDirect: info.isDirect,
                    isSpace: info.isSpace,
                    unread: info.numUnreadMessages,
                    mentions: info.numUnreadMentions,
                    hasCall: info.hasRoomCall,
                    callParticipants: info.activeRoomCallParticipants,
                    isEncrypted: info.encryptionState == .encrypted
                ))
            }
            guard !Task.isCancelled else { return }
            self?.rooms = result
        }
    }

    func summary(for roomId: String) -> RoomSummary? { rooms.first { $0.id == roomId } }

    func room(_ roomId: String) -> Room? { try? client.getRoom(roomId: roomId) }

    var directMessages: [RoomSummary] { rooms.filter { $0.isDirect && !$0.isSpace } }

    /// Group rooms that are not part of any loaded server, shown under Home like Discord's DMs.
    var roomsOutsideServers: [RoomSummary] {
        let inServers = Set(categories.values.flatMap { $0.flatMap { $0.channels.map(\.roomId) } })
        return rooms.filter { !$0.isDirect && !$0.isSpace && !inServers.contains($0.id) }
    }

    func unreadCount(inSpace spaceId: String) -> UInt64 {
        let ids = Set((categories[spaceId] ?? []).flatMap { $0.channels.map(\.roomId) })
        return rooms.filter { ids.contains($0.id) }.reduce(0) { $0 + $1.unread }
    }

    // MARK: - Spaces ("servers")

    private func reloadSpaces() async {
        guard let spaceService else { return }
        spaces = await spaceService.topLevelJoinedSpaces()
    }

    /// Loads the channels of a server: its rooms, and the rooms of each sub-space as a category.
    func loadChannels(spaceId: String) async {
        guard let spaceService else { return }
        let top = await children(of: spaceId, service: spaceService)
        var result: [ChannelCategory] = []
        let direct = top.filter { !$0.isSubspace }
        if !direct.isEmpty {
            result.append(ChannelCategory(id: spaceId, name: "Channels", channels: direct))
        }
        for subspace in top where subspace.isSubspace {
            let channels = await children(of: subspace.roomId, service: spaceService).filter { !$0.isSubspace }
            result.append(ChannelCategory(id: subspace.roomId, name: subspace.displayName, channels: channels))
        }
        categories[spaceId] = result
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
        return await list.rooms()
    }

    func join(_ channel: SpaceRoom) async throws {
        _ = try await client.joinRoomByIdOrAlias(roomIdOrAlias: channel.roomId, serverNames: channel.via)
        if let spaceId = categories.first(where: { $0.value.contains { $0.channels.contains(channel) } })?.key {
            await loadChannels(spaceId: spaceId)
        }
    }

    // MARK: - Encryption

    var needsRecovery: Bool {
        verificationState == .unverified || recoveryState == .incomplete
    }

    func recover(with key: String) async throws {
        try await client.encryption().recover(recoveryKey: key.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
