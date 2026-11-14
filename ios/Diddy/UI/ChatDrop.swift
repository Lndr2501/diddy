import SwiftUI
import UniformTypeIdentifiers

/// Files dragged into a chat (#216): from Files, Photos, Safari or another app, on iPad and
/// iPhone. They join the attachments above the composer like files picked in the file picker.
/// A text selection is left to the text field, which takes it by itself.
enum ChatDrop {
    struct File {
        let data: Data
        let name: String
        let mime: String
    }

    /// The type an item is read as, or nil when it is only text (or a web link) to type in.
    static func fileType(of provider: NSItemProvider) -> UTType? {
        let types = provider.registeredTypeIdentifiers.compactMap { UTType($0) }
        let onlyText = types.allSatisfy { $0.conforms(to: .text) || ($0.conforms(to: .url) && !$0.conforms(to: .fileURL)) }
        // A text file from Files has a name; a text selection does not.
        if onlyText && provider.suggestedName == nil { return nil }
        return types.first { $0.conforms(to: .data) || $0.conforms(to: .package) || $0.conforms(to: .content) }
    }

    static func accepts(_ providers: [NSItemProvider]) -> Bool {
        providers.contains { fileType(of: $0) != nil }
    }

    /// Reads one dropped item. The file behind the URL only exists inside the callback.
    static func load(_ provider: NSItemProvider) async -> File? {
        guard let type = fileType(of: provider) else { return nil }
        return await withCheckedContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                guard let url, let data = try? Data(contentsOf: url), !data.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }
                let ext = url.pathExtension
                var name = provider.suggestedName ?? url.lastPathComponent
                if !ext.isEmpty, !name.lowercased().hasSuffix("." + ext.lowercased()) { name += "." + ext }
                let mime = type.preferredMIMEType
                    ?? UTType(filenameExtension: ext)?.preferredMIMEType
                    ?? "application/octet-stream"
                continuation.resume(returning: File(data: data, name: name, mime: mime))
            }
        }
    }
}

/// The frame shown while files are dragged over the chat.
struct ChatDropHighlight: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(Theme.accent, style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.accent.opacity(0.08)))
            .overlay(
                Label("Drop to attach", systemImage: "paperclip")
                    .font(.headline)
                    .foregroundStyle(Theme.accent)
            )
            .padding(8)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
