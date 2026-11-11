import Foundation

/// Desktop's "Animated profile pictures" switches (`state/avatarPrefs.ts`) for what iOS shows: the
/// nameplates, effects and frames of other people's Diddy profiles. Stored on this device.
/// Pictures themselves are always still on iOS, so the desktop's per-place switches for them
/// have nothing to switch here.
enum AvatarPrefs {
    /// Moving pictures, videos and gradients behind names. Off shows a still picture.
    static let nameplatesKey = "avatar.animate.nameplates"
    /// Animated overlays over profile cards. Off shows their still picture.
    static let profileEffectsKey = "avatar.animate.profileEffects"
    /// Decorative frames around profile cards. Off hides them.
    static let profileFramesKey = "avatar.show.profileFrames"

    static var nameplates: Bool { bool(nameplatesKey) }
    static var profileEffects: Bool { bool(profileEffectsKey) }
    static var profileFrames: Bool { bool(profileFramesKey) }

    private static func bool(_ key: String) -> Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }
}
