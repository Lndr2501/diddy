import SwiftUI
import UIKit

/// Desktop room-settings/permissions/Permissions.tsx (also used for servers): the founders, the
/// named power levels ("roles"), and who may do what.
struct RoomPermissionsView: View {
    @ObservedObject var model: RoomSettingsModel
    /// Changes not applied yet, by permission (desktop `permissionUpdate`).
    @State private var changes: [PermissionLocation: Int] = [:]
    @State private var applyFailed = false
    @State private var peek: Int?

    private var state: RoomStateSnapshot? { model.state }
    private var groups: [PermissionGroupModel] { RoomPermissionGroups.groups(isSpace: model.isSpace) }
    private var canEditPermissions: Bool { model.canSendState(RoomRoleChange.powerLevelsType) }
    private var canEditPowers: Bool { model.canSendState(RoomPowerTags.eventType) }

    var body: some View {
        Form {
            if let state {
                let levels = state.powerLevels
                let tags = state.powerTags
                if !state.creators.isEmpty { foundersSection }
                powersSection(tags: tags, levels: levels)
                usersSection(tags: tags, levels: levels)
                ForEach(groups) { group in
                    Section(group.name) {
                        ForEach(group.items) { item in
                            permissionRow(item.name, location: item.location, tags: tags, levels: levels)
                        }
                    }
                }
                if !changes.isEmpty { applySection(levels: levels) }
            } else {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar.ignoresSafeArea())
        .navigationTitle("Permissions")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: Binding(get: { peek.map { PeekedPower(power: $0) } }, set: { peek = $0?.power })) { item in
            PeekPermissionsView(model: model, power: item.power)
        }
    }

    private struct PeekedPower: Identifiable {
        let power: Int
        var id: Int { power }
    }

    // MARK: Founders and power levels

    private var foundersSection: some View {
        Section {
            HStack(spacing: 8) {
                RoleDot(hex: RoomPowerTags.creators.color)
                Text(RoomPowerTags.creators.name).bold()
            }
        } header: {
            Text("Founders")
        } footer: {
            Text("Founding members has all permissions and can only be changed during upgrade.")
        }
    }

