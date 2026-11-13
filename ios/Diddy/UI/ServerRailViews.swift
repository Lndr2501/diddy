import MatrixRustSDK
import SwiftUI

// The server rail with desktop's folders and order (account data `in.cinny.spaces`), and the screens
// to arrange it. The order is shared with the desktop app.

struct ServerRail: View {
    @ObservedObject var account: MatrixAccount
    @Binding var selection: String?
    /// The iPhone's Servers tab shows the rail as a row across the top, without the Home button
    /// (direct messages have their own tab there).
    var horizontal = false
    @State private var sheet: RailSheet?
    @State private var expanded: Set<String> = []
    @State private var leaving: String?
    @State private var errorText: String?

    private enum RailSheet: Identifiable {
        case add, explore, arrange, invite(String), settings(String), manage(String), createChannel(String)
        var id: String {
            switch self {
            case .add: return "add"
            case .explore: return "explore"
            case .arrange: return "arrange"
            case .invite(let id): return "invite\(id)"
            case .settings(let id): return "settings\(id)"
            case .manage(let id): return "manage\(id)"
            case .createChannel(let id): return "create\(id)"
            }
        }
    }

    /// Until the layout is read, the servers in the order the SDK gives them.
    private var entries: [RailEntry] {
        account.railEntries.isEmpty ? account.spaces.map { RailEntry.space($0.roomId) } : account.railEntries
    }

    var body: some View {
        let layout = horizontal ? AnyLayout(HStackLayout(spacing: 10)) : AnyLayout(VStackLayout(spacing: 8))
        return ScrollView(horizontal ? .horizontal : .vertical, showsIndicators: false) {
            layout {
                if !horizontal {
                    railButton(
                        id: nil,
                        unread: account.directMessages.contains { $0.badge > 0 },
                        badge: account.directMessages.reduce(UInt64(account.invites.count)) { $0 + $1.badge }
                    ) {
                        Image("DiddyLogo").resizable().scaledToFill()
                    }
                    .accessibilityLabel("Home")
                    Capsule().fill(Theme.elevated).frame(width: 32, height: 2).padding(.vertical, 2)
                }
                ForEach(entries) { entry in
                    switch entry {
                    case .space(let id):
                        spaceButton(id)
                    case .folder(let folder):
                        folderButtons(folder)
                    }
                }
                roundButton("plus", label: "Add a Server") { sheet = .add }
                roundButton("safari", label: "Explore") { sheet = .explore }
            }
            .padding(.vertical, horizontal ? 8 : 12)
            .padding(.horizontal, horizontal ? 16 : 0)
        }
        .frame(width: horizontal ? nil : 72)
        .background(horizontal ? Theme.sidebar : Theme.rail)
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
            case .createChannel(let id): CreateRoomView(account: account, parentId: id)
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
        .frame(maxWidth: horizontal ? nil : .infinity)
        .accessibilityLabel(folder.name ?? "Folder")
        .accessibilityValue(open ? "Expanded, \(folder.content.count) servers" : "Collapsed, \(folder.content.count) servers")
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

    /// Desktop's server menu, as a long press; the same items as the server name's menu above the channels.
    @ViewBuilder
    private func serverMenu(_ id: String) -> some View {
        ServerMenuItems(
            account: account,
            serverId: id,
            onInvite: { sheet = .invite(id) },
            onCreateChannel: { sheet = .createChannel(id) },
            onManage: { sheet = .manage(id) },
            onSettings: { sheet = .settings(id) },
            onArrange: { sheet = .arrange },
            onLeave: { leaving = id }
        )
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
        .frame(maxWidth: horizontal ? nil : .infinity)
        .overlay(alignment: .leading) {
            if !horizontal {
                Capsule()
                    .fill(Theme.text)
                    .frame(width: 4, height: selected ? 40 : (unread ? 8 : 0))
                    .offset(x: -2)
            }
        }
        .overlay {
            // Across the top: a ring around the open server, a dot on one with something unread.
            if horizontal && selected {
                RoundedRectangle(cornerRadius: 19, style: .continuous).strokeBorder(Theme.text, lineWidth: 2).padding(-4)
            }
        }
        .overlay(alignment: .topTrailing) {
            if horizontal && unread && !selected && badge == 0 {
                Circle().fill(Theme.text).frame(width: 10, height: 10)
                    .overlay(Circle().stroke(Theme.sidebar, lineWidth: 2.5))
                    .offset(x: 3, y: -3)
            }
        }
        .padding(horizontal ? 4 : 0)
        .animation(.spring(response: 0.25), value: selected)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityValue(badge > 0 ? "\(badge) mentions" : (unread ? "Unread messages" : ""))
    }
}

/// The menu of a server, the same from the rail (long press) and from the server's name above the
/// channels. Items without an action are left out.
struct ServerMenuItems: View {
    @ObservedObject var account: MatrixAccount
    let serverId: String
    var onInvite: () -> Void
    var onCreateChannel: () -> Void
    var onManage: () -> Void
    var onSettings: () -> Void
    var onJoinAll: (() -> Void)? = nil
    var onArrange: (() -> Void)? = nil
    var onLeave: () -> Void

    var body: some View {
        Button { Task { await account.markServerAsRead(serverId) } } label: {
            Label("Mark as Read", systemImage: "checkmark.circle")
        }
        .disabled(account.unreadCount(inSpace: serverId) == 0 && account.mentionCount(inSpace: serverId) == 0)
        Button(action: onInvite) { Label("Invite People", systemImage: "person.badge.plus") }
        Button {
            Task { if let link = await account.roomLink(serverId) { UIPasteboard.general.string = link } }
        } label: { Label("Copy Link", systemImage: "link") }
        Divider()
        Button(action: onCreateChannel) { Label("Create Channel", systemImage: "plus.bubble") }
        if let onJoinAll {
            Button(action: onJoinAll) { Label("Join All Channels", systemImage: "arrow.right.circle") }
        }
        Button(action: onManage) { Label("Manage Channels", systemImage: "list.bullet.indent") }
        Button(action: onSettings) { Label("Server Settings", systemImage: "gearshape") }
        if let onArrange {
            Divider()
            Button(action: onArrange) { Label("Arrange Servers", systemImage: "arrow.up.arrow.down") }
        }
        Divider()
        Button(role: .destructive, action: onLeave) {
            Label("Leave Server", systemImage: "rectangle.portrait.and.arrow.right")
        }
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
                    if entries.isEmpty {
                        Text("You have not joined any servers yet.").foregroundStyle(Theme.muted)
                    }
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
                    Image(systemName: "folder.badge.plus").foregroundStyle(Theme.muted)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Move \(info.name) to a Folder")
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
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Take \(info.name) out of the folder")
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
            } footer: {
                Text("The servers stay in your list, only the folder goes away.")
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
