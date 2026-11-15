import Foundation
import MatrixRustSDK
import UIKit

/// The iPhone side of "Use iPhone as Camera & Mic" (CompanionProtocol.swift): listens on every
/// account for a request from your own computer, offers it (a sheet, or a notification while the
/// app is in the background) and hands the computer's later commands to the running call.
@MainActor
final class CompanionService: ObservableObject {
    static let shared = CompanionService()

    /// A request waiting for your answer.
    struct Pending: Identifiable, Equatable {
        let accountId: String
        let request: CompanionProtocol.Request
        var id: String { request.id }
    }

    @Published var pending: Pending?
    weak var calls: CallManager?
    private var handles: [String: TaskHandle] = [:]
    private weak var model: AppModel?

    private init() {}

    func setUp(model: AppModel) {
        self.model = model
        calls = model.calls
    }

    /// Starts listening on an account (each login is a device of its own).
    func attach(_ account: MatrixAccount) {
        guard handles[account.id] == nil else { return }
        handles[account.id] = account.client.subscribeToCustomToDeviceMessages(
            eventTypes: [CompanionProtocol.requestType, CompanionProtocol.controlType],
            listener: ToDeviceListener { [weak self, weak account] message in
                Task { @MainActor in
                    guard let self, let account else { return }
                    self.receive(message, account: account)
                }
            }
        )
    }

    func detach(accountId: String) {
        handles.removeValue(forKey: accountId)?.cancel()
        if pending?.accountId == accountId { pending = nil }
    }

    private func receive(_ message: ToDeviceMessage, account: MatrixAccount) {
        switch message.eventType {
        case CompanionProtocol.requestType:
            guard let request = CompanionProtocol.parseRequest(message.content),
                  CompanionProtocol.accepts(sender: message.senderId, ownUserId: account.userId,
                                            encrypted: message.encryptionInfo != nil,
                                            requestDevice: request.deviceId, ownDeviceId: account.deviceId)
            else {
                DiagLog.shared.write("companion: ignored a request (not from an own device, or not encrypted)")
                return
            }
            DiagLog.shared.write("companion: request for \(request.roomId) from device \(request.deviceId)")
            pending = Pending(accountId: account.id, request: request)
            if UIApplication.shared.applicationState != .active {
                LocalNotifications.shared.announceCompanion(account: account, roomId: request.roomId,
                                                            roomName: request.roomName)
            }
        case CompanionProtocol.controlType:
            guard message.senderId == account.userId, message.encryptionInfo != nil,
                  let control = CompanionProtocol.parseControl(message.content),
                  let session = calls?.current, session.companion?.requestId == control.requestId else { return }
            if control.end {
                DiagLog.shared.write("companion: the computer ended it")
                Task { await self.calls?.leave() }
                return
            }
            Task { await session.applyCompanionControl(control) }
        default:
            break
        }
    }

    /// "Join": joins the call as camera, microphone and/or screen of the computer.
    func accept(media: CompanionProtocol.Media) {
        guard let pending, let account = model?.accounts.first(where: { $0.id == pending.accountId }) else { return }
        self.pending = nil
        let companion = CallSession.Companion(requestId: pending.request.id, deviceId: pending.request.deviceId, media: media)
        let name = pending.request.roomName.isEmpty ? (account.summary(for: pending.request.roomId)?.name ?? "Call") : pending.request.roomName
        Task { await calls?.join(account: account, roomId: pending.request.roomId, roomName: name, showCallScreen: true, companion: companion) }
    }

    /// "Not now": tells the computer, so it stops waiting.
    func decline() {
        guard let pending, let account = model?.accounts.first(where: { $0.id == pending.accountId }) else { return }
        self.pending = nil
        let content = CompanionProtocol.state(requestId: pending.request.id, deviceId: account.deviceId, joined: false,
                                              media: CompanionProtocol.Media(camera: false, microphone: false, screen: false))
        Task {
            _ = try? await account.client.sendEncryptedToDeviceMessage(
                eventType: CompanionProtocol.stateType,
                recipients: [account.userId: [pending.request.deviceId]],
                content: content
            )
        }
    }
}
