import Foundation
import MatrixRustSDK

// Closure adapters for the SDK's callback protocols. The SDK calls them on its own threads; every
// consumer hops to the main actor itself.

final class SyncStateListener: SyncServiceStateObserver, @unchecked Sendable {
    private let handler: (SyncServiceState) -> Void
    init(_ handler: @escaping (SyncServiceState) -> Void) { self.handler = handler }
    func onUpdate(state: SyncServiceState) { handler(state) }
}

final class RoomEntriesListener: RoomListEntriesListener, @unchecked Sendable {
    private let handler: ([RoomListEntriesUpdate]) -> Void
    init(_ handler: @escaping ([RoomListEntriesUpdate]) -> Void) { self.handler = handler }
    func onUpdate(roomEntriesUpdate: [RoomListEntriesUpdate]) { handler(roomEntriesUpdate) }
}

final class JoinedSpacesListener: SpaceServiceJoinedSpacesListener, @unchecked Sendable {
    private let handler: ([SpaceListUpdate]) -> Void
    init(_ handler: @escaping ([SpaceListUpdate]) -> Void) { self.handler = handler }
    func onUpdate(roomUpdates: [SpaceListUpdate]) { handler(roomUpdates) }
}

final class SpaceChildrenListener: SpaceRoomListEntriesListener, @unchecked Sendable {
    private let handler: ([SpaceListUpdate]) -> Void
    init(_ handler: @escaping ([SpaceListUpdate]) -> Void) { self.handler = handler }
    func onUpdate(rooms: [SpaceListUpdate]) { handler(rooms) }
}

final class TimelineUpdates: TimelineListener, @unchecked Sendable {
    private let handler: ([TimelineDiff]) -> Void
    init(_ handler: @escaping ([TimelineDiff]) -> Void) { self.handler = handler }
    func onUpdate(diff: [TimelineDiff]) { handler(diff) }
}

final class RecoveryListener: RecoveryStateListener, @unchecked Sendable {
    private let handler: (RecoveryState) -> Void
    init(_ handler: @escaping (RecoveryState) -> Void) { self.handler = handler }
    func onUpdate(status: RecoveryState) { handler(status) }
}

final class VerificationListener: VerificationStateListener, @unchecked Sendable {
    private let handler: (VerificationState) -> Void
    init(_ handler: @escaping (VerificationState) -> Void) { self.handler = handler }
    func onUpdate(status: VerificationState) { handler(status) }
}

final class ToDeviceListener: ToDeviceMessageListener, @unchecked Sendable {
    private let handler: (ToDeviceMessage) -> Void
    init(_ handler: @escaping (ToDeviceMessage) -> Void) { self.handler = handler }
    func onMessage(message: ToDeviceMessage) { handler(message) }
}

final class RoomInfoUpdates: RoomInfoListener, @unchecked Sendable {
    private let handler: (RoomInfo) -> Void
    init(_ handler: @escaping (RoomInfo) -> Void) { self.handler = handler }
    func call(roomInfo: RoomInfo) { handler(roomInfo) }
}

/// Applies an SDK list diff to a plain array (same shape for rooms, spaces and timeline items).
enum ListDiff<Element> {
    case append([Element])
    case clear
    case pushFront(Element)
    case pushBack(Element)
    case popFront
    case popBack
    case insert(Int, Element)
    case set(Int, Element)
    case remove(Int)
    case truncate(Int)
    case reset([Element])

    func apply(to array: inout [Element]) {
        switch self {
        case .append(let values): array.append(contentsOf: values)
        case .clear: array.removeAll()
        case .pushFront(let value): array.insert(value, at: 0)
        case .pushBack(let value): array.append(value)
        case .popFront: if !array.isEmpty { array.removeFirst() }
        case .popBack: if !array.isEmpty { array.removeLast() }
        case .insert(let index, let value): array.insert(value, at: min(index, array.count))
        case .set(let index, let value): if index < array.count { array[index] = value }
        case .remove(let index): if index < array.count { array.remove(at: index) }
        case .truncate(let length): if length < array.count { array.removeSubrange(length...) }
        case .reset(let values): array = values
        }
    }
}

extension ListDiff where Element == Room {
    init(_ update: RoomListEntriesUpdate) {
        switch update {
        case .append(let values): self = .append(values)
        case .clear: self = .clear
        case .pushFront(let value): self = .pushFront(value)
        case .pushBack(let value): self = .pushBack(value)
        case .popFront: self = .popFront
        case .popBack: self = .popBack
        case .insert(let index, let value): self = .insert(Int(index), value)
        case .set(let index, let value): self = .set(Int(index), value)
        case .remove(let index): self = .remove(Int(index))
        case .truncate(let length): self = .truncate(Int(length))
        case .reset(let values): self = .reset(values)
        }
    }
}

extension ListDiff where Element == TimelineItem {
    init(_ diff: TimelineDiff) {
        switch diff {
        case .append(let values): self = .append(values)
        case .clear: self = .clear
        case .pushFront(let value): self = .pushFront(value)
        case .pushBack(let value): self = .pushBack(value)
        case .popFront: self = .popFront
        case .popBack: self = .popBack
        case .insert(let index, let value): self = .insert(Int(index), value)
        case .set(let index, let value): self = .set(Int(index), value)
        case .remove(let index): self = .remove(Int(index))
        case .truncate(let length): self = .truncate(Int(length))
        case .reset(let values): self = .reset(values)
        }
    }
}
