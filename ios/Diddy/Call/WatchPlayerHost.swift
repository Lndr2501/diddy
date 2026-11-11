import Foundation
import UIKit
import WebKit

// Watch together (#83): the YouTube player of one shared video. Like the desktop it is the official
// embed from youtube-nocookie.com in its own frame; we never load YouTube's script ourselves. The
// frame lives in a page of its own (a WKWebView with a non-persistent data store). A small script
// in a separate content world creates the frame and relays what comes out of exactly that frame;
// the page itself (and so YouTube's code) cannot reach the Swift side. Which commands follow the
// shared state, and when, is decided by WatchController (WatchTogetherLogic.swift).

private struct WatchPlayerInfoState {
    var currentTime = 0.0
    var receivedAt = 0.0
    var state = WatchPlayerState.unstarted
    var rate = 1.0
    var duration: Double?
}

@MainActor
final class WatchPlayerHost: NSObject, ObservableObject {
    let webView: WKWebView
    @Published private(set) var ready = false
    @Published private(set) var errorCode: Int?
    @Published private(set) var reportedQuality: String?
    @Published private(set) var reportedLevels: [String] = []

    /// A change you made in the player (play, pause, seek, speed, skip).
    var onChange: (@MainActor (WatchPatch) -> Void)?
    var onToast: (@MainActor (String) -> Void)?

    private let controller = WatchController()
    private var shared: SharedWatch?
    private var info = WatchPlayerInfoState()
    private var segments: [WatchSkipSegment] = []
    private var segmentTask: Task<Void, Never>?
    private var tickTask: Task<Void, Never>?
    private var qualityChoice = "auto"
    private var started = false
    private var mainFrameLoaded = false
    private var frameStarted = false
    private var invalidated = false

