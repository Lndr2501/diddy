import PhotosUI
import SwiftUI
import UIKit

/// The badge library of Settings > Profile > Status & badges on desktop (`BadgeEditor.tsx`): every
/// built-in and community badge, "Add to me" / "Remove", and deleting the ones you created. Which
/// of your badges show next to your name is chosen in the profile editor.
@MainActor
struct DiddyBadgeLibraryView: View {
    @ObservedObject var account: MatrixAccount
    @State private var query = ""
    @State private var busyId: String?
    @State private var error: String?
    @State private var deleting: DiddyBadge?

    private var ownedIds: Set<String> { Set(account.diddyOwnBadges.map { $0.id }) }
    private var visible: [DiddyBadge] { DiddyBadgeLogic.filtered(account.diddyBadgeLibrary, query: query) }

    var body: some View {
        List {
            Section {
                TextField("Search badges", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } footer: {
                Text(DiddyBadgeLogic.summary(owned: ownedIds.count, total: account.diddyBadgeLibrary.count))
            }
            if let error {
                Section { Text(error).foregroundStyle(Theme.danger) }
            }
            Section {
                if visible.isEmpty {
                    Text("No badges match your search.").foregroundStyle(Theme.muted)
                }
                ForEach(visible) { badge in row(badge) }
            }
            Section {
                NavigationLink {
                    DiddyCreateBadgeView(account: account)
                } label: {
                    Label("Create a Badge", systemImage: "plus.circle")
                }
            } footer: {
                Text("Badges you take are shown in the profile editor, where you pick up to \(DiddyBadgeLogic.maxShown) to show next to your name.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Badge Library")
        .navigationBarTitleDisplayMode(.inline)
        .task { await account.loadDiddyProfiles() }
        .confirmationDialog(
            "Delete \"\(deleting?.name ?? "")\" for everyone?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete from Library", role: .destructive) {
                if let badge = deleting { Task { await delete(badge) } }
                deleting = nil
            }
            Button("Cancel", role: .cancel) { deleting = nil }
        }
    }

    private func row(_ badge: DiddyBadge) -> some View {
        let owned = ownedIds.contains(badge.id)
        let creator = badge.createdBy.flatMap { account.profiles[$0]?.name }
        return HStack(spacing: 10) {
            DiddyBadges(badges: [badge], size: 22, account: account)
            VStack(alignment: .leading, spacing: 2) {
                Text(badge.name).foregroundStyle(Theme.text).lineLimit(1)
                Text(DiddyBadgeLogic.authorLabel(badge, displayName: creator)).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if busyId == badge.id {
                ProgressView()
            } else {
                Button(owned ? "Remove" : "Add to Me") { Task { await toggle(badge, owned: owned) } }
                    .buttonStyle(.bordered)
                    .tint(owned ? Theme.danger : Theme.accent)
                    .disabled(busyId != nil)
            }
        }
        .swipeActions(edge: .trailing) {
            if DiddyBadgeLogic.canDelete(badge, me: account.userId) {
                Button("Delete", role: .destructive) { deleting = badge }
            }
        }
        .contextMenu {
            if DiddyBadgeLogic.canDelete(badge, me: account.userId) {
                Button("Delete from Library", role: .destructive) { deleting = badge }
            }
        }
    }

    private func toggle(_ badge: DiddyBadge, owned: Bool) async {
        busyId = badge.id
        error = nil
        defer { busyId = nil }
        do {
            if owned {
                try await account.revokeDiddyBadge(badge.id, from: account.userId)
            } else {
                try await account.awardDiddyBadge(badge.id, to: account.userId)
            }
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private func delete(_ badge: DiddyBadge) async {
        busyId = badge.id
        error = nil
        defer { busyId = nil }
        do {
            try await account.deleteDiddyBadge(badge)
        } catch {
            self.error = error.friendlyMessage
        }
    }
}

/// "Create custom badge": a name, an emoji or a picture, and a colour. The new badge is given to you
/// right away; if one with the same name or look exists, you can take that one instead.
@MainActor
struct DiddyCreateBadgeView: View {
    @ObservedObject var account: MatrixAccount
    @State private var name = ""
    @State private var emoji = ""
    @State private var imageMxc: String?
    @State private var color = Color(diddyHex: DiddyBadgeLogic.defaultColor) ?? .blue
    @State private var pickedImage: PhotosPickerItem?
    @State private var uploading = false
    @State private var creating = false
    @State private var error: String?
    @State private var created: String?

    private var colorHex: String { Self.hex(color) ?? DiddyBadgeLogic.defaultColor.lowercased() }
    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedEmoji: String { emoji.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canCreate: Bool {
        DiddyBadgeLogic.canCreate(name: name, emoji: emoji, hasImage: imageMxc != nil, busy: uploading || creating)
    }
    private var duplicate: DiddyBadge? {
        DiddyBadgeLogic.duplicate(name: name, emoji: emoji, hasImage: imageMxc != nil, color: colorHex, in: account.diddyBadgeLibrary)
    }
    private var preview: DiddyBadge {
        DiddyBadge(id: "preview", name: trimmedName.isEmpty ? "Preview" : trimmedName,
                   emoji: imageMxc == nil ? (trimmedEmoji.isEmpty ? "❔" : trimmedEmoji) : nil, imageMxc: imageMxc, color: colorHex)
    }

    var body: some View {
        Form {
            Section {
                HStack {
                    Spacer()
                    DiddyBadges(badges: [preview], size: 30, account: account)
                    Spacer()
                }
            } header: {
                Text("Preview")
            }
            Section {
                TextField("Badge name", text: Binding(get: { name }, set: { name = String($0.prefix(DiddyBadgeLogic.maxNameLength)) }))
            } header: {
                Text("Name")
            }
            Section {
                TextField("😀", text: $emoji)
                    .disabled(imageMxc != nil)
                if DiddyBadgeLogic.emojiTooLong(emoji) {
                    Text("Use a single emoji.").foregroundStyle(Theme.danger)
                }
                PhotosPicker(selection: $pickedImage, matching: .images) {
                    Label(imageMxc == nil ? "Upload Image" : "Replace Image", systemImage: "photo")
                }
                .disabled(uploading)
                if uploading { HStack(spacing: 8) { ProgressView(); Text("Uploading…").foregroundStyle(Theme.muted) } }
                if imageMxc != nil {
                    Button("Remove Image", role: .destructive) { imageMxc = nil }
                }
            } header: {
                Text("Emoji or Image")
            } footer: {
                Text(imageMxc == nil ? "Type an emoji, or upload an image instead." : "Using an uploaded image.")
            }
            Section("Color") {
                ColorPicker("Badge color", selection: $color, supportsOpacity: false)
            }
            if let duplicate {
                Section {
                    HStack(spacing: 10) {
                        DiddyBadges(badges: [duplicate], size: 22, account: account)
                        Text(duplicate.name)
                        Spacer()
                        Button("Use It") { Task { await useExisting(duplicate) } }
                            .buttonStyle(.bordered)
                            .disabled(creating)
                    }
                } header: {
                    Text("Already in the library")
                } footer: {
                    Text("This badge already exists. Use the existing one instead of creating a copy.")
                }
            }
            Section {
                if let error { Text(error).foregroundStyle(Theme.danger) }
                if let created { Label(created, systemImage: "checkmark.circle.fill").foregroundStyle(Theme.online) }
                Button {
                    Task { await create() }
                } label: {
                    HStack {
                        if creating { ProgressView() }
                        Text("Create Badge")
                    }
                }
                .disabled(!canCreate || duplicate != nil)
            } footer: {
                Text("A new badge for the shared library. It is given to you right away.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Create Badge")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: pickedImage) { item in
            guard let item else { return }
            pickedImage = nil
            Task { await upload(item) }
        }
    }

    private func upload(_ item: PhotosPickerItem) async {
        uploading = true
        error = nil
        defer { uploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { throw DiddyError("This picture could not be read.") }
            let limit = await account.diddyUploadLimit()
            let file = try DiddyMediaPrep.picture(data, limit: limit)
            imageMxc = try await account.uploadDiddyMedia(file.data, mimeType: file.mimeType, filename: "badge.\(file.ext)")
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private func create() async {
        guard canCreate, duplicate == nil else { return }
        creating = true
        error = nil
        created = nil
        defer { creating = false }
        do {
            let id = try await account.createDiddyBadge(name: name, emoji: emoji, imageMxc: imageMxc, color: colorHex)
            try await account.awardDiddyBadge(id, to: account.userId)
            created = "\"\(trimmedName)\" was created and is yours now."
            name = ""
            emoji = ""
            imageMxc = nil
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private func useExisting(_ badge: DiddyBadge) async {
        creating = true
        error = nil
        created = nil
        defer { creating = false }
        do {
            try await account.awardDiddyBadge(badge.id, to: account.userId)
            created = "\"\(badge.name)\" is yours now."
            name = ""
            emoji = ""
            imageMxc = nil
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private static func hex(_ color: Color) -> String? {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        func byte(_ value: CGFloat) -> Int { Int((min(max(value, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(red), byte(green), byte(blue))
    }
}
