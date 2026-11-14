import MatrixRustSDK
import SwiftUI
import UIKit

// The views behind moving around the chat and the extra message actions, the same as the
// desktop's: Seen by, report, delete with a reason, view source, edit history, who reacted, threads,
// pinned messages and jump to time. The rules are in Matrix/TimelineNavLogic.swift.

/// A request to show one message of the chat; a new id makes the chat act again on the same message.
struct TimelineJumpTarget: Equatable {
    let id = UUID()
    let eventId: String
}

/// Everything the chat opens from the message menu and the header menu, one sheet at a time.
enum TimelineNavSheet: Identifiable {
    case readers(eventId: String)
    case reactions(key: String, senders: [String])
    case report(eventId: String)
    case delete(MessageRow)
    case source(MessageRow)
    case history(MessageRow)
    case thread(root: String)
    case pinned
    case jumpToDate

    var id: String {
        switch self {
        case .readers(let eventId): return "readers|" + eventId
        case .reactions(let key, _): return "reactions|" + key
        case .report(let eventId): return "report|" + eventId
        case .delete(let row): return "delete|" + row.id
        case .source(let row): return "source|" + row.id
        case .history(let row): return "history|" + row.id
        case .thread(let root): return "thread|" + root
        case .pinned: return "pinned"
        case .jumpToDate: return "jumpToDate"
        }
    }
}

struct TimelineNavSheetView: View {
    @ObservedObject var account: MatrixAccount
    @ObservedObject var controller: TimelineController
    let sheet: TimelineNavSheet
    /// Closes the sheet and shows the message in the chat.
    let onJump: (String) -> Void

    var body: some View {
        switch sheet {
        case .readers(let eventId):
            PeopleSheet(title: "Seen by", userIds: controller.nav.readers(of: eventId), account: account, roomId: controller.room.id())
        case .reactions(let key, let senders):
            PeopleSheet(title: "Reacted with \(key)", userIds: senders, account: account, roomId: controller.room.id())
        case .report(let eventId):
            ReportMessageSheet(account: account, roomId: controller.room.id(), eventId: eventId)
        case .delete(let row):
            DeleteMessageSheet(controller: controller, row: row)
        case .source(let row):
            MessageSourceSheet(text: controller.sourceText(of: row))
        case .history(let row):
            EditHistorySheet(controller: controller, row: row)
        case .thread(let root):
            ThreadSheet(account: account, room: controller.room, rootEventId: root)
        case .pinned:
            PinnedMessagesSheet(account: account, parent: controller, onOpen: onJump)
        case .jumpToDate:
            JumpToDateSheet(account: account, roomId: controller.room.id(), onOpen: onJump)
        }
    }
}

// MARK: Lines in the chat

/// The line above the first unread message, in a soft accent like the desktop (not alarm red).
struct NewMessagesDivider: View {
    var body: some View {
        HStack(spacing: 8) {
            Rectangle().fill(Theme.accent.opacity(0.45)).frame(height: 1)
            Text("NEW").font(.caption2.weight(.bold)).tracking(0.4).foregroundStyle(Theme.accent)
        }
        .padding(.horizontal, ChatStyle.edgePadding)
        .padding(.top, 10)
        .padding(.bottom, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("New messages")
    }
}

/// Under a thread's first message: how many answers it has and the last one.
struct ThreadSummaryButton: View {
    let info: ThreadInfo
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 6) {
                Image(systemName: "bubble.left.and.bubble.right").font(.caption).foregroundStyle(Theme.muted)
                Text(info.replies == 1 ? "1 reply" : "\(info.replies) replies")
                    .font(.caption.weight(.semibold)).foregroundStyle(Theme.text)
                if !info.latestText.isEmpty {
                    Text("\(info.latestSender): \(info.latestText)")
                        .font(.caption).foregroundStyle(Theme.faint).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Theme.faint)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.elevated))
        }
        .buttonStyle(.plain)
        .padding(.leading, ChatStyle.textLeading)
        .padding(.trailing, ChatStyle.edgePadding)
        .padding(.top, 2)
        .accessibilityLabel("Thread, \(info.replies) replies. Open thread")
    }
}

