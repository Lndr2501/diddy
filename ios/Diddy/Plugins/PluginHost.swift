import Foundation
import WebKit

/// Runs one plugin page like the desktop does (`PluginFrame.tsx`): the unchanged plugin HTML sits
/// in an `<iframe sandbox="allow-scripts">` (opaque origin, no same-origin, no popups, no top
/// navigation, no forms, no modals, features denied) inside a tiny host page, so `window.parent`
/// and `postMessage` work exactly as the plugins expect. The host page is plain HTML with a
/// Content-Security-Policy, loaded without a base URL into a WKWebView with its own throw-away
/// (non-persistent) data store: no cookies, no cache and no files of the app.
///
/// The bridge to Swift is a WKScriptMessageHandler that lives in a separate content world with the
/// host script, so scripts of the plugin (page world, in the sub frame) cannot even see it. Every
/// message is checked here (`PluginMessageParser`) before anything happens.
///
/// Only WebKit and Foundation are used, so the same file runs in a macOS command line test.
@MainActor
final class PluginHost: NSObject, ObservableObject {
    enum Source: Equatable {
        case html(String)
        case url(URL)
    }

    @Published private(set) var height = PluginRules.defaultFrameHeight
    @Published private(set) var isReady = false
    /// no `diddy:ready` within 10 seconds: the page is shown as a plain page
    @Published private(set) var isSilent = false
    @Published private(set) var pluginDescription: String?
    @Published private(set) var crashed = false

    let webView: WKWebView

    /// Reads/writes this plugin's own key/value data. `nil` (preview) answers every read with null.
    var readStorage: ((String) -> String?)?
    var writeStorage: ((String, String) -> Void)?
    /// A link the plugin asked for with `diddy:open` (https only, already checked).
    var openLink: ((URL) -> Void)?
    var log: ((String) -> Void)?

    var theme: String = "dark" { didSet { if theme != oldValue { sendInitIfReady() } } }
    var compact = false { didSet { if compact != oldValue { sendInitIfReady() } } }
    var customCss: String? { didSet { if customCss != oldValue { sendInitIfReady() } } }
    var locale: String? = Locale.preferredLanguages.first

    private var source: Source?
    private var generation = 0
    private var mainFrameLoaded = false
    private static let world = WKContentWorld.world(name: "app.diddy.plugin-host")
    private static let handlerName = "diddyPlugin"

