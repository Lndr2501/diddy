import SwiftUI
import UIKit

/// Switchable home-screen icon, the same five colours as the desktop app. The alternate icons are
/// listed in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES (project.yml).
enum AppIconChoice: String, CaseIterable, Identifiable {
    case pink, blue, purple, black, magenta

    var id: String { rawValue }

    /// nil is the primary icon (pink).
    var alternateName: String? { self == .pink ? nil : "AppIcon-\(rawValue.capitalized)" }

    var previewImage: String { "IconPreview-\(rawValue.capitalized)" }

    var title: String { rawValue.capitalized }

    static var current: AppIconChoice {
        guard let name = UIApplication.shared.alternateIconName else { return .pink }
        return allCases.first { $0.alternateName == name } ?? .pink
    }

    @MainActor
    func apply() async throws {
        guard UIApplication.shared.supportsAlternateIcons else {
            throw DiddyError("This device does not support alternate app icons.")
        }
        guard UIApplication.shared.alternateIconName != alternateName else { return }
        try await UIApplication.shared.setAlternateIconName(alternateName)
    }
}