    private static let world = WKContentWorld.world(name: "app.diddy.watch-host")
    private static let handlerName = "diddyWatch"
    private static let tickNanoseconds: UInt64 = 500_000_000

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        let userContent = WKUserContentController()
        userContent.addUserScript(WKUserScript(source: Self.hostScript, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: Self.world))
        config.userContentController = userContent
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        userContent.add(WatchWeakHandler(self), contentWorld: Self.world, name: Self.handlerName)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
    }

    // MARK: Lifecycle

    /// Loads the player once. The frame starts where the others are, so it does not first load at 0.
    func start(shared first: SharedWatch, prefs: WatchPrefs) {
        guard !started, !invalidated else { return }
        started = true
        shared = first
        qualityChoice = prefs.quality
        webView.loadHTMLString(Self.hostPage, baseURL: URL(string: WatchYouTube.embedOrigin))
        loadSegments(categories: prefs.categories)
    }

    /// Call when the view goes away: stops everything and breaks the retain cycles.
    func invalidate() {
        guard !invalidated else { return }
        invalidated = true
        tickTask?.cancel()
        tickTask = nil
        segmentTask?.cancel()
        segmentTask = nil
        onChange = nil
        onToast = nil
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.configuration.userContentController.removeAllScriptMessageHandlers()
        webView.configuration.userContentController.removeAllUserScripts()
    }

    // MARK: Following the shared state

    /// The shared state changed (here or elsewhere): follow it right away.
    func update(shared next: SharedWatch) {
        shared = next
        controller.setShared(next)
        tick()
    }

    /// Your own volume, mute and quality (never shared).
    func apply(volume: Int, muted: Bool, quality: String) {
        qualityChoice = quality
        guard ready else { return }
        post(WatchYouTube.playerCommand("setVolume", [volume]))
        post(WatchYouTube.playerCommand(muted ? "mute" : "unMute"))
        if quality != "auto" { post(WatchYouTube.playerCommand("setPlaybackQuality", [quality])) }
    }

    func setCategories(_ categories: [String]) {
        loadSegments(categories: categories)
    }

    private func position(_ now: Double) -> Double {
        let running = info.state == WatchPlayerState.playing
        return info.currentTime + (running ? (now - info.receivedAt) / 1000 * info.rate : 0)
    }

    private func run(_ commands: [WatchPlayerCommand], now: Double) {
        for command in commands {
            switch command {
            case .seek(let to):
                post(WatchYouTube.playerCommand("seekTo", [to, true]))
                info.currentTime = to
                info.receivedAt = now
            case .play:
                post(WatchYouTube.playerCommand("playVideo"))
            case .pause:
                post(WatchYouTube.playerCommand("pauseVideo"))
            case .rate(let rate):
                post(WatchYouTube.playerCommand("setPlaybackRate", [rate]))
            }
        }
    }

    private func tick() {
        guard ready, !invalidated else { return }
        let now = WatchTogetherSession.nowMs
        let sample = WatchPlayerSample(position: position(now), state: info.state, rate: info.rate, duration: info.duration, at: now)
        let result = controller.tick(sample, now: now, segments: segments)
        run(result.commands, now: now)
        if let change = result.change { onChange?(change) }
        if let skipped = result.skipped {
            let label = (WatchSponsorBlock.labels[skipped.category] ?? skipped.category).lowercased()
            onToast?("Skipped \(label) segment (SponsorBlock)")
        }
    }

    private func becomeReady(prefs: WatchPrefs) {
        guard !ready else { return }
        ready = true
        for name in ["onStateChange", "onError", "onPlaybackRateChange", "onPlaybackQualityChange"] {
            post(WatchYouTube.playerCommand("addEventListener", [name]))
        }
        apply(volume: prefs.volume, muted: prefs.muted, quality: prefs.quality)
        controller.setShared(shared)
        tick()
        tickTask?.cancel()
        tickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.tickNanoseconds)
                guard !Task.isCancelled, let self else { return }
                self.tick()
            }
        }
    }

    // MARK: SponsorBlock

    /// Segments for this video; silently none when the service is unreachable.
    private func loadSegments(categories: [String]) {
        segmentTask?.cancel()
        segments = []
        guard let videoId = shared?.videoId, WatchYouTube.isVideoId(videoId), !categories.isEmpty,
              let url = WatchSponsorBlock.requestURL(prefix: WatchSponsorBlock.hashPrefix(videoId), categories: categories)
        else { return }
        segmentTask = Task { [weak self] in
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil
            configuration.httpShouldSetCookies = false
            configuration.timeoutIntervalForRequest = 10
            var request = URLRequest(url: url)
            request.httpShouldHandleCookies = false
            let session = URLSession(configuration: configuration)
            defer { session.finishTasksAndInvalidate() }
            guard let result = try? await session.data(for: request),
                  (result.1 as? HTTPURLResponse)?.statusCode == 200,
                  let body = try? JSONSerialization.jsonObject(with: result.0)
            else { return }
            let found = WatchSponsorBlock.selectSegments(body, videoId: videoId, categories: categories)
            guard !Task.isCancelled, let self else { return }
            self.segments = found
        }
    }

    // MARK: Bridge

    private func post(_ message: String) {
        guard !invalidated else { return }
        webView.callAsyncJavaScript("window.__watch.post(m)", arguments: ["m": message], in: nil, in: Self.world, completionHandler: nil)
    }

    private func startFrame() {
        let now = WatchTogetherSession.nowMs
        guard let shared, let src = WatchYouTube.embedURL(
            videoId: shared.videoId, origin: WatchYouTube.embedOrigin,
            start: WatchProtocol.expectedPosition(shared, now: now)
        ) else {
            errorCode = 2
            return
        }
        webView.callAsyncJavaScript("window.__watch.load(src)", arguments: ["src": src], in: nil, in: Self.world) { result in
            if case .failure(let error) = result {
                DiagLog.shared.write("watchTogether: player frame failed: \(error.localizedDescription)")
            }
        }
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard !invalidated, message.frameInfo.isMainFrame, let text = message.body as? String,
              let parsed = WatchPlayerMessages.parse(text) else { return }
        let prefs = WatchTogetherPrefsStore.shared.prefs
        let now = WatchTogetherSession.nowMs
        switch parsed {
        case .ready:
            becomeReady(prefs: prefs)
        case .info(let reported):
            if !ready { becomeReady(prefs: prefs) }
            if let time = reported.currentTime {
                info.currentTime = time
                info.receivedAt = now
            }
            if let state = reported.playerState { info.state = state }
            if let rate = reported.playbackRate { info.rate = rate }
            if let duration = reported.duration, duration > 0 { info.duration = duration }
            if reported.playbackQuality != nil || reported.availableQualityLevels != nil {
                noteQuality(reported.playbackQuality, levels: reported.availableQualityLevels ?? [])
            }
        case .state(let state):
            info.currentTime = position(now)
            info.receivedAt = now
            info.state = state
            if let change = controller.onPlayerState(state, position: info.currentTime, now: now) { onChange?(change) }
            if state == WatchPlayerState.playing {
                if qualityChoice != "auto" { post(WatchYouTube.playerCommand("setPlaybackQuality", [qualityChoice])) }
                errorCode = nil
            }
        case .rate(let rate):
            info.rate = rate
            if let change = controller.onPlayerRate(rate, now: now) { onChange?(change) }
        case .quality(let quality):
            noteQuality(quality, levels: [])
        case .error(let code):
            errorCode = code
        }
    }

    private func noteQuality(_ current: String?, levels: [String]) {
        let nextCurrent = current ?? reportedQuality
        let nextLevels = levels.isEmpty ? reportedLevels : levels
        if nextCurrent != reportedQuality { reportedQuality = nextCurrent }
        if nextLevels != reportedLevels { reportedLevels = nextLevels }
    }

    // MARK: Host page

    /// The page only holds the player frame. It has the origin of the embed host, so the frame can
    /// answer our messages; nothing else may be loaded into the main frame.
    static let hostPage = """
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
    iframe{display:block;border:0;width:100%;height:100%;background:#000}</style>
    </head><body></body></html>
    """

    /// Runs in the host content world only. Creates the player frame, says "listening" until it
    /// answers, and forwards what comes out of exactly that frame as text.
    static let hostScript = #"""
    (function () {
      "use strict";
      if (window.__watch) return;
      var ORIGINS = ["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://youtube.com"];
      var TARGET = ORIGINS[0];
      var LISTEN = '{"event":"listening","id":1,"channel":"widget"}';
      var MAX = 100000;
      var frame = null, tries = 0, timer = null, heard = false;
      function post(message) {
        if (frame && frame.contentWindow) {
          try { frame.contentWindow.postMessage(message, TARGET); } catch (e) {}
        }
      }
      function listen() {
        if (heard || tries >= 60) { return; }
        tries += 1;
        post(LISTEN);
        timer = setTimeout(listen, 250);
      }
      window.__watch = {
        load: function (src) {
          if (frame) { frame.remove(); frame = null; }
          clearTimeout(timer);
          tries = 0;
          heard = false;
          var f = document.createElement("iframe");
          f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
          f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          f.setAttribute("allowfullscreen", "");
          f.setAttribute("title", "YouTube video player");
          f.addEventListener("load", function () { tries = 0; clearTimeout(timer); listen(); });
          f.src = src;
          document.body.appendChild(f);
          frame = f;
          listen();
        },
        post: post
      };
      window.addEventListener("message", function (event) {
        if (!frame || event.source !== frame.contentWindow || ORIGINS.indexOf(event.origin) < 0) { return; }
        var text = event.data;
        if (typeof text !== "string" || text.length > MAX) { return; }
        heard = true;
        clearTimeout(timer);
        try { window.webkit.messageHandlers.diddyWatch.postMessage(text); } catch (e) {}
      });
    })();
    """#
}

// MARK: - WebKit delegates

/// The user content controller retains its handler, so it gets a weak proxy.
@MainActor
private final class WatchWeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WatchPlayerHost?
    init(_ target: WatchPlayerHost) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.receive(message)
    }
}

extension WatchPlayerHost: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let scheme = url?.scheme?.lowercased() ?? ""
        // a link that wants a new window (the logo, "Watch on YouTube"): YouTube's own pages open outside
        guard let target = navigationAction.targetFrame else {
            if scheme == "https", let url, let host = url.host?.lowercased(),
               host == "youtube.com" || host.hasSuffix(".youtube.com") || host == "youtu.be" {
                UIApplication.shared.open(url)
            }
            return decisionHandler(.cancel)
        }
        if target.isMainFrame {
            // only our own page, once; the main frame never navigates away
            if !mainFrameLoaded {
                mainFrameLoaded = true
                return decisionHandler(.allow)
            }
            return decisionHandler(.cancel)
        }
        // inside the player frame: https pages (and its own about:blank / srcdoc) only
        decisionHandler(["https", "about"].contains(scheme) ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !invalidated, !frameStarted else { return }
        frameStarted = true
        startFrame()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        DiagLog.shared.write("watchTogether: player web process ended")
        errorCode = 0
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }
}
