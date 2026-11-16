import ReplayKit
import UIKit

/// Opens the iOS screen broadcast sheet with "Diddy" (`DiddyBroadcast`) chosen. The sheet can only
/// be opened through the system's own picker button, so an invisible picker is put into the
/// window for a moment and its button is tapped (what Jitsi and LiveKit's examples do too).
@MainActor
enum BroadcastPicker {
    private static var extensionURL: URL? {
        Bundle.main.builtInPlugInsURL?.appendingPathComponent("DiddyBroadcast.appex")
    }

    /// The bundle ID the extension was really installed with: sideloaders rewrite IDs (AltStore and
    /// SideStore add the team, some give the extension the app's own), so read it from the appex
    /// instead of assuming "<app>.broadcast". A wrong ID leaves the sheet without Diddy preselected.
    static let extensionBundleId: String = {
        if let url = extensionURL, let id = Bundle(url: url)?.bundleIdentifier { return id }
        return (Bundle.main.bundleIdentifier ?? "app.diddy.ios") + ".broadcast"
    }()

    /// True when the app carries the extension (a build without it falls back to in-app sharing).
    static var isAvailable: Bool {
        guard let url = extensionURL else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    static func present() {
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) else { return }
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
        picker.preferredExtension = extensionBundleId
        picker.showsMicrophoneButton = false
        picker.alpha = 0.01
        window.addSubview(picker)
        let button = picker.subviews.compactMap { $0 as? UIButton }.first
        button?.sendActions(for: .touchUpInside)
        // The sheet lives on without the picker; keep it a moment for the tap to land.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { picker.removeFromSuperview() }
    }
}
