import Foundation
import MatrixRustSDK

/// A video message the chat plays inline (desktop `MVideo`).
struct VideoAttachment {
    let source: MediaSource
    let filename: String
    let mimeType: String?
    let width: Double?
    let height: Double?
    let duration: TimeInterval?
    /// The preview picture the sender attached; may be missing.
    let thumbnail: MediaSource?
    let caption: String?

    init(_ content: VideoMessageContent) {
        source = content.source
        filename = content.filename
        mimeType = content.info?.mimetype
        width = content.info?.width.map { Double($0) }
        height = content.info?.height.map { Double($0) }
        // Remote content is untrusted: a nonsense duration is dropped.
        duration = content.info?.duration.flatMap { $0.isFinite && $0 >= 0 ? min($0, 24 * 3600) : nil }
        thumbnail = content.info?.thumbnailSource
        let trimmed = content.caption?.trimmingCharacters(in: .whitespacesAndNewlines)
        caption = (trimmed?.isEmpty ?? true) ? nil : trimmed
    }
}

/// An `m.location` message (desktop `MLocation`).
struct LocationAttachment {
    let geoURI: String
    let location: GeoLocation
    /// What the sender wrote next to the point, for example the name of the place.
    let label: String?

    init?(_ content: LocationContent) {
        guard let parsed = GeoLocation(geoURI: content.geoUri) else { return nil }
        geoURI = content.geoUri
        location = parsed
        let text = content.description ?? content.body
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        label = trimmed.isEmpty ? nil : trimmed
    }
}

/// What the timeline adds to a row beyond its plain `Body`: rich text, video and location.
struct MessageExtras {
    var rich: RichSource?
    /// `/me` text is shown in italics.
    var italic = false
    var video: VideoAttachment?
    var location: LocationAttachment?
    /// The text link previews are looked for in (desktop uses the plain body).
    var previewText: String?
    /// The text sent with a photo, file or audio (desktop `renderCaption`); videos keep theirs in `video`.
    var caption: String?
    var captionRich: RichSource?
}

enum MessageRendering {
    static func extras(of message: MessageContent) -> MessageExtras {
        var extras = MessageExtras()
        switch message.msgType {
        case .text(let text):
            extras.rich = source(body: text.body, formatted: text.formatted)
            extras.previewText = text.body
        case .notice(let notice):
            extras.rich = source(body: notice.body, formatted: notice.formatted)
            extras.previewText = notice.body
        case .emote(let emote):
            extras.rich = source(body: emote.body, formatted: emote.formatted)
            extras.italic = true
            extras.previewText = emote.body
        case .image(let image):
            extras.setCaption(image.caption, formatted: image.formattedCaption)
        case .file(let file):
            extras.setCaption(file.caption, formatted: file.formattedCaption)
        case .audio(let audio):
            extras.setCaption(audio.caption, formatted: audio.formattedCaption)
        case .video(let video):
            extras.video = VideoAttachment(video)
        case .location(let location):
            extras.location = LocationAttachment(location)
        default:
            break
        }
        return extras
    }

    fileprivate static func source(body: String, formatted: FormattedBody?) -> RichSource? {
        var html: String?
        if let formatted, case .html = formatted.format { html = formatted.body }
        return RichSource.choose(body: body, html: html)
    }
}

extension MessageExtras {
    /// The SDK only gives a caption when the body differs from the file name, like the desktop's check.
    mutating func setCaption(_ text: String?, formatted: FormattedBody?) {
        guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
        caption = text
        captionRich = MessageRendering.source(body: text, formatted: formatted)
        previewText = text
    }
}
