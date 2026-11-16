import SwiftUI

/// "Send later" on iOS: the long-press menu of the send button, the date sheet and the
/// "1 scheduled message" bar above the composer (ScheduledMessages.swift, SendLaterLogic.swift).

/// Long-press menu of the send button: quick picks and "Pick Date & Time…". The section title says
/// who sends it.
struct SendLaterMenu: View {
    let store: ScheduledMessageStore
    let roomId: String
    let onPick: (Date) -> Void
    let onCustom: () -> Void

    var body: some View {
        let now = Date()
        let picks = SendLaterLogic.quickPicks(now: now)
        Section(SendLaterLogic.explanation(store.routePreview(roomId: roomId, sendAt: picks[0].at, preferLocal: false),
                                           maxDelay: store.knownMaxDelay).title) {
            ForEach(picks, id: \.pick) { pick in
                Button { onPick(pick.at) } label: {
                    Label {
                        Text(pick.pick.title)
                        Text(SendLaterLogic.formatSendAt(pick.at, now: now, clock: ChatSettings.time))
                    } icon: { Image(systemName: "clock") }
                }
            }
            Button(action: onCustom) { Label(L("ios.chatMore.pickDateTime"), systemImage: "calendar") }
        }
    }
}

/// The free choice of date and time, with what the route means and "send from this iPhone".
struct SendLaterSheet: View {
    @ObservedObject var store: ScheduledMessageStore
    let roomId: String
    let onSchedule: (Date, Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var sendAt = SendLaterLogic.defaultCustomTime(now: Date())
    @State private var preferLocal = false

    private var choice: SendLaterLogic.RouteChoice {
        store.routePreview(roomId: roomId, sendAt: sendAt, preferLocal: preferLocal)
    }

    private var serverPossible: Bool {
        store.routePreview(roomId: roomId, sendAt: sendAt, preferLocal: false).route == .server
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker(L("ios.chatMore.sendAt"), selection: $sendAt,
                               in: Date().addingTimeInterval(SendLaterLogic.minLead)...Date().addingTimeInterval(SendLaterLogic.maxAhead))
                        .datePickerStyle(.graphical)
                }
                Section {
                    let text = SendLaterLogic.explanation(choice, maxDelay: store.knownMaxDelay)
                    Label {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(text.title).font(.subheadline.weight(.semibold))
                            Text(text.text).font(.footnote).foregroundStyle(Theme.muted)
                        }
                    } icon: { Image(systemName: choice.route == .server ? "server.rack" : "iphone") }
                    if serverPossible || preferLocal {
                        Toggle(L("ios.chatMore.sendFromThisIphoneInstead"), isOn: $preferLocal)
                    }
                } footer: {
                    Text(L("ios.chatMore.textMessagesOnlyAttachmentsCannotBeScheduled"))
                }
            }
            .navigationTitle(L("ios.chatMore.sendLater"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L("settings.deviceTile.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("ios.chatMore.schedule")) {
                        onSchedule(sendAt, preferLocal)
                        dismiss()
                    }
                    .disabled(SendLaterLogic.check(sendAt, now: Date()) != .ok)
                }
            }
        }
        .task { await store.prepare(roomId: roomId) }
    }
}

/// One row of the overview: this iPhone's record or a server message from another device.
struct ScheduledRowItem: Identifiable {
    let id: String
    let sendAt: Date
    let body: String
    let route: SendLaterLogic.Route
    let local: SendLaterLogic.Scheduled?
    let other: SendLaterLogic.ServerMessage?
}

/// "1 scheduled message · Next: Today, 18:00" above the composer; a tap opens the overview.
struct ScheduledMessagesBar: View {
    @ObservedObject var store: ScheduledMessageStore
    let roomId: String
    let onEdit: (SendLaterLogic.Scheduled) -> Void
    @State private var showList = false

    private var rows: [ScheduledRowItem] {
        let mine = store.items.filter { $0.roomId == roomId }.map {
            ScheduledRowItem(id: $0.id, sendAt: $0.sendAt, body: $0.body, route: $0.route, local: $0, other: nil)
        }
        let others = store.others.filter { $0.roomId == roomId }.map {
            ScheduledRowItem(id: $0.delayId, sendAt: $0.sendAt, body: $0.body, route: .server, local: nil, other: $0)
        }
        return (mine + others).sorted { $0.sendAt < $1.sendAt }
    }

