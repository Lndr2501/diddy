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
                    Text(error).font(.footnote).foregroundStyle(Theme.danger)
                    Button(L("ios.settings.tryAgain")) { Task { await load() } }
                } else if !loading && emails.isEmpty {
                    Text(L("ios.remainingUI.noEmailAddress")).foregroundStyle(Theme.muted)
                }
                ForEach(emails, id: \.self) { email in
                    Text(email).foregroundStyle(Theme.text).textSelection(.enabled)
                }
            } header: {
                Text(L("settings.contactInfo.emailAddress"))
            } footer: {
                Text(L("ios.remainingUI.emailAddressAttachedToYourAccountChangeItOnYourServerSAcco"))
            }
        }
        .overlay { if loading && emails.isEmpty { ProgressView() } }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("settings.contactInfo.contactInformation"))
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
                Toggle(L("settings.developTools.enableDeveloperTools"), isOn: $enabled)
            } footer: {
                Text(L("ios.remainingUI.forDebuggingYourAccessTokenAndTheRawAccountDataOfYourAccou"))
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
                        Button(L("settings.diddyProfile.hide")) { self.token = nil; copied = false }
                    } else {
                        Button(L("ios.remainingUI.revealAccessToken")) { askToken = true }
                    }
                } header: {
                    Text(L("settings.developTools.accessToken"))
                } footer: {
                    Text(L("ios.remainingUI.anyoneWithThisTokenHasFullAccessToYourAccountIncludingYour"))
                }
                Section {
                    ForEach(AccountInfo.knownAccountDataTypes, id: \.self) { type in
                        NavigationLink(type) { AccountDataView(account: account, type: type) }
                    }
                } header: {
                    Text(L("settings.accountData.accountData"))
                } footer: {
                    Text(L("settings.accountData.dataStoredInYour"))
                }
                Section {
                    TextField(L("ios.remainingUI.eventType"), text: $typeName)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    NavigationLink(L("ios.remainingUI.lookUp")) { AccountDataView(account: account, type: typeName.trimmingCharacters(in: .whitespaces)) }
                        .disabled(typeName.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text(L("ios.remainingUI.otherType"))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("settings.page.developerTools"))
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { token = nil; copied = false }
        .onChange(of: enabled) { isOn in if !isOn { token = nil } }
        .confirmationDialog(L("ios.remainingUI.showYourAccessToken"), isPresented: $askToken, titleVisibility: .visible) {
            Button(L("ios.remainingUI.showToken"), role: .destructive) { token = account.accessTokenForDeveloper() }
        } message: {
            Text(L("ios.remainingUI.anyoneWhoSeesItCanUseYourAccountMakeSureNobodyIsLookingAtY"))
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
                    Text(L("ios.remainingUI.noDataOfThisType")).foregroundStyle(Theme.muted)
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