/// A small note under a pinned message.
struct PinnedMarker: View {
    var body: some View {
        Label("Pinned", systemImage: "pin.fill")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Theme.faint)
            .padding(.leading, ChatStyle.textLeading)
            .padding(.top, 2)
    }
}

/// "Seen by Anton" or "Seen by 4" with small faces at the right under the chat, like the
/// desktop; tap for the list.
struct TimelineFollowingLine: View {
    let userIds: [String]
    @ObservedObject var account: MatrixAccount
    let onTap: () -> Void

    var body: some View {
        if !userIds.isEmpty {
            let names = userIds.map { account.name(of: $0) }
            Button(action: onTap) {
                HStack(spacing: 4) {
                    HStack(spacing: -4) {
                        ForEach(userIds.prefix(4), id: \.self) { userId in
                            AvatarView(url: account.profiles[userId]?.avatarUrl, name: account.name(of: userId), size: 16, account: account)
                                .overlay(Circle().stroke(Theme.chat, lineWidth: 1.5))
                        }
                    }
                    if userIds.count > 4 {
                        Text("+\(userIds.count - 4)").font(.caption2.weight(.semibold)).foregroundStyle(Theme.faint)
                    }
                }
                .padding(.horizontal, ChatStyle.edgePadding)
                .frame(minHeight: 20)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(TimelineNav.seenBy(names))
            .accessibilityAddTraits(.isButton)
        }
    }
}

// MARK: Sheets

/// A list of people: who has read a message, or who reacted with an emoji.
struct PeopleSheet: View {
    let title: String
    let userIds: [String]
    @ObservedObject var account: MatrixAccount
    let roomId: String
    @Environment(\.dismiss) private var dismiss
    @State private var profile: ProfileTarget?

    var body: some View {
        NavigationStack {
            List(userIds, id: \.self) { userId in
                Button { profile = ProfileTarget(userId: userId) } label: {
                    PersonRow(name: account.name(of: userId), avatarUrl: account.profiles[userId]?.avatarUrl,
                              account: account, userId: userId)
                }
                .listRowBackground(Theme.chat)
            }
            .listStyle(.plain)
            .background(Theme.chat)
            .overlay { if userIds.isEmpty { Text("Nobody yet.").foregroundStyle(Theme.muted) } }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task { account.resolveProfiles(userIds, in: roomId) }
            .sheet(item: $profile) { UserProfileSheet(account: account, userId: $0.userId, roomId: roomId) }
        }
    }
}

/// Asks for a reason and tells the server, like the desktop's Report Message.
struct ReportMessageSheet: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    let eventId: String
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var sending = false
    @State private var failed = false
    @State private var done = false

    private var trimmed: String { reason.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Report this message to server, which may then notify the appropriate people to take action.")
                        .foregroundStyle(Theme.muted)
                }
                Section("Reason") {
                    TextField("Reason", text: $reason, axis: .vertical).lineLimit(1...4)
                }
                if failed {
                    Text("Failed to report message! Please try again.").foregroundStyle(Theme.danger)
                }
                if done {
                    Text("Message has been reported to server.").foregroundStyle(Theme.online)
                }
                Section {
                    Button(sending ? "Reporting…" : "Report", role: .destructive) { submit() }
                        .disabled(trimmed.isEmpty || sending || done)
                }
            }
            .navigationTitle("Report Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(done ? "Close" : "Cancel") { dismiss() } } }
        }
    }

    private func submit() {
        sending = true
        failed = false
        let path = TimelineNav.reportPath(roomId: roomId, eventId: eventId)
        let body = TimelineNav.reportBody(reason: reason)
        Task {
            do {
                _ = try await account.clientRequest(path, body: body, method: "POST")
                done = true
            } catch {
                failed = true
            }
            sending = false
        }
    }
}

