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
                        Text(L("ios.extraSettings.ringtoneHelp"))
                    } else if index == Sound.groups.count - 1 {
                        Text(L("ios.extraSettings.customSoundsHelp"))
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("ios.settings.sounds"))
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
        .alert(L("settings.notificationModeSwitcher.sound"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button(L("settings.localPlugins.ok"), role: .cancel) {}
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
                Button { Sounds.shared.preview(sound) } label: { Label(L("ios.extraSettings.listen"), systemImage: "play.circle.fill") }
                    .accessibilityLabel(L("ios.extraSettings.playSound", ["name": sound.title]))
                Button {
                    target = sound
                    importing = true
                } label: { Label(L("settings.profileSettingsUI.replace"), systemImage: "folder") }
                if customNames[sound] != nil {
                    Button(role: .destructive) {
                        CustomSounds.reset(sound)
                        load()
                    } label: { Label(L("settings.verification.reset"), systemImage: "arrow.uturn.backward") }
                }
            }
            .font(.footnote)
            .buttonStyle(.borderless)
            if let name = customNames[sound] {
                Text(L("ios.extraSettings.ownSound", ["name": name])).font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Settings > Calls: noise suppression, voice processing and the remembered volumes of people.
struct CallSettingsView: View {
    @AppStorage(NoiseSuppression.settingKey) private var noiseSuppression = true
    @AppStorage(CallPrefs.voiceProcessingKey) private var voiceProcessing = true
    @AppStorage(CallPrefs.shareResolutionKey) private var shareResolution = BroadcastWire.Config.standard.maxPixels
    @AppStorage(CallPrefs.shareFpsKey) private var shareFps = BroadcastWire.Config.standard.fps
    @AppStorage(CallPrefs.shareQualityKey) private var shareQuality = BroadcastWire.Config.standard.quality
    @AppStorage(CallPrefs.shareSystemSoundKey) private var shareSound = true
    @AppStorage(CallPrefs.pushToTalkKey) private var pushToTalk = false
    @AppStorage(CallPrefs.pushToTalkDelayKey) private var pushToTalkDelay = PushToTalkPrefs.defaultReleaseDelayMs
    @AppStorage(CallPrefs.pushToTalkKeyboardKey) private var pushToTalkKeyboard = PushToTalkKey.none.rawValue
    @State private var confirmReset = false
    @State private var resetDone = false

    var body: some View {
        List {
            Section {
                Toggle(L("ios.extraSettings.noiseSuppression"), isOn: Binding(
                    get: { noiseSuppression },
                    set: { isOn in
                        noiseSuppression = isOn
                        NoiseSuppression.apply()
                    }
                ))
            } header: {
                Text(L("call.controls.microphone"))
            } footer: {
                Text(L("ios.extraSettings.noiseSuppressionHelp"))
            }
            Section {
                Toggle(L("ios.extraSettings.voiceProcessing"), isOn: $voiceProcessing)
            } footer: {
                Text(L("ios.extraSettings.voiceProcessingHelp"))
            }
            Section {
                Toggle(L("ios.extraSettings.pushToTalk"), isOn: $pushToTalk)
                if pushToTalk {
                    Picker(L("ios.extraSettings.releaseDelay"), selection: $pushToTalkDelay) {
                        Text(L("settings.contactInfo.none")).tag(0)
                        Text("100 ms").tag(100)
                        Text("200 ms").tag(200)
                        Text("300 ms").tag(300)
                        Text("500 ms").tag(500)
                    }
                    Picker(L("ios.extraSettings.keyboardKey"), selection: $pushToTalkKeyboard) {
                        ForEach(PushToTalkKey.allCases) { key in
                            Text(key.title).tag(key.rawValue)
                        }
                    }
                }
            } header: {
                Text(L("ios.extraSettings.inputMode"))
            } footer: {
                Text(pushToTalk
                    ? L("ios.extraSettings.pushToTalkHelp")
                    : L("ios.extraSettings.voiceActivityHelp"))
            }
            Section {
                Picker(L("ios.extraSettings.resolution"), selection: $shareResolution) {
                    Text("720p").tag(1280)
                    Text("1080p").tag(1920)
                    Text("1440p").tag(2560)
                    Text("Full Screen Size").tag(0)
                }
                Picker(L("ios.extraSettings.frameRate"), selection: $shareFps) {
                    Text("15 fps").tag(15)
                    Text("30 fps").tag(30)
                    Text("60 fps").tag(60)
                }
                Picker(L("ios.extraSettings.pictureQuality"), selection: $shareQuality) {
                    Text(L("settings.profileCardEditor.standard")).tag(0.6)
                    Text("High").tag(0.75)
                    Text("Very High").tag(0.9)
                    Text("Maximum").tag(1.0)
                }
                Toggle(L("ios.extraSettings.otherAppsSound"), isOn: $shareSound)
            } header: {
                Text(L("ios.extraSettings.screenSharing"))
            } footer: {
                Text(L("ios.extraSettings.screenSharingHelp"))
            }
            Section {
                Button(L("ios.extraSettings.resetVolumes"), role: .destructive) { confirmReset = true }
            } header: {
                Text(L("ios.extraSettings.volumes"))
            } footer: {
                Text(resetDone
                    ? L("ios.extraSettings.volumesReset")
                    : "Diddy remembers the volume and \u{201C}mute for me\u{201D} you set for each person and their screen share, on this device.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("settings.general.calls"))
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(L("ios.extraSettings.confirmResetVolumes"), isPresented: $confirmReset, titleVisibility: .visible) {
            Button(L("ios.extraSettings.resetVolumes"), role: .destructive) {
                CallVolumeMemory.clearAll(UserDefaultsVolumeStorage.shared)
                resetDone = true
            }
            Button(L("settings.deviceTile.cancel"), role: .cancel) {}
        }
    }
}
