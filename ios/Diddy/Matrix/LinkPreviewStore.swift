import Foundation
import MatrixRustSDK
import UIKit

/// Link cards like the desktop's `UrlPreviewCard` (#197):
/// - chats without encryption ask the homeserver (`/_matrix/client/v1/media/preview_url`, which
///   the SDK asks with the account's access token); when it has nothing, the app reads the page;
/// - encrypted chats never send the link to the homeserver, the app reads the page itself.
/// Answers are kept per account and link, so scrolling a chat does not ask again. A failed request
/// (no connection) is not kept: the next time the message shows it asks again.
actor LinkPreviewStore {
    static let shared = LinkPreviewStore()

    private enum Outcome {
        case found(LinkPreviewData)
        /// The answer came, but there is nothing to show for this link.
        case empty
        case failed
    }

    private var answers: [String: Outcome] = [:]
    private var inFlight: [String: Task<Outcome, Never>] = [:]
    private static let maxAnswers = 300

    /// Nil when there is nothing to show for the link.
    func preview(for url: String, accountId: String, client: Client, encrypted: Bool = false) async -> LinkPreviewData? {
        let key = "\(accountId)|\(encrypted ? "local" : "server")|\(url)"
        let outcome: Outcome
        if let known = answers[key] {
            outcome = known
        } else if let running = inFlight[key] {
            outcome = await running.value
        } else {
            let task = Task<Outcome, Never> {
                if !encrypted {
                    // `ts` is deprecated since Matrix 1.11 and left out.
                    if let json = try? await client.getUrlPreview(url: url, ts: nil),
                       let data = LinkPreviewData(json: json) {
                        return Outcome.found(data)
                    }
                }
                return await LinkPageFetcher.meta(for: url)
                    .map { $0.map(Outcome.found) ?? Outcome.empty } ?? Outcome.failed
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

/// The app's own reading of web pages and pictures behind chat links, with the same limits as the
/// desktop shells (`link_preview.rs`, `linkPreview.cjs`): only public hosts, also after redirects;
/// pages only as HTML and at most 1 MB, pictures at most 8 MB.
enum LinkPageFetcher {
    private static let maxPageBytes = 1024 * 1024
    private static let maxImageBytes = 8 * 1024 * 1024

    private final class RedirectGuard: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            let allowed = request.url.map { LinkEmbedRules.isFetchable($0.absoluteString) } ?? false
            completionHandler(allowed ? request : nil)
        }
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 20
        config.httpAdditionalHeaders = [
            // Many sites only put OpenGraph tags into pages for known link crawlers.
            "User-Agent": "Mozilla/5.0 (compatible; Diddy/1.0; +https://github.com/Lndr2501/diddy) facebookexternalhit/1.1",
        ]
        return URLSession(configuration: config, delegate: RedirectGuard(), delegateQueue: nil)
    }()

    /// `nil` when the page could not be read, `.some(nil)` when it has nothing for a card.
    static func meta(for url: String) async -> LinkPreviewData?? {
        guard LinkEmbedRules.isFetchable(url), let target = URL(string: url) else { return .some(nil) }
        var request = URLRequest(url: target)
        request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await limitedData(for: request, limit: maxPageBytes),
              let http = response as? HTTPURLResponse else { return nil }
        guard (200..<300).contains(http.statusCode),
              (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased().contains("html") else { return .some(nil) }
        let html = String(decoding: data, as: UTF8.self)
        return .some(LinkPageMeta.parse(html: html, pageURL: http.url?.absoluteString ?? url))
    }

    /// A picture from the web (a picture link or a card's picture).
    static func image(for url: String) async -> UIImage? {
        guard LinkEmbedRules.isFetchable(url), let target = URL(string: url),
              let (data, response) = try? await session.data(for: URLRequest(url: target)),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              data.count <= maxImageBytes else { return nil }
        return UIImage(data: data)
    }

    /// The start of a page: the head with the OpenGraph tags is at the top.
    private static func limitedData(for request: URLRequest, limit: Int) async throws -> (Data, URLResponse) {
        let (bytes, response) = try await session.bytes(for: request)
        var data = Data()
        data.reserveCapacity(min(Int(max(response.expectedContentLength, 0)), limit))
        for try await byte in bytes {
            data.append(byte)
            if data.count >= limit { break }
        }
        return (data, response)
    }
}
