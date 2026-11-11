import ImageIO
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The profile file of the editor's Export / Import (`DiddyProfileTransfer`) as a document.
struct DiddyProfileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var text: String

    init(text: String = "") { self.text = text }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        text = String(decoding: data, as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

/// Importing an own profile effect, profile frame or nameplate from a ZIP or a single picture,
/// like desktop's editor does (`effectZip.ts`, `frameZip.ts`, `nameplateZip.ts`, `media.ts`). The
/// reading and the rules are in `DiddyDecorImport.swift`; this uploads the pictures to the media
/// repository and returns what the draft stores.
@MainActor
enum DiddyDecorImporter {
    /// What a nameplate import changes: the still picture, the video loop (if any) and the colour the ZIP names.
    struct NameplateResult {
        var imageMxc: String
        var videoMxc: String?
        var color: String?
    }

    // MARK: Files

    /// The bytes of a file the user picked. Files from other apps need the security scope; the size is
    /// checked first so a huge file is never read.
    static func read(_ url: URL, maxBytes: Int, tooLarge: String) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        if let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, size > maxBytes {
            throw DiddyError(tooLarge)
        }
        let data: Data
        do { data = try Data(contentsOf: url) } catch { throw DiddyError("The file could not be read.") }
        if data.count > maxBytes { throw DiddyError(tooLarge) }
        return data
    }

    static func isZip(_ url: URL) -> Bool { url.pathExtension.lowercased() == "zip" }

    private static func openZip(_ data: Data) throws -> DiddyZip {
        do { return try DiddyZip(data) } catch let error as DiddyZipError { throw DiddyError(error.message) }
    }

    private static func asDiddyError<T>(_ work: () throws -> T) throws -> T {
        do { return try work() } catch let error as DiddyZipError { throw DiddyError(error.message) }
    }

    // MARK: Profile effect

    /// A ZIP in the collection layout or one animated picture, uploaded, as the draft's effect.
    static func effect(from url: URL, account: MatrixAccount) async throws -> DiddyProfileDraft.Choice {
        let imported: DiddyImportedEffect
        if isZip(url) {
            let data = try read(url, maxBytes: DiddyZip.maxArchiveBytes, tooLarge: "This ZIP file is too large.")
            let archive = try openZip(data)
            imported = try asDiddyError { try DiddyEffectImport.readZip(archive, inflater: DiddyAppleInflater()) }
        } else {
            let data = try read(url, maxBytes: DiddyProfileEffect.maxLayerBytes,
                                tooLarge: "A picture of this effect is too large (max \(DiddyProfileEffect.maxLayerBytes / (1024 * 1024)) MB each).")
            imported = try asDiddyError { try DiddyEffectImport.readImage(name: url.lastPathComponent, data: data) }
        }
        let limit = await account.diddyUploadLimit()
        let files = imported.layers.map { $0.file } + [imported.still, imported.preview].compactMap { $0 }
        if imported.totalBytes > DiddyProfileEffect.maxTotalBytes || files.contains(where: { $0.data.count > limit }) {
            throw DiddyError("This effect is too large for this server.")
        }
        var layerMxcs: [String] = []
        for layer in imported.layers {
            layerMxcs.append(try await account.uploadDiddyMedia(layer.file.data, mimeType: layer.file.type, filename: layer.file.name))
        }
        var stillMxc: String?
        if let still = imported.still {
            stillMxc = try await account.uploadDiddyMedia(still.data, mimeType: still.type, filename: still.name)
        } else if let drawn = drawStill(imported) {
            stillMxc = try await account.uploadDiddyMedia(drawn, mimeType: "image/png", filename: "effect-still.png")
        }
        var previewMxc: String?
        if let preview = imported.preview {
            previewMxc = try await account.uploadDiddyMedia(preview.data, mimeType: preview.type, filename: preview.name)
        }
        let value = DiddyEffectImport.profileValue(imported, layerMxcs: layerMxcs, stillMxc: stillMxc, previewMxc: previewMxc)
        guard let choice = DiddyProfileRules.ownChoice(value) else { throw DiddyError("This effect could not be saved.") }
        return choice
    }

    /// The still picture of an effect that came without one: the first frame of every layer, drawn into
    /// the reference box at its place, as PNG (`drawEffectStill`). A layer that cannot be decoded is left out.
    private static func drawStill(_ effect: DiddyImportedEffect) -> Data? {
        let size = CGSize(width: CGFloat(DiddyProfileEffect.refWidth), height: CGFloat(DiddyProfileEffect.refHeight))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let ordered = effect.layers.enumerated().sorted { a, b in
            a.element.timing.z != b.element.timing.z ? a.element.timing.z < b.element.timing.z : a.offset < b.offset
        }.map { $0.element }
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            for layer in ordered {
                guard let source = CGImageSourceCreateWithData(layer.file.data as CFData, nil),
                      let frame = CGImageSourceCreateImageAtIndex(source, 0, nil) else { continue }
                let box = CGRect(x: CGFloat(layer.timing.x), y: CGFloat(layer.timing.y), width: CGFloat(layer.timing.w), height: CGFloat(layer.timing.h))
                UIImage(cgImage: frame).draw(in: box)
            }
        }
        return image.pngData()
    }

    // MARK: Profile frame

    /// A ZIP in the collection layout or one PNG / WebP, uploaded, as the draft's frame.
    static func frame(from url: URL, account: MatrixAccount) async throws -> DiddyProfileDraft.Choice {
        let imported: DiddyImportedFrame
        if isZip(url) {
            let data = try read(url, maxBytes: DiddyZip.maxArchiveBytes, tooLarge: "This ZIP file is too large.")
            let archive = try openZip(data)
            imported = try asDiddyError { try DiddyFrameImport.readZip(archive, inflater: DiddyAppleInflater()) }
        } else {
            let data = try read(url, maxBytes: DiddyProfileFrame.maxLayerBytes,
                                tooLarge: "A picture of this frame is too large (max \(DiddyProfileFrame.maxLayerBytes / (1024 * 1024)) MB each).")
            imported = try asDiddyError { try DiddyFrameImport.readImage(name: url.lastPathComponent, data: data) }
        }
        let limit = await account.diddyUploadLimit()
        let total = imported.layers.reduce(0) { $0 + $1.file.data.count }
        if total > DiddyProfileFrame.maxTotalBytes || imported.layers.contains(where: { $0.file.data.count > limit }) {
            throw DiddyError("This frame is too large for this server.")
        }
        var layerMxcs: [String] = []
        for layer in imported.layers {
            layerMxcs.append(try await account.uploadDiddyMedia(layer.file.data, mimeType: layer.file.type, filename: layer.file.name))
        }
        guard let choice = DiddyProfileRules.ownChoice(DiddyFrameImport.profileValue(imported, layerMxcs: layerMxcs)) else {
            throw DiddyError("This frame could not be saved.")
        }
        return choice
    }

    // MARK: Nameplate

    private static let videoExtensions: Set<String> = ["mp4", "m4v", "mov"]

    /// A ZIP (its best loop or picture and the colour of its metadata), a picture or a short video.
    static func nameplate(from url: URL, account: MatrixAccount) async throws -> NameplateResult {
        let limit = await account.diddyUploadLimit()
        var name = url.lastPathComponent
        let data: Data
        var color: String?
        if isZip(url) {
            let archive = try openZip(try read(url, maxBytes: DiddyZip.maxArchiveBytes, tooLarge: "This ZIP file is too large."))
            let content = try asDiddyError { try DiddyNameplateImport.read(archive, inflater: DiddyAppleInflater(), playsWebM: false) }
            name = content.name
            data = content.data
            color = content.color
        } else {
            data = try read(url, maxBytes: 64 * 1024 * 1024, tooLarge: "File too large (max \(max(1, limit / (1024 * 1024))) MB)")
        }
        let ext = (name as NSString).pathExtension.lowercased()
        if videoExtensions.contains(ext) {
            let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
            try data.write(to: temp)
            defer { try? FileManager.default.removeItem(at: temp) }
            let prepared = try await DiddyMediaPrep.nameplateVideo(temp, limit: limit)
            let poster = try await account.uploadDiddyMedia(prepared.poster.data, mimeType: prepared.poster.mimeType, filename: "nameplate.png")
            let video = try await account.uploadDiddyMedia(prepared.video.data, mimeType: prepared.video.mimeType, filename: "nameplate.mp4")
            return NameplateResult(imageMxc: poster, videoMxc: video, color: color)
        }
        if ext == "webm" { throw DiddyError("This device cannot play WebM video. Choose an MP4 video or a picture.") }
        let file = try DiddyMediaPrep.picture(data, limit: limit)
        let image = try await account.uploadDiddyMedia(file.data, mimeType: file.mimeType, filename: "nameplate.\(file.ext)")
        return NameplateResult(imageMxc: image, videoMxc: nil, color: color)
    }
}
