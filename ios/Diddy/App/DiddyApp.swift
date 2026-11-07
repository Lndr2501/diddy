import SwiftUI

@main
struct DiddyApp: App {
    @StateObject private var app = AppModel()

    init() {
        LocalNotifications.shared.setUp()
        BackgroundKeepAlive.shared.setUp()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .environmentObject(app.calls)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .task { await app.restore() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var app: AppModel

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
                        LoginView(isAddingAccount: true)
                    }
            } else if !app.unreachable.isEmpty {
                OfflineView()
                    .sheet(isPresented: $app.addingAccount) {
                        LoginView(isAddingAccount: true)
                    }
            } else {
                LoginView(isAddingAccount: false)
            }
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
                        .foregroundStyle(.white)
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
