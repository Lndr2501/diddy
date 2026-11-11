import SwiftUI

/// Uses the profile editor's merge path so changing status preserves other profile fields.
struct OwnStatusMenu: View {
    @ObservedObject var account: MatrixAccount
    @State private var showing = false
    @State private var showingMessage = false
    @State private var busy = false
    @State private var error: String?
    private var chosen: String? { account.diddyProfiles[account.userId]?.status?.rawValue }

    var body: some View {
        Menu {
            ForEach(OwnStatusOptions.all, id: \.status) { option in
                Button { save(option.status) } label: {
                    Label(option.label, systemImage: chosen == option.status ? "checkmark.circle.fill" : "circle")
                }
            }
            Button("Status message") { showingMessage = true }
            Button("Edit Profile and Bio") { showing = true }
        } label: {
            AvatarView(url: account.avatarUrl, name: account.title, size: 34, account: account)
                .overlay(alignment: .bottomTrailing) { PresenceDot(userId: account.userId, account: account, size: 11) }
        }
        .disabled(busy)
        .accessibilityLabel("Account and status (\(OwnStatusOptions.info(chosen).label))")
        .sheet(isPresented: $showing) { DiddyProfileEditor(account: account) }
        .sheet(isPresented: $showingMessage) { OwnStatusMessageView(account: account) }
        .alert("Could not save status", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
    }

    private func save(_ status: String) {
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do {
                try await account.updateDiddyProfile(build: { raw in
                    let original = DiddyProfileDraft(raw: raw)
                    var edited = original
                    edited.status = status
                    return edited.apply(to: raw, since: original)
                })
                await PresenceStore.of(account).ownStatusChanged()
            } catch { self.error = error.friendlyMessage }
        }
    }
}

struct ShellSyncBanner: View {
    @ObservedObject var account: MatrixAccount
    @State private var everRan = false
    @State private var retrying = false
    private var kind: SyncBannerKind? {
        SyncBannerLogic.banner(state: String(describing: account.syncState), started: account.started, everRan: everRan)
    }
    var body: some View {
        Group {
            if let kind {
                HStack {
                    Label(kind.text, systemImage: "wifi.exclamationmark")
                    if kind == .error {
                        Button("Retry") {
                            retrying = true
                            Task { await account.resume(); retrying = false }
                        }.disabled(retrying)
                    }
                }
                .font(.footnote).foregroundStyle(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 5).background(Theme.danger)
            }
        }
        .onAppear { if account.syncState == .running { everRan = true } }
        .onChange(of: account.syncState) { if $0 == .running { everRan = true } }
    }
}

/// The same introductory explanations as desktop; also reachable from Settings.
struct WelcomeGuideView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    var onFinish: (() -> Void)? = nil
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(IntroSteps.all[index].title).font(.largeTitle.bold())
                    Text(IntroSteps.all[index].lead).font(.headline)
                    ForEach(Array(IntroSteps.all[index].points.enumerated()), id: \.offset) { _, point in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(point.label).font(.headline)
                            Text(point.text)
                        }
                    }
                    HStack {
                        if index > 0 { Button("Back") { index -= 1 } }
                        Spacer()
                        Text("\(index + 1) / \(IntroSteps.all.count)").font(.caption)
                        Button(index == IntroSteps.all.count - 1 ? "Done" : "Next") {
                            if index == IntroSteps.all.count - 1 { finish() } else { index += 1 }
                        }.buttonStyle(.borderedProminent)
                    }
                }.padding()
            }
            .navigationTitle("Welcome guide").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Skip") { finish() }.keyboardShortcut(.cancelAction) } }
        }
    }
    private func finish() { onFinish?(); dismiss() }
}

struct ShellUpdateNotice: View {
    @AppStorage("diddy.ios.skippedUpdate") private var skipped = ""
    @State private var release: UpdateRelease?
    var body: some View {
        Group {
            if let release, UpdateCheckLogic.isUpdateWanted(latest: release.version,
                current: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0", skipped: skipped) {
                HStack {
                    if let url = URL(string: release.ipaUrl ?? release.pageUrl) { Link("Diddy \(release.version) available", destination: url) }
                    Spacer()
                    Button { skipped = release.version } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Dismiss update notice")
                }.font(.footnote).padding(8).background(Theme.elevated)
            }
        }
        .task {
            guard let url = URL(string: UpdateCheckLogic.releasesApiUrl) else { return }
            var request = URLRequest(url: url, timeoutInterval: 15)
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                guard (response as? HTTPURLResponse)?.statusCode == 200, !Task.isCancelled else { return }
                release = UpdateCheckLogic.newest(in: try JSONSerialization.jsonObject(with: data))
            } catch { /* An unavailable update service must not interrupt chat. */ }
        }
    }
}

/// Diddy's short profile text is the bio field (160 characters), shared through the profile room.
private struct OwnStatusMessageView: View {
    @ObservedObject var account: MatrixAccount
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var saving = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                TextField("Status message", text: $text, axis: .vertical)
                    .onChange(of: text) { text = String($0.prefix(DiddyProfileRules.maxBio)) }
                Text("Shown as your profile bio to other Diddy users.").font(.footnote)
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle("Status message")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saving = true
                        Task { @MainActor in
                            defer { saving = false }
                            do {
                                try await account.updateDiddyProfile(build: { raw in
                                    let original = DiddyProfileDraft(raw: raw)
                                    var edited = original
                                    edited.bio = text
                                    return edited.apply(to: raw, since: original)
                                })
                                dismiss()
                            } catch { self.error = error.friendlyMessage }
                        }
                    }.disabled(saving)
                }
            }
        }
        .task { text = DiddyProfileDraft(raw: account.diddyOwnProfileRaw ?? [:]).bio }
    }
}
