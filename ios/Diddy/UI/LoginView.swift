import SwiftUI

struct LoginView: View {
    let isAddingAccount: Bool
    @EnvironmentObject private var app: AppModel
    @StateObject private var login = LoginService()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [Theme.accent.opacity(0.35), Theme.rail], startPoint: .topLeading, endPoint: .center)
                    .ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 22) {
                        Image("DiddyLogo").resizable().frame(width: 88, height: 88).padding(.top, 32)
                        VStack(spacing: 6) {
                            Text(isAddingAccount ? "Add an account" : "Welcome to Diddy").font(.title.bold()).foregroundStyle(Theme.text)
                            Text(isAddingAccount
                                 ? "Sign in on another homeserver. Your current account stays signed in."
                                 : "Sign in with your Matrix account.")
                                .multilineTextAlignment(.center)
                                .foregroundStyle(Theme.muted)
                        }
                        form
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
        }
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
            }
            switch login.method {
            case nil:
                primaryButton("Continue") { await login.discover() }
            case .password?:
                serverLine
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
            case .oauth?:
                serverLine
                Text("This server signs you in on its own page. Diddy never sees your password.")
                    .font(.footnote).foregroundStyle(Theme.muted)
                primaryButton("Continue to sign in") {
                    if let result = await login.loginWithOAuth() {
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

    private var serverLine: some View {
        HStack {
            Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.online)
            Text(login.resolvedServer ?? login.homeserver).font(.footnote).foregroundStyle(Theme.muted).lineLimit(1)
            Spacer()
            Button("Change") { login.reset() }.font(.footnote)
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
        Button {
            Task { await action() }
        } label: {
            HStack {
                if login.busy { ProgressView().tint(.white) }
                Text(title).bold()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.accent))
            .foregroundStyle(.white)
        }
        .disabled(login.busy)
    }
}