    static let readyTimeout: UInt64 = 10

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.allowsAirPlayForMediaPlayback = false
        #if os(iOS)
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        #endif
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: Self.hostScript, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: Self.world))
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        controller.add(WeakHandler(self), contentWorld: Self.world, name: Self.handlerName)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if os(iOS)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        #endif
    }

    /// Shows the plugin. Resets all state and starts the 10 second wait for `diddy:ready`.
    func load(_ source: Source) {
        self.source = source
        generation += 1
        mainFrameLoaded = false
        isReady = false
        isSilent = false
        crashed = false
        pluginDescription = nil
        height = PluginRules.defaultFrameHeight
        webView.loadHTMLString(Self.hostPage, baseURL: nil)
        let current = generation
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.readyTimeout * 1_000_000_000)
            guard let self, self.generation == current, !self.isReady else { return }
            self.isSilent = true
        }
    }

    func reload() {
        if let source { load(source) }
    }

    /// Call when the view goes away: breaks the retain cycle with the web view and stops the page.
    func invalidate() {
        generation += 1
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.configuration.userContentController.removeAllScriptMessageHandlers()
        webView.configuration.userContentController.removeAllUserScripts()
    }

    // MARK: Bridge

    private func startFrame() {
        guard let source else { return }
        let (kind, value): (String, String)
        switch source {
        case .html(let html): (kind, value) = ("html", html)
        case .url(let url): (kind, value) = ("url", url.absoluteString)
        }
        webView.callAsyncJavaScript("window.__diddy.load(kind, value)", arguments: ["kind": kind, "value": value], in: nil, in: Self.world) { [weak self] result in
            if case .failure(let error) = result { self?.log?("plugin frame failed: \(error.localizedDescription)") }
        }
    }

    private func post(_ message: [String: Any]) {
        webView.callAsyncJavaScript("window.__diddy.post(m)", arguments: ["m": message], in: nil, in: Self.world, completionHandler: nil)
    }

    private func sendInit() {
        post(PluginMessageParser.initMessage(theme: theme, locale: locale, compact: compact, customCss: customCss))
    }

    private func sendInitIfReady() {
        if isReady { sendInit() }
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let text = message.body as? String,
              let parsed = PluginMessageParser.parse(json: text) else { return }
        switch parsed {
        case .ready(_, let description, let manifestHeight):
            isReady = true
            isSilent = false
            pluginDescription = description
            if let manifestHeight { height = manifestHeight }
            sendInit()
        case .resize(let newHeight):
            if newHeight != height { height = newHeight }
        case .storageGet(let id, let key):
            let value = readStorage?(key)
            post(["type": "diddy:storage:value", "id": id, "key": key, "value": value ?? NSNull()])
        case .storageSet(let key, let value):
            writeStorage?(key, value)
        case .open(let url):
            openLink?(url)
        }
    }

    // MARK: Host page

    /// Same limits as the desktop app's CSP, without `unsafe-eval` and plain `ws:`/`http:`. The
    /// sandboxed frame inherits it, so a plugin can only talk to https/wss servers.
    static let csp = [
        "default-src data: blob: https:",
        "script-src 'unsafe-inline' data: blob: https:",
        "style-src 'unsafe-inline' data: https:",
        "img-src data: blob: https:",
        "media-src data: blob: https:",
        "font-src data: https:",
        "connect-src https: wss:",
        "frame-src https:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ].joined(separator: "; ")

    static let hostPage = """
    <!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="\(csp)">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="light dark">
    <style>html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}
    iframe{display:block;border:0;width:100%;height:100%;background:transparent}</style>
    </head><body></body></html>
    """

    /// Runs in the host content world only. Creates the sandboxed frame and forwards what comes
    /// out of exactly that frame as JSON text.
    static let hostScript = #"""
    (function () {
      "use strict";
      if (window.__diddy) return;
      var DENIED = "camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'";
      var MAX = 40000;
      var frame = null;
      window.__diddy = {
        load: function (kind, value) {
          if (frame) { frame.remove(); frame = null; }
          var f = document.createElement("iframe");
          f.setAttribute("sandbox", "allow-scripts");
          f.setAttribute("referrerpolicy", "no-referrer");
          f.setAttribute("allow", DENIED);
          f.setAttribute("title", "plugin");
          if (kind === "html") { f.srcdoc = value; } else { f.src = value; }
          document.body.appendChild(f);
          frame = f;
        },
        post: function (message) {
          if (frame && frame.contentWindow) { frame.contentWindow.postMessage(message, "*"); }
        }
      };
      window.addEventListener("message", function (event) {
        if (!frame || event.source !== frame.contentWindow) { return; }
        var text;
        try { text = JSON.stringify(event.data); } catch (e) { return; }
        if (typeof text !== "string" || text.length > MAX) { return; }
        try { window.webkit.messageHandlers.diddyPlugin.postMessage(text); } catch (e) {}
      });
    })();
    """#
}

// MARK: - WebKit delegates

/// The user content controller retains its handler, so it gets a weak proxy.
@MainActor
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: PluginHost?
    init(_ target: PluginHost) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.receive(message)
    }
}

extension PluginHost: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let scheme = navigationAction.request.url?.scheme?.lowercased() ?? ""
        // new windows never open
        guard let target = navigationAction.targetFrame else { return decisionHandler(.cancel) }
        if target.isMainFrame {
            // only our own host page: the first load, never a second navigation of the main frame
            if !mainFrameLoaded, scheme == "about" {
                mainFrameLoaded = true
                return decisionHandler(.allow)
            }
            log?("plugin navigation blocked: \(scheme)")
            return decisionHandler(.cancel)
        }
        // inside the sandboxed frame: https pages (and its own srcdoc) only
        decisionHandler(["https", "about"].contains(scheme) ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        startFrame()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        crashed = true
        log?("plugin web process ended")
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    #if os(iOS)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }
    #endif
}
