// Checks for Diddy/Matrix/SentMedia.swift. Run from the ios folder (macOS, ImageIO):
//   swiftc Diddy/Matrix/SentMedia.swift Tools/sentmedia_check/main.swift -o /tmp/sentmedia_check && /tmp/sentmedia_check
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

/// A PNG of per-pixel noise like a photo (compresses badly, so the JPEG preview is much smaller),
/// optionally with an EXIF orientation.
func png(width: Int, height: Int, orientation: Int = 1) -> Data {
    let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let pixels = context.data!.bindMemory(to: UInt8.self, capacity: width * height * 4)
    var seed: UInt32 = 7
    for i in 0..<(width * height * 4) {
        seed = seed &* 1_103_515_245 &+ 12345
        pixels[i] = UInt8(truncatingIfNeeded: seed >> 16)
    }
    let image = context.makeImage()!
    let output = NSMutableData()
    let destination = CGImageDestinationCreateWithData(output, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: orientation] as CFDictionary)
    _ = CGImageDestinationFinalize(destination)
    return output as Data
}

// rules
check(SentMedia.shownSize(width: 4000, height: 3000, orientation: 6) == (3000, 4000), "orientation 6 turns the size")
check(SentMedia.shownSize(width: 4000, height: 3000, orientation: 1) == (4000, 3000), "orientation 1 keeps it")
check(SentMedia.needsThumbnail(width: 2000, height: 1000, animated: false), "large still picture gets a preview")
check(!SentMedia.needsThumbnail(width: 800, height: 600, animated: false), "small picture none")
check(!SentMedia.needsThumbnail(width: 3000, height: 3000, animated: true), "animated none")

// a large picture
let large = SentMedia.picture(png(width: 2000, height: 1000), mime: "image/png")
check(large?.width == 2000 && large?.height == 1000, "size read: \(String(describing: large?.width))x\(String(describing: large?.height))")
check(large?.thumbnail != nil, "preview made")
check(large?.thumbnailWidth == 800 && large?.thumbnailHeight == 400, "preview 800 px wide: \(large?.thumbnailWidth ?? 0)x\(large?.thumbnailHeight ?? 0)")
if let thumb = large?.thumbnail, let source = CGImageSourceCreateWithData(thumb as CFData, nil) {
    check(CGImageSourceGetType(source) as String? == UTType.jpeg.identifier, "preview is a JPEG")
}

// turned by EXIF: shown portrait, the preview too
let turned = SentMedia.picture(png(width: 2000, height: 1000, orientation: 6), mime: "image/png")
check(turned?.width == 1000 && turned?.height == 2000, "turned size: \(String(describing: turned?.width))x\(String(describing: turned?.height))")
check(turned?.thumbnailWidth == 400 && turned?.thumbnailHeight == 800, "turned preview: \(turned?.thumbnailWidth ?? 0)x\(turned?.thumbnailHeight ?? 0)")

// small and broken
let small = SentMedia.picture(png(width: 300, height: 200), mime: "image/png")
check(small?.width == 300 && small?.thumbnail == nil, "small picture: size, no preview")
check(SentMedia.picture(Data("no picture".utf8), mime: "image/png") == nil, "not a picture: nil")

if failures > 0 { print("\(failures) sent media check(s) failed"); exit(1) }
print("sent media checks passed")
