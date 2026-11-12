import SwiftUI
import UIKit
import WebKit

// Watch together (#83): the button for the call screen, the link sheet, the panel with the YouTube
// player above the call stage and Settings > Watch together. Counterpart of the desktop's
// features/call/WatchTogether.tsx and WatchTogetherSettings.tsx. Session and transport:
// Call/WatchTogether.swift; the player: Call/WatchPlayerHost.swift.

private struct WatchWebContainer: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - Link sheet

/// Asks for the YouTube link. Opened from the "More" menu of the call bar (CallExtrasViews.swift).
struct WatchLinkSheet: View {
    @ObservedObject var watch: WatchTogetherSession
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://youtu.be/…", text: $input)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .focused($focused)
                        .submitLabel(.go)
                        .onSubmit(submit)
                        .onChange(of: input) { _ in error = nil }
                } footer: {
                    if let error {
                        Text(error).foregroundStyle(Theme.danger)
                    } else {
                        Text("Paste a YouTube link. Everybody in the call gets the video; play, pause and seeking are shared, volume and quality stay yours.")
                    }
                }
            }
            .navigationTitle("Watch together")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start for everyone", action: submit)
                        .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { focused = true }
        }
    }

    private func submit() {
        guard let ref = WatchYouTube.parseURL(input) else {
            error = "That is not a YouTube video link (youtube.com/watch, youtu.be or shorts)."
            return
        }
        watch.startWatching(videoId: ref.videoId, start: ref.start)
        dismiss()
    }
}

// MARK: - Panel

private struct WatchToastView: View {
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "info.circle")
            Text(text).lineLimit(1)
        }
        .font(.caption)
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(Theme.elevated))
        .accessibilityElement(children: .combine)
    }
}

/// The call stage with the video of the call: above the stage in portrait, beside it in landscape
/// (an iPhone in landscape has no room for a 16:9 player above the tiles). Without a video only
/// the toast ("… started watching together") sits above the stage.
struct WatchTogetherStage<Stage: View>: View {
    @ObservedObject var watch: WatchTogetherSession
    @ObservedObject private var prefsStore = WatchTogetherPrefsStore.shared
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    private let stage: Stage


    init(watch: WatchTogetherSession, @ViewBuilder stage: () -> Stage) {
        self.watch = watch
        self.stage = stage()
    }

    private var offered: Bool { prefsStore.prefs.enabled && watch.available }

    /// The shared video, unless it stopped or you closed it for yourself.
    private var visible: SharedWatch? {
        guard offered, let shared = watch.shared, shared.state != .stopped,
              watch.closedSession != shared.session else { return nil }
        return shared
    }

    /// iPhone in landscape with a video: the video column beside the stage.
    private var beside: Bool { visible != nil && verticalSizeClass == .compact }