/// Confirms a delete and takes an optional reason, like the desktop's Delete Message.
struct DeleteMessageSheet: View {
    @ObservedObject var controller: TimelineController
    let row: MessageRow
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var deleting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This action is irreversible! Are you sure that you want to delete this message?")
                        .foregroundStyle(Theme.muted)
                }
                Section("Reason (optional)") {
                    TextField("Reason", text: $reason, axis: .vertical).lineLimit(1...4)
                }
                Section {
                    Button(deleting ? "Deleting…" : "Delete", role: .destructive) {
                        deleting = true
                        Task {
                            let ok = await controller.redact(row, reason: reason)
                            deleting = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(deleting)
                }
            }
            .navigationTitle("Delete Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

/// The event as JSON, with a copy button.
struct MessageSourceSheet: View {
    let text: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(text)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(Theme.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
            }
            .background(Theme.chat)
            .navigationTitle("Message Source")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { UIPasteboard.general.string = text } label: { Image(systemName: "doc.on.doc") }
                        .accessibilityLabel("Copy")
                }
            }
        }
    }
}

/// The earlier versions of an edited message, newest first.
struct EditHistorySheet: View {
    @ObservedObject var controller: TimelineController
    let row: MessageRow
    @Environment(\.dismiss) private var dismiss
    @State private var versions: [MessageEditVersion] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            List(versions) { version in
                VStack(alignment: .leading, spacing: 4) {
                    Text(version.text).foregroundStyle(Theme.text)
                    if let date = version.date {
                        Text("\(ChatSettings.date(date)) \(ChatSettings.time(date))").font(.caption).foregroundStyle(Theme.faint)
                    }
                }
                .listRowBackground(Theme.chat)
            }
            .listStyle(.plain)
            .background(Theme.chat)
            .overlay {
                if loading { ProgressView() }
                else if versions.isEmpty { Text("No earlier versions found.").foregroundStyle(Theme.muted) }
            }
            .navigationTitle("Edit History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task {
                versions = await controller.editHistory(of: row) ?? []
                loading = false
            }
        }
    }
}

/// The messages the room has pinned, newest first. Tapping one shows it in the chat.
struct PinnedMessagesSheet: View {
    @ObservedObject var account: MatrixAccount
    @ObservedObject var parent: TimelineController
    let onOpen: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var holder = TimelineHolder()

    var body: some View {
        NavigationStack {
            Group {
                if let controller = holder.controller {
                    PinnedList(account: account, parent: parent, controller: controller, onOpen: onOpen)
                } else {
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.chat)
            .navigationTitle("Pinned Messages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task {
                guard holder.controller == nil else { return }
                let controller = TimelineController(room: parent.room, ownUserId: parent.ownUserId,
                                                    isDirect: parent.isDirect, focus: .pinnedEvents)
                holder.controller = controller
                await controller.start()
            }
        }
    }
}

private struct PinnedList: View {
    @ObservedObject var account: MatrixAccount
    @ObservedObject var parent: TimelineController
    @ObservedObject var controller: TimelineController
    let onOpen: (String) -> Void

    var body: some View {
        let ids = parent.nav.pinned
        if ids.isEmpty {
            Text("No pinned messages.").foregroundStyle(Theme.muted)
        } else if controller.rows.isEmpty {
            ProgressView()
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(controller.rows.reversed()) { row in
                        Button {
                            if let eventId = row.remoteEventId { onOpen(eventId) }
                        } label: {
                            MessageRowView(row: row, account: account, roomId: controller.room.id())
                                .allowsHitTesting(false)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            if parent.nav.canPin, let eventId = row.remoteEventId {
                                Button(role: .destructive) {
                                    Task { await parent.setPinned(eventId: eventId, pinned: false) }
                                } label: { Label("Unpin Message", systemImage: "pin.slash") }
                            }
                        }
                        Divider().background(Theme.elevated)
                    }
                }
            }
        }
    }
}

