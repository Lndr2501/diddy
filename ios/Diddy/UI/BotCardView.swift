import MatrixRustSDK
import SwiftUI

/// The drawn card of a bot message, like `components/message/BotCard.tsx` on the desktop
/// (parser: `Matrix/BotCard.swift`, protocol: docs/bot-cards.md). Buttons and the seek bar hand a
/// bot command to `onCommand`, which sends it into the room.
struct BotCardView: View {
    let card: BotCard
    let account: MatrixAccount
    var onCommand: (String) -> Void = { _ in }
    /// Like the desktop, one command at a time: a button is locked for a moment after a tap.
    @State private var busy = false
    /// Player layout: the volume slider or the "⋯" commands, opened as a row inside the card.
    @State private var panel: PlayerPanel?
    @State private var volumeValue: Double = 0

    private enum PlayerPanel { case volume, more }

    var body: some View {
        Group {
            switch card {
            case .track(let track): trackCard(track)
            case .queue(let now, let items, let total, let actions): queueCard(now: now, items: items, total: total, actions: actions)
            case .help(let groups, let note): helpCard(groups: groups, note: note)
            case .list(let title, let items, let total, let empty, let actions):
                listCard(title: title, items: items, total: total, empty: empty, actions: actions)
            case .stats(let title, let charts, let actions): statsCard(title: title, charts: charts, actions: actions)
            case .note(let text, let tone, let icon): noteCard(text: text, tone: tone, icon: icon)
            }
        }
        .frame(maxWidth: 380, alignment: .leading)
    }

