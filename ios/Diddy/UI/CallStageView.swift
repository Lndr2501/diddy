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

// StageGridLayout and StageStripLayout: Call/CallStageLayout.swift.

// MARK: Stage

/// Whose volume the sheet sets.
private struct VolumeTarget: Identifiable {
    let userId: String
    let name: String
    let kind: CallVolumeKind
    var id: String { kind.rawValue + userId }
}

struct CallStageView: View {
    @ObservedObject var session: CallSession
    @ObservedObject private var extras: CallLiveExtras
    let account: MatrixAccount?
    let showProfile: (String) -> Void
    @EnvironmentObject private var navigator: AppNavigator
    @EnvironmentObject private var calls: CallManager
    @State private var focusKey: String?
    @State private var volumeTarget: VolumeTarget?
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    init(session: CallSession, account: MatrixAccount?, showProfile: @escaping (String) -> Void) {
        self.session = session
        self.account = account
        self.showProfile = showProfile
        _extras = ObservedObject(wrappedValue: session.extras)
    }

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
        .padding(verticalSizeClass == .compact ? 8 : 12)
        .sheet(item: $volumeTarget) { target in
            PersonVolumeSheet(extras: extras, userId: target.userId, name: target.name, kind: target.kind)
        }
        // The focused tile left the call or stopped sharing: back to the grid.
        .onChange(of: focused == nil && focusKey != nil) { gone in
            if gone { focusKey = nil }
        }
    }

    private func stopWatching(_ item: StageItem) {
        if focusKey == item.id { focusKey = nil }
        session.stopWatchingShare(item.member.id)
    }

    private func select(_ item: StageItem) {
        withAnimation(.easeInOut(duration: 0.2)) {
            focusKey = focusKey == item.id ? nil : item.id
        }
    }

    // MARK: Layouts

    private func gridLayout(_ items: [StageItem], size: CGSize) -> some View {
        // iPhone in landscape: smaller tiles before the grid scrolls
        let minCellHeight: CGFloat = verticalSizeClass == .compact ? 64 : 110
        let layout = StageGridLayout.make(count: items.count, size: size, spacing: spacing, minCellHeight: minCellHeight)
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
        let strip = StageStripLayout.make(count: others.count, size: size, spacing: spacing)
        // Thumbnails under the large tile, or in a column beside it on a wide stage (landscape).
        let outer = strip.beside ? AnyLayout(HStackLayout(spacing: spacing)) : AnyLayout(VStackLayout(spacing: spacing))
        let inner = strip.beside ? AnyLayout(VStackLayout(spacing: spacing)) : AnyLayout(HStackLayout(spacing: spacing))
        let axes: Axis.Set = strip.beside ? .vertical : .horizontal
        return outer {
            tile(item, size: strip.focus, role: .focus)
            if !others.isEmpty {
                ScrollView(axes, showsIndicators: false) {
                    inner {
                        ForEach(others) { other in tile(other, size: strip.thumb, role: .thumb) }
                    }
                    // centred while they fit, from the start once they scroll: none is cut off
                    .frame(minWidth: strip.beside ? nil : strip.strip.width, minHeight: strip.beside ? strip.strip.height : nil)
                }
                .frame(width: strip.strip.width, height: strip.strip.height)
            }
        }
    }

    @ViewBuilder
    private func tile(_ item: StageItem, size: CGSize, role: StageTileRole) -> some View {
        switch item.kind {
        case .person:
            PersonTile(member: item.member, account: account, size: size, role: role, reaction: extras.reaction(for: item.member.userId), onBack: { select(item) })
                .onTapGesture { select(item) }
                .contextMenu { personMenu(item.member) }
        case .share:
            // your own share always shows; somebody else's only after Watch (#206)
            let watching = item.member.isLocal || session.watchedShares.contains(item.member.id)
            ShareTile(
                member: item.member, size: size, role: role, watching: watching,
                onSelect: { select(item) }, onBack: { select(item) },
                onWatch: { session.watchShare(item.member.id) },
                onStopWatching: { stopWatching(item) }
            )
            .contextMenu { shareMenu(item.member) }
        }
    }

    // MARK: Menus

    /// Profile, message, mute for me, volume and copy (desktop `CallUserMenu`).
    @ViewBuilder
    private func personMenu(_ member: CallMember) -> some View {
        if !member.isConnecting {
            Button { showProfile(member.userId) } label: { Label("Show Profile", systemImage: "person.crop.circle") }
            if !member.isLocal {
                Button { message(member.userId) } label: { Label("Message", systemImage: "bubble.left") }
                let muted = extras.isMuted(member.userId, kind: .voice)
                Button { extras.toggleMuted(member.userId, kind: .voice) } label: {
                    Label(muted ? "Unmute for Me" : "Mute for Me", systemImage: muted ? "speaker.wave.2" : "speaker.slash")
                }
                Button { volumeTarget = VolumeTarget(userId: member.userId, name: member.name, kind: .voice) } label: {
                    Label("Volume\u{2026}", systemImage: "slider.horizontal.3")
                }
            }
        }
        Button { UIPasteboard.general.string = member.name } label: { Label("Copy Name", systemImage: "doc.on.doc") }
        Button { UIPasteboard.general.string = member.userId } label: { Label("Copy ID", systemImage: "number") }
    }

    /// The sound of somebody's screen share, for you only.
    @ViewBuilder
    private func shareMenu(_ member: CallMember) -> some View {
        if !member.isLocal {
            if session.watchedShares.contains(member.id) {
                Button { stopWatching(StageItem(kind: .share, member: member)) } label: {
                    Label("Stop Watching", systemImage: "eye.slash")
                }
            } else {
                Button { session.watchShare(member.id) } label: { Label("Watch Stream", systemImage: "eye") }
            }
            if member.shareHasAudio {
                let muted = extras.isMuted(member.userId, kind: .stream)
                Button { extras.toggleMuted(member.userId, kind: .stream) } label: {
                    Label(muted ? "Unmute Stream for Me" : "Mute Stream for Me", systemImage: muted ? "speaker.wave.2" : "speaker.slash")
                }
                Button { volumeTarget = VolumeTarget(userId: member.userId, name: member.name, kind: .stream) } label: {
                    Label("Stream Volume\u{2026}", systemImage: "slider.horizontal.3")
                }
            } else {
                Button {} label: { Label("This Stream Has No Sound", systemImage: "speaker.slash") }.disabled(true)
            }
        }
    }

    /// Opens (or creates) the direct message with this person and leaves the call screen for it.
    private func message(_ userId: String) {
        guard let account else { return }
        Task {
            do {
                let id = try await account.directMessage(with: userId)
                try await account.waitForRoom(id)
                calls.showCallScreen = false
                navigator.open(id, account: account)
            } catch { session.lastError = error.friendlyMessage }
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
    var reaction: String?
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
                // Like desktop: an animated picture moves only while its owner speaks.
                AvatarView(url: member.avatarUrl, name: member.name, size: avatarSize, account: account, animates: speaking)
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
        .overlay {
            if let reaction {
                CallReactionBubble(emoji: reaction, size: min(max(min(size.width, size.height) * 0.4, 28), 72))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: reaction)
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
        if member.talkingToAgent { parts.append("talking to agent") }
        return parts.joined(separator: ", ")
    }
}

private struct ShareTile: View {
    let member: CallMember
    let size: CGSize
    let role: StageTileRole
    /// false: somebody else's share not opened yet, a card with Watch instead of the picture (#206)
    let watching: Bool
    /// Tap on the tile: show it large, or back to the grid when it already is.
    let onSelect: () -> Void
    let onBack: () -> Void
    let onWatch: () -> Void
    let onStopWatching: () -> Void
    @State private var fullscreen = false
    @State private var zoom = StreamZoom.none

    var body: some View {
        ZStack {
            Color.black
            if !watching {
                watchCard
            } else if let track = member.screenShare {
                if role == .focus {
                    ZoomableShareVideo(track: track, size: size, zoom: $zoom, onSingleTap: {
                        // while zoomed a tap must not throw the large view away
                        if !zoom.isZoomed { onSelect() }
                    })
                } else {
                    SwiftUIVideoView(track, layoutMode: .fit)
                        .id(ObjectIdentifier(track))
                        .frame(width: size.width, height: size.height)
                }
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        // The name and the buttons share one row, so a long name is cut instead of running under them.
        .overlay(alignment: .top) {
            HStack(alignment: .center, spacing: 0) {
                nameBadge
                Spacer(minLength: 8)
                if role == .focus {
                    if zoom.isZoomed {
                        ZoomResetButton(zoom: $zoom)
                    }
                    if watching {
                        StageIconButton(icon: "arrow.up.left.and.arrow.down.right", label: "Full screen") { fullscreen = true }
                        if !member.isLocal {
                            StageIconButton(icon: "eye.slash", label: "Stop watching", action: onStopWatching)
                        }
                    }
                    StageIconButton(icon: "square.grid.2x2", label: "Back to grid", action: onBack)
                }
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture {
            if !watching { onWatch(); return }
            // the large stream handles its own taps (ZoomableShareVideo)
            if role != .focus { onSelect() }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(watching ? "\(member.name)'s screen" : "\(member.name) is sharing their screen")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(watchHint)
        .fullScreenCover(isPresented: $fullscreen) {
            FullscreenShare(member: member, isPresented: $fullscreen)
        }
    }

    private var watchHint: String {
        if !watching { return "Watch the stream" }
        return role == .focus ? "Back to the grid. Pinch or double tap to zoom." : "Show large"
    }

    /// Instead of the picture until you tap Watch.
    private var watchCard: some View {
        VStack(spacing: role == .thumb ? 4 : 10) {
            Image(systemName: "display")
                .font(.system(size: role == .thumb ? 18 : 30, weight: .regular))
                .foregroundStyle(.white.opacity(0.8))
            if role != .thumb {
                Text("\(member.name) is sharing their screen")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            Text("Watch")
                .font((role == .thumb ? Font.caption2 : Font.footnote).weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, role == .thumb ? 8 : 14)
                .padding(.vertical, role == .thumb ? 3 : 6)
                .background(Capsule().fill(Theme.accent))
        }
        .padding(12)
        .frame(width: size.width, height: size.height)
    }

    private var nameBadge: some View {
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
}

/// The large stream of the call stage, or the stream in full screen: pinch zooms towards the
/// fingers and stays zoomed, a drag moves the zoomed picture, a double tap zooms in 2.5x at that
/// point or back out (StreamZoom, same rules as the desktop).
private struct ZoomableShareVideo: View {
    let track: LiveKit.VideoTrack
    let size: CGSize
    @Binding var zoom: StreamZoom
    var onSingleTap: () -> Void = {}
    @State private var pinchStart: StreamZoom?
    @State private var dragStart: StreamZoom?

    var body: some View {
        let width = Double(max(size.width, 1))
        let height = Double(max(size.height, 1))
        let picture = SwiftUIVideoView(track, layoutMode: .fit)
            .id(ObjectIdentifier(track))
            .frame(width: size.width, height: size.height)
            .scaleEffect(CGFloat(zoom.scale), anchor: .topLeading)
            .offset(x: CGFloat(zoom.x * width), y: CGFloat(zoom.y * height))
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .clipped()
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture(count: 2)
                    .onEnded { tap in
                        withAnimation(.easeOut(duration: 0.2)) {
                            zoom = zoom.doubleTapped(px: Double(tap.location.x) / width, py: Double(tap.location.y) / height)
                        }
                    }
                    .exclusively(before: TapGesture().onEnded { onSingleTap() })
            )
            // only while zoomed: otherwise a swipe stays free for the views around
            .simultaneousGesture(
                DragGesture(minimumDistance: 4)
                    .onChanged { drag in
                        let start = dragStart ?? zoom
                        dragStart = start
                        zoom = start.panned(dx: Double(drag.translation.width) / width, dy: Double(drag.translation.height) / height)
                    }
                    .onEnded { _ in dragStart = nil },
                including: zoom.isZoomed ? .all : .subviews
            )
        return pinchable(picture)
    }

    /// iOS 17 knows where the fingers are; before that the pinch zooms towards the middle.
    @ViewBuilder
    private func pinchable<Content: View>(_ content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.simultaneousGesture(
                MagnifyGesture()
                    .onChanged { pinch in
                        applyPinch(Double(pinch.magnification), px: Double(pinch.startAnchor.x), py: Double(pinch.startAnchor.y))
                    }
                    .onEnded { _ in pinchStart = nil }
            )
        } else {
            content.simultaneousGesture(
                MagnificationGesture()
                    .onChanged { magnification in applyPinch(Double(magnification), px: 0.5, py: 0.5) }
                    .onEnded { _ in pinchStart = nil }
            )
        }
    }

    private func applyPinch(_ magnification: Double, px: Double, py: Double) {
        let start = pinchStart ?? zoom
        pinchStart = start
        zoom = start.zoomed(by: magnification, px: px, py: py)
    }
}

/// Shows the zoom level; a tap goes back to the whole picture.
private struct ZoomResetButton: View {
    @Binding var zoom: StreamZoom

    var body: some View {
        Button {
            withAnimation(.easeOut(duration: 0.2)) { zoom = .none }
        } label: {
            Text(verbatim: "\(zoom.percent)%")
                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .frame(height: 32)
                .background(Capsule().fill(.black.opacity(0.55)))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Zoom \(zoom.percent) percent")
        .accessibilityHint("Shows the whole picture again")
        .padding(.vertical, 2)
    }
}

/// A screen share on the whole screen, zoomable like the large tile, with its own zoom.
private struct FullscreenShare: View {
    let member: CallMember
    @Binding var isPresented: Bool
    @State private var zoom = StreamZoom.none

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            // The share can end while this is open: close instead of showing a frozen frame.
            if let track = member.screenShare {
                GeometryReader { geo in
                    ZoomableShareVideo(track: track, size: geo.size, zoom: $zoom)
                }
                .ignoresSafeArea()
            }
        }
        .overlay(alignment: .topTrailing) {
            HStack(spacing: 6) {
                if zoom.isZoomed {
                    ZoomResetButton(zoom: $zoom)
                }
                Button { isPresented = false } label: {
                    Image(systemName: "xmark.circle.fill").font(.title).foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Close")
            }
            .padding()
        }
        .statusBarHidden(true)
        .onChange(of: member.screenShare == nil) { gone in
            if gone { isPresented = false }
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
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .padding(2)
    }
}
