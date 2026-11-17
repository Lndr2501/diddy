import SwiftUI

extension View {
    /// Listens for verification requests from your other devices and other people, and shows the
    /// verification sheet when one starts. Put it on the account's main view once.
    func verificationRequests(account: MatrixAccount) -> some View {
        modifier(VerificationRequests(account: account))
    }

    /// Lets this screen show the verification sheet while it is the topmost one (Settings is a
    /// sheet itself, so the main view cannot show another over it).
    func verificationSheet(account: MatrixAccount) -> some View {
        modifier(VerificationSheetPresenter(account: account))
    }
}

private struct VerificationSheetPresenter: ViewModifier {
    @ObservedObject var account: MatrixAccount

    func body(content: Content) -> some View {
        content.background(VerificationSheetHost(center: VerificationCenter.of(account)))
    }
}

private struct VerificationRequests: ViewModifier {
    @ObservedObject var account: MatrixAccount

    func body(content: Content) -> some View {
        content
            .task(id: account.syncState == .running) {
                if account.syncState == .running { await VerificationCenter.of(account).start() }
            }
            .background(VerificationSheetHost(center: VerificationCenter.of(account)))
    }
}

private struct VerificationSheetHost: View {
    @ObservedObject var center: VerificationCenter
    @State private var id = UUID()

    var body: some View {
        Color.clear
            .onAppear { center.addPresenter(id) }
            .onDisappear { center.removePresenter(id) }
            .sheet(isPresented: Binding(
                get: { center.phase.isActive && center.presenters.last == id },
                set: { isOn in if !isOn { Task { await center.dismiss() } } }
            )) {
                VerificationSheet(center: center).diddySheetAppearance()
            }
    }
}

/// The steps of a verification: request, emoji comparison, result.
struct VerificationSheet: View {
    @ObservedObject var center: VerificationCenter

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                content
                Spacer(minLength: 0)
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.sidebar)
            .navigationTitle(L("settings.verification.verify"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(center.phase.isRunning ? "Cancel" : "Close") { Task { await center.dismiss() } }
                }
            }
        }
        .interactiveDismissDisabled(center.phase.isRunning)
    }

    @ViewBuilder private var content: some View {
        switch center.phase {
        case .idle:
            EmptyView()
        case .incoming(let request):
            icon("person.badge.shield.checkmark.fill")
            Text(L("ios.remainingUI.verificationRequest")).font(.title2.bold()).foregroundStyle(Theme.text)
            Text(incomingText(request)).multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            VStack(spacing: 10) {
                Button { Task { await center.accept() } } label: { Text(L("common.deviceVerification.accept")).frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                Button(role: .cancel) { Task { await center.dismiss() } } label: { Text(L("nav.invites.decline")).frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
            }
        case .requesting(let text):
            ProgressView()
            Text(L("ios.remainingUI.waitingForTheOtherSide")).font(.title3.bold()).foregroundStyle(Theme.text)
            Text(text).multilineTextAlignment(.center).foregroundStyle(Theme.muted)
        case .starting:
            ProgressView()
            Text(L("ios.remainingUI.settingUpTheComparison")).foregroundStyle(Theme.muted)
        case .emojis(let emojis):
            Text(L("ios.remainingUI.compareTheEmojis")).font(.title2.bold()).foregroundStyle(Theme.text)
            Text(L("ios.remainingUI.checkThatTheseEmojisAppearInTheSameOrderOnTheOtherDevice"))
                .multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 14) {
                ForEach(Array(emojis.enumerated()), id: \.offset) { _, emoji in
                    VStack(spacing: 4) {
                        Text(emoji.symbol).font(.system(size: 38))
                        Text(emoji.label).font(.caption2).foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                    }
                }
            }
            matchButtons
        case .decimals(let values):
            Text(L("ios.remainingUI.compareTheNumbers")).font(.title2.bold()).foregroundStyle(Theme.text)
            Text(L("ios.remainingUI.checkThatTheseNumbersAppearInTheSameOrderOnTheOtherDevice"))
                .multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            Text(values.map(String.init).joined(separator: "  "))
                .font(.system(.title, design: .monospaced).bold()).foregroundStyle(Theme.text)
            matchButtons
        case .confirming:
            ProgressView()
            Text(L("ios.remainingUI.waitingForTheOtherSideToConfirm")).foregroundStyle(Theme.muted)
        case .done:
            icon("checkmark.shield.fill", color: Theme.online)
            Text(L("settings.verification.verified")).font(.title2.bold()).foregroundStyle(Theme.text)
            Text(L("ios.remainingUI.theVerificationIsComplete")).foregroundStyle(Theme.muted)
            Button { Task { await center.dismiss() } } label: { Text(L("call.companionDialog.done")).frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
        case .cancelled(let reason):
            icon("xmark.shield.fill", color: Theme.danger)
            Text(L("ios.remainingUI.verificationCancelled")).font(.title2.bold()).foregroundStyle(Theme.text)
            Text(reason).multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            Button { Task { await center.dismiss() } } label: { Text(L("room.callChatView.close")).frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
        case .failed(let message):
            icon("exclamationmark.triangle.fill", color: Theme.danger)
            Text(L("ios.remainingUI.verificationFailed")).font(.title2.bold()).foregroundStyle(Theme.text)
            Text(message).multilineTextAlignment(.center).foregroundStyle(Theme.muted)
            Button { Task { await center.dismiss() } } label: { Text(L("room.callChatView.close")).frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
        }
    }

    private var matchButtons: some View {
        VStack(spacing: 10) {
            Button { Task { await center.approve() } } label: { Text(L("ios.remainingUI.theyMatch")).frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
            Button(role: .destructive) { Task { await center.decline() } } label: { Text(L("ios.remainingUI.theyDonTMatch")).frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
        }
    }

    private func icon(_ name: String, color: Color = Theme.accent) -> some View {
        Image(systemName: name).font(.system(size: 54)).foregroundStyle(color)
    }

    private func incomingText(_ request: VerificationRequest) -> String {
        let device = request.deviceName.map { "\($0) (\(request.deviceId))" } ?? request.deviceId
        return "\(request.name) (\(request.userId)) asks to verify on \(device). Only accept if you started this yourself."
    }
}
