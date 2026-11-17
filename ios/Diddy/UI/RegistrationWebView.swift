import SwiftUI
import WebKit

/// A registration step on the server's own page (reCAPTCHA and steps the app does not know).
/// The page calls `window.onAuthDone()` when it is complete (Matrix spec, fallback auth); that
/// closes the sheet by itself. "Done" closes it too, then the server is asked whether it worked.
struct RegistrationWebSheet: View {
    let url: URL
    let onFinish: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            RegistrationWebView(url: url) { dismiss() }
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(url.host ?? "Server")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(L("call.companionDialog.done")) { dismiss() }
                    }
                }
        }
        .onDisappear(perform: onFinish)
    }
}

private struct RegistrationWebView: UIViewRepresentable {
    let url: URL
    let onAuthDone: () -> Void

    private static let handlerName = "diddyAuthDone"

    func makeCoordinator() -> Coordinator { Coordinator(onAuthDone: onAuthDone) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Not shared with anything else, and gone when the sheet closes.
        configuration.websiteDataStore = .nonPersistent()
        let script = WKUserScript(
            source: "window.onAuthDone = function () { window.webkit.messageHandlers.\(Self.handlerName).postMessage('done'); };",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(script)
        configuration.userContentController.add(context.coordinator, name: Self.handlerName)
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        // The controller keeps its handler alive otherwise.
        view.configuration.userContentController.removeScriptMessageHandler(forName: handlerName)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onAuthDone: () -> Void
        init(onAuthDone: @escaping () -> Void) { self.onAuthDone = onAuthDone }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            onAuthDone()
        }
    }
}
