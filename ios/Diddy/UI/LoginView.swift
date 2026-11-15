import SwiftUI

struct LoginView: View {
    let isAddingAccount: Bool
    @EnvironmentObject private var app: AppModel
    @StateObject private var login = LoginService()
    @StateObject private var registration = Registration()
    @Environment(\.dismiss) private var dismiss
    /// "Create an account" instead of "Log in" (same server step, different second step).
    @State private var creating = false
    @State private var newUsername = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var token = ""
    @State private var email = ""
    @State private var webStep: WebStep?

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [Theme.accent.opacity(0.35), Theme.rail], startPoint: .topLeading, endPoint: .center)
                    .ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 22) {
                        Image("DiddyLogo").resizable().frame(width: 88, height: 88).padding(.top, 32)
                        VStack(spacing: 6) {
                            Text(title).font(.title.bold()).foregroundStyle(Theme.text)
                            Text(subtitle)
                                .multilineTextAlignment(.center)
                                .foregroundStyle(Theme.muted)
                        }
                        form
                        modeSwitch
                    }
                    .padding(24)
                    .frame(maxWidth: 480)
                    .frame(maxWidth: .infinity)
                }
            }
            .toolbar {
                if isAddingAccount {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { login.reset(); dismiss() }
                    }
                }
            }
            .sheet(item: $webStep) { step in
                RegistrationWebSheet(url: step.url) {
                    Task { await registration.fallbackDone() }
                }
            }
            .onChange(of: registration.step) { step in
                switch step {
                case .web(let url):
                    // Only the first time by itself; after that the button opens it again.
                    if registration.error == nil { webStep = WebStep(url: url) }
                case .done(let userId):
                    Task { await signInAfterRegistration(userId: userId) }
                default:
                    break
                }
            }
            .onChange(of: login.resolvedServer) { _ in
                registration.reset(homeserver: login.resolvedServerURL)
            }
        }
    }

    private var title: String {
        if creating { return "Create an Account" }
        return isAddingAccount ? "Add an Account" : "Welcome to Diddy"
    }

    private var subtitle: String {
        if creating { return "Pick a server, a name and a password. Your account lives on that server." }
        return isAddingAccount
            ? "Sign in on another homeserver. Your current account stays signed in."
            : "Sign in with your Matrix account."
    }

    @ViewBuilder
    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            field("HOMESERVER") {
                TextField("matrix.org", text: $login.homeserver)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(login.method != nil)
                    .submitLabel(.continue)
                    .onSubmit {
                        guard login.method == nil, !login.busy else { return }
                        Task { await login.discover() }
                    }
            }
            switch login.method {
            case nil:
                primaryButton("Continue") { await login.discover() }
            case .password?:
                serverLine
                if creating {
                    registrationForm
                } else {
                    passwordLogin
                }
            case .oauth?:
                serverLine
                Text(creating
                     ? "This server creates accounts on its own page. Diddy signs you in when you are done."
                     : "This server signs you in on its own page. Diddy never sees your password.")
                    .font(.footnote).foregroundStyle(Theme.muted)
                primaryButton(creating ? "Create Account" : "Continue to Sign In") {
                    if let result = await login.loginWithOAuth(create: creating) {
                        await app.add(record: result.0, client: result.1)
                        if isAddingAccount { dismiss() }
                    }
                }
            }
            if let error = login.error {
                Text(error).font(.footnote).foregroundStyle(Theme.danger)
            }
            if !app.restoreErrors.isEmpty && !isAddingAccount {
                Text("Some saved logins could not be restored:\n" + app.restoreErrors.joined(separator: "\n"))
                    .font(.caption).foregroundStyle(Theme.faint)
            }
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 16).fill(Theme.sidebar))
    }

    @ViewBuilder
    private var passwordLogin: some View {
        field("USERNAME") {
            TextField("@you:server", text: $login.username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        field("PASSWORD") {
            SecureField("Password", text: $login.password).textContentType(.password)
        }
        primaryButton("Log In") {
            if let result = await login.loginWithPassword() {
                await app.add(record: result.0, client: result.1)
                if isAddingAccount { dismiss() }
            }
        }
    }

    // MARK: - Create an account (server without its own page)

    @ViewBuilder
    private var registrationForm: some View {
        switch registration.step {
        case .form, .done:
            field("USERNAME") {
                TextField("name", text: $newUsername)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .task(id: newUsername) {
                // shortly after typing stops
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard !Task.isCancelled else { return }
                await registration.checkAvailability(newUsername)
            }
            if let availability = registration.availability {
                switch availability {
                case .free:
                    Label("This username is free.", systemImage: "checkmark.circle.fill")
                        .font(.footnote).foregroundStyle(Theme.online)
                case .problem(let text):
                    Text(text).font(.footnote).foregroundStyle(Theme.danger)
                }
            }
            field("PASSWORD") {
                SecureField("Password", text: $newPassword).textContentType(.newPassword)
            }
            field("CONFIRM PASSWORD") {
                SecureField("Password again", text: $confirmPassword).textContentType(.newPassword)
            }
            if !confirmPassword.isEmpty && confirmPassword != newPassword {
                Text("The passwords do not match.").font(.footnote).foregroundStyle(Theme.danger)
            }
            registrationButton("Create Account") {
                guard newPassword == confirmPassword else {
                    registration.error = "The passwords do not match."
                    return
                }
                await registration.start(username: newUsername, password: newPassword, deviceName: LoginService.registrationDeviceName)
            }
        case .token:
            Text("This server needs a registration token. You get it from whoever runs the server.")
                .font(.footnote).foregroundStyle(Theme.muted)
            field("REGISTRATION TOKEN") {
                TextField("Token", text: $token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            registrationButton("Continue") { await registration.submitToken(token) }
        case .terms(let policies):
            Text("Please read and accept the server's terms.")
                .font(.footnote).foregroundStyle(Theme.muted)
            ForEach(policies) { policy in
                Link(destination: policy.url) {
                    Label(policy.name, systemImage: "doc.text")
                }
                .font(.subheadline)
            }
            registrationButton("I Agree") { await registration.acceptTerms() }
        case .email:
            Text("This server confirms new accounts by email.")
                .font(.footnote).foregroundStyle(Theme.muted)
            field("EMAIL") {
                TextField("you@example.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            registrationButton("Send Link") { await registration.sendEmail(email) }
        case .waitingForEmail(let address):
            Text("We sent a link to \(address). Open it, then come back and tap Continue.")
                .font(.footnote).foregroundStyle(Theme.muted)
            registrationButton("Continue") { await registration.confirmEmail() }
            Button("Send the Email Again") { Task { await registration.sendEmail(address) } }
                .font(.footnote)
        case .web(let url):
            Text("The server asks for one more step on its own page.")
                .font(.footnote).foregroundStyle(Theme.muted)
            registrationButton("Open Page") { webStep = WebStep(url: url) }
        }
        if let error = registration.error {
            Text(error).font(.footnote).foregroundStyle(Theme.danger)
        }
        if registration.step != .form {
            Button("Start Over") { registration.reset(homeserver: login.resolvedServerURL) }
                .font(.footnote)
        }
    }

    private func signInAfterRegistration(userId: String?) async {
        let name = RegistrationLogic.localpart(newUsername)
        if let result = await login.loginAfterRegistration(userId: userId, username: name, password: newPassword) {
            newPassword = ""
            confirmPassword = ""
            await app.add(record: result.0, client: result.1)
            if isAddingAccount { dismiss() }
        } else {
            // The account exists; signing in can be tried again with the normal form.
            creating = false
            login.username = userId ?? name
        }
    }

    private var modeSwitch: some View {
        Button {
            creating.toggle()
            login.error = nil
            registration.reset(homeserver: login.resolvedServerURL)
        } label: {
            Text(creating ? LocalizedStringKey("Already have an account? **Log in**") : LocalizedStringKey("New here? **Create an account**"))
                .font(.subheadline)
                .foregroundStyle(Theme.text)
        }
        .buttonStyle(.plain)
        .disabled(login.busy || registration.busy)
    }

    // MARK: - Pieces

    private var serverLine: some View {
        HStack {
            Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.online)
            Text(login.resolvedServer ?? login.homeserver).font(.footnote).foregroundStyle(Theme.muted).lineLimit(1)
            Spacer()
            Button("Change") {
                login.reset()
                registration.reset(homeserver: nil)
            }
            .font(.footnote)
        }
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.weight(.bold)).foregroundStyle(Theme.muted)
            content()
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 8).fill(Theme.rail))
        }
    }

    private func primaryButton(_ title: String, action: @escaping () async -> Void) -> some View {
        filledButton(title, busy: login.busy, action: action)
    }

    private func registrationButton(_ title: String, action: @escaping () async -> Void) -> some View {
        filledButton(title, busy: registration.busy || login.busy, action: action)
    }

    private func filledButton(_ title: String, busy: Bool, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack {
                if busy { ProgressView().tint(Theme.onAccent) }
                Text(title).bold()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.accent))
            .foregroundStyle(Theme.onAccent)
        }
        .disabled(busy)
    }
}

/// The server's page of a registration step, shown in a sheet.
private struct WebStep: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
