import MatrixRustSDK
import SwiftUI

/// What the detail column shows.
enum Destination: Hashable {
    case text(String)
    case voice(String)
}

/// Where the app is showing; anything can send you to a room, like Message on a profile card.
@MainActor
final class AppNavigator: ObservableObject {
    @Published var server: String? {
        didSet { UserDefaults.standard.set(server, forKey: "diddy.lastServer") }
    }
    @Published var destination: Destination?
    @Published var shellLink: ShellRoomLink?
    @Published var searchTarget: SearchEventTarget?

    init() { server = UserDefaults.standard.string(forKey: "diddy.lastServer") }

    func open(_ roomId: String, account: MatrixAccount) {
        server = account.server(of: roomId)
        destination = account.destination(for: roomId)
    }
}

/// Discord mobile layout: server rail on the far left, the selected server's channels next to it,
/// the channel itself as the detail (pushed on iPhone, side by side on iPad).
struct MainView: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var calls: CallManager
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var navigator = AppNavigator()
    @State private var showSettings = false
    @State private var showQuickSwitch = false
    @State private var showWelcome = false
    @ObservedObject private var themes = ThemeStore.shared

    var body: some View {
        NavigationSplitView {
            HStack(spacing: 0) {
                ServerRail(account: account, selection: $navigator.server)
                ChannelSidebar(account: account, server: navigator.server, destination: $navigator.destination, showSettings: $showSettings)
            }
            .background(Theme.sidebar)
            .toolbar(.hidden, for: .navigationBar)
            .navigationSplitViewColumnWidth(min: 320, ideal: 360, max: 420)
        } detail: {
            NavigationStack {
                switch navigator.destination {
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
        // A new theme rebuilds the screens (the Theme colours are plain values); the sheets and
        // the navigator stay, so Settings remains open while you pick.
        .id(themes.id)
        .environmentObject(navigator)
        .sheet(isPresented: $showSettings) {
            SettingsView(account: account).id(themes.id)
        }
        .fullScreenCover(isPresented: $calls.showCallScreen) {
            if let call = calls.current {
                NavigationStack {
                    VoiceChannelView(account: account, roomId: call.roomId, showsClose: true)
                }
                .id(themes.id)
                .environmentObject(navigator)
            }
        }
        .alert("Voice", isPresented: Binding(get: { calls.error != nil }, set: { if !$0 { calls.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(calls.error ?? "")
        }
        .task {
            account.diddyOptionsRooms.formUnion(UserDefaults.standard.stringArray(forKey: "diddy.lightOptionsRooms.\(account.id)") ?? [])
            await account.loadAllChannels()
        }
        // Nameplates, name styles and badges of everyone; again once the room list has arrived.
        .task(id: account.rooms.isEmpty) { await account.loadDiddyProfiles() }
        .onChange(of: account.spaces.map(\.roomId)) { ids in
            // The server you were on may be gone: you left it, or were removed.
            if let server = navigator.server, !ids.contains(server) { navigator.server = nil }
            Task { await account.loadAllChannels() }
        }
        .onAppear { openRequestedRoom() }
        .onChange(of: app.openRequest) { _ in openRequestedRoom() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await account.resume() } }
        }
        // Online status of DM partners and others, and your own (PresenceViews.swift).
        .presenceUpdates(account: account)
        // Verification requests from your other devices and other people (VerificationViews.swift).
        .verificationRequests(account: account)
        .background(shortcuts)
        .sheet(isPresented: $showQuickSwitch) { QuickSwitchView(account: account).environmentObject(navigator) }
        .sheet(isPresented: $showWelcome, onDismiss: finishWelcome) { DiddyWelcomeView(account: account, onFinish: { finishWelcome(); showWelcome = false }) }
        .sheet(item: $navigator.shellLink) { ShellJoinRoomView(account: account, link: $0).environmentObject(navigator) }
        .task(id: account.id) { showWelcome = !UserDefaults.standard.bool(forKey: "diddy.welcome.done.\(account.id)") }
    }
}

extension MainView {
    private func finishWelcome() { UserDefaults.standard.set(true, forKey: "diddy.welcome.done.\(account.id)") }
    private var shortcuts: some View {
        Group {
            Button("Close sheet") {
                showSettings = false; showQuickSwitch = false; showWelcome = false
                navigator.shellLink = nil
                let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
                var controller = scene?.windows.first { $0.isKeyWindow }?.rootViewController
                while let presented = controller?.presentedViewController { controller = presented }
                if controller?.presentingViewController != nil { controller?.dismiss(animated: true) }
            }.keyboardShortcut(.cancelAction)
            Button("Quick switcher") { showQuickSwitch = true }.keyboardShortcut("k", modifiers: .command)
            Button("Settings") { showSettings = true }.keyboardShortcut(",", modifiers: .command)
            Button("Previous room") { moveRoom(-1) }.keyboardShortcut(.upArrow, modifiers: .command)
            Button("Next room") { moveRoom(1) }.keyboardShortcut(.downArrow, modifiers: .command)
        }.hidden()
    }
    private func moveRoom(_ step: Int) {
        let ids: [String]
        if let server = navigator.server {
            ids = (account.categories[server] ?? []).flatMap { $0.channels }.filter { account.isJoined($0) }.map(\.roomId)
        } else { ids = (account.directMessages + account.roomsOutsideServers).map(\.id) }
        let current: String?
        switch navigator.destination { case .text(let id)?, .voice(let id)?: current = id; case nil: current = nil }
        if let next = ShellNavigation.neighbor(of: current, in: ids, step: step) { navigator.open(next, account: account) }
    }

    /// A tapped notification for this account.
    private func openRequestedRoom() {
        guard let request = app.openRequest, request.accountId == account.id else { return }
        app.openRequest = nil
        navigator.open(request.roomId, account: account)
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
    @State private var addingServer = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 8) {
                railButton(
                    id: nil,
                    unread: account.directMessages.contains { $0.badge > 0 },
                    badge: account.directMessages.reduce(UInt64(account.invites.count)) { $0 + $1.badge }
                ) {
                    Image("DiddyLogo").resizable().scaledToFill()
                }
                .accessibilityLabel("Direct Messages")
                Capsule().fill(Theme.elevated).frame(width: 32, height: 2).padding(.vertical, 2)
                ForEach(account.spaces) { space in
                    railButton(
                        id: space.roomId,
                        unread: account.unreadCount(inSpace: space.roomId) > 0,
                        badge: account.mentionCount(inSpace: space.roomId)
                    ) {
                        AvatarView(url: space.avatarUrl, name: space.displayName, size: 48, cornerRadius: 0, account: account)
                    }
                    .accessibilityLabel(space.displayName)
                }
                Button {
                    addingServer = true
                } label: {
                    Image(systemName: "plus")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Theme.online)
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(Theme.elevated))
                }
                .accessibilityLabel("Add a server")
            }
            .padding(.vertical, 12)
        }
        .frame(width: 72)
        .background(Theme.rail)
        .sheet(isPresented: $addingServer) { AddServerView(account: account) }
    }

    /// Discord's rail: a white pip for anything unread, a red number only for what is really for you.
    private func railButton<Icon: View>(id: String?, unread: Bool, badge: UInt64, @ViewBuilder icon: () -> Icon) -> some View {
        let selected = selection == id
        return Button {
            selection = id
        } label: {
            icon()
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: selected ? 16 : 24, style: .continuous))
                .overlay(alignment: .bottomTrailing) {
                    if badge > 0 { UnreadBadge(count: badge).offset(x: 4, y: 4) }
                }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .leading) {
            Capsule()
                .fill(Theme.text)
                .frame(width: 4, height: selected ? 40 : (unread ? 8 : 0))
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
    @State private var filter = ""
    @State private var showSearch = false
    @State private var joining: Set<String> = []
    @State private var sheet: SidebarSheet?
    @State private var confirmLeave = false
    @State private var joiningAll = false
    @State private var leaveRequest: LeaveRequest?

    private enum SidebarSheet: Identifiable {
        case members(String), invite(String), createChannel(String), newMessage, roomSettings(String)
        var id: String {
            switch self {
            case .members(let id): return "members\(id)"
            case .invite(let id): return "invite\(id)"
            case .createChannel(let id): return "create\(id)"
            case .newMessage: return "new"
            case .roomSettings(let id): return "settings\(id)"
            }
        }
    }

    /// A room the long-press menu asked to leave, waiting for the answer.
    private struct LeaveRequest: Identifiable {
        let id: String
        let name: String
        let isDirect: Bool
    }

    private var query: String { filter.trimmingCharacters(in: .whitespaces) }

    private func matches(_ name: String) -> Bool {
        query.isEmpty || name.localizedCaseInsensitiveContains(query)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ShellSyncBanner(account: account)
            ShellUpdateNotice()
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
            Button { showSearch = true } label: {
                Label("Search rooms, people and messages", systemImage: "magnifyingglass")
                    .font(.subheadline).padding(10)
            }
            .keyboardShortcut("k", modifiers: .command)
            searchField
            List(selection: $destination) {
                if let server {
                    serverChannels(server)
                } else {
                    homeChannels
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable {
                if let server { await account.loadChannels(spaceId: server) }
            }
            if let call = calls.current {
                VoiceStatusBar(session: call)
            }
            DiddyServerNotice(account: account)
            PluginDockView()
            UserPanel(account: account, showSettings: $showSettings)
        }
        .background(Theme.sidebar)
        .alert("Could not join", isPresented: Binding(get: { joinError != nil }, set: { if !$0 { joinError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(joinError ?? "") }
        .confirmationDialog("Leave \(serverName)?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave Server", role: .destructive) {
                guard let server else { return }
                Task {
                    do { try await account.leaveServer(server) } catch { joinError = error.friendlyMessage }
                }
            }
        } message: {
            Text("You also leave all of its channels. You need a new invite to come back if the server is private.")
        }
        .sheet(isPresented: $showSearch) { QuickSwitchView(account: account) }
        .sheet(isPresented: $showRecovery) { RecoveryView(account: account) }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case .members(let id): MembersView(account: account, roomId: id, title: serverName)
            case .invite(let id): InviteView(account: account, roomId: id)
            case .createChannel(let id): CreateChannelView(account: account, spaceId: id)
            case .newMessage: NewMessageView(account: account)
            case .roomSettings(let id):
                RoomSettingsView(roomId: id, account: account, onOpenRoom: { destination = account.destination(for: $0) })
            }
        }
        .confirmationDialog(
            leaveRequest.map { $0.isDirect ? "Close \($0.name)?" : "Leave \($0.name)?" } ?? "",
            isPresented: Binding(get: { leaveRequest != nil }, set: { if !$0 { leaveRequest = nil } }),
            titleVisibility: .visible,
            presenting: leaveRequest
        ) { request in
            Button(request.isDirect ? "Close Conversation" : "Leave Room", role: .destructive) { leave(request) }
        } message: { request in
            Text(request.isDirect ? "The conversation disappears from your list." : "Are you sure you want to leave this room?")
        }
        .task { await account.watchNotificationSettings() }
        .task(id: account.rooms.count) { await account.refreshNotifyLevels() }
    }

    /// Long press on a room, like desktop's room menu.
    @ViewBuilder
    private func roomMenu(_ roomId: String) -> some View {
        RoomContextMenu(
            account: account,
            roomId: roomId,
            onInvite: { sheet = .invite($0) },
            onSettings: { sheet = .roomSettings($0) },
            onLeave: { id in
                let summary = account.summary(for: id)
                leaveRequest = LeaveRequest(id: id, name: summary?.name ?? "this room", isDirect: summary?.isDirect == true)
            },
            onError: { joinError = $0 }
        )
    }

    private func leave(_ request: LeaveRequest) {
        Task {
            do {
                try await account.leave(roomId: request.id)
                switch destination {
                case .text(let id)?, .voice(let id)?:
                    if id == request.id { destination = nil }
                case nil:
                    break
                }
            } catch { joinError = error.friendlyMessage }
        }
    }

    private var header: some View {
        HStack {
            if let server {
                Menu {
                    Button { sheet = .members(server) } label: { Label("Members", systemImage: "person.2.fill") }
                    Button { sheet = .invite(server) } label: { Label("Invite People", systemImage: "person.badge.plus") }
                    Button { sheet = .createChannel(server) } label: { Label("Create Channel", systemImage: "plus.bubble") }
                    Button { sheet = .roomSettings(server) } label: { Label("Server Settings", systemImage: "gearshape") }
                    if !account.unjoinedChannels(inSpace: server).isEmpty {
                        Button { joinAll(server) } label: { Label("Join All Channels", systemImage: "arrow.right.circle") }
                    }
                    Divider()
                    Button(role: .destructive) { confirmLeave = true } label: {
                        Label("Leave Server", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(serverName).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
                        Image(systemName: "chevron.down").font(.caption.weight(.bold)).foregroundStyle(Theme.muted)
                    }
                }
                Spacer()
                Button { sheet = .members(server) } label: {
                    Image(systemName: "person.2.fill").foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Members")
            } else {
                Text(serverName).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
                Spacer()
                Button { sheet = .newMessage } label: {
                    Image(systemName: "square.and.pencil").foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("New Message")
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
    }

    private var searchField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").font(.footnote).foregroundStyle(Theme.faint)
            TextField("Search", text: $filter)
                .font(.subheadline)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !filter.isEmpty {
                Button { filter = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.faint) }
                    .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.rail))
        .padding(.horizontal, 10)
        .padding(.bottom, 6)
    }

    private var serverName: String {
        guard let server else { return "Direct Messages" }
        return account.spaces.first { $0.roomId == server }?.displayName ?? "Server"
    }

    private func joinAll(_ server: String) {
        joiningAll = true
        Task {
            let failed = await account.joinAllChannels(inSpace: server)
            joiningAll = false
            if failed > 0 { joinError = "\(failed) channel(s) could not be joined. They may need an invite." }
        }
    }

    @ViewBuilder
    private var homeChannels: some View {
        let invites = account.invites.filter { matches($0.name) }
        if !invites.isEmpty {
            Section {
                ForEach(invites) { invite in
                    InviteRow(account: account, invite: invite) { joinError = $0 }
                        .listRowBackground(Color.clear)
                }
            } header: { sectionHeader("Invites") }
        }
        let favourites = (account.directMessages + account.roomsOutsideServers).filter { $0.isFavourite && matches($0.name) }
        if !favourites.isEmpty {
            Section {
                ForEach(favourites) { room in
                    RoomRow(account: account, room: room, icon: room.isDirect ? nil : "number")
                        .tag(Destination.text(room.id))
                        .listRowBackground(rowBackground(.text(room.id)))
                        .contextMenu { roomMenu(room.id) }
                }
            } header: { sectionHeader("Favourites") }
        }
        let direct = account.directMessages.filter { !$0.isFavourite && matches($0.name) }
        Section {
            ForEach(direct) { room in
                RoomRow(account: account, room: room, icon: nil)
                    .tag(Destination.text(room.id))
                    .listRowBackground(rowBackground(.text(room.id)))
                    .contextMenu { roomMenu(room.id) }
            }
            if direct.isEmpty && query.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("No conversations yet.").font(.subheadline).foregroundStyle(Theme.muted)
                    Button("Start a conversation") { sheet = .newMessage }.font(.subheadline.weight(.semibold))
                }
                .listRowBackground(Color.clear)
            }
        } header: { sectionHeader("Direct Messages") }
        let others = account.roomsOutsideServers.filter { !$0.isFavourite && matches($0.name) }
        if !others.isEmpty {
            Section {
                ForEach(others) { room in
                    RoomRow(account: account, room: room, icon: "number")
                        .tag(Destination.text(room.id))
                        .listRowBackground(rowBackground(.text(room.id)))
                        .contextMenu { roomMenu(room.id) }
                }
            } header: { sectionHeader("Rooms") }
        }
    }

    @ViewBuilder
    private func serverChannels(_ server: String) -> some View {
        let categories = account.categories[server] ?? []
        let unjoined = account.unjoinedChannels(inSpace: server)
        if categories.isEmpty {
            if account.loadedServers.contains(server) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("This server has no channels yet.").font(.subheadline).foregroundStyle(Theme.muted)
                    Button("Create a channel") { sheet = .createChannel(server) }.font(.subheadline.weight(.semibold))
                }
                .listRowBackground(Color.clear)
            } else {
                HStack { Spacer(); ProgressView(); Spacer() }.listRowBackground(Color.clear)
            }
        }
        // Matrix only shows who is in voice for channels you have joined, unlike Discord.
        if unjoined.count > 1 && query.isEmpty {
            Button { joinAll(server) } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if joiningAll { ProgressView() }
                        Text("Join all \(unjoined.count) channels").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
                    }
                    Text("See messages and who is in voice everywhere.").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            .disabled(joiningAll)
            .listRowBackground(Color.clear)
        }
        ForEach(categories) { category in
            let channels = category.channels.filter { matches($0.displayName) }
            if !channels.isEmpty {
                Section {
                    ForEach(channels) { channel in
                        channelRow(channel)
                    }
                } header: { sectionHeader(category.name) }
            }
        }
    }

    @ViewBuilder
    private func channelRow(_ channel: SpaceRoom) -> some View {
        let destination = account.destination(for: channel.roomId)
        if account.isJoined(channel) {
            ChannelRow(account: account, channel: channel)
                .tag(destination)
                .listRowBackground(rowBackground(destination))
                .contextMenu { roomMenu(channel.roomId) }
        } else {
            Button {
                joining.insert(channel.roomId)
                Task {
                    do {
                        try await account.join(channel)
                        self.destination = destination
                    } catch { joinError = error.friendlyMessage }
                    joining.remove(channel.roomId)
                }
            } label: {
                ChannelRow(account: account, channel: channel, isJoining: joining.contains(channel.roomId))
                    .opacity(0.55)
            }
            .disabled(joining.contains(channel.roomId))
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

/// An invite waiting for an answer, at the top of Direct Messages.
struct InviteRow: View {
    @ObservedObject var account: MatrixAccount
    let invite: RoomSummary
    let onError: (String) -> Void
    @EnvironmentObject private var navigator: AppNavigator
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                AvatarView(url: invite.avatarUrl, name: invite.name, size: 36, cornerRadius: invite.isSpace ? 10 : nil, account: account)
                VStack(alignment: .leading, spacing: 1) {
                    Text(invite.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            HStack(spacing: 8) {
                Button("Accept") { respond(accept: true) }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.online)
                Button("Decline") { respond(accept: false) }
                    .buttonStyle(.bordered)
            }
            .font(.footnote.weight(.semibold))
            .disabled(busy)
        }
        .padding(.vertical, 4)
    }

    private var subtitle: String {
        if invite.isDirect { return "Wants to message you" }
        let what = invite.isSpace ? "Server invite" : "Room invite"
        return invite.inviterName.map { "\(what) from \($0)" } ?? what
    }

    private func respond(accept: Bool) {
        busy = true
        Task {
            do {
                if accept {
                    try await account.acceptInvite(invite.id)
                    if invite.isSpace {
                        navigator.server = invite.id
                    } else {
                        navigator.open(invite.id, account: account)
                    }
                } else {
                    try await account.declineInvite(invite.id)
                }
            } catch { onError(error.friendlyMessage) }
            busy = false
        }
    }
}

struct ChannelRow: View {
    @ObservedObject var account: MatrixAccount
    let channel: SpaceRoom
    var isJoining = false
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        let summary = account.summary(for: channel.roomId)
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: account.isVoiceChannel(channel.roomId) ? "speaker.wave.2.fill" : "number")
                    .foregroundStyle(summary?.hasCall == true ? Theme.online : Theme.faint)
                    .frame(width: 20)
                Text(channel.displayName)
                    .foregroundStyle((summary?.unread ?? 0) > 0 ? Theme.text : Theme.muted)
                    .fontWeight((summary?.unread ?? 0) > 0 ? .semibold : .regular)
                    .lineLimit(1)
                Spacer()
                if account.notifyLevel(for: channel.roomId) == .mute {
                    Image(systemName: "bell.slash.fill").font(.caption2).foregroundStyle(Theme.faint)
                }
                if isJoining {
                    ProgressView()
                } else if !account.isJoined(channel) {
                    Text("Join").font(.caption.weight(.semibold)).foregroundStyle(Theme.accent)
                } else if let mentions = summary?.mentions, mentions > 0 {
                    UnreadBadge(count: mentions)
                }
            }
            // Discord lists who is connected right under a voice channel.
            if let session = calls.current, session.roomId == channel.roomId {
                LiveVoiceRoster(session: session, account: account)
            } else if let participants = summary?.callParticipants, !participants.isEmpty {
                ForEach(participants, id: \.self) { userId in
                    VoiceRosterRow(
                        name: account.name(of: userId),
                        avatarUrl: account.profiles[userId]?.avatarUrl,
                        account: account
                    )
                }
            }
        }
        .padding(.vertical, 2)
    }
}

