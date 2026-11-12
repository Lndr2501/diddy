import MatrixRustSDK
import SwiftUI

/// Discord's role groups, from the room's power levels.
enum MemberGroup: Int, CaseIterable, Identifiable {
    case owner, admin, moderator, member, invited
    var id: Int { rawValue }

    var title: String {
        switch self {
        case .owner: return "Owner"
        case .admin: return "Admins"
        case .moderator: return "Moderators"
        case .member: return "Members"
        case .invited: return "Invited"
        }
    }

    /// The label on someone's profile card.
    var singular: String {
        switch self {
        case .owner: return "Owner"
        case .admin: return "Admin"
        case .moderator: return "Moderator"
        case .member: return "Member"
        case .invited: return "Invited"
        }
    }
}

struct MemberEntry: Identifiable, Hashable {
    let userId: String
    let name: String
    let avatarUrl: String?
    let group: MemberGroup
    let powerLevel: Int64
    let isOwner: Bool
    var id: String { userId }

    init(_ member: RoomMember) {
        userId = member.userId
        name = member.displayName ?? MatrixAccount.localpart(member.userId)
        avatarUrl = member.avatarUrl
        if case .value(let value) = member.powerLevel { powerLevel = value } else { powerLevel = .max }
        switch member.suggestedRoleForPowerLevel {
        case .creator: isOwner = true
        default: isOwner = false
        }
        if member.membership == .invite {
            group = .invited
        } else {
            switch member.suggestedRoleForPowerLevel {
            case .creator: group = .owner
            case .administrator: group = .admin
            case .moderator: group = .moderator
            default: group = .member
            }
        }
    }
}

/// Everyone in a channel or server, grouped by role and searchable.
@MainActor
final class MemberStore: ObservableObject {
    @Published private(set) var members: [MemberEntry] = []
    @Published private(set) var loading = false
    @Published private(set) var error: String?

    func load(account: MatrixAccount, roomId: String) async {
        guard let room = account.room(roomId) else {
            error = "This room is not available yet."
            return
        }
        loading = true
        defer { loading = false }
        do {
            let iterator: RoomMembersIterator
            if let fresh = try? await room.members() { iterator = fresh } else { iterator = try await room.membersNoSync() }
            var result: [MemberEntry] = []
            while let chunk = iterator.nextChunk(chunkSize: 500), !chunk.isEmpty {
                for member in chunk where !member.isServiceMember && (member.membership == .join || member.membership == .invite) {
                    result.append(MemberEntry(member))
                    account.remember(userId: member.userId, name: member.displayName, avatarUrl: member.avatarUrl)
                }
            }
            members = result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            error = nil
        } catch {
            self.error = error.friendlyMessage
        }
    }
}

