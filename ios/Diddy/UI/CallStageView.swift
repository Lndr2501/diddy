import LiveKit
import SwiftUI

/// The call as the desktop app draws it: one tile per person and one per screen share. A tap on a
/// tile puts it large in front and the others into a strip of thumbnails; a tap on the large one
/// (or its grid button) goes back to the grid. The focus is local to this view, like on the desktop.

// MARK: Model

/// One tile of the stage.
struct StageItem: Identifiable, Equatable {
    enum Kind { case person, share }
    let kind: Kind
    let member: CallMember

    /// Stable across refreshes (LiveKit identity), so the focus survives republished members.
    var id: String { (kind == .person ? "p:" : "s:") + member.id }

    static func == (a: StageItem, b: StageItem) -> Bool { a.id == b.id }

    /// People first, then the screen shares, in the desktop's order.
    static func items(for members: [CallMember]) -> [StageItem] {
        members.map { StageItem(kind: .person, member: $0) }
            + members.filter { $0.screenShare != nil }.map { StageItem(kind: .share, member: $0) }
    }
}

/// How `count` equal tiles fill `size`: the column count that gives the biggest 16:10 tile.
struct StageGridLayout: Equatable {
    let columns: Int
    let cellWidth: CGFloat
    let cellHeight: CGFloat
    let rows: Int

    static func make(count: Int, size: CGSize, spacing: CGFloat, minCellHeight: CGFloat) -> StageGridLayout {
        let count = max(count, 1)
        let width = max(size.width, 1)
        let height = max(size.height, 1)
        var best = StageGridLayout(columns: 1, cellWidth: width, cellHeight: max(minCellHeight, height), rows: count)
        var bestArea: CGFloat = -1
        for columns in 1...count {
            let rows = (count + columns - 1) / columns
            let cellWidth = max((width - CGFloat(columns - 1) * spacing) / CGFloat(columns), 1)
            let cellHeight = max((height - CGFloat(rows - 1) * spacing) / CGFloat(rows), minCellHeight)
            let fitWidth = min(cellWidth, cellHeight * 1.6)
            let area = fitWidth * fitWidth / 1.6
            if area > bestArea + 0.5 {
                bestArea = area
                best = StageGridLayout(columns: columns, cellWidth: cellWidth, cellHeight: cellHeight, rows: rows)
            }
        }
        return best
    }
}

// MARK: Stage

struct CallStageView: View {
    @ObservedObject var session: CallSession
    let account: MatrixAccount?
    let showProfile: (String) -> Void
    @State private var focusKey: String?

    private let spacing: CGFloat = 8

    private var items: [StageItem] { StageItem.items(for: session.members) }
    private var focused: StageItem? { items.first { $0.id == focusKey } }

    var body: some View {
        let items = items
        GeometryReader { geo in
            Group {
                if let focused = items.first(where: { $0.id == focusKey }) {
                    focusedLayout(focused, items: items, size: geo.size)
                } else {
                    gridLayout(items, size: geo.size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .padding(12)
        // The focused tile left the call or stopped sharing: back to the grid.
        .onChange(of: focused == nil && focusKey != nil) { gone in
            if gone { focusKey = nil }
        }
    }

    private func select(_ item: StageItem) {
        withAnimation(.easeInOut(duration: 0.2)) {
            focusKey = focusKey == item.id ? nil : item.id
        }
    }

    // MARK: Layouts

    private func gridLayout(_ items: [StageItem], size: CGSize) -> some View {
        let layout = StageGridLayout.make(count: items.count, size: size, spacing: spacing, minCellHeight: 110)
        let rows = stride(from: 0, to: items.count, by: layout.columns).map {
            Array(items[$0..<min($0 + layout.columns, items.count)])
        }
        let cell = CGSize(width: layout.cellWidth, height: layout.cellHeight)
        return ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: spacing) {
                ForEach(rows.indices, id: \.self) { row in
                    HStack(spacing: spacing) {
                        ForEach(rows[row]) { item in tile(item, size: cell, role: .grid) }
                    }
                }
            }
            .frame(minWidth: size.width, minHeight: size.height)
        }
    }

    private func focusedLayout(_ item: StageItem, items: [StageItem], size: CGSize) -> some View {
        let others = items.filter { $0.id != item.id }
        let thumbHeight: CGFloat = size.height < 380 ? 72 : 104
        let thumb = CGSize(width: thumbHeight * 1.6, height: thumbHeight)
        let stripHeight = others.isEmpty ? 0 : thumbHeight
        let big = CGSize(width: size.width, height: max(size.height - stripHeight - (others.isEmpty ? 0 : spacing), 60))
        return VStack(spacing: spacing) {
            tile(item, size: big, role: .focus)
            if !others.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: spacing) {
                        ForEach(others) { other in tile(other, size: thumb, role: .thumb) }
                    }
                }
                .frame(height: thumbHeight)
            }
        }
    }

    @ViewBuilder
    private func tile(_ item: StageItem, size: CGSize, role: StageTileRole) -> some View {
        switch item.kind {
        case .person:
            PersonTile(member: item.member, account: account, size: size, role: role, onBack: { select(item) })
                .onTapGesture { select(item) }
                .contextMenu {
                    if !item.member.isConnecting {
                        Button { showProfile(item.member.userId) } label: { Label("Show Profile", systemImage: "person.crop.circle") }
                    }
                }
        case .share:
            ShareTile(member: item.member, size: size, role: role, onBack: { select(item) })
                .onTapGesture { select(item) }
        }
    }
}

