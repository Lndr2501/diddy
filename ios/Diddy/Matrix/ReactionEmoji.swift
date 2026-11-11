import Foundation

/// Which text can become a reaction. The quick list sits in the long-press menu; every other
/// emoji comes from the system emoji keyboard (`EmojiReactionPicker`), so skin tones, ZWJ
/// sequences, flags and keycaps work as far as iOS itself offers them.
enum ReactionEmoji {
    static let quick = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👀", "✅"]

    /// The last emoji in `text` exactly as typed (variation selectors kept, so the key matches
    /// what desktop Diddy sends), or nil if there is none. The last one is the one just picked
    /// when the keyboard inserts after earlier input or a paste contains several.
    static func lastEmoji(in text: String) -> String? {
        text.reversed().first(where: isEmoji).map(String.init)
    }

    /// Whether one grapheme is shown as an emoji. Letters, digits, `#` and `©` alone are not:
    /// they carry the Emoji property but only become emoji with U+FE0F or as a keycap.
    static func isEmoji(_ character: Character) -> Bool {
        let scalars = character.unicodeScalars
        if scalars.contains(where: { $0.properties.isEmojiPresentation }) { return true }
        let styled = scalars.contains { $0.value == 0xFE0F || $0.value == 0x20E3 }
        return styled && scalars.contains { $0.properties.isEmoji }
    }
}
