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
                                    account: account
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
                                    PersonRow(name: entry.name, subtitle: entry.userId, avatarUrl: entry.avatarUrl, account: account)
                                }
                                .listRowBackground(Color.clear)
                            }
                        } header: { groupHeader(group.title, count: entries.count) }
                    }
                }
                if !store.loading && filtered.isEmpty {
                    Text(store.error ?? (search.isEmpty ? "Nobody here yet." : "No one matches “\(search)”."))
                        .foregroundStyle(Theme.muted)
                        .listRowBackground(Color.clear)
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
            .task { await store.load(account: account, roomId: roomId) }
            .refreshable { await store.load(account: account, roomId: roomId) }
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

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: avatarUrl, name: name, size: 36, account: account)
            VStack(alignment: .leading, spacing: 1) {
                Text(name).foregroundStyle(Theme.text).lineLimit(1)
                if let subtitle { Text(subtitle).font(.caption).foregroundStyle(Theme.faint).lineLimit(1) }
            }
            Spacer(minLength: 0)
            if let trailing { Image(systemName: trailing).foregroundStyle(Theme.online).font(.caption) }
        }
        .contentShape(Rectangle())
    }
}

/// The card Discord opens when you tap someone.
struct UserProfileSheet: View {
    @ObservedObject var account: MatrixAccount
    let userId: String
    var roomId: String?
    var onOpenedChat: () -> Void = {}
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss
    @State private var member: MemberEntry?
    @State private var canKick = false
    @State private var canBan = false
    @State private var ignored = false
    @State private var busy = false
    @State private var error: String?
    @State private var confirm: ModerationAction?

    private enum ModerationAction: Identifiable {
        case kick, ban
        var id: Self { self }
        var title: String { self == .kick ? "Remove from room" : "Ban" }
    }

    private var isSelf: Bool { userId == account.userId }
    private var profile: UserSummary? { account.profiles[userId] }
    private var name: String { member?.name ?? account.name(of: userId) }
    private var avatar: String? { member?.avatarUrl ?? profile?.avatarUrl }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    AvatarView(url: avatar, name: name, size: 96, account: account)
                    VStack(spacing: 4) {
                        Text(name).font(.title2.bold()).foregroundStyle(Theme.text)
                        Text(userId).font(.footnote).foregroundStyle(Theme.muted).textSelection(.enabled)
                        if let group = member?.group, group != .member {
                            Text(group == .owner ? "Owner" : String(group.title.dropLast()))
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10).padding(.vertical, 3)
                                .background(Capsule().fill(Theme.elevated))
                                .foregroundStyle(Theme.accent)
                                .padding(.top, 4)
                        }
                    }
                    if !isSelf {
                        Button { Task { await openChat() } } label: {
                            HStack {
                                if busy { ProgressView().tint(.white) }
                                Label("Message", systemImage: "bubble.left.fill").bold()
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(RoundedRectangle(cornerRadius: 10).fill(Theme.accent))
                            .foregroundStyle(.white)
                        }
                        .disabled(busy)
                    }
                    VStack(spacing: 0) {
                        actionRow("Copy User ID", icon: "doc.on.doc") { UIPasteboard.general.string = userId }
                        if !isSelf {
                            actionRow(ignored ? "Unblock" : "Block", icon: "hand.raised.fill", role: ignored ? nil : .destructive) {
                                Task { await toggleIgnore() }
                            }
                            if canKick { actionRow("Remove from room", icon: "person.fill.xmark", role: .destructive) { confirm = .kick } }
                            if canBan { actionRow("Ban", icon: "nosign", role: .destructive) { confirm = .ban } }
                        }
                    }
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.elevated))
                    if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
                }
                .padding(20)
            }
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .confirmationDialog(
                "\(confirm?.title ?? "") \(name)?",
                isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
                titleVisibility: .visible
            ) {
                if let action = confirm {
                    Button(action.title, role: .destructive) { Task { await moderate(action) } }
                }
            }
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
    }

    private func actionRow(_ title: String, icon: String, role: ButtonRole? = nil, action: @escaping () -> Void) -> some View {
        Button(role: role, action: action) {
            HStack {
                Label(title, systemImage: icon)
                Spacer()
            }
            .padding(14)
            .contentShape(Rectangle())
            .foregroundStyle(role == .destructive ? Theme.danger : Theme.text)
        }
    }

    private func load() async {
        account.resolveProfiles([userId], in: roomId ?? "")
        ignored = ((try? await account.client.ignoredUsers()) ?? []).contains(userId)
        guard let roomId, let room = account.room(roomId), let found = try? await room.member(userId: userId) else { return }
        let entry = MemberEntry(found)
        member = entry
        guard !isSelf, let levels = try? await room.getPowerLevels(),
              let own = try? await room.member(userId: account.userId) else { return }
        let ownEntry = MemberEntry(own)
        // Moderation only ever works downwards: you cannot remove someone at or above your level.
        let outranks = ownEntry.powerLevel > entry.powerLevel && !entry.isOwner
        canKick = outranks && levels.canOwnUserKick()
        canBan = outranks && levels.canOwnUserBan()
    }

    private func openChat() async {
        busy = true
        defer { busy = false }
        do {
            let id = try await account.directMessage(with: userId)
            try await account.waitForRoom(id)
            onOpenedChat()
            dismiss()
            navigator.open(id, account: account)
        } catch { self.error = error.friendlyMessage }
    }

    private func toggleIgnore() async {
        do {
            if ignored { try await account.client.unignoreUser(userId: userId) } else { try await account.client.ignoreUser(userId: userId) }
            ignored.toggle()
        } catch { self.error = error.friendlyMessage }
    }

    private func moderate(_ action: ModerationAction) async {
        guard let roomId, let room = account.room(roomId) else { return }
        do {
            switch action {
            case .kick: try await room.kickUser(userId: userId, reason: nil)
            case .ban: try await room.banUser(userId: userId, reason: nil)
            }
            dismiss()
        } catch { self.error = error.friendlyMessage }
    }
}
