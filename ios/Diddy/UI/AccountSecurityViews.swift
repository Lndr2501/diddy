import SwiftUI

/// The email addresses attached to your account (desktop: Account > Contact Information).
/// Read only, like on the desktop.
struct ContactInfoView: View {
    @ObservedObject var account: MatrixAccount
    @State private var emails: [String] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            Section {
                if let error {
                    Text(error).foregroundStyle(Theme.danger)
                } else if !loading && emails.isEmpty {
                    Text("No email address").foregroundStyle(Theme.muted)
                }
                ForEach(emails, id: \.self) { email in
                    Text(email).foregroundStyle(Theme.text).textSelection(.enabled)
                }
            } header: {
                Text("Email Address")
            } footer: {
                Text("Email address attached to your account. Change it on your server's account page.")
            }
        }
        .overlay { if loading { ProgressView() } }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Contact Information")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        defer { loading = false }
        do {
            emails = try await account.emailAddresses()
            error = nil
        } catch {
            self.error = error.friendlyMessage
        }
    }
}

/// Developer tools like the desktop's: your global account data and the access token.
struct DeveloperToolsView: View {
    @ObservedObject var account: MatrixAccount
    @AppStorage("diddy.developerTools") private var enabled = false
    @State private var typeName = ""
    @State private var askToken = false
    @State private var token: String?
    @State private var copied = false

    var body: some View {
        List {
            Section {
                Toggle("Enable Developer Tools", isOn: $enabled)
            }
            if enabled {
                Section {
                    if let token {
                        Text(token)
                            .font(.system(.footnote, design: .monospaced))
                            .foregroundStyle(Theme.text)
                            .textSelection(.enabled)
                        Button(copied ? "Copied" : "Copy") {
                            // Only on this device, and gone from the clipboard after one minute.
                            UIPasteboard.general.setItems(
                                [["public.utf8-plain-text": token]],
                                options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(60)]
                            )
                            copied = true
                        }
                        Button("Hide") { self.token = nil; copied = false }
                    } else {
                        Button("Reveal Access Token…") { askToken = true }
                    }
                } header: {
                    Text("Access Token")
                } footer: {
                    Text("Anyone with this token has full access to your account, including your messages. Never share it.")
                }
                Section {
                    ForEach(AccountInfo.knownAccountDataTypes, id: \.self) { type in
                        NavigationLink(type) { AccountDataView(account: account, type: type) }
                    }
                } header: {
                    Text("Account Data")
                } footer: {
                    Text("Data stored in your global account data.")
                }
                Section {
                    TextField("Event type", text: $typeName)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    NavigationLink("Look up") { AccountDataView(account: account, type: typeName.trimmingCharacters(in: .whitespaces)) }
                        .disabled(typeName.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text("Other Type")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Developer Tools")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { token = nil; copied = false }
        .onChange(of: enabled) { isOn in if !isOn { token = nil } }
        .confirmationDialog("Show your access token?", isPresented: $askToken, titleVisibility: .visible) {
            Button("Show Token", role: .destructive) { token = account.accessTokenForDeveloper() }
        } message: {
            Text("Anyone who sees it can use your account. Make sure nobody is looking at your screen.")
        }
    }
}

/// One global account data event as pretty JSON.
struct AccountDataView: View {
    @ObservedObject var account: MatrixAccount
    let type: String
    @State private var text: String?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if let error {
                    Text(error).foregroundStyle(Theme.danger)
                } else if let text {
                    Text(text)
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundStyle(Theme.text)
                        .textSelection(.enabled)
                } else if !loading {
                    Text("No data of this type.").foregroundStyle(Theme.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .overlay { if loading { ProgressView() } }
        .background(Theme.sidebar)
        .navigationTitle(type)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        do {
            if let content = try await account.globalAccountData(type: type) {
                text = AccountInfo.prettyJSON(content)
            } else {
                text = nil
            }
            error = nil
        } catch {
            self.error = error.friendlyMessage
        }
    }
}
