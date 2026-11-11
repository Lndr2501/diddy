import SwiftUI
import UIKit

/// Reacting with any emoji, not only the quick ones in the long-press menu (#166). iOS has no
/// public emoji picker, so this opens the system emoji keyboard and reacts with the first emoji
/// tapped. Skin tones (hold a key), ZWJ sequences, flags and keycaps come along as one key.
struct EmojiReactionPicker: View {
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                EmojiInputField { emoji in
                    onPick(emoji)
                    dismiss()
                }
                .frame(height: 52)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.input))
                Text("Tap any emoji on the keyboard to react. Hold an emoji for other skin tones. If letters show up, switch to the emoji keyboard with the globe or emoji key.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(Theme.sidebar.ignoresSafeArea())
            .navigationTitle("Add Reaction")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.accent)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// A text field that asks for the emoji keyboard and never keeps text: the first emoji typed or
/// pasted is handed to `onPick`, anything else is dropped.
private struct EmojiInputField: UIViewRepresentable {
    let onPick: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    func makeUIView(context: Context) -> EmojiTextField {
        let field = EmojiTextField()
        field.delegate = context.coordinator
        field.placeholder = "😀"
        field.textAlignment = .center
        field.font = .systemFont(ofSize: 30)
        field.textColor = UIColor(Theme.text)
        field.tintColor = UIColor(Theme.accent)
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.smartInsertDeleteType = .no
        field.returnKeyType = .done
        field.accessibilityLabel = "Emoji"
        field.accessibilityHint = "Pick an emoji on the keyboard to react with it."
        return field
    }

    func updateUIView(_ field: EmojiTextField, context: Context) {
        context.coordinator.onPick = onPick
    }

    @MainActor
    final class Coordinator: NSObject, UITextFieldDelegate {
        var onPick: (String) -> Void
        private var picked = false

        init(onPick: @escaping (String) -> Void) { self.onPick = onPick }

        func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
            if !picked, let emoji = ReactionEmoji.lastEmoji(in: string) {
                picked = true
                onPick(emoji)
            }
            return false
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            textField.resignFirstResponder()
            return false
        }
    }
}

final class EmojiTextField: UITextField {
    /// Opens straight on the emoji keyboard when the user has it enabled (it is by default);
    /// otherwise the usual keyboard, where the globe key gets there.
    override var textInputMode: UITextInputMode? {
        UITextInputMode.activeInputModes.first { $0.primaryLanguage == "emoji" } ?? super.textInputMode
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        DispatchQueue.main.async { [weak self] in _ = self?.becomeFirstResponder() }
    }
}
