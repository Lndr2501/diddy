import Foundation

/// The settings of desktop's "Custom" theme (`state/customTheme.ts`): the three colours the palette is
/// built from. Same keys and `#RRGGBB` strings as the desktop. The gradient and background media of
/// the desktop are not part of it, because the iOS screens draw opaque panels.
struct CustomThemeConfig: Codable, Equatable {
    var accent: String
    var background: String
    var text: String

    static let defaults = CustomThemeConfig(accent: "#FF4FA3", background: "#0E0E12", text: "#F2F2F5")

    /// Reads what is stored (JSON like the desktop's `customTheme`); anything missing or broken
    /// falls back to the default colour.
    static func decode(_ json: String?) -> CustomThemeConfig {
        guard let json, let data = json.data(using: .utf8),
              let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return defaults }
        func color(_ key: String, _ fallback: String) -> String {
            guard let value = raw[key] as? String, let parsed = AppearanceLogic.parseHex(value) else { return fallback }
            return AppearanceLogic.hexString(parsed)
        }
        return CustomThemeConfig(
            accent: color("accent", defaults.accent),
            background: color("background", defaults.background),
            text: color("text", defaults.text)
        )
    }

    /// The JSON string kept in the settings.
    func encoded() -> String {
        let object: [String: Any] = ["accent": accent, "background": background, "text": text]
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }
}

/// Appearance rules that mirror desktop's Settings > General > Theme and Display. Foundation only,
/// checked by `Tools/appearance_check`.
enum AppearanceLogic {
    static let customThemeId = "custom-theme"

    // MARK: Colours

    /// `#RRGGBB`, `RRGGBB` or `#RGB`.
    static func parseHex(_ value: String) -> UInt32? {
        var digits = value.trimmingCharacters(in: .whitespaces)
        if digits.hasPrefix("#") { digits.removeFirst() }
        if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
        guard digits.count == 6, let number = UInt32(digits, radix: 16) else { return nil }
        return number
    }

    static func hexString(_ value: UInt32) -> String {
        let text = String(value & 0xFFFFFF, radix: 16, uppercase: true)
        return "#" + String(repeating: "0", count: 6 - text.count) + text
    }

    // MARK: Which theme is shown

    /// Desktop's `useActiveTheme`: a fixed theme, or with "Match System Appearance" the light or the
    /// dark choice by the system's appearance.
    static func activeThemeId(useSystem: Bool, systemIsLight: Bool, themeId: String, lightId: String, darkId: String) -> String {
        if !useSystem { return themeId }
        return systemIsLight ? lightId : darkId
    }

    // MARK: Text size (desktop's Page Zoom)

    static let zoomRange = 75...150
    static let defaultZoom = 100

    static func clampZoom(_ value: Int) -> Int {
        min(zoomRange.upperBound, max(zoomRange.lowerBound, value))
    }

    /// Body text size in points for xSmall ... accessibility5, in the order of SwiftUI's
    /// `DynamicTypeSize.allCases`.
    static let typeSizePoints: [Double] = [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53]

    /// The text size step that comes closest to the system's step scaled by the zoom, so the in-app
    /// zoom works on top of Dynamic Type. At 100 % it is the system's own step.
    static func typeSizeIndex(base: Int, zoomPercent: Int) -> Int {
        let last = typeSizePoints.count - 1
        let start = min(last, max(0, base))
        let target = typeSizePoints[start] * Double(clampZoom(zoomPercent)) / 100
        var best = start
        var distance = abs(typeSizePoints[start] - target)
        for (index, points) in typeSizePoints.enumerated() {
            let gap = abs(points - target)
            if gap < distance { best = index; distance = gap }
        }
        return best
    }
}
