import MatrixRustSDK
import SwiftUI

/// The moderation part of the profile card, like desktop's `UserRoomProfile`: the role of the
/// person, Invite to Room, Kick from Room and Ban from Room (each with an optional reason),
/// Unban and Cancel Invite. What is offered follows the room's power levels (room version 12
/// creators included).
struct RoomModerationRows: View {
    @ObservedObject var account: MatrixAccount
    let userId: String
    let roomId: String
    let name: String
    /// Called when the person is gone from the room (kick, ban), so the card can close.
    var onRemoved: () -> Void = {}

    @State private var permissions: RoomPermissionsModel?
    @State private var tags: [Int: RoomPowerTag] = [:]
    @State private var membership: String?
    @State private var membershipReason: String?
    @State private var options = RoomModerationOptions()
    @State private var prompt: RoomModerationAction?
    @State private var busy = false
    @State private var error: String?
    @State private var pendingRole: PendingRole?

    private struct PendingRole: Identifiable {
        let power: Int
        let selfDemote: Bool
        var id: Int { power }
    }

    private var isSelf: Bool { userId == account.userId }

    private var power: Int { permissions?.levels.user(userId) ?? 0 }

    var body: some View {
        VStack(spacing: 0) {
            if let permissions, !isSelf || RoomRoleChange.canChange(me: account.userId, target: userId, permissions: permissions) {
                roleRow(permissions)
            }
            if membership == "ban" { statusRow("Banned User", reason: membershipReason) }
            if membership == "invite" { statusRow("Invited User", reason: membershipReason) }
            if options.canInvite { actionRow("Invite to Room", icon: "person.badge.plus") { prompt = .invite } }
            if options.canKick { actionRow("Kick from Room", icon: "person.fill.xmark", role: .destructive) { prompt = .kick } }
            if options.canCancelInvite {
                actionRow("Cancel Invite", icon: "person.fill.xmark", role: .destructive) { Task { await run(.kick) } }
            }
            if options.canBan { actionRow("Ban from Room", icon: "nosign", role: .destructive) { prompt = .ban } }
            if options.canUnban { actionRow("Unban", icon: "arrow.uturn.backward") { Task { await run(.unban) } } }
            if let error {
                Text(error).font(.footnote).foregroundStyle(Theme.danger).padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task { await load() }
        .sheet(item: $prompt) { action in
            ModerationReasonSheet(account: account, roomId: roomId, userId: userId, name: name, action: action) {
                Task {
                    await load()
                    if action == .kick || action == .ban { onRemoved() }
                }
            }
        }
        .confirmationDialog(
            pendingRole?.selfDemote == true ? "Demote yourself?" : "Give the same power as yours?",
            isPresented: Binding(get: { pendingRole != nil }, set: { if !$0 { pendingRole = nil } }),
            titleVisibility: .visible,
            presenting: pendingRole
        ) { pending in
            Button(pending.selfDemote ? "Demote" : "Promote", role: .destructive) {
                Task { await setRole(pending.power) }
            }
        } message: { pending in
            Text(pending.selfDemote
                 ? "You are about to demote yourself! You will not be able to regain this power yourself. Are you sure?"
                 : "You are promoting the user to have the same power as yourself! You will not be able to change their power afterward. Are you sure?")
        }
    }

    // MARK: Rows

    private func actionRow(_ title: String, icon: String, role: ButtonRole? = nil, action: @escaping () -> Void) -> some View {
        Button(role: role, action: action) {
            HStack {
                Label(title, systemImage: icon)
                Spacer()
                if busy { ProgressView() }
            }
            .padding(14)
            .contentShape(Rectangle())
            .foregroundStyle(role == .destructive ? Theme.danger : Theme.text)
        }
        .disabled(busy)
    }

    private func statusRow(_ title: String, reason: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption.weight(.bold)).foregroundStyle(Theme.danger)
            Text(reason.map { "Reason: \($0)" } ?? "No Reason Provided.").font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
    }

    /// Desktop `PowerChip`: the person's role, changeable for those who outrank them.
    private func roleRow(_ permissions: RoomPermissionsModel) -> some View {
        let current = RoomPowerTags.tag(for: power, in: tags)
        let canChange = RoomRoleChange.canChange(me: account.userId, target: userId, permissions: permissions)
        return HStack {
            Label("Role", systemImage: "shield")
            Spacer()
            Menu {
                ForEach(RoomPowerTags.powers(tags), id: \.self) { value in
                    let tag = RoomPowerTags.tag(for: value, in: tags)
                    Button {
                        Task { await choose(value) }
                    } label: {
                        Text(value == power ? "✓ \(tag.name)" : tag.name)
                    }
                    .disabled(!permissions.canAssign(value, by: account.userId))
                }
            } label: {
                HStack(spacing: 6) {
                    RoleDot(hex: current.color)
                    Text(current.name)
                    if canChange { Image(systemName: "chevron.down").font(.caption2) }
                }
            }
            .disabled(!canChange || busy)
        }
        .padding(14)
        .foregroundStyle(Theme.text)
    }

    // MARK: Loading and changing

    private func load() async {
        guard roomId.hasPrefix("!") else { return }
        let levelsContent = await account.roomStateContent(roomId, type: "m.room.power_levels")
        let tagContent = await account.roomStateContent(roomId, type: RoomPowerTags.eventType)
        let memberContent = await account.roomStateContent(roomId, type: "m.room.member", key: userId)
        let levels = RoomPowerLevelsModel(content: levelsContent)

        // Room creators (room version 12) have every power; the SDK knows who they are.
        var creators: Set<String> = []
        for id in [account.userId, userId] {
            if let found = try? await account.room(roomId)?.member(userId: id), MemberEntry(found).isOwner {
                creators.insert(id)
            }
        }
        let all = RoomPermissionsModel(creators: creators, levels: levels)
        permissions = all
        tags = RoomPowerTags.tags(content: tagContent, levels: levels)
        membership = memberContent?["membership"] as? String
        let reason = (memberContent?["reason"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        membershipReason = reason?.isEmpty == false ? reason : nil
        options = RoomModerationOptions.compute(permissions: all, me: account.userId, target: userId, membership: membership)
    }

    private func run(_ action: RoomModerationAction) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await account.moderate(action, userId: userId, in: roomId)
            await load()
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private func choose(_ value: Int) async {
        guard let permissions else { return }
        switch RoomRoleChange.outcome(power: value, target: userId, me: account.userId, permissions: permissions) {
        case .refused, .unchanged: return
        case .confirmSelfDemote: pendingRole = PendingRole(power: value, selfDemote: true)
        case .confirmSharedPower: pendingRole = PendingRole(power: value, selfDemote: false)
        case .apply: await setRole(value)
        }
    }

    private func setRole(_ value: Int) async {
        guard let permissions else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let content = RoomRoleChange.content(levels: permissions.levels, userId: userId, power: value)
            _ = try await account.clientRequest(
                RoomSettingsAPI.rooms(roomId, "/state/\(RoomSettingsAPI.enc(RoomRoleChange.powerLevelsType))"),
                body: content,
                method: "PUT"
            )
            await load()
        } catch {
            self.error = error.friendlyMessage
        }
    }
}

/// Desktop `ModerationPrompt`: what will happen, an optional reason, and the button.
struct ModerationReasonSheet: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    let userId: String
    let name: String
    let action: RoomModerationAction
    var onDone: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("\(name) \(action.text)")
                    TextField("Reason (optional)", text: $reason)
                        .disabled(working)
                }
                if let error {
                    Section { Text(error).font(.footnote.bold()).foregroundStyle(Theme.danger) }
                }
                Section {
                    Button(role: action == .invite ? nil : .destructive) {
                        Task { await submit() }
                    } label: {
                        HStack {
                            if working { ProgressView() }
                            Text(action.title)
                        }
                    }
                    .disabled(working)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("\(action.title) \(name)?")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .interactiveDismissDisabled(working)
        }
        .presentationDetents([.medium])
    }

    private func submit() async {
        working = true
        error = nil
        defer { working = false }
        do {
            try await account.moderate(action, userId: userId, in: roomId, reason: reason)
            dismiss()
            onDone()
        } catch {
            self.error = error.friendlyMessage
        }
    }
}