    private func run(_ command: String) {
        guard !busy else { return }
        busy = true
        onCommand(command)
        Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            busy = false
        }
    }

    // MARK: Pieces

    private func container<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) { content() }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.elevated))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.faint.opacity(0.25), lineWidth: 1))
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.footnote.weight(.bold)).foregroundStyle(Theme.muted).textCase(nil)
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(Theme.muted)
    }

    @ViewBuilder
    private func actionButtons(_ actions: [BotCardAction]) -> some View {
        if !actions.isEmpty {
            CardFlowLayout(spacing: 6) {
                ForEach(Array(actions.enumerated()), id: \.offset) { _, action in
                    Button { run(action.send) } label: {
                        Text(action.label)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Capsule().fill(Theme.input))
                            .overlay(Capsule().stroke(Theme.faint.opacity(0.3), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                    .opacity(busy ? 0.5 : 1)
                    .accessibilityHint(action.send)
                }
            }
        }
    }

    private func stateChip(_ state: BotCardTrackState) -> some View {
        let (label, color): (String, Color) = {
            switch state {
            case .searching: return ("Searching", Theme.accent)
            case .downloading: return ("Downloading", Theme.accent)
            case .playing: return ("Now playing", Theme.online)
            case .paused: return ("Paused", Theme.muted)
            case .stopped: return ("Stopped", Theme.faint)
            case .error: return ("Error", Theme.danger)
            }
        }()
        return HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(label).font(.caption2.weight(.bold)).foregroundStyle(color)
        }
    }

    private func bar(ratio: Double, color: Color) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.input)
                Capsule().fill(color).frame(width: max(0, min(1, ratio)) * geo.size.width)
            }
        }
        .frame(height: 6)
    }

    // MARK: Track

    @ViewBuilder
    private func trackCard(_ track: BotCardTrack) -> some View {
        if let controls = track.controls {
            playerCard(track, controls: controls)
        } else {
            classicTrackCard(track)
        }
    }

    private func classicTrackCard(_ track: BotCardTrack) -> some View {
        container {
            HStack(alignment: .top, spacing: 10) {
                CardCover(url: track.thumbnail, account: account)
                VStack(alignment: .leading, spacing: 3) {
                    stateChip(track.state)
                    Text(track.title).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text)
                    if let artist = track.artist { Text(artist).font(.footnote).foregroundStyle(Theme.muted) }
                }
                Spacer(minLength: 0)
            }
            liveProgress(track, showVolume: true)
            if let note = track.note { hint(note) }
            actionButtons(track.actions)
        }
    }

    @ViewBuilder
    private func liveProgress(_ track: BotCardTrack, showVolume: Bool) -> some View {
        if track.position != nil, track.duration != nil {
            if track.state == .playing {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    progress(track, now: context.date, showVolume: showVolume)
                }
            } else {
                progress(track, now: Date(), showVolume: showVolume)
            }
        } else if let duration = track.duration {
            hint("Length \(BotCardParser.formatTime(duration))")
        }
    }

    @ViewBuilder
    private func progress(_ track: BotCardTrack, now: Date, showVolume: Bool = true) -> some View {
        if let position = BotCardParser.livePosition(track, now: now), let duration = track.duration {
            let ratio = duration > 0 ? min(1, position / duration) : 0
            let seekable = track.seek != nil && (track.state == .playing || track.state == .paused)
            let fill = track.state == .paused ? Theme.muted : Theme.accent
            VStack(spacing: 2) {
                // The bar is thin; the touch area around it is not.
                bar(ratio: ratio, color: fill)
                    .frame(height: 24)
                    .contentShape(Rectangle())
                    .background(GeometryReader { geo in
                        Color.clear.contentShape(Rectangle()).gesture(
                            SpatialTapGesture().onEnded { tap in
                                guard seekable, let seek = track.seek, geo.size.width > 0 else { return }
                                let target = min(1, max(0, tap.location.x / geo.size.width)) * duration
                                run("\(seek) \(BotCardParser.formatTime(target))")
                            }
                        )
                    })
                HStack {
                    Text(BotCardParser.formatTime(position))
                    Spacer()
                    if showVolume, let volume = track.volume { Text("🔊 \(Int(volume.rounded()))") }
                    Spacer()
                    Text(BotCardParser.formatTime(duration))
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(Theme.muted)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Playback")
            .accessibilityValue("\(BotCardParser.formatTime(position)) of \(BotCardParser.formatTime(duration))")
            .accessibilityAdjustableAction { direction in
                guard seekable, let seek = track.seek else { return }
                run("\(seek) \(direction == .increment ? "+10" : "-10")")
            }
        }
    }

    // MARK: Player (the bot sent `controls`; `actions` are ignored here)

    private func playerHeader(_ track: BotCardTrack) -> String {
        let base: String = {
            switch track.state {
            case .searching: return "Searching"
            case .downloading: return "Loading"
            case .playing: return "Now playing"
            case .paused: return "Paused"
            case .stopped: return "Stopped"
            case .error: return "Error"
            }
        }()
        guard let room = track.room, track.state == .playing || track.state == .paused else { return base }
        return "\(base) in \(room)"
    }

    private func playerButton(_ title: String?, icon: String, primary: Bool = false, selected: Bool = false,
                              label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.footnote.weight(.bold))
                if let title { Text(title).font(.footnote.weight(.semibold)).monospacedDigit() }
            }
            .foregroundStyle(primary ? Theme.onAccent : Theme.text)
            .padding(.horizontal, title == nil ? 0 : 14)
            // 40 pt: comfortable to hit with a thumb
            .frame(minWidth: 40, minHeight: 40)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(primary ? Theme.accent : Theme.input))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(selected ? Theme.accent : .clear, lineWidth: 1.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy ? 0.5 : 1)
        .accessibilityLabel(label)
    }

    private func togglePanel(_ which: PlayerPanel, volume: Double?, max: Double) {
        if panel == which {
            panel = nil
        } else {
            volumeValue = min(volume ?? 0, max).rounded()
            panel = which
        }
    }

    private func playerCard(_ track: BotCardTrack, controls: BotCardControls) -> some View {
        let playing = track.state == .playing
        let volumeMax = track.volumeMax ?? 100
        let sub = [track.artist, track.requestedBy.map { "requested by \($0)" }].compactMap { $0 }.joined(separator: " · ")
        return container {
            HStack(alignment: .center, spacing: 10) {
                CardCover(url: track.thumbnail, account: account)
                VStack(alignment: .leading, spacing: 2) {
                    Text(playerHeader(track).uppercased())
                        .font(.caption2.weight(.bold)).foregroundStyle(Theme.muted).lineLimit(1)
                    Text(track.title).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text)
                    if !sub.isEmpty { Text(sub).font(.footnote).foregroundStyle(Theme.muted).lineLimit(1) }
                }
                Spacer(minLength: 0)
            }
            liveProgress(track, showVolume: false)
            if let note = track.note { hint(note) }
            CardFlowLayout(spacing: 6) {
                if let prev = controls.prev {
                    playerButton(nil, icon: "backward.end.fill", label: "Previous") { run(prev) }
                }
                if let toggle = controls.toggle {
                    playerButton(playing ? "Pause" : "Play", icon: playing ? "pause.fill" : "play.fill",
                                 primary: true, label: playing ? "Pause" : "Play") { run(toggle) }
                }
                if let skip = controls.skip {
                    playerButton("Skip", icon: "forward.end.fill", label: "Skip") { run(skip) }
                }
                if controls.volume != nil {
                    playerButton(track.volume.map { "\(Int($0.rounded()))%" }, icon: "speaker.wave.2.fill",
                                 selected: panel == .volume, label: "Volume") {
                        togglePanel(.volume, volume: track.volume, max: volumeMax)
                    }
                }
                if !track.more.isEmpty {
                    playerButton(nil, icon: "ellipsis", selected: panel == .more, label: "More") {
                        togglePanel(.more, volume: track.volume, max: volumeMax)
                    }
                }
            }
            if panel == .volume, let command = controls.volume {
                HStack(spacing: 10) {
                    Image(systemName: "speaker.wave.2.fill").font(.footnote).foregroundStyle(Theme.muted)
                    // Sends once the finger lets go, like the desktop on pointerup.
                    Slider(value: $volumeValue, in: 0...volumeMax, step: 1, onEditingChanged: { editing in
                        guard !editing else { return }
                        let value = Int(volumeValue.rounded())
                        if track.volume.map({ Int($0.rounded()) }) != value { run("\(command) \(value)") }
                    })
                    .tint(Theme.accent)
                    .disabled(busy)
                    .accessibilityLabel("Volume")
                    Text("\(Int(volumeValue.rounded()))%")
                        .font(.footnote.weight(.semibold).monospacedDigit())
                        .foregroundStyle(Theme.text)
                        .frame(minWidth: 40, alignment: .trailing)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.faint.opacity(0.3), lineWidth: 1))
            }
            if panel == .more {
                CardFlowLayout(spacing: 6) {
                    ForEach(Array(track.more.enumerated()), id: \.offset) { _, action in
                        Button {
                            run(action.send)
                            panel = nil
                        } label: {
                            Text(action.label)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Theme.text)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 40)
                                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.input))
                        }
                        .buttonStyle(.plain)
                        .disabled(busy)
                        .opacity(busy ? 0.5 : 1)
                        .accessibilityHint(action.send)
                    }
                }
                .padding(6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.faint.opacity(0.3), lineWidth: 1))
            }
            if !track.upNext.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    sectionTitle("UP NEXT")
                    ForEach(Array(track.upNext.enumerated()), id: \.offset) { index, item in
                        itemRow(index: index + 1, title: item.title, subtitle: item.artist, duration: nil)
                    }
                }
            }
        }
        // accent stripe on the left like a now-playing widget (the desktop's player card)
        .overlay(alignment: .leading) {
            Rectangle().fill(Theme.accent).frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: Queue and lists

    private func itemRow(index: Int, title: String, subtitle: String?, duration: Double?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("\(index).").font(.footnote.monospacedDigit()).foregroundStyle(Theme.faint)
            Text(subtitle.map { "\(title) · \($0)" } ?? title).font(.footnote).foregroundStyle(Theme.text)
            Spacer(minLength: 4)
            if let duration {
                Text(BotCardParser.formatTime(duration)).font(.caption2.monospacedDigit()).foregroundStyle(Theme.muted)
            }
        }
    }

    private func queueCard(now: BotCardQueueItem?, items: [BotCardQueueItem], total: Int, actions: [BotCardAction]) -> some View {
        container {
            sectionTitle("Queue · \(total)")
            if let now {
                VStack(alignment: .leading, spacing: 3) {
                    stateChip(.playing)
                    Text(now.title).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text)
                    if let artist = now.artist { Text(artist).font(.footnote).foregroundStyle(Theme.muted) }
                }
            }
            if items.isEmpty {
                hint("The queue is empty.")
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        itemRow(index: index + 1, title: item.title, subtitle: item.artist, duration: item.duration)
                    }
                }
            }
            if total > items.count { hint("… and \(total - items.count) more") }
            actionButtons(actions)
        }
    }

    private func listCard(title: String, items: [BotCardQueueItem], total: Int, empty: String?, actions: [BotCardAction]) -> some View {
        container {
            sectionTitle("\(title) · \(total)")
            if items.isEmpty {
                hint(empty ?? "Nothing here.")
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        itemRow(index: index + 1, title: item.title, subtitle: item.artist, duration: item.duration)
                    }
                }
            }
            if total > items.count { hint("… and \(total - items.count) more") }
            actionButtons(actions)
        }
    }

    // MARK: Help

    private func helpCard(groups: [BotCardHelpGroup], note: String?) -> some View {
        container {
            ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                VStack(alignment: .leading, spacing: 5) {
                    sectionTitle(group.title)
                    ForEach(Array(group.items.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(item.usage)
                                .font(.system(.footnote, design: .monospaced))
                                .foregroundStyle(Theme.accent)
                            Text(item.desc).font(.footnote).foregroundStyle(Theme.text)
                        }
                    }
                }
            }
            if let note { hint(note) }
        }
    }

    // MARK: Stats

    private func trimmed(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }

    private func statsCard(title: String, charts: [BotCardChart], actions: [BotCardAction]) -> some View {
        container {
            Text(title).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text)
            ForEach(Array(charts.enumerated()), id: \.offset) { _, chart in
                let maximum = max(chart.items.map(\.value).max() ?? 1, 1)
                VStack(alignment: .leading, spacing: 6) {
                    sectionTitle(chart.title)
                    ForEach(Array(chart.items.enumerated()), id: \.offset) { index, item in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("\(index + 1).").font(.footnote.monospacedDigit()).foregroundStyle(Theme.faint)
                                Text(item.label).font(.footnote).foregroundStyle(Theme.text).lineLimit(1)
                                if let sub = item.sub { Text(sub).font(.caption2).foregroundStyle(Theme.muted).lineLimit(1) }
                                Spacer(minLength: 4)
                                Text(trimmed(item.value) + (chart.unit.map { " \($0)" } ?? ""))
                                    .font(.footnote.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(Theme.text)
                            }
                            // Relative to the biggest value, never thinner than a sliver.
                            bar(ratio: max(0.02, item.value / maximum), color: Theme.accent)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            actionButtons(actions)
        }
    }

    // MARK: Note

    private func noteCard(text: String, tone: BotCardTone, icon: String?) -> some View {
        let color: Color = {
            switch tone {
            case .info: return Theme.accent
            case .success: return Theme.online
            case .warning: return .orange
            case .error: return Theme.danger
            }
        }()
        return HStack(alignment: .top, spacing: 8) {
            if let icon { Text(icon).accessibilityHidden(true) }
            Text(text).font(.footnote).foregroundStyle(Theme.text)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(color.opacity(0.14)))
        .overlay(alignment: .leading) {
            Rectangle().fill(color).frame(width: 3).clipShape(RoundedRectangle(cornerRadius: 2))
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// Cover of a track: the picture from the Matrix media repository (`mxc://` only), or a note.
private struct CardCover: View {
    let url: String?
    let account: MatrixAccount
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.input)
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Text("🎵").font(.title3)
            }
        }
        .frame(width: 52, height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityHidden(true)
        .task(id: url) {
            guard let url, ChatSettings.autoLoadMedia else { image = nil; return }
            image = await MediaLoader.shared.thumbnail(url: url, size: 156, accountId: account.id, client: account.client)
        }
    }
}

/// Buttons that wrap onto the next line.
private struct CardFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(width: bounds.width, subviews: subviews)
        for (subview, origin) in zip(subviews, result.origins) {
            subview.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        var origins: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return (CGSize(width: maxX, height: y + rowHeight), origins)
    }
}

