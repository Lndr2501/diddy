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
    @State private var running: RoomModerationAction?
    @State private var settingRole = false
    @State private var confirmCancelInvite = false
    @State private var error: String?
    @State private var pendingRole: PendingRole?

    private struct PendingRole: Identifiable {
        let power: Int
        let selfDemote: Bool
        var id: Int { power }
    }

    private var isSelf: Bool { userId == account.userId }

    private var power: Int { permissions?.levels.user(userId) ?? 0 }

    private var showsRole: Bool {
        guard let permissions else { return false }
        return !isSelf || RoomRoleChange.canChange(me: account.userId, target: userId, permissions: permissions)
    }

    private var hasRoomRows: Bool {
        showsRole || membership == "ban" || membership == "invite" || options.canInvite || options.canUnban
    }

    private var hasDangerRows: Bool { options.canKick || options.canCancelInvite || options.canBan }

    var body: some View {
        VStack(spacing: 20) {
            if hasRoomRows {
                ProfileRowGroup("In This Room") {
                    if let permissions, showsRole { roleRow(permissions) }
                    if membership == "ban" { statusRow("Banned", reason: membershipReason) }
                    if membership == "invite" { statusRow("Invited", reason: membershipReason) }
                    if options.canInvite {
                        ProfileActionRow(title: "Invite to Room", icon: "person.badge.plus") { prompt = .invite }
                            .disabled(running != nil)
                    }
                    if options.canUnban {
                        ProfileActionRow(title: "Unban", icon: "arrow.uturn.backward", busy: running == .unban) {
                            Task { await run(.unban) }
                        }
                        .disabled(running != nil)
                    }
                }
            }
            if hasDangerRows {
                ProfileRowGroup("Moderation") {
                    if options.canKick {
                        ProfileActionRow(title: "Kick from Room", icon: "person.fill.xmark", destructive: true) { prompt = .kick }
                            .disabled(running != nil)
                    }
                    if options.canCancelInvite {
                        ProfileActionRow(title: "Cancel Invite", icon: "xmark.circle", destructive: true, busy: running == .kick) {
                            confirmCancelInvite = true
                        }
                        .disabled(running != nil)
                    }
                    if options.canBan {
                        ProfileActionRow(title: "Ban from Room", icon: "nosign", destructive: true) { prompt = .ban }
                            .disabled(running != nil)
                    }
                }
                .confirmationDialog("Cancel the invite for \(name)?", isPresented: $confirmCancelInvite, titleVisibility: .visible) {
                    Button("Cancel Invite", role: .destructive) { Task { await run(.kick) } }
                    Button("Keep Invite", role: .cancel) {}
                }
            }
            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(Theme.danger)
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

    private func statusRow(_ title: String, reason: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: "info.circle").frame(width: 22).foregroundStyle(Theme.danger)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.danger)
                Text(reason.map { "Reason: \($0)" } ?? "No reason given").font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
    }

    /// Desktop `PowerChip`: the person's role, changeable for those who outrank them.
    private func roleRow(_ permissions: RoomPermissionsModel) -> some View {
        let current = RoomPowerTags.tag(for: power, in: tags)
        let canChange = RoomRoleChange.canChange(me: account.userId, target: userId, permissions: permissions)
        return HStack(spacing: 12) {
            Image(systemName: "shield").frame(width: 22)
            Text("Role")
            Spacer()
            if settingRole { ProgressView() }
            Menu {
                ForEach(RoomPowerTags.powers(tags), id: \.self) { value in
                    let tag = RoomPowerTags.tag(for: value, in: tags)
                    Button {
                        Task { await choose(value) }
                    } label: {
                        if value == power {
                            Label(tag.name, systemImage: "checkmark")
                        } else {
                            Text(tag.name)
                        }
                    }
                    .disabled(!permissions.canAssign(value, by: account.userId))
                }
            } label: {
                HStack(spacing: 6) {
                    RoleDot(hex: current.color)
                    Text(current.name).foregroundStyle(canChange ? Theme.accent : Theme.muted)
                    if canChange { Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(Theme.muted) }
                }
            }
            .disabled(!canChange || running != nil || settingRole)
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
        running = action
        error = nil
        defer { running = nil }
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
        settingRole = true
        error = nil
        defer { settingRole = false }
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
