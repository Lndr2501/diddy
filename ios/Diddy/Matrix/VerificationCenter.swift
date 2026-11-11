import Foundation
import MatrixRustSDK

/// One of the seven pictures of the emoji comparison.
struct VerificationEmoji: Hashable {
    let symbol: String
    let label: String
}

/// Who asks to be verified.
struct VerificationRequest: Equatable {
    let userId: String
    let name: String
    let deviceId: String
    let deviceName: String?
    let flowId: String
}

/// Where an interactive verification stands, for the sheet in VerificationViews.swift.
enum VerificationPhase: Equatable {
    case idle
    /// Somebody asks you to verify.
    case incoming(VerificationRequest)
    /// You asked; the other side has not answered yet.
    case requesting(String)
    /// Both agreed, the comparison is being set up.
    case starting
    case emojis([VerificationEmoji])
    case decimals([Int])
    /// You said they match; waiting for the other side.
    case confirming
    case done
    case cancelled(String)
    case failed(String)

    /// Anything that needs the sheet on screen.
    var isActive: Bool { self != .idle }

    /// A running flow that closing the sheet has to cancel.
    var isRunning: Bool {
        switch self {
        case .incoming, .requesting, .starting, .emojis, .decimals, .confirming: return true
        case .idle, .done, .cancelled, .failed: return false
        }
    }
}

/// What the SDK tells us, turned into plain values on whatever thread it calls from.
enum VerificationEvent {
    case request(VerificationRequest)
    case accepted
    case startedSas
    case emojis([VerificationEmoji])
    case decimals([Int])
    case failed
    case cancelled
    case finished
}

final class VerificationDelegate: SessionVerificationControllerDelegate, @unchecked Sendable {
    private let handler: (VerificationEvent) -> Void
    init(_ handler: @escaping (VerificationEvent) -> Void) { self.handler = handler }

    func didReceiveVerificationRequest(details: SessionVerificationRequestDetails) {
        let userId = details.senderProfile.userId
        handler(.request(VerificationRequest(
            userId: userId,
            name: details.senderProfile.displayName ?? userId,
            deviceId: details.deviceId,
            deviceName: details.deviceDisplayName,
            flowId: details.flowId
        )))
    }

    func didAcceptVerificationRequest() { handler(.accepted) }
    func didStartSasVerification() { handler(.startedSas) }

    func didReceiveVerificationData(data: SessionVerificationData) {
        switch data {
        case .emojis(let emojis, _):
            handler(.emojis(emojis.map { VerificationEmoji(symbol: $0.symbol(), label: $0.description()) }))
        case .decimals(let values):
            handler(.decimals(values.map { Int($0) }))
        }
    }

    func didFail() { handler(.failed) }
    func didCancel() { handler(.cancelled) }
    func didFinish() { handler(.finished) }
}

/// Interactive verification of your other devices and of other people, over the SDK's
/// session verification controller. One per account (like desktop's Verification.tsx).
@MainActor
final class VerificationCenter: ObservableObject {
    private static var centers: [String: VerificationCenter] = [:]

    /// The center of an account, made on first use.
    static func of(_ account: MatrixAccount) -> VerificationCenter {
        if let center = centers[account.id], center.account === account { return center }
        let center = VerificationCenter(account: account)
        centers[account.id] = center
        return center
    }

    @Published private(set) var phase: VerificationPhase = .idle
    /// Views that can show the sheet, in the order they appeared. Only the last one presents, so
    /// the sheet never fights with another sheet (Settings) for the screen.
    @Published private(set) var presenters: [UUID] = []

    private weak var account: MatrixAccount?
    private var controller: SessionVerificationController?
    private var delegate: VerificationDelegate?

    private init(account: MatrixAccount) {
        self.account = account
    }

    func addPresenter(_ id: UUID) {
        if !presenters.contains(id) { presenters.append(id) }
    }

    func removePresenter(_ id: UUID) {
        presenters.removeAll { $0 == id }
    }

