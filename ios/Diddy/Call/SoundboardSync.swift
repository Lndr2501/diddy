import Foundation

/// Keeps the MyInstants sounds of the soundboard the same on all your devices (#248), like the
/// desktop's `useSoundboardSync`: downloads sounds added elsewhere, removes sounds removed
/// elsewhere, and writes your own imports and removals to the account data. Rules in
/// `SoundboardSyncLogic.swift`. Runs when the app comes to the front and after your own changes.
@MainActor
final class SoundboardSync {
    static let shared = SoundboardSync()

    private weak var account: MatrixAccount?
    /// One sync or write at a time, so a sound is never downloaded twice.
    private var pending: Task<Void, Never>?
    /// Sounds that could not be downloaded (gone, too long): not again until the next launch.
    private var failed = Set<String>()

    private init() {}

    /// Starts syncing for the signed-in account (call again when the app comes back).
    func start(account: MatrixAccount) {
        self.account = account
        Soundboard.shared.onUserChange = { [weak self] change in self?.record(change) }
        enqueue { [weak self] in await self?.reconcile() }
    }

    private func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let previous = pending
        pending = Task { @MainActor in
            await previous?.value
            await work()
        }
    }

    private func record(_ change: Soundboard.UserChange) {
        enqueue { [weak self] in
            await self?.update { state, now in
                switch change {
                case let .added(path, name): return SoundboardSyncLogic.add(state, [(path: path, name: name)], now: now)
                case let .removed(path): return SoundboardSyncLogic.remove(state, path: path, now: now)
                }
            }
        }
    }

    /// Reads the server's list, applies the change and writes it; reconciles a crossed write once.
    private func update(_ change: (SoundboardSyncState, Int64) -> SoundboardSyncState) async {
        guard let account else { return }
        do {
            let base = SoundboardSyncLogic.parse(try await account.globalAccountData(type: SoundboardSyncLogic.type), now: SoundboardSyncLogic.now)
            let next = change(base, SoundboardSyncLogic.now)
            guard next != base else { return }
            try await write(account: account, state: next)
            let after = try await account.globalAccountData(type: SoundboardSyncLogic.type)
            let merged = SoundboardSyncLogic.merge([after ?? [:], next.json], now: SoundboardSyncLogic.now)
            if merged != SoundboardSyncLogic.parse(after, now: SoundboardSyncLogic.now) {
                try await write(account: account, state: merged)
            }
        } catch {
            // Offline or refused: the next sync publishes the change again.
        }
    }

    private func write(account: MatrixAccount, state: SoundboardSyncState) async throws {
        let user = MatrixAccount.securityPathComponent(account.userId)
        let type = MatrixAccount.securityPathComponent(SoundboardSyncLogic.type)
        _ = try await account.clientRequest("/_matrix/client/v3/user/\(user)/account_data/\(type)", body: state.json, method: "PUT")
    }

    private func reconcile() async {
        guard let account else { return }
        let remote: [String: Any]?
        do { remote = try await account.globalAccountData(type: SoundboardSyncLogic.type) } catch { return }
        let state = SoundboardSyncLogic.parse(remote, now: SoundboardSyncLogic.now)
        let board = Soundboard.shared
        let local = board.clips.map { SoundboardLocalClip(id: $0.id, name: $0.name, myinstants: $0.myinstants) }
        let plan = SoundboardSyncLogic.plan(state, clips: local)
        for link in plan.link { board.setSource(id: link.id, myinstants: link.path) }
        for id in plan.remove {
            if let clip = board.clips.first(where: { $0.id == id }) { board.remove(clip, fromSync: true) }
        }
        if !plan.publish.isEmpty {
            let publish = plan.publish
            await update { current, now in SoundboardSyncLogic.add(current, publish, now: now) }
        }
        for item in plan.download where !failed.contains(item.path) {
            guard self.account === account, let url = MyInstantsParser.soundURL(path: item.path) else { continue }
            do {
                let data = try await MyInstantsClient.fetchAudio(url)
                let ext = (item.path as NSString).pathExtension.lowercased()
                try board.add(data: data, name: item.name, ext: ext.isEmpty ? "mp3" : ext, myinstants: item.path, fromSync: true)
            } catch {
                failed.insert(item.path)
            }
            // Be gentle with the site, like the import.
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
    }
}
