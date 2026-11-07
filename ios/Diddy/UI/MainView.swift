import MatrixRustSDK
import SwiftUI

/// What the detail column shows.
enum Destination: Hashable {
    case text(String)
    case voice(String)
}

/// Discord mobile layout: server rail on the far left, the selected server's channels next to it,
/// the channel itself as the detail (pushed on iPhone, side by side on iPad).
struct MainView: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var calls: CallManager
    @State private var server: String?
    @State private var destination: Destination?
    @State private var showSettings = false

    var body: some View {
        NavigationSplitView {
            HStack(spacing: 0) {
                ServerRail(account: account, selection: $server)
                ChannelSidebar(account: account, server: server, destination: $destination, showSettings: $showSettings)
            }
            .background(Theme.sidebar)
            .toolbar(.hidden, for: .navigationBar)
            .navigationSplitViewColumnWidth(min: 320, ideal: 360, max: 420)
        } detail: {
            NavigationStack {
                switch destination {
                case .text(let roomId)?:
                    ChatView(account: account, roomId: roomId)
                        .id(roomId)
                case .voice(let roomId)?:
                    VoiceChannelView(account: account, roomId: roomId)
                        .id(roomId)
                case nil:
                    EmptyChannelView()
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .sheet(isPresented: $showSettings) {
            SettingsView(account: account)
        }
        .alert("Voice", isPresented: Binding(get: { calls.error != nil }, set: { if !$0 { calls.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(calls.error ?? "")
        }
        .task { await account.loadAllChannels() }
        .onChange(of: account.spaces.map(\.roomId)) { _ in
            Task { await account.loadAllChannels() }
        }
    }
}

struct EmptyChannelView: View {
    var body: some View {
        ZStack {
            Theme.chat.ignoresSafeArea()
            VStack(spacing: 12) {
                Image("DiddyLogo").resizable().frame(width: 72, height: 72).opacity(0.8)
                Text("Pick a channel").font(.headline).foregroundStyle(Theme.muted)
            }
        }
    }
}

// MARK: - Server rail

struct ServerRail: View {
    @ObservedObject var account: MatrixAccount
    @Binding var selection: String?
    @EnvironmentObject private var app: AppModel

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 8) {
                railButton(id: nil, unread: account.directMessages.reduce(0) { $0 + $1.unread }) {
                    Image("DiddyLogo").resizable().scaledToFill()
                }
                Capsule().fill(Theme.elevated).frame(width: 32, height: 2).padding(.vertical, 2)
                ForEach(account.spaces) { space in
                    railButton(id: space.roomId, unread: account.unreadCount(inSpace: space.roomId)) {
                        AvatarView(url: space.avatarUrl, name: space.displayName, size: 48, cornerRadius: 0, account: account)
                    }
                    .accessibilityLabel(space.displayName)
                }
                Button {
                    app.addingAccount = true
                } label: {
                    Image(systemName: "plus")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Theme.online)
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(Theme.elevated))
                }
                .accessibilityLabel("Add an account on another server")
            }
            .padding(.vertical, 12)
        }
        .frame(width: 72)
        .background(Theme.rail)
    }

    private func railButton<Icon: View>(id: String?, unread: UInt64, @ViewBuilder icon: () -> Icon) -> some View {
        let selected = selection == id
        return Button {
            selection = id
        } label: {
            icon()
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: selected ? 16 : 24, style: .continuous))
                .overlay(alignment: .bottomTrailing) {
                    if unread > 0 { UnreadBadge(count: unread).offset(x: 4, y: 4) }
                }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .leading) {
            Capsule()
                .fill(Theme.text)
                .frame(width: 4, height: selected ? 40 : (unread > 0 ? 8 : 0))
                .offset(x: -2)
        }
        .animation(.spring(response: 0.25), value: selected)
    }
}

// MARK: - Channel list

struct ChannelSidebar: View {
    @ObservedObject var account: MatrixAccount
    let server: String?
    @Binding var destination: Destination?
    @Binding var showSettings: Bool
    @EnvironmentObject private var calls: CallManager
    @State private var joinError: String?
    @State private var showRecovery = false

