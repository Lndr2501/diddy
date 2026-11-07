import Foundation
import MatrixRustSDK
import SwiftUI
import UIKit

/// Downloads avatars and chat images through the SDK (authenticated media, encrypted attachments)
/// and keeps decoded images in memory.
actor MediaLoader {
    static let shared = MediaLoader()

    private let cache = NSCache<NSString, UIImage>()
    private var inFlight: [String: Task<UIImage?, Never>] = [:]

    init() { cache.countLimit = 400 }

    func thumbnail(url: String, size: Int, client: Client) async -> UIImage? {
        guard let source = try? MediaSource.fromUrl(url: url) else { return nil }
        return await image(key: "\(url)#\(size)", source: source, size: size, client: client)
    }

    func image(source: MediaSource, size: Int?, client: Client) async -> UIImage? {
        await image(key: "\(source.url())#\(size ?? 0)", source: source, size: size, client: client)
    }

    private func image(key: String, source: MediaSource, size: Int?, client: Client) async -> UIImage? {
        if let cached = cache.object(forKey: key as NSString) { return cached }
        if let running = inFlight[key] { return await running.value }
        let task = Task<UIImage?, Never> {
            let data: Data?
            if let size {
                data = try? await client.getMediaThumbnail(mediaSource: source, width: UInt64(size), height: UInt64(size))
            } else {
                data = try? await client.getMediaContent(mediaSource: source)
            }
            // Servers without thumbnails (and encrypted media) fall back to the full file.
            if let data, let image = UIImage(data: data) { return image }
            if size != nil, let full = try? await client.getMediaContent(mediaSource: source) { return UIImage(data: full) }
            return nil
        }
        inFlight[key] = task
        let image = await task.value
        inFlight[key] = nil
        if let image { cache.setObject(image, forKey: key as NSString) }
        return image
    }
}

/// Round avatar with the Discord fallback: coloured circle with the first letter.
struct AvatarView: View {
    let url: String?
    let name: String
    var size: CGFloat = 40
    var cornerRadius: CGFloat? = nil
    @EnvironmentObject private var app: AppModel
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Theme.color(for: name)
                Text(initial).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius ?? size / 2, style: .continuous))
        .task(id: url) {
            guard let url, let client = app.activeAccount?.client else { image = nil; return }
            image = await MediaLoader.shared.thumbnail(url: url, size: Int(size * 3), client: client)
        }
    }

    private var initial: String {
        let trimmed = name.trimmingCharacters(in: CharacterSet(charactersIn: "@#!"))
        return trimmed.first.map { String($0).uppercased() } ?? "?"
    }
}
