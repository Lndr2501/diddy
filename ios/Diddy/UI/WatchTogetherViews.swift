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

// MARK: - Button and link sheet

/// Starts a video for the call, or brings back one you closed. Hidden while the feature is off or
/// the call is not connected.
struct WatchTogetherButton: View {
    @ObservedObject var watch: WatchTogetherSession
    @ObservedObject private var prefsStore = WatchTogetherPrefsStore.shared
    @State private var asking = false

    private var label: String {
        if watch.hidden { return "Show the video" }
        if watch.running { return "Watch another video together" }
        return "Watch together"
    }

    var body: some View {
        if prefsStore.prefs.enabled && watch.available {
            Button {
                if watch.hidden { watch.reopen() } else { asking = true }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: watch.running ? "play.fill" : "play")
                    Text(watch.hidden ? "Show video" : "Watch together")
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(watch.running ? Theme.onAccent : Theme.text)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(watch.running ? Theme.accent : Theme.elevated))
            }
            .accessibilityLabel(label)
            .sheet(isPresented: $asking) { WatchLinkSheet(watch: watch) }
        }
    }
}

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

/// The video of the call above the stage. Shows nothing while no video runs (or you closed it),
/// only the toast ("… started watching together").
struct WatchTogetherPanel: View {
    @ObservedObject var watch: WatchTogetherSession
    @ObservedObject private var prefsStore = WatchTogetherPrefsStore.shared

    var body: some View {
        if prefsStore.prefs.enabled && watch.available {
            VStack(spacing: 8) {
                if let shared = watch.shared, shared.state != .stopped, watch.closedSession != shared.session {
                    // one player per session: a new video gets a new page and a new controller
                    WatchPlayerCard(watch: watch, shared: shared)
                        .id(shared.session)
                }
                if let toast = watch.toast {
                    WatchToastView(text: toast.text)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct WatchPlayerCard: View {
    @ObservedObject var watch: WatchTogetherSession
    let shared: SharedWatch
    @ObservedObject private var prefsStore = WatchTogetherPrefsStore.shared
    @StateObject private var host = WatchPlayerHost()
    @State private var loadedCategories: [String] = []

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
            Text(footnote).font(.caption2).foregroundStyle(Theme.faint)
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "play.fill").font(.footnote).foregroundStyle(Theme.accent)
                Text("Watch together").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                Spacer()
                if let url = WatchYouTube.watchURL(shared.videoId) {
                    Link(destination: url) {
                        Label("YouTube", systemImage: "arrow.up.right.square").font(.caption.weight(.semibold))
                    }
                }
            }
            HStack(spacing: 8) {
                Button("Close for me") { watch.closeForMe() }
                    .buttonStyle(.bordered)
                Button("Stop for everyone", role: .destructive) { watch.stopForEveryone() }
                    .buttonStyle(.bordered)
                Spacer()
            }
            .font(.caption.weight(.semibold))
            .controlSize(.small)
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
                    .frame(width: 28, height: 28)
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
