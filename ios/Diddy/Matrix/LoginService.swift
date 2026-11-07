import AuthenticationServices
import Foundation
import MatrixRustSDK
import UIKit

/// Signs in to a homeserver. Each login gets a fresh AccountRecord (and therefore its own data
/// store), so adding a second server never touches an existing account.
@MainActor
final class LoginService: ObservableObject {
    enum Method { case password, oauth }

    @Published var homeserver = "matrix.org" { didSet { clearStaleError(homeserver != oldValue) } }
    @Published var username = "" { didSet { clearStaleError(username != oldValue) } }
    @Published var password = "" { didSet { clearStaleError(password != oldValue) } }
    @Published private(set) var method: Method?
    @Published private(set) var resolvedServer: String?
    @Published private(set) var busy = false
    @Published var error: String?

    private var record: AccountRecord?
    private var client: Client?
    private var webSession: ASWebAuthenticationSession?
    private let anchor = WebAuthAnchor()

    /// OAuth (MAS) client metadata. Native clients must use a private-use scheme that is the
    /// reversed host of `clientUri`.
    private static let oauthConfiguration = OAuthConfiguration(
        clientName: "Diddy",
        redirectUri: "io.github.lndr2501:/oauth/callback",
        clientUri: "https://lndr2501.github.io/diddy",
        logoUri: nil,
        tosUri: nil,
        policyUri: nil,
        staticRegistrations: [:]
    )

    /// An error stays up only until you start correcting it.
    private func clearStaleError(_ changed: Bool) {
        if changed && !busy { error = nil }
    }

    func reset() {
        record?.removeDirectories()
        record = nil
        client = nil
        method = nil
        resolvedServer = nil
        error = nil
    }

    /// Step 1: find the homeserver (server name or URL, .well-known is followed) and its login types.
    func discover() async {
        error = nil
        busy = true
        defer { busy = false }
        let input = homeserver.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { error = "Enter a homeserver."; return }
        if let problem = Self.insecureServerProblem(input) { error = problem; return }
        record?.removeDirectories()
        let fresh = AccountRecord(id: UUID().uuidString.lowercased(), userId: "", homeserver: input, displayName: nil)
        do {
            let client = try await ClientFactory.builder(for: fresh)
                .serverNameOrHomeserverUrl(serverNameOrUrl: input)
                .build()
            let details = await client.homeserverLoginDetails()
            // .well-known may point somewhere else; that address has to be HTTPS as well.
            if let problem = Self.insecureServerProblem(details.url()) {
                fresh.removeDirectories()
                error = problem
                return
            }
            self.record = fresh
            self.client = client
            self.resolvedServer = details.url()
            if details.supportsOauthLogin() {
                method = .oauth
            } else if details.supportsPasswordLogin() {
                method = .password
            } else {
                error = "This server only offers login types Diddy does not support yet (SSO without OAuth)."
            }
        } catch {
            fresh.removeDirectories()
            self.error = Self.describe(error, server: input)
        }
    }

    /// Step 2a: user name and password.
    func loginWithPassword() async -> (AccountRecord, Client)? {
        guard let client, var record else { return nil }
        guard !username.trimmingCharacters(in: .whitespaces).isEmpty, !password.isEmpty else {
            error = "Enter your username and password."
            return nil
        }
        error = nil
        busy = true
        defer { busy = false }
        do {
            try await client.login(
                username: username.trimmingCharacters(in: .whitespaces),
                password: password,
                initialDeviceName: Self.deviceName,
                deviceId: nil
            )
            password = ""
            return try finish(client: client, record: &record)
        } catch {
            self.error = error.friendlyMessage
            return nil
        }
    }

    /// Step 2b: the homeserver's own login page (Matrix Authentication Service).
    func loginWithOAuth() async -> (AccountRecord, Client)? {
        guard let client, var record else { return nil }
        error = nil
        busy = true
        defer { busy = false }
        do {
            let data = try await client.urlForOauth(
                oauthConfiguration: Self.oauthConfiguration,
                prompt: nil,
                loginHint: nil,
                deviceId: nil,
                additionalScopes: nil
            )
            guard let url = URL(string: data.loginUrl()) else { throw DiddyError("The server sent an invalid login URL.") }
            let callback: URL
            do {
                callback = try await authenticate(url: url, scheme: "io.github.lndr2501")
            } catch {
                await client.abortOauthAuth(authorizationData: data)
                throw error
            }
            try await client.loginWithOauthCallback(callbackUrl: callback.absoluteString)
            return try finish(client: client, record: &record)
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return nil
        } catch {
            self.error = error.friendlyMessage
            return nil
        }
    }

    private func finish(client: Client, record: inout AccountRecord) throws -> (AccountRecord, Client) {
        let session = try client.session()
        record.userId = session.userId
        record.homeserver = session.homeserverUrl
        try SessionStore.save(session, accountId: record.id)
        let result = (record, client)
        self.record = nil
        self.client = nil
        self.method = nil
        return result
    }

    private func authenticate(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else {
                    continuation.resume(throwing: error ?? DiddyError("Login was cancelled."))
                }
            }
            session.presentationContextProvider = anchor
            session.prefersEphemeralWebBrowserSession = false
            webSession = session
            if !session.start() {
                continuation.resume(throwing: DiddyError("The login page could not be opened."))
            }
        }
    }

    private static var deviceName: String {
        "Diddy \(UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone")"
    }

    /// Access tokens and passwords only go over HTTPS. A bare server name ("matrix.org") is fine:
    /// the SDK resolves it to https://. Any other scheme is refused with a message for the login
    /// screen. Debug builds (Xcode, Simulator) also accept http://localhost, http://127.0.0.1 and
    /// http://[::1] for a homeserver on the developer's machine; Release builds, including every
    /// CI/IPA build, never do.
    static func insecureServerProblem(_ input: String) -> String? {
        let lowered = input.lowercased()
        guard lowered.contains("://") else { return nil }
        if lowered.hasPrefix("https://") { return nil }
        #if DEBUG
        if lowered.hasPrefix("http://"), let host = URL(string: input)?.host?.lowercased(),
           ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host) {
            return nil
        }
        #endif
        if lowered.hasPrefix("http://") {
            return "Diddy only connects over HTTPS. Enter the server name (like matrix.org) or an https:// address."
        }
        return "Enter the server name (like matrix.org) or an https:// address."
    }

    private static func describe(_ error: Error, server: String) -> String {
        let text = error.friendlyMessage
        if text.localizedCaseInsensitiveContains("sliding sync") {
            return "\(server) does not support Simplified Sliding Sync (MSC4186), which the iOS app needs. Synapse 1.114+ and Continuwuity have it."
        }
        return text
    }
}

final class WebAuthAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
