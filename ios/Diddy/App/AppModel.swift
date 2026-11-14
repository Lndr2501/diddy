import Foundation
import MatrixRustSDK
import SwiftUI
import UIKit

/// All logins on this device and which one is shown. Like Discord's account switcher, every
/// account keeps its own session and data; switching only changes what is on screen.
@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var accounts: [MatrixAccount] = []
    @Published var activeAccountId: String? {
        didSet { AccountList.activeAccountId = activeAccountId }
    }
    @Published private(set) var restoring = true
    @Published var addingAccount = false
    @Published var restoreErrors: [String] = []
    /// A room to show, from a tapped notification. MainView of that account opens it.
    @Published var openRequest: OpenRequest?

    struct OpenRequest: Equatable {
        let accountId: String
        let roomId: String
    }

    let calls = CallManager()

    var activeAccount: MatrixAccount? {
        accounts.first { $0.id == activeAccountId } ?? accounts.first
    }

    /// Saved logins whose server cannot be reached right now. They are still valid: being offline
    /// must not send anyone back to the login screen.
    @Published private(set) var unreachable: [AccountRecord] = []

    func restore() async {
        defer { restoring = false }
        let records = AccountList.load()
        let preferred = AccountList.activeAccountId
        // The account shown first is restored first, and the splash only waits for it (or, when
        // it cannot be reached, for the next one that can). Building a client asks the server, so
        // every further login used to add its round trips to the start of the app.
        var pending = records
        if let index = pending.firstIndex(where: { $0.id == preferred }) { pending.insert(pending.remove(at: index), at: 0) }
        while !pending.isEmpty, accounts.isEmpty {
            let record = pending.removeFirst()
            if await restoreAccount(record) == false { unreachable.append(record) }
        }
        activeAccountId = preferred.flatMap { id in accounts.contains { $0.id == id } ? id : nil }
            ?? accounts.first?.id
        LocalNotifications.shared.onOpen = { [weak self] accountId, roomId in
            Task { await self?.open(roomId: roomId, accountId: accountId) }
        }
        calls.onAnswer = { [weak self] account in
            guard let self, self.activeAccountId != account.id else { return }
            await self.switchTo(account)
        }
        if let active = activeAccount { await active.start() }
        guard !pending.isEmpty else { return }
        restoring = false
        for record in pending where await restoreAccount(record) == false { unreachable.append(record) }
        // The account switcher keeps the saved order.
        let order = records.map(\.id)
        accounts.sort { (order.firstIndex(of: $0.id) ?? Int.max) < (order.firstIndex(of: $1.id) ?? Int.max) }
    }

    /// False when the server could not be reached, which is worth trying again. Other failures
    /// are reported and not retried.
    private func restoreAccount(_ record: AccountRecord) async -> Bool {
        guard let session = SessionStore.load(accountId: record.id) else {
            restoreErrors.append("\(record.userId): this device no longer has the saved login. Please sign in again.")
            return true
        }
        do {
            let client = try await ClientFactory.builder(for: record)
                .homeserverUrl(url: session.homeserverUrl)
                .build()
            try await client.restoreSession(session: session)
            accounts.append(makeAccount(record: record, client: client))
        } catch let error as ClientBuildError {
            if case .ServerUnreachable = error { return false }
            restoreErrors.append("\(record.userId): \(error.friendlyMessage)")
        } catch {
            restoreErrors.append("\(record.userId): \(error.friendlyMessage)")
        }
        return true
    }

    /// Tries the servers that were out of reach again; the first to answer opens up.
    func retryUnreachable() async {
        var waiting: [AccountRecord] = []
        for record in unreachable where await restoreAccount(record) == false { waiting.append(record) }
        unreachable = waiting
        guard activeAccountId == nil, let first = accounts.first else { return }
        activeAccountId = first.id
        await first.start()
    }

    private func makeAccount(record: AccountRecord, client: Client) -> MatrixAccount {
        let account = MatrixAccount(record: record, client: client)
        account.onRoomsChanged = { [weak self, weak account] old, new in
            guard let self, let account else { return }
            self.calls.roomsChanged(account: account, from: old, to: new)
            self.announceActivity(account: account, from: old, to: new)
            LocalNotifications.shared.roomsChanged(account: account, from: old, to: new)
            CallPush.shared.publish(account: account)
        }
        return account
    }

    /// Plays one sound for what just arrived, when the app is on screen to hear about it.
    private func announceActivity(account: MatrixAccount, from old: [String: RoomSummary], to new: [RoomSummary]) {
        guard account.canRing, UIApplication.shared.applicationState == .active, calls.current?.deafened != true else { return }
        var sound: Sound?
        // A call notification mentions the whole room, and the ringing already says everything.
        for room in new where !room.isSpace && !(room.isDirect && !room.callParticipants.isEmpty) {
            guard let before = old[room.id] else {
                if room.isInvite { sound = sound ?? .invite }
                continue
            }
            if room.isInvite, !before.isInvite {
                sound = sound ?? .invite
            } else if room.isJoined, room.id != Sounds.shared.openRoomId {
                if room.mentions > before.mentions {
                    sound = .mention
                } else if room.notifications > before.notifications {
                    sound = sound ?? .message
                }
            }
        }
        // Do not disturb: no sound for new messages, mentions or invites (desktop #71).
        if let sound, !DoNotDisturb.silencesSound(sound.alert, status: PresenceStore.of(account).ownStatus) {
            Sounds.shared.playAlert(sound)
        }
    }

    func add(record: AccountRecord, client: Client) async {
        let account = makeAccount(record: record, client: client)
        accounts.append(account)
        saveAccountList()
        addingAccount = false
        activeAccountId = account.id
        await account.start()
    }

    private func open(roomId: String, accountId: String) async {
        guard let account = accounts.first(where: { $0.id == accountId }) else { return }
        if activeAccountId != account.id { await switchTo(account) }
        openRequest = OpenRequest(accountId: accountId, roomId: roomId)
    }

    func switchTo(_ account: MatrixAccount) async {
        activeAccountId = account.id
        await account.start()
    }

    func logout(_ account: MatrixAccount) async {
        if calls.current?.accountId == account.id { await calls.leave() }
        await account.logout()
        accounts.removeAll { $0.id == account.id }
        saveAccountList()
        if activeAccountId == account.id { activeAccountId = accounts.first?.id }
        if let active = activeAccount { await active.start() }
    }

    /// Logins that are only out of reach for now have to stay on the list.
    private func saveAccountList() {
        AccountList.save(accounts.map(\.record) + unreachable)
    }
}
