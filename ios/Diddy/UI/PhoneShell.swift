import SwiftUI
import UIKit

/// The tabs at the bottom of the iPhone.
enum PhoneTab: Hashable {
    case chats, servers, activity, you
}

/// The iPhone's home: one tab at a time above a tab bar. It lives in the sidebar column of the
/// split view like the iPad's rail and channel list, so opening a room still pushes the chat over
/// everything (tab bar included) and going back returns to the same tab.
struct PhoneHome: View {
    @ObservedObject var account: MatrixAccount
    @Binding var showSettings: Bool
    @Binding var showSearch: Bool
    @EnvironmentObject private var navigator: AppNavigator

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch navigator.tab {
                case .chats:
                    ChannelSidebar(account: account, server: nil, destination: $navigator.destination,
                                   showSettings: $showSettings, showSearch: $showSearch, phone: true)
                case .servers:
                    serversTab
                case .activity:
                    ActivityList(account: account)
                case .you:
                    YouView(account: account, showSettings: $showSettings)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            PhoneTabBar(account: account, tab: $navigator.tab)
        }
        .background(Theme.sidebar)
    }

    /// The server shown in the Servers tab: the one picked last, else the first in the rail.
    private var shownServer: String? {
        if let server = navigator.server, account.spaces.contains(where: { $0.roomId == server }) { return server }
        for entry in account.railEntries {
            switch entry {
            case .space(let id): return id
            case .folder(let folder): if let first = folder.content.first { return first }
            }
        }
        return account.spaces.first?.roomId
    }

    private var serversTab: some View {
        let shown = shownServer
        return VStack(spacing: 0) {
            ServerRail(account: account, selection: Binding(get: { shown }, set: { navigator.server = $0 }), horizontal: true)
                .frame(height: 72)
            if let shown {
                ChannelSidebar(account: account, server: shown, destination: $navigator.destination,
                               showSettings: $showSettings, showSearch: $showSearch, phone: true)
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "square.grid.2x2").font(.system(size: 34)).foregroundStyle(Theme.faint)
                    Text("No servers yet").font(.headline).foregroundStyle(Theme.text)
                    Text("Join or create one with + above, or find one with Explore.")
                        .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

// MARK: - Tab bar

struct PhoneTabBar: View {
    @ObservedObject var account: MatrixAccount
    @Binding var tab: PhoneTab

    var body: some View {
        HStack(spacing: 0) {
            item(.chats, title: "Chats", symbol: "bubble.left", selectedSymbol: "bubble.left.fill", badge: chatsBadge)
            item(.servers, title: "Servers", symbol: "square.grid.2x2", selectedSymbol: "square.grid.2x2.fill", badge: serversBadge)
            item(.activity, title: "Activity", symbol: "bell", selectedSymbol: "bell.fill", badge: activityBadge)
            Button { select(.you) } label: {
                VStack(spacing: 3) {
                    AvatarView(url: account.avatarUrl, name: account.title, size: 24, account: account)
                        .overlay(Circle().strokeBorder(tab == .you ? Theme.text : Color.clear, lineWidth: 1.5).padding(-2.5))
                        .frame(height: 26)
                    Text("You").font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(tab == .you ? Theme.text : Theme.faint)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("You")
            .accessibilityAddTraits(tab == .you ? .isSelected : [])
        }
        .padding(.top, 4)
        .padding(.horizontal, 8)
        .background(Theme.rail.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Theme.text.opacity(0.07)).frame(height: 1) }
    }

    private func select(_ target: PhoneTab) {
        guard tab != target else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        tab = target
    }

    private func item(_ target: PhoneTab, title: String, symbol: String, selectedSymbol: String, badge: Int) -> some View {
        let selected = tab == target
        return Button { select(target) } label: {
            VStack(spacing: 3) {
                Image(systemName: selected ? selectedSymbol : symbol)
                    .font(.system(size: 20, weight: .medium))
                    .frame(height: 26)
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 { TabBadge(count: badge).offset(x: 12, y: -4) }
                    }
                Text(title).font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(selected ? Theme.text : Theme.faint)
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityValue(badge > 0 ? "\(badge) new" : "")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// Conversations with something unread, plus invites.
    private var chatsBadge: Int {
        (account.directMessages + account.roomsOutsideServers).filter { $0.unread > 0 || $0.badge > 0 }.count + account.invites.count
    }

    private var serversBadge: Int {
        Int(account.spaces.reduce(UInt64(0)) { $0 + account.mentionCount(inSpace: $1.roomId) })
    }

    private var activityBadge: Int {
        account.rooms.filter { $0.isJoined && !$0.isSpace && $0.mentions > 0 }.count
    }
}

/// The small count on a tab or a chat row, in the accent colour: something is for you.
struct TabBadge: View {
    let count: Int

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Theme.onAccent)
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 18)
            .background(Capsule().fill(Theme.accent))
            .overlay(Capsule().stroke(Theme.rail, lineWidth: 2))
    }
}

// MARK: - Chat list row

/// One conversation in the iPhone's chat list: picture, name and time, the newest message, and on
/// the right a dot for unread or the accent count for mentions. Muted chats are faded.
struct ChatListRow: View {
    @ObservedObject var account: MatrixAccount
    let room: RoomSummary
    /// The Activity tab says which server a channel belongs to.
    var context: String?

    private var unread: Bool { room.unread > 0 || room.badge > 0 }
    private var muted: Bool { account.notifyLevel(for: room.id) == .mute }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: room.avatarUrl, name: room.name, size: 48, account: account)
                .overlay(alignment: .bottomTrailing) {
                    PresenceDot(userId: room.dmUserId, account: account, size: 12, ring: Theme.sidebar).offset(x: 2, y: 2)
                }
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    name
                    Spacer(minLength: 4)
                    if let date = room.lastActivity {
                        Text(Self.timeLabel(date))
                            .font(.caption)
                            .foregroundStyle(unread ? Theme.text : Theme.faint)
                            .fixedSize()
                    }
                }
                HStack(spacing: 6) {
                    Text(previewText)
                        .font(.subheadline)
                        .foregroundStyle(unread ? Theme.text : Theme.muted)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if room.hasCall {
                        Image(systemName: "speaker.wave.2.fill").font(.caption).foregroundStyle(Theme.online)
                            .accessibilityLabel("Call in progress")
                    }
                    if muted {
                        Image(systemName: "bell.slash.fill").font(.caption2).foregroundStyle(Theme.faint)
                            .accessibilityLabel("Muted")
                    }
                    if room.mentions > 0 {
                        TabBadge(count: Int(room.mentions))
                    } else if unread && !muted {
                        Circle().fill(Theme.text).frame(width: 9, height: 9)
                            .accessibilityLabel("Unread")
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .opacity(muted ? 0.55 : 1)
    }

    @ViewBuilder private var name: some View {
        let weight: Font.Weight = unread ? .bold : .medium
        if let dm = room.dmUserId, let diddy = account.diddyProfiles[dm] {
            DiddyName(name: room.name, profile: diddy, font: .body.weight(weight), size: 17, fallback: Theme.text)
                .lineLimit(1)
        } else {
            Text(room.name).font(.body.weight(weight)).foregroundStyle(Theme.text).lineLimit(1)
        }
    }

    private var previewText: String {
        let text = room.lastMessage ?? (room.hasCall ? "Call in progress" : "")
        guard let context else { return text }
        return text.isEmpty ? context : context + " · " + text
    }

    static func timeLabel(_ date: Date) -> String {
        ChatListLogic.timeLabel(
            date,
            clock: { ChatSettings.time($0) },
            weekday: { $0.formatted(.dateTime.weekday(.abbreviated)) },
            short: { ChatSettings.date($0) }
        )
    }
}

// MARK: - Call card

/// Above the chat list: the call you are in (Return), or one going on in a room of yours (Join).
struct PhoneCallCard: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        if let session = calls.current {
            OngoingPhoneCallCard(session: session)
        } else if let room = account.rooms.first(where: { $0.isJoined && !$0.isSpace && !$0.callParticipants.isEmpty }) {
            let place = account.server(of: room.id).map { account.serverInfo($0).name }
            let count = room.callParticipants.count
            PhoneCallCardBody(
                title: room.name,
                subtitle: [place, count == 1 ? "1 in call" : "\(count) in call"].compactMap { $0 }.joined(separator: " · "),
                action: "Join",
                tint: Theme.online
            ) {
                HStack(spacing: -6) {
                    ForEach(room.callParticipants.prefix(3), id: \.self) { userId in
                        AvatarView(url: account.profiles[userId]?.avatarUrl, name: account.name(of: userId), size: 24, account: account)
                            .overlay(Circle().stroke(Theme.sidebar, lineWidth: 2))
                    }
                }
            } onTap: {
                Task { await calls.requestJoin(account: account, roomId: room.id, roomName: room.name, showCallScreen: true) }
            }
            .onAppear { account.resolveProfiles(room.callParticipants, in: room.id) }
        }
    }
}

