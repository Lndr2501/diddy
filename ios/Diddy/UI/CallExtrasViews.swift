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

/// The share button: starts sharing; while sharing it opens a menu with "Share system sound"
/// and "Stop sharing" (desktop `ShareOptionsButton`).
struct ShareControl: View {
    @ObservedObject var session: CallSession
    @ObservedObject var extras: CallLiveExtras

    var body: some View {
        if session.screenSharing {
            Menu {
                Button {
                    Task { await session.setShareSystemSound(!extras.shareSystemSound) }
                } label: {
                    Label("Share system sound", systemImage: extras.shareSystemSound ? "checkmark" : "speaker.slash")
                }
                Button(role: .destructive) {
                    Task { await session.stopScreenShare() }
                } label: {
                    Label("Stop sharing", systemImage: "xmark")
                }
            } label: {
                CallBarIcon(icon: "rectangle.on.rectangle", highlight: true)
            }
            .accessibilityLabel("Sharing options")
        } else {
            Button { Task { await session.toggleScreenShare() } } label: {
                CallBarIcon(icon: "rectangle.on.rectangle")
            }
            .accessibilityLabel("Share screen")
        }
    }
}

/// A round button of the call bar.
struct CallBarIcon: View {
    let icon: String
    var highlight = false

    var body: some View {
        Image(systemName: icon)
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(highlight ? Theme.onAccent : Theme.text)
            .frame(width: 50, height: 50)
            .background(Circle().fill(highlight ? Theme.accent : Theme.elevated))
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
                                if port.uid == currentInput { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
                            }
                        }
                    }
                    Button { select(nil) } label: {
                        Text("System default").foregroundStyle(Theme.text)
                    }
                    volumeRow("Input volume", value: extras.inputVolume) { extras.setInputVolume($0) }
                }
                Section {
                    HStack {
                        Text("Output").foregroundStyle(Theme.text)
                        Spacer()
                        RoutePickerButton().frame(width: 36, height: 36)
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
            .navigationTitle("Devices")
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
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(muted ? "Unmute for me" : "Mute for me")
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
        .presentationDetents([.height(320)])
    }
}