struct MembersView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    var title = "Members"
    @StateObject private var store = MemberStore()
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var selected: MemberEntry?
    @State private var inviting = false

    private var callParticipants: [String] { account.summary(for: roomId)?.callParticipants ?? [] }
    private var canInvite: Bool { account.summary(for: roomId)?.isDirect != true }

    private var filtered: [MemberEntry] {
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return store.members }
        return store.members.filter { $0.name.localizedCaseInsensitiveContains(query) || $0.userId.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            List {
                if search.isEmpty && !callParticipants.isEmpty {
                    Section {
                        ForEach(callParticipants, id: \.self) { userId in
                            let entry = store.members.first { $0.userId == userId }
                            Button {
                                selected = entry
                            } label: {
                                PersonRow(
                                    name: entry?.name ?? account.name(of: userId),
                                    subtitle: "In voice",
                                    avatarUrl: entry?.avatarUrl ?? account.profiles[userId]?.avatarUrl,
                                    trailing: "speaker.wave.2.fill",
                                    account: account,
                                    userId: userId
                                )
                            }
                            .listRowBackground(Color.clear)
                        }
                    } header: { groupHeader("In Voice", count: callParticipants.count) }
                }
                ForEach(MemberGroup.allCases) { group in
                    let entries = filtered.filter { $0.group == group }
                    if !entries.isEmpty {
                        Section {
                            ForEach(entries) { entry in
                                Button { selected = entry } label: {
                                    PersonRow(name: entry.name, subtitle: entry.userId, avatarUrl: entry.avatarUrl, account: account, userId: entry.userId)
                                }
                                .listRowBackground(Color.clear)
                            }
                        } header: { groupHeader(group.title, count: entries.count) }
                    }
                }
                if !store.loading && filtered.isEmpty {
                    emptyState.listRowBackground(Color.clear)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .overlay { if store.loading && store.members.isEmpty { ProgressView() } }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search members")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                if canInvite {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button { inviting = true } label: { Image(systemName: "person.badge.plus") }
                            .accessibilityLabel("Invite people")
                    }
                }
            }
            .task {
                await store.load(account: account, roomId: roomId)
                await account.loadDiddyProfiles()
            }
            .refreshable {
                await store.load(account: account, roomId: roomId)
                await account.loadDiddyProfiles(force: true)
            }
            .sheet(item: $selected, onDismiss: {
                Task { await store.load(account: account, roomId: roomId) }
            }) { entry in
                UserProfileSheet(account: account, userId: entry.userId, roomId: roomId, onOpenedChat: { dismiss() })
            }
            .sheet(isPresented: $inviting, onDismiss: {
                Task { await store.load(account: account, roomId: roomId) }
            }) {
                InviteView(account: account, roomId: roomId)
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if let error = store.error {
            VStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle").font(.title2).foregroundStyle(Theme.faint)
                Text(error).font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                Button("Try Again") { Task { await store.load(account: account, roomId: roomId) } }
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        } else if search.isEmpty {
            Text("Nobody here yet.")
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
        } else {
            VStack(spacing: 6) {
                Image(systemName: "magnifyingglass").font(.title2).foregroundStyle(Theme.faint)
                Text("No one matches “\(search)”.").foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        }
    }

    private func groupHeader(_ title: String, count: Int) -> some View {
        Text("\(title.uppercased()) — \(count)")
            .font(.caption.weight(.bold))
            .foregroundStyle(Theme.faint)
    }
}

struct PersonRow: View {
    let name: String
    var subtitle: String?
    let avatarUrl: String?
    var trailing: String?
    var account: MatrixAccount?
    /// Set to show the person's Diddy name style, status, nameplate and badges.
    var userId: String?

    private var diddy: DiddyProfile? { userId.flatMap { account?.diddyProfiles[$0] } }
    private var badges: [DiddyBadge] { userId.flatMap { account?.diddyBadges[$0] } ?? [] }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: avatarUrl, name: name, size: 36, account: account)
                .overlay(alignment: .bottomTrailing) { PresenceDot(userId: userId, account: account, size: 11).offset(x: 2, y: 2) }
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    DiddyName(name: name, profile: diddy).lineLimit(1)
                    if !badges.isEmpty { DiddyBadges(badges: badges, account: account) }
                }
                if let subtitle { Text(subtitle).font(.caption).foregroundStyle(Theme.faint).lineLimit(1) }
            }
            Spacer(minLength: 0)
            if let trailing { Image(systemName: trailing).foregroundStyle(Theme.online).font(.caption) }
        }
        .contentShape(Rectangle())
        // Diddy's nameplate (colour, gradient, picture or loop) behind the row.
        .diddyNameplate(diddy?.nameplate, account: account)
    }
}

/// The card Discord opens when you tap someone: banner, avatar with presence, name and status,
/// the main actions (Message, Call, Verify), the Diddy card modules, then the room part (role,
/// invite, unban; kick and ban in red) and Block at the bottom.
struct UserProfileSheet: View {
    @ObservedObject var account: MatrixAccount
    let userId: String
    var roomId: String?
    var onOpenedChat: () -> Void = {}
    @EnvironmentObject private var navigator: AppNavigator
    @EnvironmentObject private var calls: CallManager
    @Environment(\.dismiss) private var dismiss
    @State private var member: MemberEntry?
    @State private var ignored = false
    @State private var busy: Busy?
    @State private var error: String?
    @State private var confirmBlock = false
    @State private var copied = false

