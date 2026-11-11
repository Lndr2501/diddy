import MatrixRustSDK
import SwiftUI

// Managing what is inside a server: add existing rooms and servers, remove them, mark channels as
// suggested (desktop's features/lobby/HierarchyItemMenu.tsx and features/add-existing), and the
// choice when leaving a server (components/leave-space-prompt).

/// Asks how to leave a server. Desktop leaves only the server; Diddy used to leave all channels too,
/// so both are offered.
private struct LeaveServerDialog: ViewModifier {
    @ObservedObject var account: MatrixAccount
    @Binding var serverId: String?
    let onError: (String) -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog(
            serverId.map { "Leave \(account.serverInfo($0).name)?" } ?? "",
            isPresented: Binding(get: { serverId != nil }, set: { if !$0 { serverId = nil } }),
            titleVisibility: .visible,
            presenting: serverId
        ) { id in
            Button("Leave Server Only") { leave(id, withChannels: false) }
            Button("Leave Server and Its Channels", role: .destructive) { leave(id, withChannels: true) }
        } message: { _ in
            Text("Are you sure you want to leave this server? You need a new invite to come back if it is private.")
        }
    }

    private func leave(_ id: String, withChannels: Bool) {
        Task {
            do { try await account.leaveServer(id, withChannels: withChannels) } catch { onError(error.friendlyMessage) }
        }
    }
}

extension View {
    func leaveServerDialog(account: MatrixAccount, serverId: Binding<String?>, onError: @escaping (String) -> Void) -> some View {
        modifier(LeaveServerDialog(account: account, serverId: serverId, onError: onError))
    }
}

