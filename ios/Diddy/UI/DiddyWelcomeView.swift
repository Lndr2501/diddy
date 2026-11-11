import MatrixRustSDK
import SwiftUI

struct DiddyWelcomeView: View {
    @ObservedObject var account: MatrixAccount
    var onFinish: () -> Void
    @State private var error: String?
    @State private var busy = false
    private var candidates: [SpaceRoom] {
        var seen = Set<String>()
        return account.categories.values.flatMap { $0 }.flatMap { $0.channels }.filter {
            OnboardingLogic.isDiddyRoom(name: $0.displayName, topic: $0.topic, tag: DiddyEvents.topicTag)
                && !account.isJoined($0) && seen.insert($0.roomId).inserted
        }
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Welcome to Diddy").font(.title.bold())
                    NavigationLink("Matrix guide for Discord users") { WelcomeGuideView() }
                }
                Section("Join a Diddy server") {
                    Text("Join its Diddy room to see profiles, name styles and badges of other Diddy users.")
                    if candidates.isEmpty {
                        Text("On Diddy-ready servers an admin creates a hidden room called Diddy Options. Ask your admin if none is available.")
                    }
                    ForEach(candidates, id: \.roomId) { room in
                        Button("Join \(room.displayName)") {
                            busy = true
                            Task { @MainActor in
                                defer { busy = false }
                                do {
                                    try await account.join(room)
                                    account.diddyOptionsRooms.insert(room.roomId)
                                    let key = "diddy.lightOptionsRooms.\(account.id)"
                                    var ids = UserDefaults.standard.stringArray(forKey: key) ?? []
                                    if !ids.contains(room.roomId) { ids.append(room.roomId) }
                                    UserDefaults.standard.set(ids, forKey: key)
                                    await account.loadDiddyProfiles(force: true)
                                } catch { self.error = error.friendlyMessage }
                            }
                        }.disabled(busy)
                    }
                    if busy { ProgressView() }
                    if let error { Text(error).foregroundStyle(Theme.danger) }
                }
                Section("Make it yours") {
                    NavigationLink("Open Profile settings") { DiddyProfileEditor(account: account) }
                    Text("Choose your name style, status and profile. Changes are shared with other members of your Diddy room.")
                }
            }
            .navigationTitle("Welcome guide")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", action: onFinish).keyboardShortcut(.cancelAction) } }
        }
        .task { await account.loadAllChannels() }
    }
}

struct DiddyServerNotice: View {
    @ObservedObject var account: MatrixAccount
    @State private var showing = false
    @AppStorage("diddy.onboarding.dismissedRooms") private var dismissedJSON = "[]"
    private var pending: [String] {
        let dismissed = (try? JSONDecoder().decode([String].self, from: Data(dismissedJSON.utf8))) ?? []
        return account.categories.values.flatMap { $0 }.flatMap { $0.channels }.filter {
            OnboardingLogic.isDiddyRoom(name: $0.displayName, topic: $0.topic, tag: DiddyEvents.topicTag)
                && !account.isJoined($0) && !dismissed.contains(account.id + "|" + $0.roomId)
        }.map { account.id + "|" + $0.roomId }
    }
    var body: some View {
        if !pending.isEmpty {
            HStack {
                Button("This server uses Diddy") { showing = true }
                Spacer()
                Button(action: dismissNotice) { Image(systemName: "xmark") }.accessibilityLabel("Dismiss welcome notice")
            }.font(.footnote).padding(8)
            .sheet(isPresented: $showing) {
                DiddyWelcomeView(account: account, onFinish: { dismissNotice(); showing = false })
            }
        }
    }
    private func dismissNotice() {
        var ids = (try? JSONDecoder().decode([String].self, from: Data(dismissedJSON.utf8))) ?? []
        ids.append(contentsOf: pending)
        if let data = try? JSONEncoder().encode(Array(Set(ids))) { dismissedJSON = String(decoding: data, as: UTF8.self) }
    }
}
