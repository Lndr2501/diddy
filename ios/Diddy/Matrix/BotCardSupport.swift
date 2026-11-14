import Foundation
import MatrixRustSDK

/// Connects the pure bot card parser (`BotCard.swift`) to the SDK: reads the raw event of a timeline
/// message, sends card button commands, and loads the command lists bots registered in a room.

/// What the raw event of one message says: it carries a card, or it is a command a card button sent
/// (hidden in the chat, the card changes instead).
struct BotCardInspection {
    var card: BotCard?
    var hidden = false
    /// A shared song (MusicCard.swift).
    var music: MusicCard?
}

@MainActor
enum BotCardLookup {
    private static var cache: [String: BotCardInspection] = [:]

    /// The SDK gives the raw JSON only through the debug info, so the answer is remembered per
    /// message. An edited message is looked at again every time: a bot edits its card in place, and
    /// two edits may share the same plain text.
    static func inspect(_ event: EventTimelineItem, id: String, message: MessageContent) -> BotCardInspection {
        let body: String
        let isText: Bool
        switch message.msgType {
        case .text(let text): body = text.body; isText = true
        case .notice(let notice): body = notice.body; isText = false
        default: return BotCardInspection()
        }
        guard event.isRemote else { return BotCardInspection() }
        let key = "\(id)|\(body)"
        if !message.isEdited, let known = cache[key] { return known }
        let info = event.lazyProvider.debugInfo()
        var result = BotCardInspection()
        if isText, BotCardParser.looksLikeActionBody(body), BotCardParser.isAction(originalJson: info.originalJson) {
            result.hidden = true
        } else if BotCardParser.mightHaveCard(info.originalJson) || BotCardParser.mightHaveCard(info.latestEditJson) {
            result.card = BotCardParser.card(originalJson: info.originalJson, latestEditJson: info.latestEditJson)
        }
        if isText, result.card == nil, MusicCard.mightHaveCard(info.originalJson) || MusicCard.mightHaveCard(info.latestEditJson) {
            result.music = MusicCard.card(originalJson: info.originalJson, latestEditJson: info.latestEditJson)
        }
        if !message.isEdited {
            if cache.count > 3000 { cache.removeAll() }
            cache[key] = result
        }
        return result
    }
}

extension TimelineController {
    /// What a card button does on the desktop: the command goes into the room as a normal text
    /// message of yours, flagged so Diddy hides it. The bot checks, as always, whether you may use it.
    func sendCardAction(_ command: String) async {
        guard let content = BotCardParser.actionContent(command) else { return }
        setTyping(false)
        do {
            _ = try await room.sendRaw(eventType: "m.room.message", content: content)
        } catch {
            sendError = error.friendlyMessage
        }
    }
}

/// The commands bots registered in one room (state event `dev.diddy.commands`, one per bot).
@MainActor
final class BotCommandStore: ObservableObject {
    @Published private(set) var lists: [BotCommandList] = []
    private var loadedFromServer: Date?
    private var loading = false

    /// Cheap start: whatever the SDK already holds locally. For a custom event type that is only
    /// something when the sync asked for it, so `refreshFromServer` is the reliable path.
    func loadLocal(room: Room) async {
        let events = (try? await room.stateEvents(eventType: stateEventTypeFromString(s: BotCardKeys.commandsEvent))) ?? []
        let local = Self.lists(from: events.map(\.contentJson))
        if !local.isEmpty, lists.isEmpty { lists = local }
    }

    /// Reads the room's whole state once in a while. Done when somebody starts typing something
    /// that could be a command, so rooms without any bot cost nothing.
    func refreshFromServer(room: Room, account: MatrixAccount) async {
        if loading { return }
        if let last = loadedFromServer, Date().timeIntervalSince(last) < 60 { return }
        loading = true
        defer { loading = false }
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
        let roomPath = room.id().addingPercentEncoding(withAllowedCharacters: allowed) ?? room.id()
        guard let state = try? await account.clientRequestArray("/_matrix/client/v3/rooms/\(roomPath)/state") else { return }
        loadedFromServer = Date()
        var contents: [String] = []
        for event in state where event["type"] as? String == BotCardKeys.commandsEvent {
            if let content = event["content"], let data = try? JSONSerialization.data(withJSONObject: content) {
                contents.append(String(decoding: data, as: UTF8.self))
            }
        }
        lists = Self.lists(from: contents)
    }

    private static func lists(from contents: [String]) -> [BotCommandList] {
        contents.compactMap { json in
            guard let data = json.data(using: .utf8),
                  let content = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            else { return nil }
            return BotCommandParser.parse(content: content)
        }
    }

    /// Suggestions for the draft: only while it is a single word (a command is the whole message).
    func suggestions(for draft: String) -> [BotCommand] {
        guard !lists.isEmpty, !draft.isEmpty, !draft.contains(where: { $0.isWhitespace || $0.isNewline }) else { return [] }
        return BotCommandParser.match(lists, typed: draft)
    }

    /// True when the draft starts like the prefix of a bot command (`!`, `%`, `.` ...).
    static func mayBeCommand(_ draft: String) -> Bool {
        guard let first = draft.first, !draft.contains(where: { $0.isWhitespace }) else { return false }
        return "!%$.,;~?+*-".contains(first)
    }
}

extension TimelineController {
    /// Sends a shared song as a music card: the cover is uploaded first (other people's clients
    /// then load it from your server, not from Apple or Spotify).
    func sendMusic(_ card: MusicCard, client: Client) async -> Bool {
        var card = card
        if card.artwork == nil, let remote = card.remoteArtwork,
           let (data, response) = try? await URLSession.shared.data(from: remote),
           (response as? HTTPURLResponse)?.statusCode == 200, data.count <= 5 * 1024 * 1024 {
            let mime = (response as? HTTPURLResponse)?.mimeType ?? "image/jpeg"
            card.artwork = try? await client.uploadMedia(mimeType: mime, data: data, progressWatcher: nil)
        }
        guard let json = try? JSONSerialization.data(withJSONObject: card.content()) else { return false }
        setTyping(false)
        do {
            _ = try await room.sendRaw(eventType: "m.room.message", content: String(decoding: json, as: UTF8.self))
            return true
        } catch {
            sendError = error.friendlyMessage
            return false
        }
    }
}