    /// Starts listening for requests from your other devices and other people. Safe to repeat.
    func start() async {
        guard controller == nil, let account else { return }
        do {
            let controller = try await account.client.getSessionVerificationController()
            let delegate = VerificationDelegate { [weak self] event in
                Task { @MainActor in self?.handle(event) }
            }
            controller.setDelegate(delegate: delegate)
            self.controller = controller
            self.delegate = delegate
        } catch {
            DiagLog.shared.write("verification: no controller (\(error.friendlyMessage))")
        }
    }

    // MARK: Starting

    /// Asks your other devices to verify this one.
    func requestDeviceVerification() async {
        guard !phase.isRunning else { return }
        await start()
        guard let controller else { phase = .failed("Verification is not ready yet. Try again in a moment."); return }
        phase = .requesting("Open Diddy or Element on another device you are signed in on and accept the request there.")
        do {
            try await controller.requestDeviceVerification()
        } catch {
            phase = .failed(error.friendlyMessage)
        }
    }

    /// Asks another person to verify with you.
    func requestUserVerification(userId: String) async {
        guard !phase.isRunning else { return }
        await start()
        guard let controller else { phase = .failed("Verification is not ready yet. Try again in a moment."); return }
        phase = .requesting("Waiting for \(userId) to accept the request.")
        do {
            try await controller.requestUserVerification(userId: userId)
        } catch {
            phase = .failed(error.friendlyMessage)
        }
    }

    // MARK: Answering

    func accept() async {
        guard case .incoming(let request) = phase, let controller else { return }
        phase = .starting
        do {
            try await controller.acknowledgeVerificationRequest(senderId: request.userId, flowId: request.flowId)
            try await controller.acceptVerificationRequest()
        } catch {
            phase = .failed(error.friendlyMessage)
        }
    }

    /// The emojis or numbers are the same on both devices.
    func approve() async {
        guard let controller else { return }
        phase = .confirming
        do {
            try await controller.approveVerification()
        } catch {
            phase = .failed(error.friendlyMessage)
        }
    }

    /// The emojis or numbers differ.
    func decline() async {
        guard let controller else { return }
        do {
            try await controller.declineVerification()
            phase = .cancelled("You said the emojis do not match. Do not trust the other device.")
        } catch {
            phase = .failed(error.friendlyMessage)
        }
    }

    /// Closes the sheet, cancelling a running flow first.
    func dismiss() async {
        let running = phase
        phase = .idle
        guard running.isRunning, let controller else { return }
        if case .incoming(let request) = running {
            try? await controller.acknowledgeVerificationRequest(senderId: request.userId, flowId: request.flowId)
        }
        try? await controller.cancelVerification()
    }

    // MARK: Events

    private func handle(_ event: VerificationEvent) {
        // After the sheet was closed only a new request matters.
        if case .request = event {} else if phase == .idle { return }
        switch event {
        case .request(let request):
            // One flow at a time; a second request waits until the first is over.
            if !phase.isRunning { phase = .incoming(request) }
        case .accepted:
            phase = .starting
            Task { await startSas() }
        case .startedSas:
            if phase.isRunning, !isComparing { phase = .starting }
        case .emojis(let emojis):
            phase = .emojis(emojis)
        case .decimals(let values):
            phase = .decimals(values)
        case .finished:
            phase = .done
        case .failed:
            phase = .failed("The verification failed. Try again.")
        case .cancelled:
            let reason = controller?.sasCancelInfo()?.reason ?? controller?.requestCancelInfo()?.reason
            if phase.isRunning {
                phase = .cancelled(reason ?? "The verification was cancelled.")
            }
        }
    }

    private var isComparing: Bool {
        switch phase {
        case .emojis, .decimals, .confirming: return true
        default: return false
        }
    }

    private func startSas() async {
        guard let controller else { return }
        do {
            try await controller.startSasVerification()
        } catch {
            // The other side may have started the comparison already; its data arrives anyway.
            DiagLog.shared.write("verification: start sas: \(error.friendlyMessage)")
        }
    }
}