/// The tree of a server with a menu per entry.
struct ManageServerView: View {
    @ObservedObject var account: MatrixAccount
    let serverId: String
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [HierarchyRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var sheet: ManageSheet?
    @State private var removing: HierarchyRow?

    private enum ManageSheet: Identifiable {
        case addRooms(String), addServers(String), createRoom(String), createServer(String)
        var id: String {
            switch self {
            case .addRooms(let id): return "rooms\(id)"
            case .addServers(let id): return "servers\(id)"
            case .createRoom(let id): return "room\(id)"
            case .createServer(let id): return "server\(id)"
            }
        }
    }

    private var title: String { account.serverInfo(serverId).name }

    var body: some View {
        NavigationStack {
            List {
                if loading && rows.isEmpty {
                    HStack { Spacer(); ProgressView(); Spacer() }.listRowBackground(Color.clear)
                }
                if !loading && rows.isEmpty {
                    Text("Nothing in this server yet.").foregroundStyle(Theme.muted).listRowBackground(Color.clear)
                }
                ForEach(rows) { row in
                    rowView(row)
                }
                if let error { Text(error).foregroundStyle(Theme.danger).listRowBackground(Color.clear) }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Menu {
                        addMenu(to: serverId)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add")
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .sheet(item: $sheet, onDismiss: { Task { await load() } }) { sheet in
                switch sheet {
                case .addRooms(let parent):
                    AddExistingView(account: account, parentId: parent, spacesOnly: false, alreadyInside: inside(parent))
                case .addServers(let parent):
                    AddExistingView(account: account, parentId: parent, spacesOnly: true, alreadyInside: inside(parent))
                case .createRoom(let parent):
                    CreateRoomView(account: account, parentId: parent)
                case .createServer(let parent):
                    CreateSpaceView(account: account, parentId: parent)
                }
            }
            .confirmationDialog(
                removing.map { "Remove \($0.name)?" } ?? "",
                isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible,
                presenting: removing
            ) { row in
                Button("Remove", role: .destructive) { remove(row) }
            } message: { row in
                Text("\(row.name) stays as it is, it is only taken out of this server.")
            }
        }
    }

    @ViewBuilder
    private func addMenu(to parent: String) -> some View {
        Button { sheet = .addRooms(parent) } label: { Label("Add Existing Room", systemImage: "number") }
        Button { sheet = .addServers(parent) } label: { Label("Add Existing Server", systemImage: "square.stack.3d.up") }
        Button { sheet = .createRoom(parent) } label: { Label("Create Room", systemImage: "plus.bubble") }
        Button { sheet = .createServer(parent) } label: { Label("Create Server", systemImage: "plus.square.on.square") }
    }

    private func rowView(_ row: HierarchyRow) -> some View {
        HStack(spacing: 8) {
            Image(systemName: row.isSpace ? "square.stack.3d.up.fill" : (row.isVoice ? "speaker.wave.2.fill" : "number"))
                .foregroundStyle(Theme.faint)
                .frame(width: 22)
            Text(row.name).foregroundStyle(Theme.text).lineLimit(1)
            if row.suggested {
                Text("Suggested").font(.caption2.weight(.semibold)).foregroundStyle(Theme.accent)
            }
            Spacer()
            Menu {
                Button {
                    run { try await account.toggleSuggested(row) }
                } label: {
                    Label(row.suggested ? "Unset Suggested" : "Set Suggested", systemImage: row.suggested ? "star.slash" : "star")
                }
                if row.isSpace { addMenu(to: row.roomId) }
                Button(role: .destructive) { removing = row } label: { Label("Remove", systemImage: "minus.circle") }
            } label: {
                Image(systemName: "ellipsis.circle").foregroundStyle(Theme.muted)
            }
        }
        .padding(.leading, CGFloat(row.depth) * 20)
        .listRowBackground(Color.clear)
    }

    private func inside(_ parent: String) -> Set<String> {
        Set(rows.filter { $0.parentId == parent }.map(\.roomId))
    }

    private func load() async {
        do {
            rows = try await account.serverTree(serverId)
            error = nil
        } catch {
            self.error = error.friendlyMessage
        }
        loading = false
    }

    private func remove(_ row: HierarchyRow) {
        run { try await account.removeChild(row.roomId, from: row.parentId) }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        Task {
            do {
                try await work()
                await load()
            } catch { self.error = error.friendlyMessage }
        }
    }
}

/// Desktop's "Add Existing": pick rooms (or servers) you are in and add them to a server.
struct AddExistingView: View {
    @ObservedObject var account: MatrixAccount
    let parentId: String
    let spacesOnly: Bool
    let alreadyInside: Set<String>
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var selected: Set<String> = []
    @State private var busy = false
    @State private var error: String?

    private var candidates: [RoomSummary] {
        let all = account.addableRooms(to: parentId, spacesOnly: spacesOnly, alreadyInside: alreadyInside)
        let term = query.trimmingCharacters(in: .whitespaces)
        return term.isEmpty ? all : all.filter { $0.name.localizedCaseInsensitiveContains(term) }
    }

    var body: some View {
        NavigationStack {
            List {
                if candidates.isEmpty {
                    Text(spacesOnly ? "You have no other servers to add." : "You have no other rooms to add.")
                        .foregroundStyle(Theme.muted).listRowBackground(Color.clear)
                }
                ForEach(candidates) { room in
                    Button {
                        if selected.contains(room.id) { selected.remove(room.id) } else { selected.insert(room.id) }
                    } label: {
                        HStack(spacing: 10) {
                            AvatarView(url: room.avatarUrl, name: room.name, size: 32, cornerRadius: room.isSpace ? 10 : nil, account: account)
                            Text(room.name).foregroundStyle(Theme.text).lineLimit(1)
                            Spacer()
                            Image(systemName: selected.contains(room.id) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selected.contains(room.id) ? Theme.accent : Theme.faint)
                        }
                    }
                    .listRowBackground(Color.clear)
                }
                if let error { Text(error).foregroundStyle(Theme.danger).listRowBackground(Color.clear) }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar.ignoresSafeArea())
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
            .navigationTitle(spacesOnly ? "Add Existing Server" : "Add Existing Room")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Add") { add() }.disabled(selected.isEmpty)
                    }
                }
            }
        }
    }

    private func add() {
        busy = true
        error = nil
        let ids = Array(selected)
        Task {
            let failed = await account.addExistingRooms(ids, to: parentId)
            busy = false
            if failed == 0 {
                dismiss()
            } else {
                selected = []
                error = "\(failed) could not be added. You may not be allowed to change this server."
            }
        }
    }
}