    private enum Busy { case message, call, block }

    private var isSelf: Bool { userId == account.userId }
    private var profile: UserSummary? { account.profiles[userId] }
    private var name: String { member?.name ?? account.name(of: userId) }
    private var avatar: String? { member?.avatarUrl ?? profile?.avatarUrl }
    private var diddy: DiddyProfile? { account.diddyProfiles[userId] }
    private var badges: [DiddyBadge] { account.diddyBadges[userId] ?? [] }

    /// A frame or effect needs a visible card to sit on.
    private var decorated: Bool { diddy?.frame?.resolved != nil || diddy?.effect != nil }

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                ScrollView {
                    VStack(spacing: 20) {
                        // The card with the owner's profile frame around it and their effect over it,
                        // like the desktop profile card.
                        DiddyProfileFrameBox(frame: diddy?.frame, account: account, available: max(0, proxy.size.width - 40)) {
                            card
                        }
                        if let error {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.footnote)
                                .foregroundStyle(Theme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ProfileRowGroup {
                            ProfileActionRow(title: copied ? "Copied" : "Copy User ID", icon: copied ? "checkmark" : "doc.on.doc") {
                                UIPasteboard.general.string = userId
                                copied = true
                            }
                        }
                        // Role, invite, kick and ban (with a reason), unban: RoomSettings/RoomModerationViews.swift
                        if let roomId {
                            RoomModerationRows(account: account, userId: userId, roomId: roomId, name: name, onRemoved: { dismiss() })
                        }
                        if !isSelf {
                            ProfileRowGroup {
                                ProfileActionRow(
                                    title: ignored ? "Unblock" : "Block",
                                    icon: "hand.raised.fill",
                                    destructive: !ignored,
                                    busy: busy == .block
                                ) {
                                    if ignored { Task { await toggleIgnore() } } else { confirmBlock = true }
                                }
                                .disabled(busy != nil)
                            }
                            .confirmationDialog("Block \(name)?", isPresented: $confirmBlock, titleVisibility: .visible) {
                                Button("Block", role: .destructive) { Task { await toggleIgnore() } }
                            } message: {
                                Text("You will no longer see their messages or invites. You can unblock them later.")
                            }
                        }
                    }
                    .padding(20)
                }
                .background(Theme.sidebar.ignoresSafeArea())
            }
            .navigationBarTitleDisplayMode(.inline)
            .verificationSheet(account: account)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task {
                await load()
                await account.loadDiddyProfiles()
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var card: some View {
        VStack(spacing: 16) {
            VStack(spacing: 0) {
                DiddyBanner(profile: diddy, seed: userId, account: account)
                    .frame(height: 100)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                AvatarView(url: avatar, name: name, size: 96, account: account)
                    .overlay(Circle().stroke(Theme.sidebar, lineWidth: 5))
                    .overlay(alignment: .bottomTrailing) { PresenceDot(userId: userId, account: account, size: 22, onDemand: true) }
                    .padding(.top, -48)
            }
            identity
            primaryActions
            if let diddy, diddy.hasCardContent { DiddyCardModules(profile: diddy) }
            if let version = diddy?.clientVersion {
                Text("Diddy \(version)")
                    .font(.caption)
                    .foregroundStyle(Theme.faint)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .accessibilityLabel("Uses Diddy \(version)")
            }
        }
        .padding(decorated ? 10 : 0)
        .background {
            if decorated { RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.sidebar) }
        }
        .overlay {
            if let effect = diddy?.effect {
                DiddyProfileEffectOverlay(effect: effect, account: account)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .allowsHitTesting(false)
            }
        }
    }