// MARK: - Command suggestions

/// The commands a bot registered in this room, shown above the composer while a command is typed
/// (the iOS side of `BotCommandAutocomplete.tsx`). A tap puts the command into the draft.
struct BotCommandSuggestions: View {
    @ObservedObject var store: BotCommandStore
    @Binding var draft: String
    let room: Room
    let account: MatrixAccount
    /// Off while editing a message.
    let enabled: Bool

    var body: some View {
        let matches = enabled ? store.suggestions(for: draft) : []
        VStack(spacing: 0) {
            if !matches.isEmpty {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(matches) { command in
                            Button { draft = "\(command.prefix)\(command.name) " } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(command.usage).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                                    if !command.desc.isEmpty {
                                        Text(command.desc).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(command.desc.isEmpty ? command.usage : "\(command.usage), \(command.desc)")
                        }
                    }
                }
                .frame(maxHeight: min(220, CGFloat(matches.count) * 54))
                .background(Theme.elevated)
            }
        }
        // Reading the room's state costs a request, so it waits until something command-like is typed.
        .onChange(of: draft) { text in
            guard enabled, BotCommandStore.mayBeCommand(text) else { return }
            Task { await store.refreshFromServer(room: room, account: account) }
        }
        .task { await store.loadLocal(room: room) }
    }
}
