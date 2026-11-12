import SwiftUI
import UniformTypeIdentifiers

/// Settings > Sounds: one switch per sound, listen, and your own file in place of Diddy's
/// (desktop `SoundSettings.tsx`).
struct SoundSettingsView: View {
    @State private var customNames: [Sound: String] = [:]
    @State private var enabled: [Sound: Bool] = [:]
    @State private var target: Sound?
    @State private var importing = false
    @State private var error: String?

    var body: some View {
        List {
            ForEach(Array(Sound.groups.enumerated()), id: \.offset) { index, group in
                Section {
                    ForEach(group.sounds) { sound in row(sound) }
                } header: {
                    Text(group.title)
                } footer: {
                    if group.sounds.contains(.ringtone) {
                        Text("Diddy can only ring while it is open. The ringtone follows the silent switch and also vibrates.")
                    } else if index == Sound.groups.count - 1 {
                        Text("Your own sounds stay on this device. Notifications while Diddy is in the background keep Diddy's sound.")
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Sounds")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: load)
        .onDisappear { Sounds.shared.stopLoop() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio]) { result in
            guard let sound = target else { return }
            switch result {
            case .success(let url):
                do {
                    try CustomSounds.set(sound, from: url)
                    error = nil
                    load()
                    Sounds.shared.preview(sound)
                } catch { self.error = error.friendlyMessage }
            case .failure(let failure):
                error = failure.friendlyMessage
            }
        }
        .alert("Sound", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
    }

    private func load() {
        var names: [Sound: String] = [:]
        var switches: [Sound: Bool] = [:]
        for sound in Sound.allCases {
            if let name = CustomSounds.name(of: sound) { names[sound] = name }
            switches[sound] = sound.isEnabled
        }
        customNames = names
        enabled = switches
    }

    private func row(_ sound: Sound) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: Binding(
                get: { enabled[sound] ?? sound.isEnabled },
                set: { on in
                    sound.setEnabled(on)
                    enabled[sound] = on
                }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(sound.title).foregroundStyle(Theme.text)
                    Text(sound.detail).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            HStack(spacing: 16) {
                Button { Sounds.shared.preview(sound) } label: { Label("Listen", systemImage: "play.circle.fill") }
                    .accessibilityLabel("Play \(sound.title)")
                Button {
                    target = sound
                    importing = true
                } label: { Label("Replace", systemImage: "folder") }
                if customNames[sound] != nil {
                    Button(role: .destructive) {
                        CustomSounds.reset(sound)
                        load()
                    } label: { Label("Reset", systemImage: "arrow.uturn.backward") }
                }
            }
            .font(.footnote)
            .buttonStyle(.borderless)
            if let name = customNames[sound] {
                Text("Own sound: \(name)").font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Settings > Calls: noise suppression, voice processing and the remembered volumes of people.
struct CallSettingsView: View {
    @AppStorage(NoiseSuppression.settingKey) private var noiseSuppression = true
    @AppStorage(CallPrefs.voiceProcessingKey) private var voiceProcessing = true
    @State private var confirmReset = false
    @State private var resetDone = false

    var body: some View {
        List {
            Section {
                Toggle("Noise Suppression", isOn: Binding(
                    get: { noiseSuppression },
                    set: { isOn in
                        noiseSuppression = isOn
                        NoiseSuppression.apply()
                    }
                ))
            } header: {
                Text("Microphone")
            } footer: {
                Text("Filters background noise such as fans and typing out of your microphone. Takes effect at once, also during a call.")
            }
            Section {
                Toggle("Voice Processing", isOn: $voiceProcessing)
            } footer: {
                Text("The system's echo cancellation and automatic gain. Keep it on if you use the speaker instead of headphones; off keeps music and other apps sounding normal. Applies the next time you join a call.")
            }
            Section {
                Button("Reset Volumes", role: .destructive) { confirmReset = true }
            } header: {
                Text("Volumes")
            } footer: {
                Text(resetDone
                    ? "All volumes are back to 100 %."
                    : "Diddy remembers the volume and \u{201C}mute for me\u{201D} you set for each person and their screen share, on this device.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Calls")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Reset all volumes to 100 %?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset Volumes", role: .destructive) {
                CallVolumeMemory.clearAll(UserDefaultsVolumeStorage.shared)
                resetDone = true
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}
