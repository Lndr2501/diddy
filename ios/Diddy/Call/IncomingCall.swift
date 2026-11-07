import MatrixRustSDK
import SwiftUI

/// A direct message call ringing on this device.
@MainActor
final class IncomingCall: Identifiable {
    let account: MatrixAccount
    let roomId: String
    var id: String { roomId }
    var callerId: String
    /// What a decline refers to. Until it has been found, declining only stops the ringing here.
    private(set) var notificationEventId: String?
    var onCancelled: (() -> Void)?

    private var timeline: Timeline?
    private var listener: TaskHandle?
    private var items: [TimelineItem] = []
    /// A notification older than this belongs to an earlier call. Same as Element Call's upper limit.
    private static let maximumAgeMs: UInt64 = 120_000

    init(account: MatrixAccount, roomId: String, callerId: String) {
        self.account = account
        self.roomId = roomId
        self.callerId = callerId
    }

    var name: String { account.summary(for: roomId)?.name ?? account.name(of: callerId) }
    var avatarUrl: String? { account.profiles[callerId]?.avatarUrl ?? account.summary(for: roomId)?.avatarUrl }

    /// Room state says someone is in a call; the notification beside it, read from the timeline,
    /// says which event to decline and whether another of your devices already did.
    func watchTimeline() async {
        guard let room = account.room(roomId), let timeline = try? await room.timeline() else { return }
        self.timeline = timeline
        listener = await timeline.addListener(listener: TimelineUpdates { [weak self] diffs in
            Task { @MainActor in self?.apply(diffs) }
        })
    }

    func stopWatching() {
        listener?.cancel()
        listener = nil
        timeline = nil
    }

    private func apply(_ diffs: [TimelineDiff]) {
        for diff in diffs { ListDiff<TimelineItem>(diff).apply(to: &items) }
        for item in items.reversed() {
            guard let event = item.asEvent(), !event.isOwn,
                  case .rtcNotification(_, let declinedBy, _, _, _) = event.content,
                  case .eventId(let eventId) = event.eventOrTransactionId else { continue }
            let now = UInt64(Date().timeIntervalSince1970 * 1000)
            if now > UInt64(event.timestamp) + Self.maximumAgeMs || declinedBy.contains(account.userId) {
                onCancelled?()
            } else {
                notificationEventId = eventId
            }
            return
        }
    }

    func decline() async {
        guard let notificationEventId, let room = account.room(roomId) else { return }
        try? await room.declineCall(rtcNotificationEventId: notificationEventId)
    }
}

/// Keeps the ringing screen above everything, sheets and the call screen included, in a window of
/// its own: a SwiftUI cover cannot appear while something else is being presented.
@MainActor
final class IncomingCallWindow {
    private var window: UIWindow?

    func show(_ call: IncomingCall, manager: CallManager) {
        guard window == nil,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }) ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
        else { return }
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        let host = UIHostingController(rootView: IncomingCallView(call: call, manager: manager).preferredColorScheme(.dark).tint(Theme.accent))
        host.view.backgroundColor = .clear
        window.rootViewController = host
        window.isHidden = false
        self.window = window
    }

    func hide() {
        window?.isHidden = true
        window = nil
    }
}

struct IncomingCallView: View {
    let call: IncomingCall
    @ObservedObject var manager: CallManager
    @State private var pulsing = false
    @State private var answering = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.accent.opacity(0.45), Theme.rail], startPoint: .top, endPoint: .center)
                .background(Theme.rail)
                .ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                ZStack {
                    Circle()
                        .stroke(Theme.online.opacity(pulsing ? 0 : 0.7), lineWidth: 3)
                        .frame(width: 132, height: 132)
                        .scaleEffect(pulsing ? 1.35 : 1)
                    AvatarView(url: call.avatarUrl, name: call.name, size: 120, account: call.account)
                }
                .onAppear {
                    withAnimation(.easeOut(duration: 1.3).repeatForever(autoreverses: false)) { pulsing = true }
                }
                Text(call.name)
                    .font(.largeTitle.bold())
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                Text("Incoming voice call")
                    .font(.headline)
                    .foregroundStyle(Theme.muted)
                Spacer()
                HStack(spacing: 64) {
                    action("Decline", systemImage: "phone.down.fill", color: Theme.danger) {
                        Task { await manager.declineIncoming() }
                    }
                    action("Accept", systemImage: "phone.fill", color: Theme.online) {
                        answering = true
                        manager.answerIncoming()
                    }
                }
                .padding(.bottom, 48)
                .disabled(answering)
            }
            .padding(24)
        }
        .accessibilityAddTraits(.isModal)
    }

    private func action(_ title: String, systemImage: String, color: Color, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            VStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 76, height: 76)
                    .background(Circle().fill(color))
                Text(title).font(.subheadline).foregroundStyle(Theme.text)
            }
        }
        .buttonStyle(.plain)
    }
}
