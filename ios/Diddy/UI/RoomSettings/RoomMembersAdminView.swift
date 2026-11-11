import SwiftUI

/// Desktop common-settings/members: everybody who has a relation to the room, by membership
/// (joined, invited, left, kicked, banned), with Unban and Cancel Invite for those who may.
/// People knocking are listed too; desktop has no approval step for them, so a moderator invites
/// them from their profile card.
struct RoomMembersAdminView: View {
    @ObservedObject var model: RoomSettingsModel
    @State private var filter: RoomMembershipFilter = .joined
    @State private var search = ""
    @State private var selected: RoomMemberState?
    @State private var working: Set<String> = []

    private var permissions: RoomPermissionsModel? { model.state?.permissions }

    var body: some View {
        let all = model.state?.members ?? []
        let counts = Dictionary(grouping: all, by: { $0.filter }).mapValues(\.count)
        let shown = visible(all)
        List {
            Section {
                Picker("Membership", selection: $filter) {
                    ForEach(RoomMembershipFilter.allCases) { kind in
                        Text("\(kind.title) (\(counts[kind] ?? 0))").tag(kind)
                    }
                }
                .pickerStyle(.menu)
            }
            if let error = model.actionError {
                Section { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
            }
            Section {
                if model.state == nil {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if shown.isEmpty {
                    Text(search.isEmpty ? "No \(filter.title.lowercased()) members." : "No match for “\(search)”.")
                        .foregroundStyle(Theme.muted)
                }
                ForEach(shown) { member in
                    Button {
                        selected = member
                    } label: {
                        row(member)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        swipe(member)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar.ignoresSafeArea())
        .searchable(text: $search, prompt: "Search")
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load() }
        .sheet(item: $selected, onDismiss: { Task { await model.load() } }) { member in
            UserProfileSheet(account: model.account, userId: member.userId, roomId: model.roomId)
        }
    }

    private func visible(_ all: [RoomMemberState]) -> [RoomMemberState] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return all.filter { member in
            guard member.filter == filter else { return false }
            if query.isEmpty { return true }
            return (member.displayName ?? "").localizedCaseInsensitiveContains(query)
                || member.userId.localizedCaseInsensitiveContains(query)
        }
    }

    private func row(_ member: RoomMemberState) -> some View {
        let name = member.displayName ?? MatrixAccount.localpart(member.userId)
        return HStack(spacing: 12) {
            AvatarView(url: member.avatarUrl, name: name, size: 36, account: model.account)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).foregroundStyle(Theme.text).lineLimit(1)
                Text(member.userId).font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                if let line = detail(member) {
                    Text(line).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            if working.contains(member.userId) { ProgressView() }
        }
        .contentShape(Rectangle())
    }

    /// "Banned by …" lines like the desktop alerts: who did it, when and why.
    private func detail(_ member: RoomMemberState) -> String? {
        let verb: String
        switch member.filter {
        case .banned?: verb = "Banned by"
        case .kicked?: verb = "Kicked by"
        case .invited?: verb = "Invited by"
        default: return member.reason.map { "Reason: \($0)" }
        }
        var parts: [String] = []
        if let sender = member.sender { parts.append("\(verb): \(model.account.name(of: sender))") }
        if let stamp = member.timestamp {
            let date = Date(timeIntervalSince1970: Double(stamp) / 1000)
            parts.append(date.formatted(date: .abbreviated, time: .shortened))
        }
        parts.append(member.reason.map { "Reason: \($0)" } ?? "No Reason Provided.")
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func swipe(_ member: RoomMemberState) -> some View {
        if let permissions {
            let options = RoomModerationOptions.compute(
                permissions: permissions, me: model.me, target: member.userId, membership: member.membership
            )
            if options.canUnban {
                Button("Unban") { run(.unban, member) }.tint(Theme.accent)
            }
            if options.canCancelInvite {
                Button("Cancel Invite", role: .destructive) { run(.kick, member) }
            }
        }
    }

    private func run(_ action: RoomModerationAction, _ member: RoomMemberState) {
        working.insert(member.userId)
        Task {
            await model.perform {
                try await model.account.moderate(action, userId: member.userId, in: model.roomId)
            }
            await model.load()
            working.remove(member.userId)
        }
    }
}