    private var layout: AnyLayout {
        beside ? AnyLayout(HStackLayout(alignment: .top, spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
    }

    // One layout that switches between row and column, so turning the phone keeps the player
    // and the focused tile instead of building both again.
    var body: some View {
        layout {
            accessory
            stage
        }
    }

    private var accessory: some View {
        VStack(spacing: 8) {
            if let shared = visible { card(shared) }
            toastView
        }
        .padding(.horizontal, 12)
        .padding(.top, visible != nil || (offered && watch.toast != nil) ? 6 : 0)
        .frame(maxWidth: beside ? 300 : .infinity)
    }

    /// One player per session: a new video gets a new page and a new controller.
    private func card(_ shared: SharedWatch) -> some View {
        WatchPlayerCard(watch: watch, shared: shared)
            .id(shared.session)
    }

    @ViewBuilder
    private var toastView: some View {
        if offered, let toast = watch.toast {
            WatchToastView(text: toast.text)
        }
    }
}

private struct WatchPlayerCard: View {
    @ObservedObject var watch: WatchTogetherSession
    let shared: SharedWatch
    @ObservedObject private var prefsStore = WatchTogetherPrefsStore.shared
    @StateObject private var host = WatchPlayerHost()
    @State private var loadedCategories: [String] = []
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    private var prefs: WatchPrefs { prefsStore.prefs }

    private var qualityIgnored: Bool {
        guard prefs.quality != "auto", let current = host.reportedQuality else { return false }
        return current != prefs.quality
    }

    private var footnote: String {
        var text = "Volume and quality are yours only. Use headphones: the video plays on your device and speakers would leak into your microphone."
        if qualityIgnored {
            text += " YouTube decides the quality itself and ignored your choice; the gear in the player changes it for you only."
        }
        if !prefs.categories.isEmpty { text += " Sponsor segments are skipped with SponsorBlock." }
        return text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            ZStack {
                WatchWebContainer(webView: host.webView)
                if let code = host.errorCode {
                    errorOverlay(code)
                }
            }
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            bar
            // no room for the note beside the stage in landscape
            if verticalSizeClass != .compact {
                Text(footnote).font(.caption2).foregroundStyle(Theme.faint)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.elevated))
        .onAppear(perform: setUp)
        .onDisappear { host.invalidate() }
        .onChange(of: shared) { next in host.update(shared: next) }
        .onChange(of: prefsStore.prefs) { next in
            host.apply(volume: next.volume, muted: next.muted, quality: next.quality)
            if next.categories != loadedCategories {
                loadedCategories = next.categories
                host.setCategories(next.categories)
            }
        }
    }

    private func setUp() {
        let session = watch
        host.onChange = { [weak session] patch in session?.change(patch) }
        host.onToast = { [weak session] text in session?.showToast(text) }
        loadedCategories = prefs.categories
        host.start(shared: shared, prefs: prefs)
    }

    /// One row: title, YouTube and a menu with "Close for Me" and "Stop for Everyone".
    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "play.fill").font(.footnote).foregroundStyle(Theme.accent)
            Text("Watch Together").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                .lineLimit(1)
            Spacer(minLength: 4)
            if let url = WatchYouTube.watchURL(shared.videoId) {
                Link(destination: url) {
                    Image(systemName: "arrow.up.right.square")
                        .font(.body.weight(.semibold))
                        .frame(width: 44, height: 36)
                }
                .accessibilityLabel("Open on YouTube")
            }
            Menu {
                Button { watch.closeForMe() } label: {
                    Label("Close for Me", systemImage: "eye.slash")
                }
                Button(role: .destructive) { watch.stopForEveryone() } label: {
                    Label("Stop for Everyone", systemImage: "stop.fill")
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(Theme.muted)
                    .frame(width: 44, height: 36)
            }
            .accessibilityLabel("Close the video")
            .accessibilityHint("Close it for you or stop it for everyone")
        }
    }

    private func errorOverlay(_ code: Int) -> some View {
        VStack(spacing: 6) {
            Text(WatchYouTube.errorText(code)).font(.footnote).multilineTextAlignment(.center)
            if let url = WatchYouTube.watchURL(shared.videoId) {
                Link("Open on YouTube", destination: url).font(.caption.weight(.semibold))
            }
        }
        .foregroundStyle(Color.white)
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.75))
        .accessibilityElement(children: .combine)
    }

    private var bar: some View {
        HStack(spacing: 10) {
            Button {
                WatchTogetherPrefsStore.shared.update { $0.muted.toggle() }
            } label: {
                Image(systemName: prefs.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .foregroundStyle(Theme.text)
                    .frame(width: 44, height: 36)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(prefs.muted ? "Unmute video" : "Mute video")
            Slider(
                value: Binding(
                    get: { Double(prefs.volume) },
                    set: { value in
                        WatchTogetherPrefsStore.shared.update {
                            $0.volume = Int(min(100, max(0, value.rounded())))
                            $0.muted = false
                        }
                    }
                ),
                in: 0...100
            )
            .accessibilityLabel("Your video volume")
            Menu {
                Picker("Quality", selection: Binding(
                    get: { prefs.quality },
                    set: { choice in WatchTogetherPrefsStore.shared.update { $0.quality = choice } }
                )) {
                    ForEach(WatchYouTube.qualityChoices, id: \.self) { choice in
                        Text(WatchYouTube.qualityLabels[choice] ?? choice).tag(choice)
                    }
                }
            } label: {
                VStack(alignment: .trailing, spacing: 0) {
                    Text(WatchYouTube.qualityLabels[prefs.quality] ?? prefs.quality)
                        .font(.caption.weight(.semibold))
                    if let current = host.reportedQuality, current != "unknown" {
                        Text("now \(WatchYouTube.qualityLabels[current] ?? current)").font(.caption2)
                    }
                }
                .foregroundStyle(Theme.text)
            }
            .accessibilityLabel("Your video quality")
        }
    }
}

// MARK: - Settings

/// Watch together on/off and the SponsorBlock categories (Settings > Watch together).
struct WatchTogetherSettingsView: View {
    @ObservedObject private var prefsStore = WatchTogetherPrefsStore.shared

    var body: some View {
        List {
            Section {
                Toggle(isOn: Binding(
                    get: { prefsStore.prefs.enabled },
                    set: { on in prefsStore.update { $0.enabled = on } }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Watch together")
                        Text("Watch a YouTube video with everyone in the call. Play, pause and seeking are shared; your volume and quality stay yours.")
                            .font(.footnote).foregroundStyle(Theme.muted)
                    }
                }
            } footer: {
                Text("Videos load from YouTube (youtube-nocookie.com) in YouTube's own player, so YouTube sees your IP address and what you watch; ads YouTube shows are not blocked. The others in the call get the video link and play / pause / position as end-to-end encrypted messages (plain to-device messages when encryption is unavailable). For SponsorBlock only the first 4 characters of a hash of the video id go to sponsor.ajay.app, not the video itself.")
            }
            if prefsStore.prefs.enabled {
                Section {
                    ForEach(WatchSponsorBlock.categories, id: \.self) { category in
                        Toggle(WatchSponsorBlock.labels[category] ?? category, isOn: Binding(
                            get: { prefsStore.prefs.categories.contains(category) },
                            set: { on in prefsStore.setCategory(category, on: on) }
                        ))
                    }
                } header: {
                    Text("Skip segments with SponsorBlock")
                } footer: {
                    Text("Community data from SponsorBlock (sponsor.ajay.app, by Ajay Ramachandran and contributors, CC BY-NC-SA 4.0). When you skip, the video jumps for everybody in the call.")
                }
            }
        }
        .navigationTitle("Watch together")
        .navigationBarTitleDisplayMode(.inline)
    }
}
