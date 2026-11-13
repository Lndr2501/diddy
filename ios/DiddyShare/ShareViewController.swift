import UIKit
import UniformTypeIdentifiers

/// "Diddy" in the share sheet (Photos, Apple Music lyrics, Safari, Files, …). It only collects
/// what was shared and opens the app, which asks for the chat and sends it: the extension never
/// signs in or talks to the server (see ShareHandoff.swift for how the two meet).
final class ShareViewController: UIViewController {
    private static let maxItems = 20

    private let status = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.07, green: 0.07, blue: 0.09, alpha: 1)
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = .white
        spinner.startAnimating()
        status.text = "Opening Diddy…"
        status.textColor = .white
        status.font = .preferredFont(forTextStyle: .headline)
        let stack = UIStackView(arrangedSubviews: [spinner, status])
        stack.axis = .vertical
        stack.spacing = 12
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        Task { await collectAndOpen() }
    }

    private func collectAndOpen() async {
        let bundleId = Bundle.main.bundleIdentifier ?? "app.diddy.ios.share"
        let id = UUID().uuidString
        let folder = ShareHandoff.folder(bundleId: bundleId)
        let dir = folder?.appendingPathComponent(id, isDirectory: true)
        if let dir { try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }

        var manifest = ShareHandoff.Manifest()
        var texts: [String] = []
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        for item in items {
            if let text = item.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
                texts.append(text)
            }
            for provider in item.attachments ?? [] {
                manifest.types.append(contentsOf: provider.registeredTypeIdentifiers)
                guard manifest.files.count < Self.maxItems else { continue }
                await ShareItems.collect(provider, into: &manifest, texts: &texts, dir: dir)
            }
        }
        // A share sheet often gives the same text twice (as text and as the item's description).
        var seen: Set<String> = []
        let text = texts.filter { seen.insert($0).inserted }.joined(separator: "\n")
        manifest.text = text.isEmpty ? nil : text
        manifest.urls = Array(NSOrderedSet(array: manifest.urls).compactMap { $0 as? String })

        let link: URL?
        if let folder, (try? ShareHandoff.write(manifest, id: id, in: folder)) != nil {
            ShareHandoff.removeOld(in: folder, keeping: id)
            link = ShareHandoff.storedURL(id: id)
        } else {
            // No shared folder: text and links still make it, files cannot.
            link = ShareHandoff.inlineURL(text: manifest.text, urls: manifest.urls)
        }
        guard let link else {
            finish(message: "Nothing Diddy can send.")
            return
        }
        if openApp(link) {
            try? await Task.sleep(nanoseconds: 300_000_000)
            extensionContext?.completeRequest(returningItems: nil)
        } else {
            finish(message: "Open Diddy to send it.")
        }
    }

    // MARK: Opening the app

    /// An extension cannot open other apps through the public API; the application object in the
    /// responder chain still can (sideloaded, so no App Review).
    private func openApp(_ url: URL) -> Bool {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return true
            }
            responder = current.next
        }
        return false
    }

    private func finish(message: String) {
        status.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}

/// Reading the shared items. Not tied to the main thread: the item provider calls back on its own.
enum ShareItems {
    static let maxFileBytes: Int64 = 200 * 1024 * 1024


    static func collect(_ provider: NSItemProvider, into manifest: inout ShareHandoff.Manifest, texts: inout [String], dir: URL?) async {
        // Order matters: a photo may also say it is a "file URL", a link may also be "text".
        if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
            if let file = await copyFile(provider, type: UTType.movie, dir: dir) { manifest.files.append(file) }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            if let file = await copyFile(provider, type: UTType.image, dir: dir) {
                manifest.files.append(file)
            } else if let file = await imageData(provider, dir: dir) {
                manifest.files.append(file)
            }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                  let url = await loadURL(provider) {
            if url.isFileURL {
                if let file = copyIn(url, dir: dir) { manifest.files.append(file) }
            } else if url.scheme == "https" || url.scheme == "http" {
                manifest.urls.append(url.absoluteString)
            }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                  let text = await loadText(provider) {
            texts.append(text)
        } else if provider.hasItemConformingToTypeIdentifier(UTType.data.identifier) {
            if let file = await copyFile(provider, type: UTType.data, dir: dir) { manifest.files.append(file) }
        }
    }

    /// The file itself (Photos gives HEIC/JPEG/MOV files); the app converts what needs it.
    static func copyFile(_ provider: NSItemProvider, type: UTType, dir: URL?) async -> ShareHandoff.Manifest.File? {
        guard let dir else { return nil }
        let identifier = provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: type) == true } ?? type.identifier
        return await withCheckedContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: identifier) { url, _ in
                // The file is only there until this block returns, so it is copied right here.
                continuation.resume(returning: url.flatMap { ShareItems.copyIn($0, dir: dir, suggested: provider.suggestedName) })
            }
        }
    }

    static func copyIn(_ source: URL, dir: URL?, suggested: String? = nil) -> ShareHandoff.Manifest.File? {
        guard let dir else { return nil }
        let size = (try? source.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        guard Int64(size) <= maxFileBytes else { return nil }
        var name = ShareHandoff.safeFileName(source.lastPathComponent)
        if let suggested, !suggested.isEmpty, !source.pathExtension.isEmpty {
            name = ShareHandoff.safeFileName(suggested + "." + source.pathExtension)
        }
        let stored = UUID().uuidString + "-" + name
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        do {
            try FileManager.default.copyItem(at: source, to: dir.appendingPathComponent(stored))
        } catch {
            return nil
        }
        let mime = UTType(filenameExtension: source.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        return ShareHandoff.Manifest.File(stored: stored, name: name, mime: mime)
    }

    /// Some apps give an image only as an object (screenshots, other apps' editors).
    static func imageData(_ provider: NSItemProvider, dir: URL?) async -> ShareHandoff.Manifest.File? {
        guard let dir else { return nil }
        let item = await withCheckedContinuation { (continuation: CheckedContinuation<NSSecureCoding?, Never>) in
            provider.loadItem(forTypeIdentifier: UTType.image.identifier) { item, _ in continuation.resume(returning: item) }
        }
        let data: Data?
        if let image = item as? UIImage { data = image.jpegData(compressionQuality: 0.9) }
        else if let raw = item as? Data { data = raw }
        else if let url = item as? URL { return copyIn(url, dir: dir) }
        else { data = nil }
        guard let data else { return nil }
        let stored = UUID().uuidString + "-image.jpg"
        guard (try? data.write(to: dir.appendingPathComponent(stored))) != nil else { return nil }
        return ShareHandoff.Manifest.File(stored: stored, name: "image.jpg", mime: "image/jpeg")
    }

    static func loadURL(_ provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                if let url = item as? URL { continuation.resume(returning: url) }
                else if let data = item as? Data { continuation.resume(returning: URL(dataRepresentation: data, relativeTo: nil)) }
                else if let text = item as? String { continuation.resume(returning: URL(string: text)) }
                else { continuation.resume(returning: nil) }
            }
        }
    }

    static func loadText(_ provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                if let text = item as? String { continuation.resume(returning: text) }
                else if let data = item as? Data { continuation.resume(returning: String(data: data, encoding: .utf8)) }
                else if let text = item as? NSAttributedString { continuation.resume(returning: text.string) }
                else { continuation.resume(returning: nil) }
            }
        }
    }
}
