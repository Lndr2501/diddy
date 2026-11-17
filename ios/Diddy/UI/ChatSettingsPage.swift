import SwiftUI

/// Settings > Chat: the options of desktop's Settings > General (Timeline, Media & Previews,
/// Date & Time, Editor, privacy and the profile decorations of others), with the same names.
/// Stored on this device. Desktop's message layouts and spacing, legacy username colours, profile
/// change and hidden event switches are left out: the iOS timeline has one layout, always hides
/// profile changes and has no view for hidden events, so those switches would do nothing.
struct ChatSettingsView: View {
    @AppStorage(ChatSettings.showMembershipKey) private var showMembership = true

    @AppStorage(ChatSettings.autoLoadMediaKey) private var autoLoadMedia = true
    @AppStorage(ChatSettings.urlPreviewsKey) private var urlPreviews = true
    @AppStorage(ChatSettings.encryptedUrlPreviewsKey) private var encryptedUrlPreviews = true

    @AppStorage(ChatSettings.timeFormatKey) private var timeFormat = ChatSettings.TimeFormat.system.rawValue
    @AppStorage(ChatSettings.dateFormatKey) private var dateFormat = DateFormatRules.defaultFormat
    @State private var customDate = false

    @AppStorage(ChatSettings.enterForNewlineKey) private var enterForNewline = false
    @AppStorage(ChatSettings.markdownKey) private var markdown = true
    @AppStorage(ChatSettings.editorToolbarKey) private var editorToolbar = false
    @AppStorage(ChatSettings.shareActivityKey) private var shareActivity = true

    @AppStorage(AvatarPrefs.picturesKey) private var pictures = true
    @AppStorage(AvatarPrefs.nameplatesKey) private var nameplates = true
    @AppStorage(AvatarPrefs.profileEffectsKey) private var profileEffects = true
    @AppStorage(AvatarPrefs.profileFramesKey) private var profileFrames = true

    var body: some View {
        List {
            Section(L("settings.general.timeline")) {
                Toggle(L("settings.general.hideMembershipChange"), isOn: Binding(get: { !showMembership }, set: { showMembership = !$0 }))
            }

            Section(L("settings.general.mediaPreviews")) {
                Toggle(L("settings.general.disableMediaAutoLoad"), isOn: Binding(get: { !autoLoadMedia }, set: { autoLoadMedia = !$0 }))
                Toggle(L("settings.general.urlPreview"), isOn: $urlPreviews)
                Toggle(L("settings.general.urlPreviewInEncrypted"), isOn: $encryptedUrlPreviews)
            }

            dateAndTime

            Section(L("settings.general.editor")) {
                Toggle(isOn: $enterForNewline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("settings.general.enterForNewline"))
                        Text(L("ios.extraSettings.returnNewlineHelp")).font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle(L("settings.general.markdownFormatting"), isOn: $markdown)
                Toggle(L("ios.extraSettings.editorToolbar"), isOn: $editorToolbar)
                Toggle(isOn: Binding(get: { !shareActivity }, set: { shareActivity = !$0 })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("settings.general.hideTypingReadReceipts"))
                        Text(L("ios.extraSettings.privateReadHelp"))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }

            Section {
                Toggle(isOn: $pictures) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("ios.extraSettings.animatedAvatars"))
                        Text(L("ios.extraSettings.animatedAvatarsHelp"))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle(isOn: $nameplates) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("settings.general.nameplates"))
                        Text(L("ios.extraSettings.animatedNameplatesHelp"))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle(isOn: $profileEffects) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("ios.extraSettings.profileEffects"))
                        Text(L("ios.extraSettings.profileEffectsHelp"))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle(isOn: $profileFrames) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("ios.extraSettings.profileFrames"))
                        Text(L("settings.general.decorativeFramesOtherPeople"))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            } header: {
                Text(L("ios.extraSettings.profileDecorations"))
            } footer: {
                Text(L("ios.extraSettings.profileDecorationsHelp"))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle(L("settings.page.chat"))
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Date & Time

    /// The preset in use, or empty for "Custom" like desktop.
    private var dateSelection: String {
        customDate || !DateFormatRules.presets.contains(dateFormat) ? "" : dateFormat
    }

    private var dateExample: String {
        DateFormatRules.string(from: Date(), format: dateFormat.isEmpty ? DateFormatRules.defaultFormat : dateFormat)
    }

    private var dateAndTime: some View {
        Section {
            Picker(L("ios.extraSettings.timeFormat"), selection: $timeFormat) {
                ForEach(ChatSettings.TimeFormat.allCases) { Text($0.title).tag($0.rawValue) }
            }
            Picker(L("settings.general.dateFormat"), selection: Binding(
                get: { dateSelection },
                set: { choice in
                    if choice.isEmpty {
                        customDate = true
                    } else {
                        customDate = false
                        dateFormat = choice
                    }
                }
            )) {
                ForEach(DateFormatRules.presets, id: \.self) { preset in
                    Text(DateFormatRules.string(from: Date(), format: preset)).tag(preset)
                }
                Text(L("settings.general.custom")).tag("")
            }
            if dateSelection.isEmpty {
                TextField("D MMM YYYY", text: Binding(
                    get: { dateFormat },
                    set: { dateFormat = String($0.prefix(DateFormatRules.maxLength)) }
                ))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(.body, design: .monospaced))
            }
        } header: {
            Text(L("settings.general.dateTime"))
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                Text(L("ios.extraSettings.dateExample", ["example": Date().chatTimestamp]))
                if dateSelection.isEmpty {
                    Text(L("ios.extraSettings.customDateHelp", ["example": dateExample]))
                }
            }
        }
    }
}
