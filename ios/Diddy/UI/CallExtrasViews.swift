import AVFoundation
import AVKit
import SwiftUI

// The extras of the call screen: ping, reactions, devices, the sharing menu, a person's volume
// and the "Leave your current call?" question. Logic: Call/CallLiveExtras.swift.

// MARK: Leave your current call?

extension View {
    /// Asks "Leave your current call?" when `calls.requestJoin` finds another call running.
    func callSwitchAlert(_ calls: CallManager) -> some View {
        modifier(CallSwitchAlert(calls: calls))
    }
}

private struct CallSwitchAlert: ViewModifier {
    @ObservedObject var calls: CallManager

    func body(content: Content) -> some View {
        content.alert(
            CallSwitchText.title,
            isPresented: Binding(get: { calls.switchRequest != nil }, set: { if !$0 { calls.switchRequest = nil } }),
            presenting: calls.switchRequest
        ) { request in
            Button(CallSwitchText.confirm(request.action), role: .destructive) {
                Task { await calls.confirmSwitch(request) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { request in
            Text(CallSwitchText.message(currentName: request.currentName, targetName: request.roomName, action: request.action))
        }
    }
}

// MARK: Ping

/// Signal bars and the round trip to the voice server, dimmed until a value exists.
struct PingBadge: View {
    @ObservedObject var extras: CallLiveExtras

    var body: some View {
        let ms = extras.pingMs
        let lit = ms.map { CallPing.bars(forMs: $0) } ?? 0
        HStack(spacing: 4) {
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(1...3, id: \.self) { bar in
                    RoundedRectangle(cornerRadius: 1.5)
                        .frame(width: 3.5, height: CGFloat(4 + bar * 3))
                        .opacity(lit >= bar ? 1 : 0.3)
                }
            }
            if let ms { Text("\(ms) ms").font(.caption2.monospacedDigit()) }
        }
        .foregroundStyle(lit == 1 ? Color.orange : (lit == 0 ? Theme.muted : Theme.online))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(CallPing.label(ms: ms))
    }
}

// MARK: Reactions

/// The emoji Element Call offers; a tap floats it over your tile for everybody.
struct CallReactionsSheet: View {
    @ObservedObject var session: CallSession
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 14) {
                ForEach(CallReactions.options) { option in
                    Button {
                        Task { await session.sendReaction(option) }
                        dismiss()
                    } label: {
                        Text(option.emoji).font(.system(size: 36)).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(option.name)
                }
            }
            .padding()
            .frame(maxHeight: .infinity, alignment: .top)
            .background(Theme.sidebar)
            .navigationTitle("Reactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .presentationDetents([.height(340), .large])
    }
}

/// An emoji floating over a tile for three seconds.
struct CallReactionBubble: View {
    let emoji: String
    let size: CGFloat

    var body: some View {
        Text(emoji)
            .font(.system(size: size))
            .shadow(radius: 4)
            .transition(.scale.combined(with: .opacity))
            .accessibilityLabel("Reaction \(emoji)")
    }
}

// MARK: Sharing menu

/// The share button: starts sharing; while sharing it opens a menu with "Share System Sound"
/// and "Stop Sharing" (desktop `ShareOptionsButton`).
struct ShareControl: View {
    @ObservedObject var session: CallSession
    @ObservedObject var extras: CallLiveExtras

    var body: some View {
        if session.screenSharing {
            Menu {
                Toggle(isOn: Binding(
                    get: { extras.shareSystemSound },
                    set: { on in Task { await session.setShareSystemSound(on) } }
                )) {
                    Label("Share System Sound", systemImage: "speaker.wave.2")
                }
                Button(role: .destructive) {
                    Task { await session.stopScreenShare() }
                } label: {
                    Label("Stop Sharing", systemImage: "rectangle.on.rectangle.slash")
                }
            } label: {
                CallBarIcon(icon: "rectangle.on.rectangle", highlight: true)
            }
            .accessibilityLabel("Sharing your screen")
            .accessibilityHint("Opens the sharing options")
        } else {
            Button { Task { await session.toggleScreenShare() } } label: {
                CallBarIcon(icon: "rectangle.on.rectangle")
            }
            .disabled(!session.connected)
            .accessibilityLabel("Share screen")
        }
    }
}

/// A round button of the call bar (50 pt, so the tap target is never under 44 pt).
/// `warn`: an "off" state that matters (muted, deafened); `destructive`: leave, red.
struct CallBarIcon: View {
    let icon: String
    var highlight = false
    var warn = false
    var destructive = false

    private var foreground: Color {
        if destructive { return .white }
        if warn { return Theme.danger }
        return highlight ? Theme.onAccent : Theme.text
    }

    private var fill: Color {
        if destructive { return Theme.danger }
        return highlight ? Theme.accent : Theme.elevated
    }

    var body: some View {
        Image(systemName: icon)
            .font(.system(size: 19, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: 50, height: 50)
            .background(Circle().fill(fill))
            .contentShape(Circle())
    }
}

// MARK: More

/// What the "More" button of the call bar opens.
private enum CallMoreSheet: String, Identifiable {
    case reactions, soundboard, devices, watchLink
    var id: String { rawValue }
}

/// Everything that is not a core action of the call bar: reactions, soundboard, watch together,
/// deafen and the devices. One button, so the bar stays at six on the smallest iPhone.
struct CallMoreButton: View {
    @ObservedObject var session: CallSession
    @ObservedObject var extras: CallLiveExtras
    @ObservedObject var watch: WatchTogetherSession
    @ObservedObject private var watchPrefs = WatchTogetherPrefsStore.shared
    @ObservedObject private var board = Soundboard.shared
    @State private var sheet: CallMoreSheet?

    private var watchOffered: Bool { watchPrefs.prefs.enabled && watch.available }

    var body: some View {
        Menu {
            Section {
                Button { sheet = .reactions } label: { Label("Reactions", systemImage: "face.smiling") }
                    .disabled(!session.connected)
                Button { sheet = .soundboard } label: { Label("Soundboard", systemImage: "music.note.list") }
                if board.playing != nil {
                    Button { board.stopAll() } label: { Label("Stop All Clips", systemImage: "stop.fill") }
                }
                if watchOffered {
                    watchButton
                }
            }
            Section {
                Button { Task { await session.toggleDeafen() } } label: {
                    Label(session.deafened ? "Undeafen" : "Deafen", systemImage: session.deafened ? "headphones" : "speaker.slash")
                }
                Button { sheet = .devices } label: { Label("Audio Devices", systemImage: "slider.horizontal.3") }
            }
        } label: {
            CallBarIcon(icon: "ellipsis")
        }
        .accessibilityLabel("More")
        .accessibilityHint("Reactions, soundboard, watch together, deafen and audio devices")
        .sheet(item: $sheet) { which in sheetContent(which) }
    }

    @ViewBuilder
    private var watchButton: some View {
        if watch.hidden {
            Button { watch.reopen() } label: { Label("Show the Video", systemImage: "play.rectangle") }
        } else {
            Button { sheet = .watchLink } label: {
                Label(watch.running ? "Watch Another Video" : "Watch Together", systemImage: "play.rectangle")
            }
        }
    }

    @ViewBuilder
    private func sheetContent(_ which: CallMoreSheet) -> some View {
        switch which {
        case .reactions: CallReactionsSheet(session: session)
        case .soundboard: SoundboardSheet(session: session)
        case .devices: CallDevicesSheet(session: session, extras: extras)
        case .watchLink: WatchLinkSheet(watch: watch)
        }
    }
}

// MARK: Devices

/// The system's output picker (speaker, headphones, Bluetooth, AirPlay).
private struct RoutePickerButton: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = UIColor(Theme.accent)
        view.activeTintColor = UIColor(Theme.accent)
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

/// Microphone and output of the call, with the input and output volume (desktop `DevicePicker`).
struct CallDevicesSheet: View {
    @ObservedObject var session: CallSession
    @ObservedObject var extras: CallLiveExtras
    @Environment(\.dismiss) private var dismiss
    @State private var inputs: [AVAudioSessionPortDescription] = CallSession.availableInputs
    @State private var currentInput: String? = CallSession.currentInputUid
    @State private var preferredInput: String? = CallSession.preferredInputUid
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Microphone") {
                    if inputs.isEmpty {
                        Text("No microphone found.").foregroundStyle(Theme.muted)
                    }
                    ForEach(inputs, id: \.uid) { port in
                        Button { select(port.uid) } label: {
                            HStack {
                                Text(port.portName).foregroundStyle(Theme.text)
                                Spacer()
                                if preferredInput != nil && port.uid == currentInput {
                                    Image(systemName: "checkmark").foregroundStyle(Theme.accent)
                                }
                            }
                        }
                    }
                    Button { select(nil) } label: {
                        HStack {
                            Text("System Default").foregroundStyle(Theme.text)
                            Spacer()
                            if preferredInput == nil { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
                        }
                    }
                    volumeRow("Input volume", value: extras.inputVolume) { extras.setInputVolume($0) }
                }
                Section {
                    HStack {
                        Text("Speaker, Headphones, AirPlay").foregroundStyle(Theme.text)
                        Spacer()
                        RoutePickerButton()
                            .frame(width: 44, height: 44)
                            .accessibilityLabel("Choose output")
                    }
                    volumeRow("Output volume", value: extras.outputVolume) { extras.setOutputVolume($0) }
                } header: {
                    Text("Output")
                } footer: {
                    Text("The volume of the whole device is set with the volume buttons. Output volume turns the call down further.")
                }
                if let error { Section { Text(error).foregroundStyle(Theme.danger) } }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle("Audio Devices")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { _ in refresh() }
        }
    }

    private func volumeRow(_ title: String, value: Double, set: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.subheadline)
                Spacer()
                Text("\(Int((value * 100).rounded())) %").font(.subheadline.monospacedDigit()).foregroundStyle(Theme.muted)
            }
            Slider(value: Binding(get: { value }, set: { set($0) }), in: 0...1, step: 0.01)
                .accessibilityLabel(title)
        }
    }

    private func refresh() {
        inputs = CallSession.availableInputs
        currentInput = CallSession.currentInputUid
        preferredInput = CallSession.preferredInputUid
    }

    private func select(_ uid: String?) {
        do {
            try CallSession.selectInput(uid: uid)
            error = nil
            Sounds.shared.play(.micChange)
        } catch {
            self.error = error.friendlyMessage
        }
        refresh()
    }
}

