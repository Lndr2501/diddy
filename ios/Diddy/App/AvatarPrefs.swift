import Foundation

/// Desktop's "Animated profile pictures" switches (`state/avatarPrefs.ts`): animated profile
/// pictures, and the nameplates, effects and frames of other people's Diddy profiles. Stored on
/// this device. iOS has one switch for the pictures instead of desktop's one per place.
enum AvatarPrefs {
    /// Animated (GIF, WebP, APNG) profile pictures move. Off shows their first frame.
    static let picturesKey = "avatar.animate.pictures"
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