/// A thread: the root message and its answers in their own timeline, with a box to answer.
struct ThreadSheet: View {
    @ObservedObject var account: MatrixAccount
    let room: Room
    let rootEventId: String
    @Environment(\.dismiss) private var dismiss
    @StateObject private var holder = TimelineHolder()

    var body: some View {
        NavigationStack {
            Group {
                if let controller = holder.controller {
                    ThreadBody(account: account, controller: controller, rootEventId: rootEventId)
                } else {
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.chat)
            .navigationTitle("Thread")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task {
                guard holder.controller == nil else { return }
                let controller = TimelineController(room: room, ownUserId: account.userId,
                                                    isDirect: false, focus: .thread(rootEventId: rootEventId))
                holder.controller = controller
                await controller.start()
            }
        }
    }
}

private struct ThreadBody: View {
    @ObservedObject var account: MatrixAccount
    @ObservedObject var controller: TimelineController
    let rootEventId: String
    @State private var draft = ""
    @State private var sending = false
    @State private var profile: ProfileTarget?

    private var trimmed: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(controller.rows) { row in
                            MessageRowView(
                                row: row,
                                account: account,
                                roomId: controller.room.id(),
                                onProfile: { profile = ProfileTarget(userId: row.sender) },
                                onMention: { profile = ProfileTarget(userId: $0) },
                                onReact: { key in Task { await controller.toggleReaction(key, on: row) } }
                            )
                            .id(row.id)
                        }
                        Color.clear.frame(height: 4).id("threadBottom")
                    }
                }
                .onChange(of: controller.rows.last?.id) { _ in
                    withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("threadBottom", anchor: .bottom) }
                }
                .onAppear { proxy.scrollTo("threadBottom", anchor: .bottom) }
            }
            Divider().background(Theme.elevated)
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Reply in thread", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.elevated))
                Button { send() } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 30))
                }
                .disabled(trimmed.isEmpty || sending)
                .accessibilityLabel("Send")
            }
            .padding(10)
            .background(Theme.chat)
        }
        .sheet(item: $profile) { UserProfileSheet(account: account, userId: $0.userId, roomId: controller.room.id()) }
        .alert("Message", isPresented: Binding(get: { controller.sendError != nil }, set: { if !$0 { controller.sendError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(controller.sendError ?? "") }
    }

    private func send() {
        let text = draft
        sending = true
        Task {
            if await controller.sendInThread(text: text, root: rootEventId), draft == text { draft = "" }
            sending = false
        }
    }
}

/// Jump to Time: picks a moment, asks the server for the first event after it and shows it.
struct JumpToDateSheet: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    let onOpen: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Preset") {
                    HStack(spacing: 8) {
                        presetButton("Today") { date = TimelineNav.presets(now: Date(), calendar: Calendar.current).today }
                        presetButton("Yesterday") { date = TimelineNav.presets(now: Date(), calendar: Calendar.current).yesterday }
                        presetButton("Beginning") { date = Date(timeIntervalSince1970: 1) }
                    }
                }
                Section {
                    DatePicker("Date and time", selection: $date, in: ...Date(), displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.graphical)
                }
                if let error {
                    Text(error).foregroundStyle(Theme.danger)
                }
                Section {
                    Button(working ? "Looking…" : "Open Timeline") { jump() }
                        .disabled(working)
                }
            }
            .navigationTitle("Jump to Time")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func presetButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.bordered)
    }

    private func jump() {
        working = true
        error = nil
        let path = TimelineNav.timestampToEventPath(roomId: roomId, date: date)
        Task {
            do {
                let json = try await account.clientRequest(path)
                if let eventId = json["event_id"] as? String {
                    onOpen(eventId)
                } else {
                    error = "The server did not find a message at that time."
                }
            } catch {
                self.error = error.friendlyMessage
            }
            working = false
        }
    }
}
