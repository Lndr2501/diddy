import SwiftUI
import UIKit

/// Settings > Notifications, like desktop's Notifications page: system notifications and their
/// sound on this device, then the account's push rules (All Messages, Mentions, Keywords) with
/// the same Sound / Silent / Off levels, and email notifications.
struct NotificationSettingsView: View {
    @ObservedObject var account: MatrixAccount
    @AppStorage(LocalNotifications.settingKey) private var backgroundNotifications = false
    @AppStorage(SoundSetting.messages.rawValue) private var notificationSound = true
    @State private var notificationsDenied = false
    @State private var rules: [String: Any] = [:]
    @State private var loaded = false
    @State private var busy: Set<String> = []
    @State private var error: String?
    @State private var keyword = ""
    @State private var addingKeyword = false
    @State private var email: PushRuleLogic.EmailState?
    @State private var emailFailed = false
    @State private var emailBusy = false
    @State private var emailError: String?

    var body: some View {
        List {
            systemSection
            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
            }
            Section {
                ForEach(PushRuleLogic.allMessages) { item in
                    levelRow(title: item.title, description: nil, spec: item.spec)
                }
            } header: {
                Text("All Messages")
            } footer: {
                Text("Counted in the grey badge. Applies on every device of your account.")
            }
            Section {
                ForEach(PushRuleLogic.mentions) { item in
                    levelRow(title: item.title, description: mentionDescription(item.spec.ruleId), spec: item.spec)
                }
            } header: {
                Text("Mentions")
            }
            keywordSection
        }
        .overlay { if !loaded && error == nil { ProgressView() } }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .alert("Notifications are off", isPresented: $notificationsDenied) {
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Allow notifications for Diddy in the Settings app, then turn this on again.")
        }
    }

    // MARK: System

    private var systemSection: some View {
        Section {
            Toggle(isOn: Binding(get: { backgroundNotifications }, set: { setBackgroundNotifications($0) })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Notifications in the background")
                    Text("Show notifications when messages arrive.").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Toggle(isOn: $notificationSound) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Notification Sound")
                    Text("Play sound when new message arrive.").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            emailRow
        } header: {
            Text("System")
        } footer: {
            Text("Keeps Diddy running in the background so new messages, mentions and calls show up as notifications. Works without a paid Apple account, but uses more battery. If iOS ends Diddy, for example after a restart, open it once to start again.")
        }
    }

    @ViewBuilder
    private var emailRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Email Notification")
                Spacer()
                if email == nil && !emailFailed || emailBusy { ProgressView() }
                if let address = email?.email {
                    Toggle("Email Notification", isOn: Binding(
                        get: { email?.enabled ?? false },
                        set: { setEmail(address, enabled: $0) }
                    ))
                    .labelsHidden()
                    .disabled(emailBusy)
                }
            }
            Group {
                if emailFailed {
                    Text("Unexpected Error!").foregroundStyle(Theme.danger)
                } else if let email, email.email == nil {
                    Text("Your account does not have any email attached.").foregroundStyle(Theme.danger)
                } else if let address = email?.email {
                    Text("Send notification to your email. (\"\(address)\")").foregroundStyle(Theme.muted)
                } else {
                    Text("Send notification to your email.").foregroundStyle(Theme.muted)
                }
                if let emailError { Text(emailError).foregroundStyle(Theme.danger) }
            }
            .font(.caption)
        }
    }

    private func setBackgroundNotifications(_ isOn: Bool) {
        guard isOn else {
            backgroundNotifications = false
            BackgroundKeepAlive.shared.refresh()
            LocalNotifications.shared.clearAll()
            return
        }
        Task {
            if await LocalNotifications.shared.requestPermission() {
                backgroundNotifications = true
                BackgroundKeepAlive.shared.refresh()
            } else {
                notificationsDenied = true
            }
        }
    }

    private func setEmail(_ address: String, enabled: Bool) {
        let before = email
        email = PushRuleLogic.EmailState(email: address, enabled: enabled)
        emailBusy = true
        emailError = nil
        Task {
            do {
                try await account.setEmailNotifications(email: address, enabled: enabled)
                email = try await account.emailNotificationState()
            } catch {
                email = before
                emailError = "Failed to update. Please try again."
            }
            emailBusy = false
        }
    }

    // MARK: Push rules

    private func levelRow(title: String, description: String?, spec: PushRuleLogic.Spec) -> some View {
        let resolved = PushRuleLogic.resolve(spec, in: rules)
        return LevelPicker(
            title: title,
            description: description,
            level: resolved.level,
            busy: busy.contains(spec.ruleId) || !loaded
        ) { level in
            change(ruleId: spec.ruleId, kind: resolved.kind, level: level, highlight: spec.highlight)
        }
    }

    private func mentionDescription(_ ruleId: String) -> String? {
        switch ruleId {
        case PushRuleLogic.isUserMention: return account.userId
        case PushRuleLogic.containsDisplayName: return account.displayName.map { "\"\($0)\"" }
        case PushRuleLogic.containsUserName: return "\"\(localpart)\""
        default: return nil
        }
    }

    private var localpart: String {
        let id = account.userId.hasPrefix("@") ? String(account.userId.dropFirst()) : account.userId
        return id.split(separator: ":", maxSplits: 1).first.map(String.init) ?? id
    }

    private var keywordSection: some View {
        Section {
            HStack(spacing: 8) {
                TextField("Keyword", text: $keyword)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit { addKeyword() }
                    .disabled(addingKeyword)
                if addingKeyword { ProgressView() }
                Button("Save") { addKeyword() }
                    .buttonStyle(.bordered)
                    .disabled(addingKeyword || keyword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            ForEach(PushRuleLogic.keywords(in: rules), id: \.ruleId) { rule in
                LevelPicker(
                    title: "\"\(rule.pattern ?? rule.ruleId)\"",
                    description: nil,
                    level: rule.level,
                    busy: busy.contains(rule.ruleId)
                ) { level in
                    change(ruleId: rule.ruleId, kind: "content", level: level, highlight: true)
                }
                .swipeActions {
                    Button("Remove", role: .destructive) { removeKeyword(rule.ruleId) }
                }
                .contextMenu {
                    Button("Remove", role: .destructive) { removeKeyword(rule.ruleId) }
                }
            }
        } header: {
            Text("Keywords")
        } footer: {
            Text("Set a notification preference for messages containing the given keyword. Swipe left on a keyword to remove it.")
        }
    }

    private func load() async {
        do {
            rules = try await account.pushRules()
            loaded = true
            error = nil
        } catch {
            self.error = error.friendlyMessage
        }
        do {
            email = try await account.emailNotificationState()
            emailFailed = false
        } catch {
            emailFailed = true
        }
    }

    private func change(ruleId: String, kind: String, level: NotificationLevel, highlight: Bool) {
        busy.insert(ruleId)
        error = nil
        Task {
            do {
                try await account.setPushRuleActions(kind: kind, ruleId: ruleId, actions: PushRuleLogic.actions(for: level, highlight: highlight))
                rules = try await account.pushRules()
            } catch {
                self.error = error.friendlyMessage
            }
            busy.remove(ruleId)
        }
    }

    private func addKeyword() {
        let trimmed = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !addingKeyword else { return }
        addingKeyword = true
        error = nil
        Task {
            do {
                try await account.addNotificationKeyword(trimmed)
                keyword = ""
                rules = try await account.pushRules()
            } catch {
                self.error = error.friendlyMessage
            }
            addingKeyword = false
        }
    }

    private func removeKeyword(_ ruleId: String) {
        busy.insert(ruleId)
        error = nil
        Task {
            do {
                try await account.deletePushRule(kind: "content", ruleId: ruleId)
                rules = try await account.pushRules()
            } catch {
                self.error = error.friendlyMessage
            }
            busy.remove(ruleId)
        }
    }
}

/// A title with desktop's Sound / Silent / Off control below it.
private struct LevelPicker: View {
    let title: String
    let description: String?
    let level: NotificationLevel
    let busy: Bool
    let onChange: (NotificationLevel) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(Theme.text)
                    if let description {
                        Text(description).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                Spacer()
                if busy { ProgressView() }
            }
            Picker(title, selection: Binding(get: { level }, set: { if $0 != level { onChange($0) } })) {
                ForEach(NotificationLevel.allCases) { level in
                    Text(level.shortTitle).tag(level).accessibilityLabel(level.title)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .disabled(busy)
        }
        .padding(.vertical, 2)
    }
}
