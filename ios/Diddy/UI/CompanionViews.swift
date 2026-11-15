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
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Use this iPhone for your call", systemImage: "iphone.gen3.radiowaves.left.and.right")
                            .font(.headline)
                        Text(pending.request.roomName.isEmpty
                             ? "Your computer asks to join its call from this iPhone."
                             : "Your computer asks to join “\(pending.request.roomName)” from this iPhone.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 4)
                }
                Section {
                    Toggle(isOn: $camera) { Label("Camera", systemImage: "video.fill") }
                    Toggle(isOn: $microphone) { Label("Microphone", systemImage: "mic.fill") }
                    Toggle(isOn: $screen) { Label("Screen", systemImage: "rectangle.on.rectangle") }
                } header: {
                    Text("This iPhone sends")
                } footer: {
                    Text("The call sound keeps playing on your computer; this iPhone stays silent. You can turn the camera around in the call.")
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
                    Button("Join") { onJoin(CompanionProtocol.Media(camera: camera, microphone: microphone, screen: screen)) }
                        .bold()
                        .disabled(!anything)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Over the call while this iPhone works for your computer.
struct CompanionBanner: View {
    var body: some View {
        Label("Camera & mic for your computer. The call plays there.", systemImage: "desktopcomputer")
            .font(.footnote)
            .foregroundStyle(Theme.muted)
            .padding(.horizontal)
            .padding(.bottom, 6)
    }
}
