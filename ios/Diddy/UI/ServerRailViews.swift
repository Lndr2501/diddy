import MatrixRustSDK
import SwiftUI

// The server rail with desktop's folders and order (account data `in.cinny.spaces`), and the screens
// to arrange it. The order is shared with the desktop app.

struct ServerRail: View {
    @ObservedObject var account: MatrixAccount
    @Binding var selection: String?
    @State private var sheet: RailSheet?
    @State private var expanded: Set<String> = []
    @State private var leaving: String?
    @State private var errorText: String?

    private enum RailSheet: Identifiable {
        case add, explore, arrange, invite(String), settings(String), manage(String)
        var id: String {
            switch self {
            case .add: return "add"
            case .explore: return "explore"
            case .arrange: return "arrange"
            case .invite(let id): return "invite\(id)"
            case .settings(let id): return "settings\(id)"
            case .manage(let id): return "manage\(id)"
            }
        }
    }

    /// Until the layout is read, the servers in the order the SDK gives them.
    private var entries: [RailEntry] {
        account.railEntries.isEmpty ? account.spaces.map { RailEntry.space($0.roomId) } : account.railEntries
    }

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
                ForEach(entries) { entry in
                    switch entry {
                    case .space(let id):
                        spaceButton(id)
                    case .folder(let folder):
                        folderButtons(folder)
                    }
                }
                roundButton("plus", label: "Add a server") { sheet = .add }
                roundButton("safari", label: "Explore public rooms and servers") { sheet = .explore }
            }
            .padding(.vertical, 12)
        }
        .frame(width: 72)
        .background(Theme.rail)
        .task(id: account.spaces.map(\.roomId)) { await account.refreshRail() }
        .onChange(of: account.rooms.count) { _ in Task { await account.refreshRail() } }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case .add: AddServerView(account: account)
            case .explore: ExploreView(account: account)
            case .arrange: ServerRailEditorView(account: account)
            case .invite(let id): InviteView(account: account, roomId: id)
            case .settings(let id): RoomSettingsView(roomId: id, account: account)
            case .manage(let id): ManageServerView(account: account, serverId: id)
            }
        }
        .leaveServerDialog(account: account, serverId: $leaving) { errorText = $0 }
        .alert("Server", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorText ?? "") }
    }

    private func roundButton(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.online)
                .frame(width: 48, height: 48)
                .background(Circle().fill(Theme.elevated))
        }
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private func spaceButton(_ id: String) -> some View {
        let info = account.serverInfo(id)
        railButton(
            id: id,
            unread: account.unreadCount(inSpace: id) > 0,
            badge: account.mentionCount(inSpace: id)
        ) {
            AvatarView(url: info.avatarUrl, name: info.name, size: 48, cornerRadius: 0, account: account)
        }
        .accessibilityLabel(info.name)
        .contextMenu { serverMenu(id) }
    }

    @ViewBuilder
    private func folderButtons(_ folder: RailFolder) -> some View {
        let open = expanded.contains(folder.id)
        Button {
            if open { expanded.remove(folder.id) } else { expanded.insert(folder.id) }
        } label: {
            folderTile(folder, open: open)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .accessibilityLabel(folder.name ?? "Folder")
        .contextMenu {
            Button { sheet = .arrange } label: { Label("Arrange Servers", systemImage: "arrow.up.arrow.down") }
        }
        if open {
            ForEach(folder.content, id: \.self) { spaceButton($0) }
        }
    }

    private func folderTile(_ folder: RailFolder, open: Bool) -> some View {
        let shown = Array(folder.content.prefix(4))
        let unread = folder.content.reduce(UInt64(0)) { $0 + account.mentionCount(inSpace: $1) }
        return ZStack {
            RoundedRectangle(cornerRadius: open ? 16 : 24, style: .continuous).fill(Theme.elevated)
            VStack(spacing: 2) {
                HStack(spacing: 2) { mini(shown, 0); mini(shown, 1) }
                HStack(spacing: 2) { mini(shown, 2); mini(shown, 3) }
            }
        }
        .frame(width: 48, height: 48)
        .overlay(alignment: .bottomTrailing) {
            if unread > 0 { UnreadBadge(count: unread).offset(x: 4, y: 4) }
        }
    }

    @ViewBuilder
    private func mini(_ ids: [String], _ index: Int) -> some View {
        if index < ids.count {
            let info = account.serverInfo(ids[index])
            AvatarView(url: info.avatarUrl, name: info.name, size: 20, cornerRadius: 6, account: account)
        } else {
            Color.clear.frame(width: 20, height: 20)
        }
    }

    /// Desktop's server menu, as a long press.
    @ViewBuilder
    private func serverMenu(_ id: String) -> some View {
        Button { Task { await account.markServerAsRead(id) } } label: { Label("Mark as Read", systemImage: "checkmark.circle") }
        Button { sheet = .invite(id) } label: { Label("Invite", systemImage: "person.badge.plus") }
        Button {
            Task { if let link = await account.roomLink(id) { UIPasteboard.general.string = link } }
        } label: { Label("Copy Link", systemImage: "link") }
        Button { sheet = .manage(id) } label: { Label("Manage Channels", systemImage: "list.bullet.indent") }
        Button { sheet = .settings(id) } label: { Label("Server Settings", systemImage: "gearshape") }
        Button { sheet = .arrange } label: { Label("Arrange Servers", systemImage: "arrow.up.arrow.down") }
        Divider()
        Button(role: .destructive) { leaving = id } label: { Label("Leave Server", systemImage: "rectangle.portrait.and.arrow.right") }
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

// MARK: - Arranging

/// Reorder servers and put them into folders. Drag the handles in edit mode; every change is saved
/// at once, to the same account data the desktop app uses.
struct ServerRailEditorView: View {
    @ObservedObject var account: MatrixAccount
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?

    private var entries: [RailEntry] {
        account.railEntries.isEmpty ? account.spaces.map { RailEntry.space($0.roomId) } : account.railEntries
    }

    private var folders: [RailFolder] {
        entries.compactMap { entry -> RailFolder? in
            if case .folder(let folder) = entry { return folder }
            return nil
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(entries) { entry in
                        row(entry)
                    }
                    .onMove { source, destination in
                        apply(ServerRailLayout.moved(entries, from: source, to: destination))
                    }
                } footer: {
                    Text("Tap Edit and drag to change the order. The order is the same in the desktop app.")
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("Arrange Servers")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { EditButton() }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    @ViewBuilder
    private func row(_ entry: RailEntry) -> some View {
        switch entry {
        case .space(let id):
            let info = account.serverInfo(id)
            HStack(spacing: 12) {
                AvatarView(url: info.avatarUrl, name: info.name, size: 32, cornerRadius: 10, account: account)
                Text(info.name).foregroundStyle(Theme.text).lineLimit(1)
                Spacer()
                Menu {
                    Button { apply(ServerRailLayout.foldered(id, in: entries)) } label: { Label("Put in New Folder", systemImage: "folder.badge.plus") }
                    ForEach(folders, id: \.id) { folder in
                        Button { apply(ServerRailLayout.put(id, intoFolder: folder.id, of: entries)) } label: {
                            Label("Put in \(folder.name ?? "Folder")", systemImage: "folder")
                        }
                    }
                } label: {
                    Image(systemName: "folder").foregroundStyle(Theme.muted)
                }
            }
        case .folder(let folder):
            NavigationLink {
                FolderEditorView(account: account, folderId: folder.id)
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "folder.fill").foregroundStyle(Theme.accent).frame(width: 32)
                    Text(folder.name ?? "Folder").foregroundStyle(Theme.text).lineLimit(1)
                    Spacer()
                    Text("\(folder.content.count)").foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private func apply(_ next: [RailEntry]) {
        Task {
            do { try await account.saveRail(next) } catch { self.error = error.friendlyMessage }
        }
    }
}

/// One folder: its name, the order inside, and taking servers out.
struct FolderEditorView: View {
    @ObservedObject var account: MatrixAccount
    let folderId: String
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var loadedName = false
    @State private var error: String?

    private var entries: [RailEntry] {
        account.railEntries.isEmpty ? account.spaces.map { RailEntry.space($0.roomId) } : account.railEntries
    }

    private var folder: RailFolder? {
        for entry in entries {
            if case .folder(let folder) = entry, folder.id == folderId { return folder }
        }
        return nil
    }

    var body: some View {
        List {
            Section("Name") {
                TextField("Folder", text: $name)
                    .onSubmit { rename() }
                Button("Save Name") { rename() }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines) == (folder?.name ?? ""))
            }
            Section {
                ForEach(folder?.content ?? [], id: \.self) { id in
                    let info = account.serverInfo(id)
                    HStack(spacing: 12) {
                        AvatarView(url: info.avatarUrl, name: info.name, size: 32, cornerRadius: 10, account: account)
                        Text(info.name).foregroundStyle(Theme.text).lineLimit(1)
                        Spacer()
                        Button {
                            apply(ServerRailLayout.takeOut(id, of: entries))
                        } label: {
                            Image(systemName: "arrow.up.right.square").foregroundStyle(Theme.muted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Take out of folder")
                    }
                }
                .onMove { source, destination in
                    apply(ServerRailLayout.moveInFolder(folderId, from: source, to: destination, of: entries))
                }
            } header: {
                Text("Servers")
            }
            Section {
                Button(role: .destructive) {
                    apply(ServerRailLayout.dissolved(folderId, in: entries))
                    dismiss()
                } label: {
                    Label("Dissolve Folder", systemImage: "folder.badge.minus")
                }
            }
            if let error { Text(error).foregroundStyle(Theme.danger) }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar.ignoresSafeArea())
        .navigationTitle(folder?.name ?? "Folder")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { EditButton() } }
        .onAppear {
            if !loadedName { name = folder?.name ?? ""; loadedName = true }
        }
    }

    private func rename() {
        apply(ServerRailLayout.renamed(folderId, to: name, in: entries))
    }

    private func apply(_ next: [RailEntry]) {
        Task {
            do { try await account.saveRail(next) } catch { self.error = error.friendlyMessage }
        }
    }
}
