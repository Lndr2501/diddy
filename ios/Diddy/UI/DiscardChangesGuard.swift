import SwiftUI

/// The iOS way to leave a page with unsaved changes: ask "Discard Changes?" with Discard
/// (red), Save or Apply where the page has it, and Cancel.
private struct DiscardChangesDialog: ViewModifier {
    @Binding var isPresented: Bool
    let saveTitle: String?
    let onSave: (() async -> Bool)?
    let onDiscard: () -> Void
    let onLeave: () -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog("Discard Changes?", isPresented: $isPresented, titleVisibility: .visible) {
            if let saveTitle, let onSave {
                Button(saveTitle) {
                    Task { @MainActor in
                        if await onSave() { onLeave() }
                    }
                }
            }
            Button("Discard Changes", role: .destructive) {
                onDiscard()
                onLeave()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your changes haven't been saved.")
        }
    }
}

/// On a pushed page: while there are changes, the back button (and the swipe back) is replaced
/// by one that asks first.
private struct DiscardChangesBackButton: ViewModifier {
    let hasChanges: Bool
    @Binding var asking: Bool

    func body(content: Content) -> some View {
        content
            .navigationBarBackButtonHidden(hasChanges)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if hasChanges {
                        Button {
                            asking = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.backward").font(.body.weight(.semibold))
                                Text("Back")
                            }
                        }
                        .accessibilityLabel("Back")
                    }
                }
            }
    }
}

extension View {
    /// The "Discard Changes?" question. `onSave` returns whether saving worked; only then
    /// `onLeave` runs. Without `saveTitle` there is no save button.
    func discardChangesDialog(
        isPresented: Binding<Bool>,
        saveTitle: String? = nil,
        onSave: (() async -> Bool)? = nil,
        onDiscard: @escaping () -> Void = {},
        onLeave: @escaping () -> Void
    ) -> some View {
        modifier(DiscardChangesDialog(isPresented: isPresented, saveTitle: saveTitle, onSave: onSave,
                                      onDiscard: onDiscard, onLeave: onLeave))
    }

    /// Replaces the back button while `hasChanges`; tapping it sets `asking`.
    func discardChangesBackButton(_ hasChanges: Bool, asking: Binding<Bool>) -> some View {
        modifier(DiscardChangesBackButton(hasChanges: hasChanges, asking: asking))
    }
}
