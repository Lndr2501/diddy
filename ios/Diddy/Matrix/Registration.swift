import Foundation

/// Creates an account with user name and password on a server without its own sign-in page.
/// Runs the steps the server asks for (RegistrationLogic picks them): dummy and terms right away or
/// after a tap, a registration token or an email link through LoginView, anything else (reCAPTCHA)
/// on the server's own page in RegistrationWebView. When `step` is `.done`, LoginView signs in with
/// the same name and password through the SDK.
@MainActor
final class Registration: ObservableObject {
    enum Step: Equatable {
        case form
        case token
        case terms([RegistrationLogic.Policy])
        case email
        case waitingForEmail(String)
        case web(URL)
        /// The account exists; `userId` is what the server answered (nil: build it from the name).
        case done(userId: String?)
    }

    enum Availability: Equatable { case free, problem(String) }

    @Published private(set) var step: Step = .form
    @Published private(set) var busy = false
    @Published var error: String?
    @Published private(set) var availability: Availability?

    private var homeserver: URL?
    private var username = ""
    private var password = ""
    private var deviceName = "Diddy"
    private var session: String?
    private var flow: [String] = []
    private var completed: [String] = []
    private var pendingToken: String?
    private var emailAddress: String?
    private var emailSid: String?
    private var latestCheck = ""
    private let clientSecret = UUID().uuidString.replacingOccurrences(of: "-", with: "")

    /// Starts over on another server (or after "Change").
    func reset(homeserver: URL?) {
        self.homeserver = homeserver
        step = .form
        busy = false
        error = nil
        availability = nil
        session = nil
        flow = []
        completed = []
        pendingToken = nil
        emailAddress = nil
        emailSid = nil
    }

    // MARK: - Username check

