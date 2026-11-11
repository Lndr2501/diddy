import Foundation
import MatrixRustSDK

/// Link previews from the homeserver (`/_matrix/client/v1/media/preview_url`, which the SDK asks
/// with the account's access token), like the desktop's `mx.getUrlPreview`. Answers are kept per
/// account and link, so scrolling a chat does not ask the server again. A failed request (no
/// connection, a server that has no previews) is not kept: the next time the message shows it asks again.
actor LinkPreviewStore {
    static let shared = LinkPreviewStore()

    private enum Outcome {
        case found(LinkPreviewData)
        /// The server answered, but has nothing to show for this link.
        case empty
        case failed
    }

    private var answers: [String: Outcome] = [:]
    private var inFlight: [String: Task<Outcome, Never>] = [:]
    private static let maxAnswers = 300

    /// Nil when there is nothing to show for the link.
    func preview(for url: String, accountId: String, client: Client) async -> LinkPreviewData? {
        let key = "\(accountId)|\(url)"
        let outcome: Outcome
        if let known = answers[key] {
            outcome = known
        } else if let running = inFlight[key] {
            outcome = await running.value
        } else {
            let task = Task<Outcome, Never> {
                do {
                    // `ts` is deprecated since Matrix 1.11 and left out.
                    guard let json = try await client.getUrlPreview(url: url, ts: nil) else { return Outcome.empty }
                    if let data = LinkPreviewData(json: json) { return Outcome.found(data) }
                    return Outcome.empty
                } catch {
                    return Outcome.failed
                }
            }
            inFlight[key] = task
            outcome = await task.value
            inFlight[key] = nil
            if case .failed = outcome {
                // Not kept.
            } else {
                if answers.count >= Self.maxAnswers { answers.removeAll() }
                answers[key] = outcome
            }
        }
        if case .found(let data) = outcome { return data }
        return nil
    }
}
