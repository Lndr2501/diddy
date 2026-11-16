import SwiftUI

@main
struct DiddyApp: App {
    @StateObject private var app = AppModel()
    @ObservedObject private var language = AppLanguage.shared

    init() {
        DiagLog.shared.setUp()
        LocalNotifications.shared.setUp()
        BackgroundKeepAlive.shared.setUp()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .id(language.revision)
                .environmentObject(app)
                .environmentObject(app.calls)
                .diddyAppearance()
                .task { await app.restore() }
                // `diddy://share?…` from the share extension (ShareInbox.swift).
                .onOpenURL { ShareInbox.shared.handle($0) }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var app: AppModel
    /// Your computer asking for this iPhone as camera and microphone (CompanionService.swift).
    @ObservedObject private var companion = CompanionService.shared

    var body: some View {
        Group {
            if app.restoring {
                ZStack {
                    Theme.rail.ignoresSafeArea()
                    VStack(spacing: 16) {
                        Image("DiddyLogo").resizable().frame(width: 96, height: 96)
                        ProgressView()
                    }
                }
            } else if let account = app.activeAccount {
                MainView(account: account)
                    .id(account.id)
                    .sheet(isPresented: $app.addingAccount) {
                        LoginView(isAddingAccount: true).diddySheetAppearance()
                    }
            } else if !app.unreachable.isEmpty {
                OfflineView()
                    .sheet(isPresented: $app.addingAccount) {
                        LoginView(isAddingAccount: true).diddySheetAppearance()
                    }
            } else {
                LoginView(isAddingAccount: false)
            }
        }
        .sheet(item: $companion.pending) { pending in
            CompanionRequestSheet(pending: pending,
                                  onJoin: { companion.accept(media: $0) },
                                  onDecline: { companion.decline() })
                .diddySheetAppearance()
        }
        .task(id: app.unreachable.isEmpty) {
            // Quietly keeps trying, for the offline screen and for a second account that is down.
            while !app.unreachable.isEmpty {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard !Task.isCancelled else { return }
                await app.retryUnreachable()
            }
        }
    }
}

/// You are signed in, the server just cannot be reached. Comes back by itself.
private struct OfflineView: View {
    @EnvironmentObject private var app: AppModel
    @State private var retrying = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.accent.opacity(0.35), Theme.rail], startPoint: .topLeading, endPoint: .center)
                .ignoresSafeArea()
            VStack(spacing: 18) {
                Image("DiddyLogo").resizable().frame(width: 88, height: 88)
                Text("Can't reach your server").font(.title2.bold()).foregroundStyle(Theme.text)
                Text("You're still signed in as \(app.unreachable.first?.userId ?? ""). Diddy keeps trying and opens as soon as the server answers.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.muted)
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Trying to reconnect…").font(.footnote).foregroundStyle(Theme.muted)
                }
                Button {
                    retrying = true
                    Task {
                        await app.retryUnreachable()
                        retrying = false
                    }
                } label: {
                    Text("Try Again").bold()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.accent))
                        .foregroundStyle(Theme.onAccent)
                }
                .disabled(retrying)
                Button("Sign in to another account") { app.addingAccount = true }
                    .font(.footnote)
            }
            .padding(24)
            .frame(maxWidth: 480)
        }
    }
}
