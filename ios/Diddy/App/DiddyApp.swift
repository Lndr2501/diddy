import SwiftUI

@main
struct DiddyApp: App {
    @StateObject private var app = AppModel()

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
            } else {
                LoginView(isAddingAccount: false)
            }
        }
    }
}
