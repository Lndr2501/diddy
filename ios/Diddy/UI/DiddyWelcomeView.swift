import MatrixRustSDK
import SwiftUI

struct DiddyWelcomeView: View {
    @ObservedObject var account: MatrixAccount
    var onFinish: () -> Void
    @State private var error: String?
    @State private var busy = false
    @State private var showGuide = false
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
                    // The guide has its own navigation bar, so it opens as a sheet and not pushed.
                    Button { showGuide = true } label: {
                        Label("Matrix Guide for Discord Users", systemImage: "book")
                    }
                }
                Section("Join a Diddy Server") {
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
                    if busy { HStack { Spacer(); ProgressView(); Spacer() } }
                    if let error { Text(error).foregroundStyle(Theme.danger) }
                }
                Section {
                    NavigationLink { DiddyProfileEditor(account: account) } label: {
                        Label("Edit Profile", systemImage: "person.crop.circle")
                    }
                } header: {
                    Text("Make It Yours")
                } footer: {
                    Text("Choose your name style, status and profile. Changes are shared with other members of your Diddy room.")
                }
            }
            .navigationTitle("Welcome")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showGuide) { WelcomeGuideView() }
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
        let prefix: String = account.id + "|"
        var keys: [String] = []
        for group in account.categories.values {
            for category in group {
                for channel in category.channels {
                    let key: String = prefix + channel.roomId
                    if dismissed.contains(key) { continue }
                    if account.isJoined(channel) { continue }
                    let isDiddy: Bool = OnboardingLogic.isDiddyRoom(name: channel.displayName, topic: channel.topic, tag: DiddyEvents.topicTag)
                    if isDiddy { keys.append(key) }
                }
            }
        }
        return keys
    }
    var body: some View {
        if !pending.isEmpty {
            HStack(spacing: 8) {
                Button { showing = true } label: {
                    Label("This server uses Diddy", systemImage: "sparkles")
                }
                Spacer()
                Button(action: dismissNotice) {
                    Image(systemName: "xmark").foregroundStyle(Theme.muted)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss welcome notice")
            }
            .font(.footnote.weight(.semibold))
            .padding(.leading, 12).padding(.trailing, 6).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.elevated))
            .padding(.horizontal, 8).padding(.bottom, 6)
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
