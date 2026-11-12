import SwiftUI
import UIKit

/// UITextView keeps selection for the formatting toolbar, and receives actual paste actions.
struct ComposerEditor: UIViewRepresentable {
    @Binding var text: String
    @Binding var selection: NSRange
    var isFocused: Bool
    var onFocus: (Bool) -> Void
    var onSend: () -> Void
    var onFiles: ([URL], [UIImage]) -> Void
    /// Room on the right for a button laid over the field (the emoji button).
    var trailingInset: CGFloat = 0

    /// The field grows with its text, wrapped lines and Dynamic Type included, up to this height and then scrolls.
    static let minHeight: CGFloat = 36
    static let maxHeight: CGFloat = 140

    final class PasteView: UITextView {
        var files: (([URL], [UIImage]) -> Void)?
        override func paste(_ sender: Any?) {
            let board = UIPasteboard.general
            if let images = board.images, !images.isEmpty { files?([], images); return }
            if let urls = board.urls, urls.contains(where: \.isFileURL) {
                files?(urls.filter(\.isFileURL), []); return
            }
            super.paste(sender)
        }
    }

    func makeUIView(context: Context) -> PasteView {
        let view = PasteView()
        view.delegate = context.coordinator
        view.font = .preferredFont(forTextStyle: .body)
        view.adjustsFontForContentSizeCategory = true
        view.backgroundColor = .clear
        view.textColor = .label
        view.textContainerInset = UIEdgeInsets(top: 8, left: 6, bottom: 8, right: 6 + trailingInset)
        view.accessibilityLabel = "Message"
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: PasteView, context: Context) -> CGSize? {
        let width = proposal.width ?? 240
        let fitting = uiView.sizeThatFits(CGSize(width: width, height: CGFloat.greatestFiniteMagnitude))
        let height = min(Self.maxHeight, max(Self.minHeight, ceil(fitting.height)))
        return CGSize(width: width, height: height)
    }

    func updateUIView(_ view: PasteView, context: Context) {
        context.coordinator.parent = self
        view.files = onFiles
        let insets = UIEdgeInsets(top: 8, left: 6, bottom: 8, right: 6 + trailingInset)
        if view.textContainerInset != insets { view.textContainerInset = insets }
        if isFocused, !view.isFirstResponder { view.becomeFirstResponder() }
        if view.text != text { view.text = text }
        let length = (text as NSString).length
        if selection.location <= length, selection.length <= length - selection.location,
           view.selectedRange != selection { view.selectedRange = selection }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerEditor
        init(_ parent: ComposerEditor) { self.parent = parent }
        func textViewDidBeginEditing(_ view: UITextView) { parent.onFocus(true) }
        func textViewDidEndEditing(_ view: UITextView) { parent.onFocus(false) }
        func textViewDidChange(_ view: UITextView) { parent.text = view.text; parent.selection = view.selectedRange }
        func textViewDidChangeSelection(_ view: UITextView) { parent.selection = view.selectedRange }
        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            if text == "\n", !ChatSettings.enterForNewline {
                parent.onSend(); return false
            }
            return true
        }
    }
}

struct ComposerCamera: UIViewControllerRepresentable {
    var onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ComposerCamera
        init(_ parent: ComposerCamera) { self.parent = parent }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }
    }
}

struct ComposerEmojiPicker: View {
    @ObservedObject var account: MatrixAccount
    let packs: [ImagePack]
    var onEmoji: (String) -> Void
    var onCustom: (PackImage, Bool) -> Void
    @State private var search = ""
    @State private var stickers = false
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading) {
                    ForEach(packs) { pack in
                        let images = pack.images(for: stickers ? ImagePack.sticker : ImagePack.emoticon)
                            .filter { search.isEmpty || ImagePack.matches($0, search) }
                        if !images.isEmpty {
                            Text(pack.name ?? "Custom pack").font(.headline)
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 90))]) {
                                ForEach(images) { image in
                                    Button { onCustom(image, stickers) } label: {
                                        VStack {
                                            AvatarView(url: image.url, name: image.shortcode, size: stickers ? 64 : 32, account: account)
                                            Text(":" + image.shortcode + ":").lineLimit(2).font(.caption)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if !stickers {
                        ForEach(EmojiCatalog.groupNames.indices, id: \.self) { index in
                            Text(EmojiCatalog.groupNames[index]).font(.headline)
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 44))]) {
                                ForEach(EmojiCatalog.groups[index].filter { search.isEmpty || EmojiCatalog.matches($0, search) }) { emoji in
                                    Button(emoji.unicode) { onEmoji(emoji.unicode) }.font(.system(size: 28)).accessibilityLabel(emoji.label)
                                }
                            }
                        }
                    }
                }.padding()
            }
            .searchable(text: $search)
            .navigationTitle(stickers ? "Stickers" : "Emoji")
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button(stickers ? "Emoji" : "Stickers") { stickers.toggle() } } }
        }
    }
}