private struct OngoingPhoneCallCard: View {
    @ObservedObject var session: CallSession
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        PhoneCallCardBody(
            title: session.roomName,
            subtitle: session.isReconnecting ? "Reconnecting…" : "\(session.members.count) in voice",
            action: "Return",
            tint: session.isReconnecting ? .orange : Theme.online
        ) {
            Image(systemName: session.microphoneOn ? "waveform" : "mic.slash.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(session.microphoneOn ? Theme.online : Theme.danger)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Theme.text.opacity(0.08)))
        } onTap: {
            calls.showCallScreen = true
        }
    }
}

private struct PhoneCallCardBody<Leading: View>: View {
    let title: String
    let subtitle: String
    let action: String
    let tint: Color
    let leading: Leading
    let onTap: () -> Void

    init(title: String, subtitle: String, action: String, tint: Color, @ViewBuilder leading: () -> Leading, onTap: @escaping () -> Void) {
        self.title = title
        self.subtitle = subtitle
        self.action = action
        self.tint = tint
        self.leading = leading()
        self.onTap = onTap
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                leading
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                }
                Spacer(minLength: 8)
                Text(action)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Color.black.opacity(0.85))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(tint))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint.opacity(0.12)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(subtitle)")
        .accessibilityHint(action)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Activity

