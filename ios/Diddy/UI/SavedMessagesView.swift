import MatrixRustSDK
import SwiftUI

/// Bookmarks are account data, not search results. A focused SDK timeline loads each event by ID
/// and decrypts it locally, including older messages outside the live timeline window.
struct SavedMessagesView: View {
    let account: MatrixAccount
    @EnvironmentObject private var saved: SavedMessagesStore
    @EnvironmentObject private var navigator: AppNavigator
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if saved.state.saved.isEmpty && saved.loaded {
                    VStack(spacing: 10) {
                        Image(systemName: "bookmark").font(.largeTitle)
                        Text(L("ios.chatMore.noSavedMessages")).font(.headline)
                        Text(L("ios.chatMore.longPressAMessageAndChooseSaveMessageYourBookmarksSyncA"))
                            .font(.subheadline).multilineTextAlignment(.center)
                    }
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity).padding(24)
                    .listRowBackground(Color.clear)
                }
                ForEach(saved.state.saved) { item in
                    SavedMessageRow(account: account, item: item) {
                        navigator.searchTarget = SearchEventTarget(roomId: item.roomId, eventId: item.eventId)
                        navigator.open(item.roomId, account: account)
                        navigator.destination = .text(item.roomId)
                        dismiss()
                    }
                }
            }
            .overlay { if !saved.loaded { ProgressView() } }
            .refreshable { await saved.refresh(account: account) }
            .navigationTitle(L("ios.chatMore.savedMessages"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("settings.globalPacks.close")) { dismiss() } } }
            .task { await saved.refresh(account: account) }
        }
    }
}

private struct SavedMessageRow: View {
    let account: MatrixAccount
    let item: SavedMessage
    let open: () -> Void
    @EnvironmentObject private var saved: SavedMessagesStore
    @State private var focused: TimelineController?
    @State private var issue: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(account.summary(for: item.roomId)?.name ?? item.roomId)
                .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
            if let issue {
                Text(issue).foregroundStyle(Theme.muted)
            } else if let focused {
                SavedMessageContent(controller: focused, eventId: item.eventId, open: open)
            } else {
                ProgressView().accessibilityLabel(L("ios.chatMore.loadingMessage"))
            }
            HStack {
                if issue == nil, focused?.rows.contains(where: { $0.remoteEventId == item.eventId && !$0.isRedactedMessage }) == true {
                    Button(L("settings.connectedAccounts.open"), action: open).buttonStyle(.bordered)
                }
                Spacer()
                Button(L("ios.chatMore.removeFromSaved")) { saved.remove(account: account, item: item) }
                    .font(.caption)
            }
        }
        .padding(.vertical, 6)
        .task(id: item.id) {
            guard account.summary(for: item.roomId)?.isJoined == true,
                  let room = account.room(item.roomId) else {
                issue = "You are no longer in this room. This message cannot be shown."
                return
            }
            do {
                // GET checks access/redaction before opening the focused SDK timeline. The SDK
                // fetches the event again and decrypts it with this device's keys.
                let json = try await account.clientRequest(MessageSearch.eventPath(roomId: item.roomId, eventId: item.eventId))
                if (json["unsigned"] as? [String: Any])?["redacted_because"] != nil {
                    issue = "This message was deleted."
                    return
                }
                let controller = TimelineController(room: room, ownUserId: account.userId,
                    focus: .event(eventId: item.eventId, numContextEvents: 0,
                                  threadMode: .automatic(hideThreadedEvents: false)))
                await controller.start()
                guard !Task.isCancelled else { return }
                focused = controller
                // The SDK supplies the initial focused item through its listener asynchronously.
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if !Task.isCancelled && !controller.rows.contains(where: { $0.remoteEventId == item.eventId }) {
                    issue = "This message could not be loaded. You can remove its bookmark."
                }
            } catch {
                issue = "This message is no longer available to you. You can remove its bookmark."
            }
        }
    }
}

private struct SavedMessageContent: View {
    @ObservedObject var controller: TimelineController
    let eventId: String
    let open: () -> Void

    var body: some View {
        if let row = controller.rows.first(where: { $0.remoteEventId == eventId }) {
            HStack {
                Text(row.senderName).font(.caption.weight(.semibold))
                Spacer()
                Text(row.date, format: .dateTime.day().month().year().hour().minute())
                    .font(.caption2)
            }
            .foregroundStyle(Theme.muted)
            if row.isRedactedMessage {
                Text(L("ios.chatMore.thisMessageWasDeleted")).foregroundStyle(Theme.muted)
            } else {
                Button(action: open) {
                    Text(preview(row)).lineLimit(4).foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        } else {
            ProgressView().accessibilityLabel(L("ios.chatMore.decryptingMessage"))
        }
    }

    private func preview(_ row: MessageRow) -> String {
        switch row.body {
        case .text(let value): return value
        case .image: return L("ios.finalComputed.photo")
        case .file(let name, _, _): return L("ios.finalComputed.fileName", ["name": name])
        case .audio: return L("ios.finalComputed.audioMessage")
        case .notice(let value): return value
        case .undecryptable: return L("ios.finalComputed.undecryptable")
        case .redacted: return L("ios.chatMore.thisMessageWasDeleted")
        }
    }
}
