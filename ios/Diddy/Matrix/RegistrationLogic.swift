import Foundation

/// Creating an account with user name and password (`POST /_matrix/client/v3/register` with
/// user-interactive authentication). Pure logic without network or UI, checked by
/// Tools/registration_check. Registration.swift runs the requests, LoginView shows the steps.
///
/// Servers with their own sign-in page (OAuth, e.g. matrix.org) do not get here: the app opens
/// their page in "create account" mode instead (LoginService.loginWithOAuth).
enum RegistrationLogic {
    static let dummy = "m.login.dummy"
    static let token = "m.login.registration_token"
    static let tokenUnstable = "org.matrix.msc3231.login.registration_token"
    static let terms = "m.login.terms"
    static let email = "m.login.email.identity"
    static let recaptcha = "m.login.recaptcha"

    /// One document of the server's terms, in the user's language where offered.
    struct Policy: Equatable, Identifiable {
        let id: String
        let name: String
        let url: URL
    }

    /// The server's 401 answer: the ways to register and how far this session got.
    struct Challenge: Equatable {
        var session: String?
        var flows: [[String]]
        var completed: [String]
        var policies: [Policy]
        /// Set when the last step was not accepted (wrong token, email not confirmed yet).
        var errcode: String?
        var error: String?
    }

    /// Reads a 401 answer of /register. Nil when it is no user-interactive challenge.
    static func parseChallenge(_ data: Data, language: String = "en") -> Challenge? {
        guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let rawFlows = json["flows"] as? [[String: Any]]
        else { return nil }
        let flows = rawFlows.compactMap { $0["stages"] as? [String] }
        let params = json["params"] as? [String: Any] ?? [:]
        return Challenge(
            session: json["session"] as? String,
            flows: flows,
            completed: json["completed"] as? [String] ?? [],
            policies: policies(from: params, language: language),
            errcode: json["errcode"] as? String,
            error: json["error"] as? String
        )
    }

    /// The flow to follow: without email when the server allows that (one step less for the
    /// user), then the one with the fewest steps.
    static func pickFlow(_ flows: [[String]]) -> [String]? {
        flows.enumerated().min { a, b in
            let aMail = a.element.contains(email), bMail = b.element.contains(email)
            if aMail != bMail { return !aMail }
            if a.element.count != b.element.count { return a.element.count < b.element.count }
            return a.offset < b.offset
        }?.element
    }

    /// The first step of `flow` the server has not marked as done.
    static func nextStage(flow: [String], completed: [String]) -> String? {
        flow.first { !completed.contains($0) }
    }

    /// Whether the app shows `stage` itself. Everything else (reCAPTCHA, unknown steps) runs on the
    /// server's own fallback page.
    static func isNative(_ stage: String) -> Bool {
        [dummy, token, tokenUnstable, terms, email].contains(stage)
    }

    /// `params["m.login.terms"].policies`: `{ id: { version, en: { name, url }, de: { … } } }`.
    static func policies(from params: [String: Any], language: String) -> [Policy] {
        guard let termsParams = params[Self.terms] as? [String: Any],
              let all = termsParams["policies"] as? [String: Any]
        else { return [] }
        return all.keys.sorted().compactMap { id in
            guard let policy = all[id] as? [String: Any] else { return nil }
            let translations = policy.compactMapValues { $0 as? [String: Any] }
            let chosen = translations[language] ?? translations["en"]
                ?? translations.keys.sorted().first.flatMap { translations[$0] }
            guard let chosen, let link = chosen["url"] as? String, let url = URL(string: link),
                  url.scheme == "https" || url.scheme == "http"
            else { return nil }
            let name = (chosen["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? id
            return Policy(id: id, name: name, url: url)
        }
    }

    /// The server's page for one step of a session (Matrix spec: "Fallback" of user-interactive auth).
    static func fallbackURL(homeserver: URL, stage: String, session: String) -> URL? {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove("/")
        guard let step = stage.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        let base = homeserver.absoluteString.hasSuffix("/") ? String(homeserver.absoluteString.dropLast()) : homeserver.absoluteString
        var components = URLComponents(string: "\(base)/_matrix/client/v3/auth/\(step)/fallback/web")
        components?.queryItems = [URLQueryItem(name: "session", value: session)]
        return components?.url
    }

    /// What goes into the user name field may be "@bob:server" or "Bob": the server only takes the
    /// local part, in lowercase.
    static func localpart(_ input: String) -> String {
        var name = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.hasPrefix("@") { name.removeFirst() }
        if let colon = name.firstIndex(of: ":") { name = String(name[..<colon]) }
        return name.lowercased()
    }

    /// Nil when the server could accept the name (spec: a-z, 0-9, and . _ = - /).
    static func usernameProblem(_ localpart: String) -> String? {
        if localpart.isEmpty { return "Choose a username." }
        let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789._=-/")
        if !localpart.allSatisfy({ allowed.contains($0) }) {
            return "Use only letters, numbers and . _ = - /"
        }
        return nil
    }

    /// The request body. `auth` is nil for the first request, which only asks for the steps.
    static func registerBody(username: String, password: String, deviceName: String, auth: [String: Any]?) -> [String: Any] {
        var body: [String: Any] = [
            "username": username,
            "password": password,
            "initial_device_display_name": deviceName,
            // The app signs in through the SDK afterwards, which sets up encryption and the store.
            "inhibit_login": true,
        ]
        if let auth { body["auth"] = auth }
        return body
    }

    /// A sentence for an error answer of /register or /register/available.
    static func message(errcode: String?, error: String?) -> String {
        switch errcode {
        case "M_USER_IN_USE": return "This username is already taken."
        case "M_INVALID_USERNAME": return "This username is not allowed. Use only letters, numbers and . _ = - /"
        case "M_EXCLUSIVE": return "This username is reserved."
        case "M_WEAK_PASSWORD": return error.map { "Choose a stronger password: \($0)" } ?? "Choose a stronger password."
        case "M_PASSWORD_TOO_SHORT": return "Choose a longer password."
        case "M_FORBIDDEN": return error ?? "This server does not accept new accounts. Try another server."
        case "M_LIMIT_EXCEEDED": return "Too many attempts. Wait a moment, then try again."
        case "M_THREEPID_IN_USE": return "This email address already belongs to an account."
        case "M_THREEPID_DENIED": return "This server does not accept this email address."
        default: return error ?? "The server could not create the account."
        }
    }
}
