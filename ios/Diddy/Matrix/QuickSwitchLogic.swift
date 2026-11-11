import Foundation

// The search window of the desktop app (cinny/src/app/features/search/Search.tsx, opened with
// Cmd+K): rooms, direct messages and spaces by name from one field. "#" limits it to rooms, "@" to
// direct messages and "*" to spaces. Matching and ranking follow hooks/useAsyncSearch.ts.
//
// Foundation only, so Tools/quickswitch_check can test it on macOS and Linux.

enum QuickSwitch {
    enum Kind: Equatable {
        case rooms, directs, spaces
    }

    struct Item: Identifiable, Equatable {
        let id: String
        var name: String
        /// Local part of the other person of a direct message, searched as well.
        var dmUsername: String?
        var kind: Kind
    }

    /// The type a leading "#", "@" or "*" asks for, and what is left to search.
    static func parse(_ input: String) -> (kind: Kind?, query: String) {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = value.first else { return (nil, "") }
        let asked: Kind?
        switch first {
        case "#": asked = .rooms
        case "@": asked = .directs
        case "*": asked = .spaces
        default: asked = nil
        }
        guard let kind = asked else { return (nil, value) }
        return (kind, String(value.dropFirst()))
    }

    /// What can be found for a type (all when no type is asked for).
    static func targets(_ kind: Kind?, rooms: [Item], directs: [Item], spaces: [Item]) -> [Item] {
        switch kind {
        case nil: return rooms + directs + spaces
        case .rooms?: return rooms
        case .directs?: return directs
        case .spaces?: return spaces
        }
    }

    /// Shown before anything is typed: the 20 most active rooms and direct messages, or every
    /// space. `activity` orders by the newest activity first (lower is newer).
    static func recent(_ kind: Kind?, rooms: [Item], directs: [Item], spaces: [Item],
                       activity: [String: Int]) -> [Item] {
        func byActivity(_ items: [Item]) -> [Item] {
            let ordered = items.enumerated().sorted { a, b in
                let ra = activity[a.element.id] ?? Int.max
                let rb = activity[b.element.id] ?? Int.max
                return ra != rb ? ra < rb : a.offset < b.offset
            }
            return Array(ordered.map { $0.element }.prefix(20))
        }
        switch kind {
        case .spaces?: return spaces
        case .directs?: return byActivity(directs)
        case .rooms?: return byActivity(rooms)
        case nil: return byActivity(rooms + directs)
        }
    }

    /// NFKC and lower case; spaces stay (the desktop window turns ignoreWhitespace off).
    static func normalize(_ text: String) -> String {
        text.precomposedStringWithCompatibilityMapping.lowercased()
    }

    private static func strings(of item: Item) -> [String] {
        if item.kind == .directs, let username = item.dmUsername, !username.isEmpty {
            return [item.name, username]
        }
        return [item.name]
    }

    /// The first of the item's names that contains the query, normalized.
    static func matchedString(_ item: Item, query: String) -> String? {
        guard !query.isEmpty else { return nil }
        for text in strings(of: item) {
            let normalized = normalize(text)
            if normalized.range(of: query) != nil { return normalized }
        }
        return nil
    }

    private struct Scored {
        let item: Item
        let length: Int
        let index: Int
        let boundary: Bool
        let perfectBoundary: Bool
        let order: Int
    }

    /// Items containing the query, best first like the desktop's orderSearchItems: earlier match,
    /// a match at a word start, a match that is a whole word, and shorter names score higher.
    static func search(_ input: String, in items: [Item]) -> [Item] {
        let query = normalize(input)
        guard !query.isEmpty else { return [] }
        let escaped = NSRegularExpression.escapedPattern(for: query)
        let boundary = try? NSRegularExpression(pattern: "(\\b|_)" + escaped)
        let perfect = try? NSRegularExpression(pattern: "(\\b|_)" + escaped + "(\\b|_)")
        func matches(_ regex: NSRegularExpression?, _ text: String) -> Bool {
            guard let regex else { return false }
            return regex.firstMatch(in: text, options: [], range: NSRange(text.startIndex..<text.endIndex, in: text)) != nil
        }
        var scored: [Scored] = []
        for (order, item) in items.enumerated() {
            guard let text = matchedString(item, query: query), let range = text.range(of: query) else { continue }
            scored.append(Scored(
                item: item,
                length: text.count,
                index: text.distance(from: text.startIndex, to: range.lowerBound),
                boundary: matches(boundary, text),
                perfectBoundary: matches(perfect, text),
                order: order
            ))
        }
        // A stable insertion sort with the desktop's pairwise points.
        var sorted: [Scored] = []
        for entry in scored {
            var position = sorted.count
            while position > 0 && compare(entry, sorted[position - 1]) < 0 {
                position -= 1
            }
            sorted.insert(entry, at: position)
        }
        return sorted.map(\.item)
    }

    /// Negative when `a` comes first.
    private static func compare(_ a: Scored, _ b: Scored) -> Int {
        var points1 = 0
        var points2 = 0
        func toShorter(_ points: Int) {
            if a.length < b.length { points1 += points } else if b.length < a.length { points2 += points }
        }
        toShorter(1)
        if a.index < b.index { points1 += 2 } else if b.index < a.index { points2 += 2 } else { toShorter(2) }
        if a.boundary && b.boundary { toShorter(4) } else if a.boundary { points1 += 4 } else if b.boundary { points2 += 4 }
        if a.perfectBoundary && b.perfectBoundary { toShorter(8) } else if a.perfectBoundary { points1 += 8 } else if b.perfectBoundary { points2 += 8 }
        return points2 - points1
    }

    /// The parts of a name to highlight for the query, the desktop splits it at spaces.
    static func highlightWords(_ query: String) -> [String] {
        query.split(separator: " ").map(String.init).filter { !$0.isEmpty }
    }
}
