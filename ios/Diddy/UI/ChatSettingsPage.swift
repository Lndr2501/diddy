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
            Section("Timeline") {
                Toggle("Hide Membership Change", isOn: Binding(get: { !showMembership }, set: { showMembership = !$0 }))
            }

            Section("Media & Previews") {
                Toggle("Disable Media Auto Load", isOn: Binding(get: { !autoLoadMedia }, set: { autoLoadMedia = !$0 }))
                Toggle("Url Preview", isOn: $urlPreviews)
                Toggle("Url Preview in Encrypted Room", isOn: $encryptedUrlPreviews)
            }

            dateAndTime

            Section("Editor") {
                Toggle(isOn: $enterForNewline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ENTER for Newline")
                        Text("Use the send button to send and Return for a new line.").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle("Markdown Formatting", isOn: $markdown)
                Toggle("Editor Toolbar", isOn: $editorToolbar)
                Toggle(isOn: Binding(get: { !shareActivity }, set: { shareActivity = !$0 })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Hide Typing & Read Receipts")
                        Text("Turn off both typing status and read receipts to keep your activity private.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }

            Section {
                Toggle(isOn: $pictures) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Animated Profile Pictures")
                        Text("GIF, WebP and APNG profile pictures move. In a call only while the person speaks.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle(isOn: $nameplates) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Nameplates")
                        Text("Moving pictures, videos and gradients behind names in the member and DM lists.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle(isOn: $profileEffects) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Profile Effects")
                        Text("Animated overlays other people put over their profile card.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Toggle(isOn: $profileFrames) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Profile Frames")
                        Text("Decorative frames other people put around their profile card.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            } header: {
                Text("Profile Decorations")
            } footer: {
                Text("What other people add to their profile. Nameplates and effects that are off show a still picture, and with Reduce Motion turned on in iOS nothing moves.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Chat")
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
            Picker("Time Format", selection: $timeFormat) {
                ForEach(ChatSettings.TimeFormat.allCases) { Text($0.title).tag($0.rawValue) }
            }
            Picker("Date Format", selection: Binding(
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
                Text("Custom").tag("")
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
            Text("Date & Time")
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Example: \(Date().chatTimestamp)")
                if dateSelection.isEmpty {
                    Text("Custom format with the desktop's tokens, for example YYYY, MM, DD, D, MMM, MMMM, dddd. Text in [brackets] is shown as it is. Today: \(dateExample)")
                }
            }
        }
    }
}
