import LiveKit
import SwiftUI

/// Your computer asks for this iPhone in its call: what to send, then Join or Not Now.
struct CompanionRequestSheet: View {
    let pending: CompanionService.Pending
    let onJoin: (CompanionProtocol.Media) -> Void
    let onDecline: () -> Void
    @State private var camera: Bool
    @State private var microphone: Bool
    @State private var screen: Bool

    init(pending: CompanionService.Pending, onJoin: @escaping (CompanionProtocol.Media) -> Void, onDecline: @escaping () -> Void) {
        self.pending = pending
        self.onJoin = onJoin
        self.onDecline = onDecline
        _camera = State(initialValue: pending.request.media.camera)
        _microphone = State(initialValue: pending.request.media.microphone)
        _screen = State(initialValue: pending.request.media.screen)
    }

    private var anything: Bool { camera || microphone || screen }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Your computer wants this iPhone", systemImage: "iphone.gen3.radiowaves.left.and.right")
                            .font(.headline)
                        Text(pending.request.roomName.isEmpty
                             ? "Join its call as its camera and microphone."
                             : "Join “\(pending.request.roomName)” as its camera and microphone.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                        VStack(alignment: .leading, spacing: 6) {
                            CompanionFact(icon: "speaker.slash", text: "This iPhone stays silent; the call plays on your computer.")
                            CompanionFact(icon: "desktopcomputer", text: "Your computer's microphone and camera go off meanwhile.")
                            CompanionFact(icon: "hand.tap", text: "Your computer's buttons control this iPhone too.")
                        }
                    }
                    .padding(.vertical, 4)
                }
                Section {
                    Toggle(isOn: $camera) { Label(L("settings.general.camera"), systemImage: "video.fill") }
                    Toggle(isOn: $microphone) { Label(L("call.controls.microphone"), systemImage: "mic.fill") }
                    Toggle(isOn: $screen) { Label(L("call.companionDialog.screen"), systemImage: "rectangle.on.rectangle") }
                } header: {
                    Text("This iPhone sends")
                } footer: {
                    Text("The call sound keeps playing on your computer; this iPhone stays silent. You can turn the camera around in the call."
                         + (screen && CallSession.sharesWholeScreen ? "\n\n" + ScreenShareNotice.message : ""))
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.sidebar)
            .navigationTitle("Camera & Mic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not Now", action: onDecline)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("call.prescreenControls.join")) { onJoin(CompanionProtocol.Media(camera: camera, microphone: microphone, screen: screen)) }
                        .bold()
                        .disabled(!anything)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct CompanionFact: View {
    let icon: String
    let text: String

    var body: some View {
        Label {
            Text(text).font(.footnote).foregroundStyle(Theme.muted)
        } icon: {
            Image(systemName: icon).font(.footnote).foregroundStyle(Theme.accent).frame(width: 18)
        }
    }
}

/// The call screen while this iPhone is your computer's camera, microphone and/or screen: what it
/// sends, at a glance and big enough to switch without looking twice; no call stage (the call
/// plays on the computer).
struct CompanionCallView: View {
    @ObservedObject var session: CallSession
    let title: String
    @EnvironmentObject private var calls: CallManager
    @State private var confirmWholeScreen = false

    private var camera: LiveKit.VideoTrack? {
        session.cameraOn ? session.liveKitRoom.localParticipant.firstCameraPublication?.track as? LiveKit.VideoTrack : nil
    }

    var body: some View {
        VStack(spacing: 16) {
            header
            preview
            controls
            // what happens when you leave: said before it happens
            Label(session.cameraOn
                  ? "Keep Diddy open: iOS pauses the camera in other apps. The microphone keeps going."
                  : "You can use other apps meanwhile; the microphone keeps going.",
                  systemImage: "info.circle")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(role: .destructive) {
                Task { await calls.leave() }
            } label: {
                Label("Disconnect from Computer", systemImage: "xmark.circle.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.danger.opacity(0.15)))
                    .foregroundStyle(Theme.danger)
            }
            .buttonStyle(.plain)
            if session.awaitingBroadcast {
                Label("Choose Diddy and tap Start Broadcast.", systemImage: "info.circle")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            if let error = session.lastError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote).foregroundStyle(Theme.danger)
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    private var header: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                Circle().fill(session.connected ? Theme.online : Theme.muted).frame(width: 8, height: 8)
                Text(session.connected ? "Connected for your computer" : "Connecting…")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
            }
            Text("\(title) · the call plays on your computer")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
        .padding(.top, 8)
    }

    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20).fill(Theme.elevated)
            if let camera {
                SwiftUIVideoView(camera, layoutMode: .fill)
                    .id(ObjectIdentifier(camera))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "video.slash.fill").font(.system(size: 40)).foregroundStyle(Theme.muted)
                    Text("Camera off").font(.subheadline).foregroundStyle(Theme.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .topLeading) {
            HStack(spacing: 6) {
                CompanionChip(icon: session.microphoneOn ? "mic.fill" : "mic.slash.fill",
                              text: session.microphoneOn ? "Mic on" : "Mic off", on: session.microphoneOn)
                if session.screenSharing {
                    CompanionChip(icon: "rectangle.on.rectangle", text: "Screen shared", on: true)
                }
            }
            .padding(10)
        }
        .overlay(alignment: .bottomTrailing) {
            if camera != nil {
                Button { Task { await session.flipCamera() } } label: {
                    Image(systemName: "arrow.triangle.2.circlepath.camera")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(.black.opacity(0.55)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Flip camera")
                .padding(12)
            }
        }
    }

    private var controls: some View {
        controlRow
            .wholeScreenShareAlert(isPresented: $confirmWholeScreen) { Task { await session.toggleScreenShare() } }
    }

    private var controlRow: some View {
        HStack(spacing: 12) {
            CompanionToggle(icon: session.cameraOn ? "video.fill" : "video.slash.fill", label: "Camera", on: session.cameraOn) {
                Task { await session.toggleCamera() }
            }
            CompanionToggle(icon: session.microphoneOn ? "mic.fill" : "mic.slash.fill", label: "Microphone", on: session.microphoneOn) {
                Task { await session.toggleMicrophone() }
            }
            CompanionToggle(icon: "rectangle.on.rectangle", label: session.screenSharing ? "Stop Screen" : "Screen", on: session.screenSharing) {
                if session.screenSharing {
                    Task { await session.stopScreenShare() }
                } else if CallSession.sharesWholeScreen {
                    confirmWholeScreen = true
                } else if !BroadcastPicker.isAvailable {
                    Task { await session.toggleScreenShare() }
                } else {
                    session.startWholeScreenShare()
                }
            }
        }
    }
}

private struct CompanionChip: View {
    let icon: String
    let text: String
    let on: Bool

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(on ? .white : Theme.danger)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(.black.opacity(0.55)))
    }
}

/// A big switch with its name under it: on is filled, off is outlined.
private struct CompanionToggle: View {
    let icon: String
    let label: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 22, weight: .semibold))
                Text(label).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 14).fill(on ? Theme.accent : Theme.elevated))
            .foregroundStyle(on ? Theme.onAccent : Theme.text)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(on ? "On" : "Off")
    }
}