    /// Name with badges, the user ID, presence and the room role.
    private var identity: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                DiddyName(name: name, profile: diddy, font: .title2.bold(), size: 22)
                if !badges.isEmpty { DiddyBadges(badges: badges, size: 20, account: account) }
            }
            .multilineTextAlignment(.center)
            Text(userId).font(.footnote).foregroundStyle(Theme.muted).textSelection(.enabled)
            PresenceLabel(userId: userId, account: account)
            AgentTalkingProfileBadge(userId: userId)
            if let group = member?.group, group != .member {
                Text(group.singular)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .background(Capsule().fill(Theme.elevated))
                    .foregroundStyle(Theme.accent)
                    .padding(.top, 4)
            }
        }
    }

    /// Message, Call and Verify side by side; your own card has Edit Diddy Profile instead.
    @ViewBuilder
    private var primaryActions: some View {
        if isSelf {
            NavigationLink { DiddyProfileEditor(account: account) } label: {
                Label("Edit Diddy Profile", systemImage: "paintbrush.fill").bold()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.elevated))
                    .foregroundStyle(Theme.text)
            }
        } else {
            let accent = Color(diddyHex: diddy?.cardAccent)
            HStack(spacing: 8) {
                ProfileActionButton(
                    title: "Message", icon: "bubble.left.fill",
                    fill: accent ?? Theme.accent, foreground: accent == nil ? Theme.onAccent : .white,
                    busy: busy == .message
                ) { Task { await openChat(call: false) } }
                ProfileActionButton(
                    title: "Call", icon: "phone.fill",
                    fill: Theme.elevated, foreground: Theme.text,
                    busy: busy == .call
                ) { Task { await openChat(call: true) } }
                ProfileActionButton(
                    title: "Verify", icon: "checkmark.shield.fill",
                    fill: Theme.elevated, foreground: Theme.text,
                    busy: false
                ) { Task { await VerificationCenter.of(account).requestUserVerification(userId: userId) } }
            }
            .disabled(busy != nil)
        }
    }

    private func load() async {
        account.resolveProfiles([userId], in: roomId ?? "")
        ignored = ((try? await account.client.ignoredUsers()) ?? []).contains(userId)
        guard let roomId, let room = account.room(roomId), let found = try? await room.member(userId: userId) else { return }
        member = MemberEntry(found)
    }

    /// Opens (or starts) the direct message; with `call` it also starts a call there, like the
    /// phone button in the chat.
    private func openChat(call: Bool) async {
        busy = call ? .call : .message
        error = nil
        defer { busy = nil }
        do {
            let id = try await account.directMessage(with: userId)
            try await account.waitForRoom(id)
            onOpenedChat()
            dismiss()
            navigator.open(id, account: account)
            if call {
                await calls.requestJoin(account: account, roomId: id, roomName: name, showCallScreen: true)
            }
        } catch { self.error = error.friendlyMessage }
    }

    private func toggleIgnore() async {
        busy = .block
        error = nil
        defer { busy = nil }
        do {
            if ignored { try await account.client.unignoreUser(userId: userId) } else { try await account.client.ignoreUser(userId: userId) }
            ignored.toggle()
        } catch { self.error = error.friendlyMessage }
    }
}

/// A rounded group of rows on the profile card, with an optional small header (like a List
/// section, but inside the card's scroll view).
struct ProfileRowGroup<Content: View>: View {
    let title: String?
    let content: Content

    init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title {
                Text(title.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.faint)
                    .padding(.leading, 14)
            }
            VStack(spacing: 0) { content }
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.elevated))
        }
    }
}

/// One tappable row in a `ProfileRowGroup`; destructive rows are red.
struct ProfileActionRow: View {
    let title: String
    let icon: String
    var destructive = false
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(role: destructive ? .destructive : nil, action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).frame(width: 22)
                Text(title)
                Spacer()
                if busy { ProgressView() }
            }
            .padding(14)
            .contentShape(Rectangle())
            .foregroundStyle(destructive ? Theme.danger : Theme.text)
        }
        .buttonStyle(.plain)
    }
}

/// Message / Call / Verify on the profile card: icon over a short label.
struct ProfileActionButton: View {
    let title: String
    let icon: String
    let fill: Color
    let foreground: Color
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack {
                    Image(systemName: icon).opacity(busy ? 0 : 1)
                    if busy { ProgressView().tint(foreground) }
                }
                .font(.body.weight(.semibold))
                .frame(height: 22)
                Text(title).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 10).fill(fill))
            .foregroundStyle(foreground)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