// MARK: A person's volume

/// Volume of somebody's voice (0 to 200 %) or screen-share sound (0 to 100 %), for you only,
/// remembered on this device (desktop `userVolume.ts`, `shareVolume.ts`).
struct PersonVolumeSheet: View {
    @ObservedObject var extras: CallLiveExtras
    let userId: String
    let name: String
    let kind: CallVolumeKind
    @Environment(\.dismiss) private var dismiss

    private var title: String { kind == .voice ? "Volume of \(name)" : "Stream volume of \(name)" }

    var body: some View {
        // Read here so the sheet redraws when the volume changes.
        let _ = extras.volumeRevision
        let muted = extras.isMuted(userId, kind: kind)
        let level = extras.level(of: userId, kind: kind)
        let shown = muted ? 0 : level
        return NavigationStack {
            List {
                Section {
                    HStack {
                        Text(muted ? "Muted" : "\(Int((level * 100).rounded())) %")
                            .font(.title3.monospacedDigit().weight(.semibold))
                        Spacer()
                        Button {
                            extras.toggleMuted(userId, kind: kind)
                        } label: {
                            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                                .foregroundStyle(muted ? Theme.danger : Theme.text)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(muted ? "Unmute for Me" : "Mute for Me")
                    }
                    Slider(
                        value: Binding(get: { shown }, set: { extras.setLevel($0, of: userId, kind: kind) }),
                        in: 0...kind.maxLevel,
                        step: 0.01
                    )
                    .accessibilityLabel(title)
                } footer: {
                    Text("Only you hear this change. Diddy remembers it for this person on this device.")
                }
                Section {
                    Button("Reset to 100 %") {
                        extras.setLevel(1, of: userId, kind: kind)
                    }
                    .disabled(!muted && level == 1)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.height(320), .medium])
    }
}