    var body: some View {
        VStack(spacing: 0) {
            if let notice = store.lateNotices[roomId] {
                HStack(spacing: 8) {
                    Image(systemName: "clock.badge.exclamationmark").foregroundStyle(Theme.muted).accessibilityHidden(true)
                    Text(notice).lineLimit(3)
                    Spacer(minLength: 0)
                    Button { store.lateNotices[roomId] = nil } label: { Image(systemName: "xmark.circle.fill").frame(width: 30, height: 30) }
                        .foregroundStyle(Theme.muted)
                        .accessibilityLabel(L("settings.legacyAvatarNotice.dismiss"))
                }
                .font(.footnote)
                .padding(.leading, 14)
                .padding(.trailing, 8)
                .padding(.vertical, 2)
                .background(Theme.elevated)
            }
            let list = rows
            if let next = list.first {
                Button { showList = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "clock").foregroundStyle(Theme.accent).accessibilityHidden(true)
                        Text(SendLaterLogic.countLabel(list.count)).bold().foregroundColor(Theme.text)
                        Text("Next: " + SendLaterLogic.formatSendAt(next.sendAt, now: Date(), clock: ChatSettings.time))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.up").foregroundStyle(Theme.muted).accessibilityHidden(true)
                    }
                    .font(.footnote)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(Theme.elevated)
                .sheet(isPresented: $showList) {
                    ScheduledMessagesSheet(store: store, roomId: roomId, onEdit: { item in
                        showList = false
                        onEdit(item)
                    })
                }
            }
        }
    }
}

/// The scheduled messages of a chat with Edit, Send Now and Cancel.
struct ScheduledMessagesSheet: View {
    @ObservedObject var store: ScheduledMessageStore
    let roomId: String
    let onEdit: (SendLaterLogic.Scheduled) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var busy: String?
    @State private var error: String?

    private var rows: [ScheduledRowItem] {
        let mine = store.items.filter { $0.roomId == roomId }.map {
            ScheduledRowItem(id: $0.id, sendAt: $0.sendAt, body: $0.body, route: $0.route, local: $0, other: nil)
        }
        let others = store.others.filter { $0.roomId == roomId }.map {
            ScheduledRowItem(id: $0.delayId, sendAt: $0.sendAt, body: $0.body, route: .server, local: nil, other: $0)
        }
        return (mine + others).sorted { $0.sendAt < $1.sendAt }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(rows) { row in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(SendLaterLogic.preview(row.body).isEmpty ? "Message" : SendLaterLogic.preview(row.body))
                            .lineLimit(2)
                        Text(subtitle(row)).font(.footnote).foregroundStyle(Theme.muted)
                        HStack(spacing: 16) {
                            if let local = row.local {
                                Button { run(row) { try await store.cancel(local); onEdit(local) } } label: {
                                    Label(L("settings.deviceTile.edit"), systemImage: "pencil")
                                }
                            }
                            Button { run(row) { try await sendNow(row) } } label: {
                                Label(L("ios.chatMore.sendNow"), systemImage: "paperplane")
                            }
                            Button(role: .destructive) { run(row) { try await cancel(row) } } label: {
                                Label(L("settings.deviceTile.cancel"), systemImage: "xmark")
                            }
                            if busy == row.id { ProgressView() }
                        }
                        .buttonStyle(.borderless)
                        .font(.footnote.weight(.semibold))
                        .disabled(busy != nil)
                    }
                    .padding(.vertical, 4)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Theme.danger)
                }
            }
            .navigationTitle(L("ios.chatMore.scheduled"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(L("call.companionDialog.done")) { dismiss() } } }
            .onChange(of: rows.count) { count in if count == 0 && error == nil { dismiss() } }
        }
        .presentationDetents([.medium, .large])
    }

    private func subtitle(_ row: ScheduledRowItem) -> String {
        var parts = [SendLaterLogic.formatSendAt(row.sendAt, now: Date(), clock: ChatSettings.time),
                     row.route == .server ? "Sent by the server" : "Only while Diddy runs"]
        if row.local == nil { parts.append("scheduled on another device") }
        return parts.joined(separator: " · ")
    }

    private func sendNow(_ row: ScheduledRowItem) async throws {
        if let local = row.local { try await store.sendNow(local) } else if let other = row.other { try await store.sendNow(other: other) }
    }

    private func cancel(_ row: ScheduledRowItem) async throws {
        if let local = row.local { try await store.cancel(local) } else if let other = row.other { try await store.cancel(other: other) }
    }

    @MainActor
    private func run(_ row: ScheduledRowItem, _ action: @escaping @MainActor () async throws -> Void) {
        guard busy == nil else { return }
        busy = row.id
        error = nil
        Task {
            do { try await action() } catch { self.error = error.localizedDescription }
            busy = nil
        }
    }
}