enum StageTileRole { case grid, focus, thumb }

// MARK: Tiles

private struct PersonTile: View {
    let member: CallMember
    let account: MatrixAccount?
    let size: CGSize
    let role: StageTileRole
    let onBack: () -> Void

    private var speaking: Bool { member.isSpeaking && member.microphoneOn && !member.isConnecting }
    private var avatarSize: CGFloat { min(max(min(size.width, size.height) * 0.42, 30), 128) }

    var body: some View {
        ZStack {
            Theme.elevated
            if let camera = member.camera {
                // A new track is a new view, so a replaced camera never keeps showing the old frame.
                SwiftUIVideoView(camera, layoutMode: .fill)
                    .id(ObjectIdentifier(camera))
                    .frame(width: size.width, height: size.height)
                    .clipped()
            } else {
                AvatarView(url: member.avatarUrl, name: member.name, size: avatarSize, account: account)
                    .offset(y: role == .thumb ? -6 : -avatarSize * 0.12)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .opacity(member.isConnecting ? 0.55 : 1)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(speaking ? Theme.online : .clear, lineWidth: role == .thumb ? 2 : 3)
        )
        .overlay(alignment: .bottomLeading) { nameTag }
        .overlay(alignment: .topLeading) {
            if member.talkingToAgent { AgentTalkingBadge(compact: role != .focus).padding(role == .thumb ? 4 : 8) }
        }
        .overlay(alignment: .topTrailing) {
            if role == .focus { StageIconButton(icon: "square.grid.2x2", label: "Back to grid", action: onBack) }
        }
        .animation(.easeOut(duration: 0.12), value: speaking)
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(role == .focus ? "Back to the grid" : "Show large")
    }

    private var nameTag: some View {
        HStack(spacing: 4) {
            if member.isConnecting {
                ProgressView().scaleEffect(0.6).frame(width: 12, height: 12)
            } else if !member.microphoneOn {
                Image(systemName: "mic.slash.fill").foregroundStyle(Theme.danger)
            }
            Text(member.isLocal ? "\(member.name) (you)" : member.name).lineLimit(1)
        }
        .font((role == .thumb ? Font.caption2 : Font.caption).weight(.semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, role == .thumb ? 6 : 8)
        .padding(.vertical, role == .thumb ? 2 : 4)
        .background(Capsule().fill(.black.opacity(0.55)))
        .padding(role == .thumb ? 5 : 8)
    }

    private var accessibilityText: String {
        var parts = [member.isLocal ? "\(member.name), you" : member.name]
        if member.isConnecting { parts.append("connecting") }
        else if !member.microphoneOn { parts.append("muted") }
        else if speaking { parts.append("speaking") }
        if member.camera != nil { parts.append("camera on") }
        return parts.joined(separator: ", ")
    }
}

private struct ShareTile: View {
    let member: CallMember
    let size: CGSize
    let role: StageTileRole
    let onBack: () -> Void
    @State private var fullscreen = false

    var body: some View {
        ZStack {
            Color.black
            if let track = member.screenShare {
                SwiftUIVideoView(track, layoutMode: .fit, pinchToZoomOptions: role == .focus ? [.zoomIn, .resetOnRelease] : [])
                    .id(ObjectIdentifier(track))
                    .frame(width: size.width, height: size.height)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .topLeading) {
            Label(role == .thumb ? member.name : "\(member.name)'s screen", systemImage: "display")
                .labelStyle(.titleAndIcon)
                .lineLimit(1)
                .font((role == .thumb ? Font.caption2 : Font.caption).weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, role == .thumb ? 6 : 8)
                .padding(.vertical, role == .thumb ? 2 : 4)
                .background(Capsule().fill(Theme.danger))
                .padding(role == .thumb ? 5 : 8)
        }
        .overlay(alignment: .topTrailing) {
            if role == .focus {
                HStack(spacing: 6) {
                    StageIconButton(icon: "arrow.up.left.and.arrow.down.right", label: "Full screen") { fullscreen = true }
                    StageIconButton(icon: "square.grid.2x2", label: "Back to grid", action: onBack)
                }
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(member.name)'s screen")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(role == .focus ? "Back to the grid" : "Show large")
        .fullScreenCover(isPresented: $fullscreen) {
            ZStack(alignment: .topTrailing) {
                Color.black.ignoresSafeArea()
                // The share can end while this is open: close instead of showing a frozen frame.
                if let track = member.screenShare {
                    SwiftUIVideoView(track, layoutMode: .fit, pinchToZoomOptions: [.zoomIn, .resetOnRelease])
                        .id(ObjectIdentifier(track))
                        .ignoresSafeArea()
                }
                Button { fullscreen = false } label: {
                    Image(systemName: "xmark.circle.fill").font(.title).foregroundStyle(.white)
                }
                .accessibilityLabel("Close")
                .padding()
            }
            .onChange(of: member.screenShare == nil) { gone in
                if gone { fullscreen = false }
            }
        }
    }
}

private struct StageIconButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(Circle().fill(.black.opacity(0.55)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .padding(8)
    }
}