    var body: some View {
        VStack(spacing: 0) {
            header
            if account.needsRecovery {
                Button { showRecovery = true } label: {
                    Label("Verify this device to read encrypted messages", systemImage: "lock.shield")
                        .font(.footnote.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.accent.opacity(0.25)))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.bottom, 6)
            }
            List(selection: $destination) {
                if let server {
                    serverChannels(server)
                } else {
                    homeChannels
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            if let call = calls.current {
                VoiceStatusBar(session: call)
            }
            UserPanel(account: account, showSettings: $showSettings)
        }
        .background(Theme.sidebar)
        .alert("Could not join", isPresented: Binding(get: { joinError != nil }, set: { if !$0 { joinError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(joinError ?? "") }
        .sheet(isPresented: $showRecovery) { RecoveryView(account: account) }
    }

    private var header: some View {
        HStack {
            Text(serverName).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
            Spacer()
            if account.syncState == .error || account.syncState == .offline {
                Image(systemName: "wifi.exclamationmark").foregroundStyle(Theme.danger)
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
    }

    private var serverName: String {
        guard let server else { return "Direct Messages" }
        return account.spaces.first { $0.roomId == server }?.displayName ?? "Server"
    }

    @ViewBuilder
    private var homeChannels: some View {
        Section {
            ForEach(account.directMessages) { room in
                RoomRow(account: account, room: room, icon: nil)
                    .tag(Destination.text(room.id))
                    .listRowBackground(rowBackground(.text(room.id)))
            }
        } header: { sectionHeader("Direct Messages") }
        let others = account.roomsOutsideServers
        if !others.isEmpty {
            Section {
                ForEach(others) { room in
                    RoomRow(account: account, room: room, icon: "number")
                        .tag(Destination.text(room.id))
                        .listRowBackground(rowBackground(.text(room.id)))
                }
            } header: { sectionHeader("Rooms") }
        }
    }

    @ViewBuilder
    private func serverChannels(_ server: String) -> some View {
        let categories = account.categories[server] ?? []
        if categories.isEmpty {
            HStack { Spacer(); ProgressView(); Spacer() }.listRowBackground(Color.clear)
        }
        ForEach(categories) { category in
            Section {
                ForEach(category.channels) { channel in
                    channelRow(channel)
                }
            } header: { sectionHeader(category.name) }
        }
    }

    @ViewBuilder
    private func channelRow(_ channel: SpaceRoom) -> some View {
        let destination: Destination = channel.isVoiceChannel ? .voice(channel.roomId) : .text(channel.roomId)
        if channel.isJoined {
            ChannelRow(account: account, channel: channel)
                .tag(destination)
                .listRowBackground(rowBackground(destination))
        } else {
            Button {
                Task {
                    do {
                        try await account.join(channel)
                        self.destination = destination
                    } catch { joinError = error.localizedDescription }
                }
            } label: {
                ChannelRow(account: account, channel: channel)
                    .opacity(0.55)
            }
            .listRowBackground(Color.clear)
        }
    }

    private func rowBackground(_ value: Destination) -> some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(destination == value ? Theme.elevated : Color.clear)
            .padding(.horizontal, 6)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption.weight(.bold))
            .foregroundStyle(Theme.faint)
    }
}

struct ChannelRow: View {
    @ObservedObject var account: MatrixAccount
    let channel: SpaceRoom

    var body: some View {
        let summary = account.summary(for: channel.roomId)
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: channel.isVoiceChannel ? "speaker.wave.2.fill" : "number")
                    .foregroundStyle(Theme.faint)
                    .frame(width: 20)
                Text(channel.displayName)
                    .foregroundStyle((summary?.unread ?? 0) > 0 ? Theme.text : Theme.muted)
                    .fontWeight((summary?.unread ?? 0) > 0 ? .semibold : .regular)
                    .lineLimit(1)
                Spacer()
                if !channel.isJoined {
                    Text("Join").font(.caption.weight(.semibold)).foregroundStyle(Theme.accent)
                } else if let mentions = summary?.mentions, mentions > 0 {
                    UnreadBadge(count: mentions)
                }
            }
            // Discord lists who is connected right under a voice channel.
            if channel.isVoiceChannel, let participants = summary?.callParticipants, !participants.isEmpty {
                ForEach(participants, id: \.self) { userId in
                    HStack(spacing: 6) {
                        AvatarView(url: nil, name: userId.dropFirst().description, size: 20)
                        Text(userId).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                    .padding(.leading, 28)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct RoomRow: View {
    @ObservedObject var account: MatrixAccount
    let room: RoomSummary
    let icon: String?

    var body: some View {
        HStack(spacing: 10) {
            if let icon {
                Image(systemName: icon).foregroundStyle(Theme.faint).frame(width: 20)
            } else {
                AvatarView(url: room.avatarUrl, name: room.name, size: 32, account: account)
            }
            Text(room.name)
                .foregroundStyle(room.unread > 0 ? Theme.text : Theme.muted)
                .fontWeight(room.unread > 0 ? .semibold : .regular)
                .lineLimit(1)
            Spacer()
            if room.hasCall { Image(systemName: "speaker.wave.2.fill").foregroundStyle(Theme.online) }
            if room.mentions > 0 || (room.isDirect && room.unread > 0) {
                UnreadBadge(count: room.isDirect ? room.unread : room.mentions)
            }
        }
    }
}

/// Bottom-left panel: own avatar and name, settings.
struct UserPanel: View {
    @ObservedObject var account: MatrixAccount
    @Binding var showSettings: Bool

    var body: some View {
        HStack(spacing: 10) {
            AvatarView(url: account.avatarUrl, name: account.title, size: 34, account: account)
                .overlay(alignment: .bottomTrailing) {
                    Circle().fill(account.syncState == .running ? Theme.online : Theme.faint)
                        .frame(width: 11, height: 11)
                        .overlay(Circle().stroke(Theme.rail, lineWidth: 2))
                }
            VStack(alignment: .leading, spacing: 1) {
                Text(account.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(1)
                Text(account.record.serverName).font(.caption2).foregroundStyle(Theme.faint).lineLimit(1)
            }
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "gearshape.fill").foregroundStyle(Theme.muted)
            }
            .accessibilityLabel("Settings")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.rail)
    }
}
