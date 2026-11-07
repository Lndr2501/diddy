import UIKit
import UserNotifications

/// Notifications for new messages, mentions, invites and calls, posted by the app itself while it
/// runs in the background (see BackgroundKeepAlive). On screen, the sounds in AppModel do this job.
@MainActor
final class LocalNotifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = LocalNotifications()
    static let settingKey = "diddy.backgroundNotifications"

    /// Off unless the user turned it on: keeping the app running costs battery.
    static var isEnabled: Bool { UserDefaults.standard.bool(forKey: settingKey) }

    /// Opens the room of a tapped notification. Until the app has set this, a tap waits here.
    var onOpen: ((_ accountId: String, _ roomId: String) -> Void)? {
        didSet {
            guard let onOpen, let pending = pendingOpen else { return }
            pendingOpen = nil
            onOpen(pending.accountId, pending.roomId)
        }
    }

    private var pendingOpen: (accountId: String, roomId: String)?
    private let center = UNUserNotificationCenter.current()

    private override init() {}

    /// Must run at launch, so a tap that starts the app is delivered.
    func setUp() {
        center.delegate = self
    }

    /// False when the user declines, now or earlier in the Settings app.
    func requestPermission() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    private var canPost: Bool {
        Self.isEnabled && UIApplication.shared.applicationState != .active
    }

    private static func identifier(_ account: MatrixAccount, _ roomId: String) -> String {
        "\(account.id)|\(roomId)"
    }

    // MARK: Messages

    func roomsChanged(account: MatrixAccount, from old: [String: RoomSummary], to new: [RoomSummary]) {
        // Read somewhere (here or on another device): its notification has done its job.
        let read = new.filter { room in
            room.notifications == 0 && room.mentions == 0
                && ((old[room.id]?.notifications ?? 0) > 0 || (old[room.id]?.mentions ?? 0) > 0)
        }
        if !read.isEmpty {
            center.removeDeliveredNotifications(withIdentifiers: read.map { Self.identifier(account, $0.id) })
        }
        if Self.isEnabled { setBadge(Int(new.filter(\.isJoined).reduce(0) { $0 + $1.badge })) }

        guard canPost, account.canRing else { return }
        // A call in a direct message mentions the room; the call notification already says it all.
        for room in new where !room.isSpace && !(room.isDirect && !room.callParticipants.isEmpty) {
            guard let before = old[room.id] else {
                if room.isInvite { postInvite(account: account, room: room) }
                continue
            }
            if room.isInvite, !before.isInvite {
                postInvite(account: account, room: room)
            } else if room.isJoined, room.mentions > before.mentions || room.notifications > before.notifications {
                let mention = room.mentions > before.mentions
                Task { await self.postMessage(account: account, room: room, mention: mention) }
            }
        }
    }

    private func postMessage(account: MatrixAccount, room: RoomSummary, mention: Bool) async {
        let preview = await account.notificationPreview(roomId: room.id)
        let content = UNMutableNotificationContent()
        content.title = room.name
        if let preview {
            content.body = room.isDirect ? preview.text : "\(preview.sender): \(preview.text)"
        } else {
            // Not decrypted (yet), or something without text.
            content.body = mention ? "You were mentioned" : "New message"
        }
        let sound: Sound = mention ? .mention : .message
        if sound.setting.isOn { content.sound = .default }
        post(content, id: Self.identifier(account, room.id), account: account, roomId: room.id)
    }

    private func postInvite(account: MatrixAccount, room: RoomSummary) {
        let content = UNMutableNotificationContent()
        content.title = room.name
        content.body = room.inviterName.map { "\($0) invited you" } ?? "You were invited"
        if Sound.invite.setting.isOn { content.sound = .default }
        post(content, id: Self.identifier(account, room.id), account: account, roomId: room.id)
    }

    // MARK: Calls

    /// False when no notification was posted (setting off, app on screen); then the caller rings.
    func announceCall(account: MatrixAccount, roomId: String, name: String) -> Bool {
        guard canPost else { return false }
        let content = UNMutableNotificationContent()
        content.title = name
        content.body = "Incoming call"
        if Sound.ringtone.setting.isOn { content.sound = .default }
        post(content, id: "call|" + Self.identifier(account, roomId), account: account, roomId: roomId)
        return true
    }

    func removeCall(account: MatrixAccount, roomId: String) {
        let id = "call|" + Self.identifier(account, roomId)
        center.removeDeliveredNotifications(withIdentifiers: [id])
        center.removePendingNotificationRequests(withIdentifiers: [id])
    }

    // MARK: Plumbing

    /// One notification per room, replaced by the newest, so a busy chat does not fill the screen.
    private func post(_ content: UNMutableNotificationContent, id: String, account: MatrixAccount, roomId: String) {
        content.threadIdentifier = Self.identifier(account, roomId)
        content.userInfo = ["accountId": account.id, "roomId": roomId]
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }

    private func setBadge(_ count: Int) {
        if #available(iOS 17, *) {
            center.setBadgeCount(count)
        } else {
            UIApplication.shared.applicationIconBadgeNumber = count
        }
    }

    /// The setting was turned off.
    func clearAll() {
        center.removeAllDeliveredNotifications()
        setBadge(0)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        // On screen the app plays its own sounds instead.
        []
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        guard let accountId = info["accountId"] as? String, let roomId = info["roomId"] as? String else { return }
        await MainActor.run {
            if let onOpen = self.onOpen {
                onOpen(accountId, roomId)
            } else {
                self.pendingOpen = (accountId, roomId)
            }
        }
    }
}