/// Everything that mentions you or wants your attention, newest first, across chats and servers.
struct ActivityList: View {
    @ObservedObject var account: MatrixAccount
    @EnvironmentObject private var navigator: AppNavigator

    private var rooms: [RoomSummary] {
        let open = account.rooms.filter { $0.isJoined && !$0.isSpace && ($0.mentions > 0 || $0.notifications > 0) }
        return ChatListLogic.sortedByActivity(open) { $0.lastActivity }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Activity").font(.largeTitle.bold()).foregroundStyle(Theme.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.top, 6)
            .padding(.bottom, 8)
            let shown = rooms
            if shown.isEmpty && account.invites.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "bell").font(.system(size: 34)).foregroundStyle(Theme.faint)
                    Text("You're all caught up").font(.headline).foregroundStyle(Theme.text)
                    Text("Mentions and new messages that notify you show up here.")
                        .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(selection: $navigator.destination) {
                    if !account.invites.isEmpty {
                        Section {
                            ForEach(account.invites) { invite in
                                InviteRow(account: account, invite: invite) { _ in }
                                    .listRowBackground(Color.clear)
                            }
                        } header: {
                            Text("INVITES").font(.caption.weight(.bold)).foregroundStyle(Theme.faint)
                        }
                    }
                    ForEach(shown) { room in
                        ChatListRow(account: account, room: room, context: place(of: room))
                            .tag(account.destination(for: room.id))
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 12))
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.sidebar)
    }

    /// "Diddy Dev · #bugs" style context for a channel in a server; nothing for chats.
    private func place(of room: RoomSummary) -> String? {
        account.server(of: room.id).map { account.serverInfo($0).name }
    }
}

// MARK: - You

/// Your profile and status, the call you are in, plugins and the way to Settings.
struct YouView: View {
    @ObservedObject var account: MatrixAccount
    @Binding var showSettings: Bool
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                VStack(spacing: 8) {
                    OwnStatusMenu(account: account, size: 84)
                    DiddyName(name: account.title, profile: account.diddyProfiles[account.userId], font: .title2.bold(), size: 22, fallback: Theme.text)
                        .lineLimit(1)
                    Text(account.userId).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
                    Text(OwnStatusOptions.info(account.diddyProfiles[account.userId]?.status?.rawValue).shownLabel)
                        .font(.footnote).foregroundStyle(Theme.faint)
                    Text("Tap your picture to change your status or edit your profile.")
                        .font(.caption).foregroundStyle(Theme.faint)
                }
                .padding(.top, 28)

                if let call = calls.current {
                    VoiceStatusBar(session: call)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                VStack(spacing: 0) {
                    youRow("gearshape.fill", "Settings") { showSettings = true }
                }
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.elevated))

                DiddyServerNotice(account: account)
                PluginDockView()
                HStack {
                    Spacer()
                    PluginsPanelButton()
                    Spacer()
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.sidebar)
    }

    private func youRow(_ symbol: String, _ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol).font(.system(size: 17)).foregroundStyle(Theme.muted).frame(width: 24)
                Text(title).font(.body).foregroundStyle(Theme.text)
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.faint)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