    private func powersSection(tags: [Int: RoomPowerTag], levels: RoomPowerLevelsModel) -> some View {
        Section {
            ForEach(RoomPowerTags.powers(tags), id: \.self) { power in
                let tag = tags[power] ?? RoomPowerTags.fallback(tags, power: power)
                Button {
                    peek = power
                } label: {
                    HStack(spacing: 8) {
                        RoleDot(hex: tag.color)
                        Text(tag.name).bold().foregroundStyle(Theme.text)
                        if let icon = tag.iconKey, !icon.hasPrefix("mxc://") { Text(icon) }
                        Spacer()
                        Text("\(power)").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
            if canEditPowers {
                NavigationLink {
                    RoomPowersEditor(model: model)
                } label: {
                    Text("Edit")
                }
            }
        } header: {
            Text("Power Levels")
        } footer: {
            Text("Manage and customize incremental power levels for users.")
        }
    }

    // MARK: Permissions

    private func usersSection(tags: [Int: RoomPowerTag], levels: RoomPowerLevelsModel) -> some View {
        Section("Users") {
            permissionRow("Default Power", detail: "Default power level for all users.", location: .user(nil), tags: tags, levels: levels)
        }
    }

    private func permissionRow(_ title: String, detail: String? = nil, location: PermissionLocation,
                               tags: [Int: RoomPowerTag], levels: RoomPowerLevelsModel) -> some View {
        let current = levels.power(at: location)
        let value = changes[location] ?? current
        let maxPower = RoomPowerTags.powers(tags).first ?? 0
        let tag = RoomPowerTags.tag(for: value, in: tags)
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                if let detail { Text(detail).font(.caption).foregroundStyle(Theme.muted) }
            }
            Spacer()
            Menu {
                ForEach(RoomPowerTags.powers(tags), id: \.self) { power in
                    Button {
                        change(location, to: power, from: current)
                    } label: {
                        Text(RoomPowerTags.tag(for: power, in: tags).name + (power < maxPower ? " & Above" : ""))
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(tag.name + (value < maxPower ? " & Above" : ""))
                        .foregroundStyle(value == current ? Theme.accent : Theme.online)
                    if canEditPermissions { Image(systemName: "chevron.down").font(.caption2) }
                }
            }
            .disabled(!canEditPermissions || model.busy)
        }
    }

    private func change(_ location: PermissionLocation, to power: Int, from current: Int) {
        if power == current {
            changes[location] = nil
        } else {
            changes[location] = power
        }
    }

    private func applySection(levels: RoomPowerLevelsModel) -> some View {
        Section {
            if applyFailed || model.actionError != nil {
                Text("Failed to apply changes! Please try again.").font(.footnote.bold()).foregroundStyle(Theme.danger)
            } else {
                Text("Changes saved! Apply when ready.").font(.footnote.bold())
            }
            Button("Reset", role: .cancel) {
                changes = [:]
                applyFailed = false
            }
            .disabled(model.busy)
            Button {
                Task {
                    let content = RoomPermissionGroups.applying(changes, to: levels, groups: groups)
                    let worked = await model.perform {
                        try await model.sendState(RoomRoleChange.powerLevelsType, content: content)
                    }
                    applyFailed = !worked
                    if worked { changes = [:] }
                }
            } label: {
                HStack {
                    if model.busy { ProgressView() }
                    Text("Apply Changes").bold()
                }
            }
            .disabled(model.busy)
        }
    }
}

/// The coloured dot in front of a role (desktop `PowerColorBadge`).
struct RoleDot: View {
    let hex: String?
    var body: some View {
        Circle()
            .fill(Color(diddyHex: hex) ?? Theme.faint)
            .frame(width: 12, height: 12)
    }
}

// MARK: - What a power level may do

/// Desktop `PeekPermissions`: every permission with a tick for what the power allows.
struct PeekPermissionsView: View {
    @ObservedObject var model: RoomSettingsModel
    let power: Int
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let state = model.state {
                    let levels = state.powerLevels
                    ForEach(RoomPermissionGroups.groups(isSpace: model.isSpace)) { group in
                        Section(group.name) {
                            ForEach(group.items) { item in
                                let has = levels.power(at: item.location) <= power
                                Text("\(has ? "✅" : "❌") \(item.name)")
                                    .font(.callout)
                                    .foregroundStyle(has ? Theme.text : Theme.danger)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle(RoomPowerTags.tag(for: power, in: model.state?.powerTags ?? [:]).name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Power level editor

/// Desktop `PowersEditor`: rename, recolour, add and remove the named power levels.
struct RoomPowersEditor: View {
    @ObservedObject var model: RoomSettingsModel
    @Environment(\.dismiss) private var dismiss
    @State private var edited: [Int: RoomPowerTag]?
    @State private var deleted: Set<Int> = []
    @State private var editing: EditedTag?
    @State private var creating = false
    @State private var applyFailed = false

    private struct EditedTag: Identifiable {
        let power: Int
        var id: Int { power }
    }

    private var shown: [Int: RoomPowerTag] { edited ?? model.state?.powerTags ?? [:] }
    private var usedPowers: Set<Int> { model.state?.powerLevels.usedPowers ?? [] }
    private var changed: Bool { edited != nil || !deleted.isEmpty }

    var body: some View {
        Form {
            Section {
                Button { creating = true } label: { Label("New Power Level", systemImage: "plus") }
                    .disabled(model.busy)
            } footer: {
                Text("Create a new power level.")
            }
            Section("Power Levels") {
                ForEach(RoomPowerTags.powers(shown), id: \.self) { power in
                    row(power)
                }
            }
            if changed {
                Section {
                    if applyFailed || model.actionError != nil {
                        Text("Failed to apply changes! Please try again.").font(.footnote.bold()).foregroundStyle(Theme.danger)
                    } else {
                        Text("Changes saved! Apply when ready.").font(.footnote.bold())
                    }
                    Button("Reset", role: .cancel) {
                        edited = nil
                        deleted = []
                        applyFailed = false
                    }
                    .disabled(model.busy)
                    Button {
                        Task { await apply() }
                    } label: {
                        HStack {
                            if model.busy { ProgressView() }
                            Text("Apply Changes").bold()
                        }
                    }
                    .disabled(model.busy)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar.ignoresSafeArea())
        .navigationTitle("Power Levels")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editing) { item in
            RoleTagForm(power: item.power, existing: shown, tag: shown[item.power]) { power, tag in
                var tags = shown
                tags[power] = tag
                edited = tags
                deleted.remove(power)
            }
        }
        .sheet(isPresented: $creating) {
            RoleTagForm(power: nil, existing: shown, tag: nil) { power, tag in
                var tags = shown
                tags[power] = tag
                edited = tags
                deleted.remove(power)
            }
        }
    }

    private func row(_ power: Int) -> some View {
        let tag = shown[power] ?? RoomPowerTags.fallback(shown, power: power)
        let isDeleted = deleted.contains(power)
        let used = usedPowers.contains(power)
        return HStack(spacing: 8) {
            RoleDot(hex: tag.color)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if isDeleted {
                        Text(tag.name).bold().strikethrough()
                    } else {
                        Text(tag.name).bold()
                    }
                    if let icon = tag.iconKey, !icon.hasPrefix("mxc://") { Text(icon) }
                    Text("(\(power))").font(.caption).foregroundStyle(Theme.muted)
                }
                if used && !isDeleted {
                    Text("Used power level. You have to remove its use before you can delete it.")
                        .font(.caption2).foregroundStyle(Theme.faint)
                }
            }
            Spacer()
            if isDeleted {
                Button("Undo", role: .destructive) { deleted.remove(power) }
                    .buttonStyle(.borderless).disabled(model.busy)
            } else {
                if !used {
                    Button {
                        deleted.insert(power)
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless).disabled(model.busy)
                    .accessibilityLabel("Delete")
                }
                Button("Edit") { editing = EditedTag(power: power) }
                    .buttonStyle(.borderless).disabled(model.busy)
            }
        }
    }

    private func apply() async {
        let content = RoomPowerTags.content(shown, deleting: deleted)
        let worked = await model.perform {
            try await model.sendState(RoomPowerTags.eventType, content: content)
        }
        applyFailed = !worked
        if worked {
            edited = nil
            deleted = []
        }
    }
}

/// Name, colour and icon of one power level; a new one also takes the power.
struct RoleTagForm: View {
    /// Nil when creating.
    let power: Int?
    let existing: [Int: RoomPowerTag]
    let tag: RoomPowerTag?
    let onSave: (Int, RoomPowerTag) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var powerText = ""
    @State private var color = Theme.accent
    @State private var hasColor = false
    @State private var icon = ""
    @State private var loaded = false

    private var enteredPower: Int? { power ?? Int(powerText.trimmingCharacters(in: .whitespaces)) }
    private var powerTaken: Bool { power == nil && enteredPower.map { existing[$0] != nil } == true }
    private var keepsPictureIcon: Bool { tag?.iconKey?.hasPrefix("mxc://") == true }
    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && enteredPower != nil && !powerTaken
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Bot", text: $name)
                }
                if power == nil {
                    Section {
                        TextField("75", text: $powerText).keyboardType(.numbersAndPunctuation)
                    } header: {
                        Text("Power")
                    } footer: {
                        if powerTaken { Text("This power level already exists.").foregroundStyle(Theme.danger) }
                    }
                }
                Section("Color") {
                    Toggle("Use a color", isOn: $hasColor)
                    if hasColor { ColorPicker("Pick", selection: $color, supportsOpacity: false) }
                }
                Section("Icon") {
                    if keepsPictureIcon {
                        Text("This power level has a picture as its icon. It stays as it is until you type an emoji instead.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                    TextField("Emoji", text: $icon)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle(power == nil ? "New Power Level" : "Edit")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(!valid) }
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                name = tag?.name ?? ""
                if let existingColor = Color(diddyHex: tag?.color) {
                    color = existingColor
                    hasColor = true
                }
                icon = keepsPictureIcon ? "" : (tag?.iconKey ?? "")
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func save() {
        guard let value = enteredPower else { return }
        var result = tag ?? RoomPowerTag(name: "")
        result.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if hasColor {
            // Keeps the colour as written when it was not touched.
            let picked = color.roleHex
            if let old = tag?.color, let picked, RoomPowerTags.normalizedHex(old) == picked {
                result.color = old
            } else {
                result.color = picked
            }
        } else {
            result.color = nil
        }
        let trimmedIcon = icon.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedIcon.isEmpty {
            result.iconKey = trimmedIcon
        } else if !keepsPictureIcon {
            result.iconKey = nil
            result.iconRaw = nil
        }
        onSave(value, result)
        dismiss()
    }
}

private extension Color {
    /// `#rrggbb` as desktop's colour picker writes it.
    var roleHex: String? {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        func byte(_ value: CGFloat) -> Int { max(0, min(255, Int((value * 255).rounded()))) }
        return String(format: "#%02x%02x%02x", byte(red), byte(green), byte(blue))
    }
}
