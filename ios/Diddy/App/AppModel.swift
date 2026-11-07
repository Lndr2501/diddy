import Foundation
import MatrixRustSDK
import SwiftUI

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

    let calls = CallManager()

    var activeAccount: MatrixAccount? {
        accounts.first { $0.id == activeAccountId } ?? accounts.first
    }

    func restore() async {
        defer { restoring = false }
        for record in AccountList.load() {
            guard let session = SessionStore.load(accountId: record.id) else {
                restoreErrors.append("\(record.userId): this device no longer has the saved login. Please sign in again.")
                continue
            }
            do {
                let client = try await ClientFactory.builder(for: record)
                    .homeserverUrl(url: session.homeserverUrl)
                    .build()
                try await client.restoreSession(session: session)
                accounts.append(MatrixAccount(record: record, client: client))
            } catch {
                restoreErrors.append("\(record.userId): \(error.friendlyMessage)")
            }
        }
        activeAccountId = AccountList.activeAccountId.flatMap { id in accounts.contains { $0.id == id } ? id : nil }
            ?? accounts.first?.id
        if let active = activeAccount { await active.start() }
    }

    func add(record: AccountRecord, client: Client) async {
        let account = MatrixAccount(record: record, client: client)
        accounts.append(account)
        AccountList.save(accounts.map(\.record))
        addingAccount = false
        activeAccountId = account.id
        await account.start()
    }

    func switchTo(_ account: MatrixAccount) async {
        activeAccountId = account.id
        await account.start()
    }

    func logout(_ account: MatrixAccount) async {
        if calls.current?.accountId == account.id { await calls.leave() }
        await account.logout()
        accounts.removeAll { $0.id == account.id }
        AccountList.save(accounts.map(\.record))
        if activeAccountId == account.id { activeAccountId = accounts.first?.id }
        if let active = activeAccount { await active.start() }
    }
}
