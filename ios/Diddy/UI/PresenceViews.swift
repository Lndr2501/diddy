import SwiftUI
import UIKit

/// The status dot on someone's avatar: online, idle, do not disturb or offline, from their Matrix
/// presence and the status they picked in Diddy (see PresenceStore.swift). Shows nothing while
/// that is unknown. Put it on an avatar with `.overlay(alignment: .bottomTrailing) { ... }`.
struct PresenceDot: View {
    let userId: String?
    let account: MatrixAccount?
    /// Edge of the coloured shape; the ring around it adds a quarter.
    var size: CGFloat = 12
    /// The colour behind the avatar, so the dot looks cut out of it like on desktop.
    var ring: Color = Theme.sidebar
    /// Ask the server right away (profile cards, chat headers) instead of with the next round.
    var onDemand = false

    var body: some View {
        if let userId, let account {
            PresenceDotContent(userId: userId, account: account, store: PresenceStore.of(account), size: size, ring: ring, onDemand: onDemand)
        }
    }
}

private struct PresenceDotContent: View {
    let userId: String
    @ObservedObject var account: MatrixAccount
    @ObservedObject var store: PresenceStore
    let size: CGFloat
    let ring: Color
    let onDemand: Bool

    var body: some View {
        let outer = size * 1.25
        // Always a real view, so onAppear and the task run even while nothing is shown.
        Color.clear
            .frame(width: outer, height: outer)
            .overlay {
                if let state = store.state(of: userId) {
                    ZStack {
                        Circle().fill(ring)
                        PresenceIcon(state: state, size: size)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(state.title)
                }
            }
            .allowsHitTesting(false)
            .task(id: userId) {
                // Captures this user; a reused row with another user gets a new task.
                let watched = userId
                let watchingStore = store
                watchingStore.watch(watched)
                if onDemand { await watchingStore.refreshNow(watched) }
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 3_600_000_000_000)
                }
                watchingStore.unwatch(watched)
            }
    }
}

/// Desktop's status shapes (`components/presence/StatusIcon.tsx`): online a filled circle, idle a
/// crescent, do not disturb a circle with a bar, offline a ring. The shape tells the states apart,
/// not only the colour.
struct PresenceIcon: View {
    let state: PresenceState
    var size: CGFloat = 12

    var body: some View {
        let color = Color(hex: state.hex)
        let shape = state
        Canvas { context, canvas in
            let w = min(canvas.width, canvas.height)
            context.fill(Path(ellipseIn: CGRect(x: 0, y: 0, width: w, height: w)), with: .color(color))
            context.blendMode = .clear
            switch shape {
            case .idle:
                context.fill(Path(ellipseIn: CGRect(x: w * -0.125, y: w * -0.125, width: w * 0.75, height: w * 0.75)), with: .color(.black))
            case .dnd:
                context.fill(Path(roundedRect: CGRect(x: w * 0.125, y: w * 0.375, width: w * 0.75, height: w * 0.25), cornerRadius: w * 0.125), with: .color(.black))
            case .offline:
                context.fill(Path(ellipseIn: CGRect(x: w * 0.25, y: w * 0.25, width: w * 0.5, height: w * 0.5)), with: .color(.black))
            case .online:
                break
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(state.title)
    }
}

/// "Online", "Idle" ... under the name on a profile card, with the person's status message.
struct PresenceLabel: View {
    let userId: String
    @ObservedObject var account: MatrixAccount

    var body: some View {
        PresenceLabelContent(userId: userId, store: PresenceStore.of(account))
    }
}

private struct PresenceLabelContent: View {
    let userId: String
    @ObservedObject var store: PresenceStore

    var body: some View {
        if let state = store.state(of: userId) {
            HStack(spacing: 5) {
                PresenceIcon(state: state, size: 10)
                Text(state.title)
                if let message = store.message(of: userId) {
                    Text("•")
                    Text(message).lineLimit(1)
                }
            }
            .font(.caption)
            .foregroundStyle(Theme.muted)
        }
    }
}

extension View {
    /// Keeps your own presence and the status dots up to date while the app is open, and says
    /// "unavailable" (or keeps "offline" when invisible) when it goes to the background. Put it
    /// on the account's main view once.
    func presenceUpdates(account: MatrixAccount) -> some View {
        modifier(PresenceUpdates(account: account))
    }
}

private struct PresenceUpdates: ViewModifier {
    @ObservedObject var account: MatrixAccount
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .task(id: scenePhase == .background) {
                let store = PresenceStore.of(account)
                if scenePhase == .background {
                    // A moment of background time, so the request can finish before iOS suspends.
                    let app = UIApplication.shared
                    let task = app.beginBackgroundTask(withName: "Diddy presence", expirationHandler: nil)
                    await store.enterBackground()
                    if task != .invalid { app.endBackgroundTask(task) }
                } else {
                    await store.runForeground()
                }
            }
            .onChange(of: account.diddyProfiles[account.userId]?.status) { _ in
                Task { await PresenceStore.of(account).ownStatusChanged() }
            }
    }
}