/// Who is in the call you are in, with mute and speaking state from the media server.
private struct LiveVoiceRoster: View {
    @ObservedObject var session: CallSession
    let account: MatrixAccount

    var body: some View {
        ForEach(session.members) { member in
            VoiceRosterRow(
                name: member.name,
                avatarUrl: member.avatarUrl,
                isSpeaking: member.isSpeaking && member.microphoneOn,
                isMuted: !member.microphoneOn,
                isConnecting: member.isConnecting,
                account: account
            )
        }
    }
}

struct VoiceRosterRow: View {
    let name: String
    let avatarUrl: String?
    var isSpeaking = false
    var isMuted = false
    var isConnecting = false
    var account: MatrixAccount?

    var body: some View {
        HStack(spacing: 6) {
            AvatarView(url: avatarUrl, name: name, size: 22, account: account)
                .overlay(Circle().stroke(isSpeaking ? Theme.online : .clear, lineWidth: 2))
            Text(name).font(.caption).foregroundStyle(isSpeaking ? Theme.text : Theme.muted).lineLimit(1)
            Spacer(minLength: 0)
            if isConnecting {
                ProgressView().scaleEffect(0.6).frame(width: 14, height: 14)
            } else if isMuted {
                Image(systemName: "mic.slash.fill").font(.caption2).foregroundStyle(Theme.danger)
            }
        }
        .padding(.leading, 28)
        .opacity(isConnecting ? 0.6 : 1)
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
                    .overlay(alignment: .bottomTrailing) { PresenceDot(userId: room.dmUserId, account: account, size: 10).offset(x: 2, y: 2) }
            }
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    if let dm = room.dmUserId, let diddy = account.diddyProfiles[dm] {
                        // A direct message shows the other person's Diddy name style and badges.
                        DiddyName(name: room.name, profile: diddy, fallback: room.unread > 0 ? Theme.text : Theme.muted)
                            .fontWeight(room.unread > 0 ? .semibold : .regular)
                            .lineLimit(1)
                        if let badges = account.diddyBadges[dm] { DiddyBadges(badges: badges, size: 12, account: account) }
                    } else {
                        Text(room.name)
                            .foregroundStyle(room.unread > 0 ? Theme.text : Theme.muted)
                            .fontWeight(room.unread > 0 ? .semibold : .regular)
                            .lineLimit(1)
                    }
                }
                if let last = room.lastMessage {
                    Text(last).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                }
            }
            Spacer()
            if account.notifyLevel(for: room.id) == .mute {
                Image(systemName: "bell.slash.fill").font(.caption2).foregroundStyle(Theme.faint)
            }
            if room.hasCall { Image(systemName: "speaker.wave.2.fill").foregroundStyle(Theme.online) }
            if room.badge > 0 { UnreadBadge(count: room.badge) }
        }
        .diddyNameplate(room.dmUserId.flatMap { account.diddyProfiles[$0]?.nameplate }, account: account)
    }
}

/// Bottom-left panel: own avatar and name, settings.
struct UserPanel: View {
    @ObservedObject var account: MatrixAccount
    @Binding var showSettings: Bool

    var body: some View {
        HStack(spacing: 10) {
            OwnStatusMenu(account: account)
            VStack(alignment: .leading, spacing: 1) {
                Text(account.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(1)
                Text(OwnStatusOptions.info(account.diddyProfiles[account.userId]?.status?.rawValue).shownLabel).font(.caption2).foregroundStyle(Theme.faint).lineLimit(1)
            }
            Spacer()
            PluginsPanelButton()
            Button { showSettings = true } label: {
                Image(systemName: "gearshape.fill").foregroundStyle(Theme.muted)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Settings")
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .padding(.vertical, 6)
        .background(Theme.rail)
    }
}