    /// Asks the server whether the name is free. Call it shortly after typing stops.
    func checkAvailability(_ input: String) async {
        let name = RegistrationLogic.localpart(input)
        latestCheck = name
        guard !name.isEmpty else { availability = nil; return }
        if let problem = RegistrationLogic.usernameProblem(name) { availability = .problem(problem); return }
        guard let homeserver,
              var components = URLComponents(url: homeserver.appendingPathComponent("_matrix/client/v3/register/available"), resolvingAgainstBaseURL: false)
        else { return }
        components.queryItems = [URLQueryItem(name: "username", value: name)]
        guard let url = components.url,
              let answer = try? await URLSession.shared.data(from: url),
              let status = (answer.1 as? HTTPURLResponse)?.statusCode
        else { availability = nil; return }
        let data = answer.0
        // The answer of an older input must not replace that of the current one.
        guard latestCheck == name else { return }
        if status == 200 {
            availability = .free
        } else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let code = json?["errcode"] as? String
            // Servers that do not offer the check (or not to guests) answer with something else.
            if ["M_USER_IN_USE", "M_INVALID_USERNAME", "M_EXCLUSIVE"].contains(code ?? "") {
                availability = .problem(RegistrationLogic.message(errcode: code, error: json?["error"] as? String))
            } else {
                availability = nil
            }
        }
    }

    // MARK: - Steps

    /// The form was sent: asks the server which steps it wants and starts with the first.
    func start(username input: String, password: String, deviceName: String) async {
        let name = RegistrationLogic.localpart(input)
        if let problem = RegistrationLogic.usernameProblem(name) { error = problem; return }
        guard !password.isEmpty else { error = L("ios.registrationMore.chooseAPassword"); return }
        username = name
        self.password = password
        self.deviceName = deviceName
        session = nil
        flow = []
        completed = []
        await send(auth: nil)
    }

    func submitToken(_ token: String) async {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { error = L("ios.registrationMore.enterTheRegistrationToken"); return }
        pendingToken = trimmed
        await advance()
    }

    func acceptTerms() async {
        await send(auth: ["type": RegistrationLogic.terms])
    }

    /// Asks the server to send the confirmation link.
    func sendEmail(_ address: String) async {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.contains("@"), let homeserver else { error = L("ios.registrationMore.enterYourEmailAddress"); return }
        error = nil
        busy = true
        defer { busy = false }
        let body: [String: Any] = ["client_secret": clientSecret, "email": trimmed, "send_attempt": Int(Date().timeIntervalSince1970)]
        guard let answer = await post(homeserver, "_matrix/client/v3/register/email/requestToken", body) else { return }
        let (status, data) = answer
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard status == 200, let sid = json?["sid"] as? String else {
            error = RegistrationLogic.message(errcode: json?["errcode"] as? String, error: json?["error"] as? String)
            return
        }
        emailAddress = trimmed
        emailSid = sid
        step = .waitingForEmail(trimmed)
    }

    /// The user says the link in the email was opened.
    func confirmEmail() async {
        guard let emailSid else { step = .email; return }
        await send(auth: [
            "type": RegistrationLogic.email,
            "threepid_creds": ["sid": emailSid, "client_secret": clientSecret],
            "threepidCreds": ["sid": emailSid, "client_secret": clientSecret],
        ])
    }

    /// The server's page was completed (or closed): asks the server whether that step is done.
    func fallbackDone() async {
        await send(auth: [:])
    }

    // MARK: - Requests

    private func send(auth: [String: Any]?) async {
        guard let homeserver else { error = L("ios.registrationMore.chooseAServerFirst"); return }
        error = nil
        busy = true
        defer { busy = false }
        var authDict = auth
        if authDict != nil, let session { authDict?["session"] = session }
        let body = RegistrationLogic.registerBody(username: username, password: password, deviceName: deviceName, auth: authDict)
        guard let answer = await post(homeserver, "_matrix/client/v3/register", body) else { return }
        let (status, data) = answer
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if status == 200 {
            step = .done(userId: json?["user_id"] as? String)
            return
        }
        if status == 401, let challenge = RegistrationLogic.parseChallenge(data, language: Self.language) {
            session = challenge.session ?? session
            if flow.isEmpty || !challenge.flows.contains(flow) {
                guard let picked = RegistrationLogic.pickFlow(challenge.flows) else {
                    error = L("ios.registrationMore.thisServerDoesNotOfferAWayToCreateAnAccountHere")
                    step = .form
                    return
                }
                flow = picked
            }
            completed = challenge.completed
            // The step just sent was not accepted: say why and ask again.
            if auth != nil, let code = challenge.errcode {
                error = Self.stageError(code: code, message: challenge.error, step: step)
            }
            await advance(policies: challenge.policies, retry: auth != nil && challenge.errcode == nil)
            return
        }
        error = RegistrationLogic.message(errcode: json?["errcode"] as? String, error: json?["error"] as? String)
        step = .form
    }

    /// Shows or sends the next step of the chosen flow.
    private func advance(policies: [RegistrationLogic.Policy] = [], retry: Bool = false) async {
        guard let next = RegistrationLogic.nextStage(flow: flow, completed: completed) else {
            // Every step is done, yet no account: send once more with the session only.
            if !retry { await send(auth: [:]) } else { error = L("ios.registrationMore.theServerDidNotFinishTheRegistrationTryAgain"); step = .form }
            return
        }
        switch next {
        case RegistrationLogic.dummy:
            await send(auth: ["type": next])
        case RegistrationLogic.token, RegistrationLogic.tokenUnstable:
            if let token = pendingToken {
                pendingToken = nil
                await send(auth: ["type": next, "token": token])
            } else {
                step = .token
            }
        case RegistrationLogic.terms:
            if case .terms(let shown) = step, policies.isEmpty {
                step = .terms(shown)
            } else {
                step = .terms(policies)
            }
        case RegistrationLogic.email:
            if let emailAddress, emailSid != nil {
                step = .waitingForEmail(emailAddress)
            } else {
                step = .email
            }
        default:
            guard let homeserver, let session,
                  let url = RegistrationLogic.fallbackURL(homeserver: homeserver, stage: next, session: session)
            else {
                error = L("ios.registrationMore.theServerAskedForAStepDiddyCannotShow")
                step = .form
                return
            }
            if case .web = step, retry {
                error = L("ios.registrationMore.thatStepIsNotDoneYetOpenThePageAgainAndCompleteIt")
            }
            step = .web(url)
        }
    }

    private func post(_ homeserver: URL, _ path: String, _ body: [String: Any]) async -> (Int, Data)? {
        var request = URLRequest(url: homeserver.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
        } catch {
            self.error = "The server could not be reached: \(error.localizedDescription)"
            return nil
        }
    }

    private static func stageError(code: String, message: String?, step: Step) -> String {
        switch step {
        case .token: return L("ios.registrationMore.theServerDidNotAcceptThisToken")
        case .waitingForEmail: return L("ios.registrationMore.theEmailLinkHasNotBeenOpenedYet")
        default: return RegistrationLogic.message(errcode: code, error: message)
        }
    }

    private static var language: String {
        Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "en"
    }
}
