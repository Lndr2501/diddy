import Foundation

// Importing an own profile effect, profile frame or nameplate from a ZIP or a single picture,
// exactly like desktop's editor does (`effectZip.ts`, `frameZip.ts`, `nameplateZip.ts`,
// `profileEffect.ts`, `profileFrame.ts`): which ZIP entry plays which role, the limits, the
// timing and geometry of the layers. Foundation only, see `Tools/diddyzip_check`. Uploading the
// pictures and putting the result into the draft happen in `UI/DiddyDecorImporter.swift`.

/// Type and animation of a picture, read from its bytes (`imageInfo`), never from its name.
struct DiddyImageInfo: Equatable {
    var type: String
    var animated: Bool
    var durationMs: Int
    /// 0 = loops forever
    var plays: Int
}

enum DiddyImageSniffer {
    private static let maxChunks = 100_000

    /// PNG / APNG, GIF, WebP or JPEG; nil for anything else or fewer than 16 bytes.
    static func info(_ data: Data) -> DiddyImageInfo? {
        let b = [UInt8](data)
        guard b.count >= 16 else { return nil }
        if be32(b, 0) == 0x8950_4E47, be32(b, 4) == 0x0D0A_1A0A { return png(b) }
        if b[0] == 0x47, b[1] == 0x49, b[2] == 0x46, b[3] == 0x38 { return gif(b) }
        if be32(b, 0) == 0x5249_4646, be32(b, 8) == 0x5745_4250 { return webp(b) }
        if b[0] == 0xFF, b[1] == 0xD8, b[2] == 0xFF { return DiddyImageInfo(type: "image/jpeg", animated: false, durationMs: 0, plays: 1) }
        return nil
    }

    /// A byte, 0 beyond the end (reading past the end gives `undefined` in JavaScript).
    private static func at(_ b: [UInt8], _ i: Int) -> Int { i >= 0 && i < b.count ? Int(b[i]) : 0 }
    private static func be16(_ b: [UInt8], _ i: Int) -> Int { at(b, i) << 8 | at(b, i + 1) }
    private static func be32(_ b: [UInt8], _ i: Int) -> Int { be16(b, i) << 16 | be16(b, i + 2) }
    private static func le16(_ b: [UInt8], _ i: Int) -> Int { at(b, i) | at(b, i + 1) << 8 }
    private static func le32(_ b: [UInt8], _ i: Int) -> Int { le16(b, i) | le16(b, i + 2) << 16 }

    private static func png(_ b: [UInt8]) -> DiddyImageInfo {
        var animated = false
        var plays = 1
        var durationMs = 0.0
        var pos = 8
        var n = 0
        while n < maxChunks, pos + 12 <= b.count {
            let length = be32(b, pos)
            let kind = String(decoding: [UInt8(at(b, pos + 4)), UInt8(at(b, pos + 5)), UInt8(at(b, pos + 6)), UInt8(at(b, pos + 7))], as: UTF8.self)
            let data = pos + 8
            if data + length > b.count { break }
            if kind == "acTL", length >= 8 {
                animated = be32(b, data) > 1
                plays = be32(b, data + 4)
            } else if kind == "fcTL", length >= 26 {
                let delayNum = Double(be16(b, data + 20))
                let denominator = be16(b, data + 22)
                let delayDen = Double(denominator == 0 ? 100 : denominator)
                durationMs += delayNum / delayDen * 1000
            } else if kind == "IEND" {
                break
            }
            pos = data + length + 4
            n += 1
        }
        return DiddyImageInfo(type: "image/png", animated: animated, durationMs: animated ? Int(durationMs.rounded()) : 0, plays: animated ? plays : 1)
    }

    private static func gif(_ b: [UInt8]) -> DiddyImageInfo {
        var pos = 13
        if at(b, 10) & 0x80 != 0 { pos += 3 * (1 << ((at(b, 10) & 0x07) + 1)) }
        var frames = 0
        var durationMs = 0
        var plays = 1
        var delay = 0
        func skipBlocks() {
            var n = 0
            while n < maxChunks, pos < b.count {
                let size = at(b, pos)
                pos += 1 + size
                if size == 0 { return }
                n += 1
            }
        }
        var n = 0
        while n < maxChunks, pos < b.count {
            let marker = at(b, pos)
            if marker == 0x21 {
                let label = at(b, pos + 1)
                if label == 0xF9, pos + 6 < b.count {
                    delay = at(b, pos + 4) | at(b, pos + 5) << 8
                } else if label == 0xFF, pos + 18 < b.count {
                    let app = String(decoding: (3..<14).map { UInt8(at(b, pos + $0)) }, as: UTF8.self)
                    if app == "NETSCAPE2.0", at(b, pos + 15) == 1 {
                        let count = at(b, pos + 16) | at(b, pos + 17) << 8
                        plays = count == 0 ? 0 : count + 1
                    }
                }
                pos += 2
                skipBlocks()
            } else if marker == 0x2C {
                frames += 1
                // browsers play very short frame delays at 100 ms
                durationMs += delay <= 1 ? 100 : delay * 10
                delay = 0
                let flags = at(b, pos + 9)
                pos += 10
                if flags & 0x80 != 0 { pos += 3 * (1 << ((flags & 0x07) + 1)) }
                pos += 1
                skipBlocks()
            } else {
                break
            }
            n += 1
        }
        let animated = frames > 1
        return DiddyImageInfo(type: "image/gif", animated: animated, durationMs: animated ? durationMs : 0, plays: animated ? plays : 1)
    }

    private static func webp(_ b: [UInt8]) -> DiddyImageInfo {
        var animated = false
        var plays = 1
        var durationMs = 0
        var pos = 12
        var n = 0
        while n < maxChunks, pos + 8 <= b.count {
            let kind = String(decoding: [UInt8(at(b, pos)), UInt8(at(b, pos + 1)), UInt8(at(b, pos + 2)), UInt8(at(b, pos + 3))], as: UTF8.self)
            let length = le32(b, pos + 4)
            let data = pos + 8
            if data + length > b.count { break }
            if kind == "VP8X", length >= 1 {
                animated = at(b, data) & 0x02 != 0
            } else if kind == "ANIM", length >= 6 {
                plays = le16(b, data + 4)
            } else if kind == "ANMF", length >= 16 {
                durationMs += at(b, data + 12) | at(b, data + 13) << 8 | at(b, data + 14) << 16
            }
            pos = data + length + (length % 2)
            n += 1
        }
        return DiddyImageInfo(type: "image/webp", animated: animated, durationMs: animated ? durationMs : 0, plays: animated ? plays : 1)
    }
}

// MARK: - Profile effect (effectZip.ts)

struct DiddyImportedFile: Equatable {
    var name: String
    var type: String
    var data: Data
}

struct DiddyImportedEffect {
    struct Layer {
        var file: DiddyImportedFile
        /// start, duration, loop, loopDelay, x, y, w, h, z (the mxc is empty until it is uploaded)
        var timing: DiddyProfileEffect.Layer
    }

    var name: String?
    var layers: [Layer] = []
    /// still picture for reduced motion; missing: the uploader draws the first frames
    var still: DiddyImportedFile?
    var preview: DiddyImportedFile?

    var totalBytes: Int {
        layers.reduce(0) { $0 + $1.file.data.count } + (still?.data.count ?? 0) + (preview?.data.count ?? 0)
    }
}

enum DiddyEffectImport {
    static let maxJsonBytes = 512 * 1024
    static let maxConfigEffects = 16
    static let maxAssets = 64
    static let imageExtensions = ["apng", "png", "webp", "gif"]
    static let configNames = ["konfiguration.json", "configuration.json", "config.json"]
    static let metaNames = ["metadaten.json", "metadata.json"]
    /// Where the timing of a layer is clamped; the mxc is a placeholder until the upload.
    static let placeholderMxc = "mxc://placeholder/placeholder"

    private typealias Zip = DiddyZip

    // MARK: Limits (profileEffect.ts)

    static func checkLayer(_ info: DiddyImageInfo?, bytes: Int, maxBytes: Int = DiddyProfileEffect.maxLayerBytes) -> String? {
        guard let info, DiddyProfileEffect.imageTypes.contains(info.type) else {
            return "Please choose an animated PNG, WebP or GIF with a transparent background."
        }
        let limit = min(maxBytes, DiddyProfileEffect.maxLayerBytes)
        if bytes > limit { return "A picture of this effect is too large (max \(limit / (1024 * 1024)) MB each)." }
        return nil
    }

    /// `timingForImage`: it loops by itself (duration 0, never restarted), or it plays a fixed number
    /// of times and is restarted after each play.
    static func timing(for info: DiddyImageInfo?) -> DiddyProfileEffect.Layer {
        let duration = (info?.animated == true && info?.plays != 0) ? (info?.durationMs ?? 0) : 0
        return DiddyProfileEffect.clampLayer(["start": 0, "loop": true, "loopDelay": 0, "duration": duration], mxc: placeholderMxc)
    }

    // MARK: Config and metadata

    struct Config {
        var title: String?
        var effects: [(src: String?, timing: DiddyProfileEffect.Layer)] = []
        var reducedMotionSrc: String?
        var staticFrameSrc: String?
        var thumbnailPreviewSrc: String?
    }

    struct Asset: Equatable {
        var file: String
        var roles: [String]
        var url: String?
    }

    /// A string of 1...max UTF-16 units (`shortText`).
    static func shortText(_ value: Any?, max: Int = 2048) -> String? {
        guard let text = value as? String, !text.isEmpty, text.utf16.count <= max else { return nil }
        return text
    }

    static func parseJSON(_ text: String) -> Any? {
        try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])
    }

    /// `parseEffectConfig`: the layer list (`effects[]`, also nested under `configuration`).
    static func parseConfig(_ text: String) -> Config? {
        var parsed = parseJSON(text)
        if let dict = parsed as? [String: Any], !(dict["effects"] is [Any]), let nested = dict["configuration"] as? [String: Any] {
            parsed = nested
        }
        guard let dict = parsed as? [String: Any], let list = dict["effects"] as? [Any] else { return nil }
        var config = Config()
        for case let item as [String: Any] in list.prefix(maxConfigEffects) {
            config.effects.append((shortText(item["src"]), DiddyProfileEffect.clampLayer(item, mxc: placeholderMxc)))
        }
        config.title = shortText(dict["title"], max: 48)
        config.reducedMotionSrc = shortText(dict["reducedMotionSrc"])
        config.staticFrameSrc = shortText(dict["staticFrameSrc"])
        config.thumbnailPreviewSrc = shortText(dict["thumbnailPreviewSrc"])
        return config
    }

    /// `parseEffectAssets`: which file has which role (`effects[0].src`, ...).
    static func parseAssets(_ text: String) -> (name: String?, assets: [Asset]) {
        guard let dict = parseJSON(text) as? [String: Any] else { return (nil, []) }
        var assets: [Asset] = []
        for case let item as [String: Any] in (dict["assets"] as? [Any] ?? []).prefix(maxAssets) {
            guard let file = shortText(item["file"], max: 512) else { continue }
            let roles = (item["roles"] as? [Any] ?? []).prefix(16).compactMap { $0 as? String }.filter { $0.utf16.count <= 64 }
            assets.append(Asset(file: file, roles: roles, url: shortText(item["url"])))
        }
        return (shortText(dict["name"], max: 48), assets)
    }

    // MARK: Which file is what

    struct Plan {
        var name: String?
        var layers: [(entry: String, timing: DiddyProfileEffect.Layer)] = []
        var still: String?
        var preview: String?
        /// no usable config: the reader picks the best animated picture of these
        var fallback: [String]?
    }

    private static func lower(_ name: String) -> String { Zip.baseName(name).lowercased() }
    static func isStillName(_ name: String) -> Bool {
        ["reduziert", "reduced", "statisch", "static", "still"].contains { lower(name).contains($0) }
    }
    static func isPreviewName(_ name: String) -> Bool {
        ["vorschau", "preview", "thumbnail"].contains { lower(name).contains($0) }
    }
    static func isLoopName(_ name: String) -> Bool {
        ["loop", "phase", "ebene", "layer", "effect", "anim"].contains { lower(name).contains($0) }
    }
    /// `(^|/)(phasen|ebenen|layers|phases)/`: a folder of that name somewhere in the path.
    static func inLayerFolder(_ name: String, folders: [String] = ["phasen", "ebenen", "layers", "phases"]) -> Bool {
        name.lowercased().split(separator: "/", omittingEmptySubsequences: false).dropLast().contains { folders.contains(String($0)) }
    }

    /// The entry a metadata path points to: its last 1...4 parts are compared with the entries.
    static func entryForFile(_ file: String, in images: [String]) -> String? {
        let parts = file.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        var keep = min(parts.count, 4)
        while keep >= 1 {
            let tail = parts.suffix(keep).joined(separator: "/")
            if let hit = images.first(where: { $0 == tail || $0.hasSuffix("/" + tail) }) { return hit }
            keep -= 1
        }
        return nil
    }

    /// `planEffectImport`: decides which ZIP entry is which layer, the still and the preview, from
    /// the entry names and the config / metadata texts.
    static func makePlan(entryNames: [String], configText: String?, metaText: String?, configPath: String = "") -> Plan {
        let dir = Zip.dirOf(configPath)
        let images = entryNames
            .filter { Zip.isUsableName($0) && $0.hasPrefix(dir) }
            .filter { imageExtensions.contains(Zip.extensionOf($0)) }
        let meta: (name: String?, assets: [Asset]) = metaText.map { parseAssets($0) } ?? (name: nil, assets: [])
        let config = parseConfig(configText ?? "") ?? parseConfig(metaText ?? "")

        func entryFor(_ role: String, _ src: String?) -> String? {
            let asset = meta.assets.first { $0.roles.contains(role) } ?? (src.flatMap { s in meta.assets.first { $0.url == s } })
            return asset.flatMap { entryForFile($0.file, in: images) }
        }

        var used: Set<String> = []
        var result = Plan()
        if let config {
            // by order for the layers the metadata does not name
            let spare = images.filter { !(isStillName($0) || isPreviewName($0)) }.sorted { a, b in
                let folderA = inLayerFolder(a) ? 0 : 1, folderB = inLayerFolder(b) ? 0 : 1
                if folderA != folderB { return folderA < folderB }
                let loopA = isLoopName(a) ? 0 : 1, loopB = isLoopName(b) ? 0 : 1
                if loopA != loopB { return loopA < loopB }
                return Zip.localeLess(a, b)
            }
            let named: [String?] = config.effects.enumerated().map { entryFor("effects[\($0.offset)].src", $0.element.src) }
            for entry in named { if let entry { used.insert(entry) } }
            for (index, effect) in config.effects.enumerated() {
                if result.layers.count >= DiddyProfileEffect.maxLayers { break }
                var entry = named[index]
                if entry == nil {
                    entry = spare.first { !used.contains($0) }
                    if let entry { used.insert(entry) }
                }
                if let entry { result.layers.append((entry, effect.timing)) }
            }
        }

        func pick(_ candidates: [String?]) -> String? {
            for case let candidate? in candidates where !result.layers.contains(where: { $0.entry == candidate }) { return candidate }
            return nil
        }
        let still = pick(
            [entryFor("reducedMotionSrc", config?.reducedMotionSrc), entryFor("staticFrameSrc", config?.staticFrameSrc)]
                + images.filter { isStillName($0) }.sorted(by: Zip.byDepthThenName).map { Optional($0) }
        )
        let preview = pick(
            [entryFor("thumbnailPreviewSrc", config?.thumbnailPreviewSrc)]
                + images.filter { isPreviewName($0) }.sorted(by: Zip.byDepthThenName).map { Optional($0) }
        )
        result.name = config?.title ?? meta.name
        result.still = still
        if let preview, preview != still { result.preview = preview }
        if result.layers.isEmpty {
            func rank(_ name: String) -> Int {
                let ext = ["apng", "webp", "gif", "png"].firstIndex(of: Zip.extensionOf(name)) ?? -1
                return (isStillName(name) || isPreviewName(name) ? 10 : 0) + (isLoopName(name) ? 0 : 5) + ext
            }
            result.fallback = images.filter { $0 != result.still }.sorted { a, b in
                rank(a) != rank(b) ? rank(a) < rank(b) : Zip.localeLess(a, b)
            }
        }
        return result
    }

    // MARK: Reading

    private static func asFile(_ name: String, _ data: Data) -> DiddyImportedFile? {
        guard let info = DiddyImageSniffer.info(data), info.type != "image/jpeg" else { return nil }
        return DiddyImportedFile(name: Zip.baseName(name), type: info.type, data: data)
    }

    /// One picture on its own, as a single looping layer (`readProfileEffectImage`).
    static func readImage(name: String, data: Data) throws -> DiddyImportedEffect {
        let info = DiddyImageSniffer.info(data)
        if let error = checkLayer(info, bytes: data.count) { throw DiddyZipError(error) }
        guard let info else { throw DiddyZipError("Please choose an animated PNG, WebP or GIF with a transparent background.") }
        var title = Zip.baseName(name)
        if let dot = title.lastIndex(of: "."), title.index(after: dot) != title.endIndex { title = String(title[..<dot]) }
        let cleaned = String(title.unicodeScalars.prefix(48))
        var out = DiddyImportedEffect()
        out.name = cleaned.isEmpty ? nil : cleaned
        out.layers = [.init(file: DiddyImportedFile(name: Zip.baseName(name), type: info.type, data: data), timing: timing(for: info))]
        return out
    }

    /// Reads an effect ZIP: config layout when there is one, else its best animated picture
    /// (`readProfileEffectZip`).
    static func readZip(_ zip: DiddyZip, inflater: DiddyInflater) throws -> DiddyImportedEffect {
        let entries = zip.usableEntries
        let byName = Dictionary(entries.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })
        func named(_ names: [String], dir: String? = nil) -> DiddyZipEntry? {
            entries
                .filter { names.contains(Zip.baseName($0.name).lowercased()) }
                .filter { dir == nil || Zip.dirOf($0.name) == dir }
                .sorted { Zip.byDepthThenName($0.name, $1.name) }
                .first
        }
        let config = named(configNames)
        let meta = named(metaNames, dir: config.map { Zip.dirOf($0.name) }) ?? named(metaNames)
        let plan = makePlan(
            entryNames: entries.map(\.name),
            configText: zip.text(of: config, limit: maxJsonBytes, inflater: inflater),
            metaText: zip.text(of: meta, limit: maxJsonBytes, inflater: inflater),
            configPath: (config ?? meta)?.name ?? ""
        )

        let layerLimit = DiddyProfileEffect.maxLayerBytes
        let tooLarge = "A picture of this effect is too large (max \(layerLimit / (1024 * 1024)) MB each)."
        var out = DiddyImportedEffect()
        for layer in plan.layers {
            guard let entry = byName[layer.entry] else { continue }
            if entry.size > layerLimit { throw DiddyZipError(tooLarge) }
            let data = try zip.extract(entry, limit: layerLimit, inflater: inflater)
            if let error = checkLayer(DiddyImageSniffer.info(data), bytes: data.count) { throw DiddyZipError(error) }
            if let file = asFile(entry.name, data) { out.layers.append(.init(file: file, timing: layer.timing)) }
        }

        if out.layers.isEmpty {
            // unknown layout: the best animated picture in the ZIP loops on its own
            let candidates = (plan.fallback ?? []).compactMap { byName[$0] }.filter { $0.size <= layerLimit }
            for entry in candidates {
                guard let data = try? zip.extract(entry, limit: layerLimit, inflater: inflater),
                      let info = DiddyImageSniffer.info(data), info.animated,
                      checkLayer(info, bytes: data.count) == nil else { continue }
                out.layers.append(.init(file: DiddyImportedFile(name: Zip.baseName(entry.name), type: info.type, data: data), timing: timing(for: info)))
                break
            }
        }
        if out.layers.isEmpty {
            throw DiddyZipError("This ZIP file has no animated PNG, WebP or GIF for a profile effect.")
        }

        func readStill(_ name: String?) -> DiddyImportedFile? {
            guard let name, let entry = byName[name], entry.size <= DiddyProfileEffect.maxStillBytes,
                  let data = try? zip.extract(entry, limit: DiddyProfileEffect.maxStillBytes, inflater: inflater) else { return nil }
            return asFile(entry.name, data)
        }
        out.name = plan.name
        out.still = readStill(plan.still)
        if let preview = readStill(plan.preview), out.totalBytes + preview.data.count <= DiddyProfileEffect.maxTotalBytes {
            out.preview = preview
        }
        if out.totalBytes > DiddyProfileEffect.maxTotalBytes {
            throw DiddyZipError("This effect is too large (max \(DiddyProfileEffect.maxTotalBytes / (1024 * 1024)) MB in total).")
        }
        return out
    }

    /// The `effect` value of the profile once every picture is uploaded (`uploadProfileEffect`):
    /// `mxcs` are the layers' addresses in order, the others are optional.
    static func profileValue(_ effect: DiddyImportedEffect, layerMxcs: [String], stillMxc: String?, previewMxc: String?) -> [String: Any] {
        var layers: [[String: Any]] = []
        for (index, layer) in effect.layers.enumerated() where index < layerMxcs.count {
            let t = layer.timing
            layers.append([
                "mxc": layerMxcs[index],
                "start": DiddyProfileRules.jsonNumber(t.start), "duration": DiddyProfileRules.jsonNumber(t.duration),
                "loop": t.loop, "loopDelay": DiddyProfileRules.jsonNumber(t.loopDelay),
                "x": DiddyProfileRules.jsonNumber(t.x), "y": DiddyProfileRules.jsonNumber(t.y),
                "w": DiddyProfileRules.jsonNumber(t.w), "h": DiddyProfileRules.jsonNumber(t.h),
                "z": DiddyProfileRules.jsonNumber(t.z),
            ])
        }
        var out: [String: Any] = ["layers": layers]
        if let stillMxc { out["stillMxc"] = stillMxc }
        if let previewMxc { out["previewMxc"] = previewMxc }
        if let name = effect.name { out["name"] = name }
        return out
    }
}

// MARK: - Profile frame (frameZip.ts)

struct DiddyImportedFrame {
    struct Layer {
        var file: DiddyImportedFile
        var order: String
        var anchor: String
    }

    var name: String?
    var geometry: DiddyProfileFrame.Geometry
    var layers: [Layer] = []
}

enum DiddyFrameImport {
    static let maxJsonBytes = 512 * 1024
    static let maxConfigLayers = 16
    static let imageExtensions = ["apng", "png", "webp"]
    private typealias Zip = DiddyZip

    static func isPreviewName(_ name: String) -> Bool {
        ["vorschau", "preview", "thumbnail", "contact"].contains { Zip.baseName(name).lowercased().contains($0) }
    }

    /// `checkFrameLayer`
    static func checkLayer(type: String?, bytes: Int, maxBytes: Int = DiddyProfileFrame.maxLayerBytes) -> String? {
        guard let type, DiddyProfileFrame.imageTypes.contains(type) else { return "Please choose a PNG or WebP with a transparent background." }
        let limit = min(maxBytes, DiddyProfileFrame.maxLayerBytes)
        if bytes > limit { return "A picture of this frame is too large (max \(limit / (1024 * 1024)) MB each)." }
        return nil
    }

    struct Config {
        var geometry: DiddyProfileFrame.Geometry
        var layers: [(id: String?, order: String, anchor: String)] = []
    }

    private static let idCharacters = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

    private static func layerId(_ value: Any?) -> String? {
        var text: String?
        if let number = DiddySanitize.number(value) {
            text = number == number.rounded() && abs(number) < 1e15 ? String(Int64(number)) : String(number)
        } else {
            text = value as? String
        }
        guard let text, (3...64).contains(text.count), text.allSatisfy({ idCharacters.contains($0) }) else { return nil }
        return text
    }

    /// `parseFrameConfig`: `layers[]` and the geometry at the top, or nested under `configuration` /
    /// `frame_data` (the metadata file carries a copy there).
    static func parseConfig(_ text: String) -> Config? {
        var parsed = DiddyEffectImport.parseJSON(text)
        if let dict = parsed as? [String: Any], !(dict["layers"] is [Any]) {
            if let nested = dict["configuration"] as? [String: Any] {
                parsed = nested
            } else if let nested = dict["frame_data"] as? [String: Any] {
                parsed = nested
            }
        }
        guard let dict = parsed as? [String: Any], let list = dict["layers"] as? [Any] else { return nil }
        var config = Config(geometry: DiddyProfileFrame.clampGeometry(dict))
        for case let item as [String: Any] in list.prefix(maxConfigLayers) {
            // a frame layer without an anchor hangs on the top edge
            var raw = item
            if raw["anchor"] == nil { raw["anchor"] = "top" }
            let layer = DiddyProfileFrame.clampLayer(raw, mxc: DiddyEffectImport.placeholderMxc)
            config.layers.append((layerId(item["id"]), layer.order, layer.anchor))
        }
        return config
    }

    struct Plan {
        var name: String?
        var geometry: DiddyProfileFrame.Geometry
        var layers: [(entry: String, order: String, anchor: String)] = []
    }

    /// `planFrameImport`. Without a config: a pair named *top* / *bottom* hangs on those edges,
    /// else a single picture is laid over the whole card.
    static func makePlan(entryNames: [String], configText: String?, metaText: String?, configPath: String = "") -> Plan {
        let dir = Zip.dirOf(configPath)
        let images = entryNames
            .filter { Zip.isUsableName($0) && $0.hasPrefix(dir) }
            .filter { imageExtensions.contains(Zip.extensionOf($0)) }
            .filter { !isPreviewName($0) }
            .sorted { a, b in
                let folderA = DiddyEffectImport.inLayerFolder(a, folders: ["ebenen", "layers"]) ? 0 : 1
                let folderB = DiddyEffectImport.inLayerFolder(b, folders: ["ebenen", "layers"]) ? 0 : 1
                return folderA != folderB ? folderA < folderB : Zip.byDepthThenName(a, b)
            }
        let meta: (name: String?, assets: [DiddyEffectImport.Asset]) = metaText.map { DiddyEffectImport.parseAssets($0) } ?? (name: nil, assets: [])
        let config = parseConfig(configText ?? "") ?? parseConfig(metaText ?? "")

        if let config {
            var plan = Plan(name: meta.name, geometry: config.geometry)
            var used: Set<String> = []
            let named: [String?] = config.layers.enumerated().map { index, layer in
                if let asset = meta.assets.first(where: { $0.roles.contains("layers[\(index)]") }),
                   let byRole = DiddyEffectImport.entryForFile(asset.file, in: images) { return byRole }
                guard let id = layer.id else { return nil }
                return images.first { Zip.baseName($0).contains(id) }
            }
            for entry in named { if let entry { used.insert(entry) } }
            for (index, layer) in config.layers.enumerated() {
                if plan.layers.count >= DiddyProfileFrame.maxLayers { break }
                var entry = named[index]
                if entry == nil {
                    entry = images.first { !used.contains($0) }
                    if let entry { used.insert(entry) }
                }
                if let entry { plan.layers.append((entry, layer.order, layer.anchor)) }
            }
            return plan
        }

        var plan = Plan(name: meta.name, geometry: DiddyProfileFrame.clampGeometry([:]))
        func mentions(_ name: String, _ words: [String]) -> Bool {
            let base = Zip.baseName(name).lowercased()
            return words.contains { base.contains($0) }
        }
        let top = images.first { mentions($0, ["top", "oben"]) }
        let bottom = images.first { mentions($0, ["bottom", "unten"]) && $0 != top }
        if let top, let bottom {
            plan.layers.append((top, "front", "top"))
            plan.layers.append((bottom, "front", "bottom"))
        } else if let first = images.first {
            plan.layers.append((first, "front", "fill"))
        }
        return plan
    }

    private static func layer(_ name: String, _ data: Data, order: String, anchor: String) throws -> DiddyImportedFrame.Layer {
        let type = DiddyImageSniffer.info(data)?.type
        if let error = checkLayer(type: type, bytes: data.count) { throw DiddyZipError(error) }
        guard let type else { throw DiddyZipError("Please choose a PNG or WebP with a transparent background.") }
        return .init(file: DiddyImportedFile(name: Zip.baseName(name), type: type, data: data), order: order, anchor: anchor)
    }

    /// One picture on its own: laid over the card as a whole, nothing sticks out.
    static func readImage(name: String, data: Data) throws -> DiddyImportedFrame {
        var title = Zip.baseName(name)
        if let dot = title.lastIndex(of: "."), title.index(after: dot) != title.endIndex { title = String(title[..<dot]) }
        let cleaned = String(title.unicodeScalars.prefix(48))
        var out = DiddyImportedFrame(name: cleaned.isEmpty ? nil : cleaned, geometry: DiddyProfileFrame.clampGeometry([:]))
        out.layers = [try layer(name, data, order: "front", anchor: "fill")]
        return out
    }

    /// Reads a frame ZIP: config layout when there is one, else *top* / *bottom* or one picture.
    static func readZip(_ zip: DiddyZip, inflater: DiddyInflater) throws -> DiddyImportedFrame {
        let entries = zip.usableEntries
        let byName = Dictionary(entries.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })
        func named(_ names: [String], dir: String? = nil) -> DiddyZipEntry? {
            entries
                .filter { names.contains(Zip.baseName($0.name).lowercased()) }
                .filter { dir == nil || Zip.dirOf($0.name) == dir }
                .sorted { Zip.byDepthThenName($0.name, $1.name) }
                .first
        }
        let config = named(DiddyEffectImport.configNames)
        let meta = named(DiddyEffectImport.metaNames, dir: config.map { Zip.dirOf($0.name) }) ?? named(DiddyEffectImport.metaNames)
        let plan = makePlan(
            entryNames: entries.map(\.name),
            configText: zip.text(of: config, limit: maxJsonBytes, inflater: inflater),
            metaText: zip.text(of: meta, limit: maxJsonBytes, inflater: inflater),
            configPath: (config ?? meta)?.name ?? ""
        )
        if plan.layers.isEmpty { throw DiddyZipError("This ZIP file has no PNG or WebP for a profile frame.") }

        var out = DiddyImportedFrame(name: plan.name, geometry: plan.geometry)
        var total = 0
        for item in plan.layers {
            guard let entry = byName[item.entry] else { continue }
            if entry.size > DiddyProfileFrame.maxLayerBytes {
                throw DiddyZipError(checkLayer(type: "image/png", bytes: entry.size) ?? "A file in this ZIP is too large.")
            }
            let data = try zip.extract(entry, limit: DiddyProfileFrame.maxLayerBytes, inflater: inflater)
            total += data.count
            if total > DiddyProfileFrame.maxTotalBytes {
                throw DiddyZipError("This frame is too large (max \(DiddyProfileFrame.maxTotalBytes / (1024 * 1024)) MB in total).")
            }
            out.layers.append(try layer(entry.name, data, order: item.order, anchor: item.anchor))
        }
        return out
    }

    /// The `frame` value of the profile once every picture is uploaded (`uploadProfileFrame`).
    static func profileValue(_ frame: DiddyImportedFrame, layerMxcs: [String]) -> [String: Any] {
        var layers: [[String: Any]] = []
        for (index, layer) in frame.layers.enumerated() where index < layerMxcs.count {
            layers.append(["mxc": layerMxcs[index], "order": layer.order, "anchor": layer.anchor])
        }
        var out: [String: Any] = [
            "innerWidth": DiddyProfileRules.jsonNumber(frame.geometry.innerWidth),
            "overflowTop": DiddyProfileRules.jsonNumber(frame.geometry.overflowTop),
            "overflowBottom": DiddyProfileRules.jsonNumber(frame.geometry.overflowBottom),
            "overflowHorizontal": DiddyProfileRules.jsonNumber(frame.geometry.overflowHorizontal),
            "layers": layers,
        ]
        if let name = frame.name { out["name"] = name }
        return out
    }
}

// MARK: - Nameplate (nameplateZip.ts)

enum DiddyNameplateImport {
    static let maxEntryBytes = 16 * 1024 * 1024
    static let maxJsonBytes = 256 * 1024
    /// Best first: an animated picture, then a video loop, then a still. Pictures come first
    /// because nameplates are usually transparent on one side and WebKit cannot play WebM with
    /// alpha, while APNG, GIF and WebP keep the transparency everywhere.
    static let preference = ["apng", "gif", "webp", "webm", "mp4", "png", "jpg", "jpeg"]
    static let mimeByExtension = [
        "webm": "video/webm", "mp4": "video/mp4", "apng": "image/png", "png": "image/png", "gif": "image/gif",
        "webp": "image/webp", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    ]

    struct Content {
        var name: String
        var type: String
        var data: Data
        /// first colour of the gradient the ZIP describes, as #rrggbb
        var color: String?
    }

    private static func toHex(_ number: Double) -> String? {
        guard number == number.rounded(), number >= 0, number <= 16_777_215 else { return nil }
        let hex = String(Int(number), radix: 16)
        return "#" + String(repeating: "0", count: 6 - hex.count) + hex
    }

    /// `colorFromNameplateMetadata`: the first gradient colour in a metadata JSON
    /// (`gradient_colours`, as list or JSON text).
    static func colorFromMetadata(_ text: String) -> String? {
        guard let parsed = DiddyEffectImport.parseJSON(text) else { return nil }
        func find(_ node: Any?, _ depth: Int) -> Any? {
            guard let record = node as? [String: Any], depth <= 3 else { return nil }
            if let found = record["gradient_colours"] { return found }
            for key in record.keys.sorted() {
                if let found = find(record[key], depth + 1) { return found }
            }
            return nil
        }
        var colours = find(parsed, 0)
        if let string = colours as? String {
            guard let again = DiddyEffectImport.parseJSON(string) else { return nil }
            colours = again
        }
        guard let list = colours as? [Any], let first = list.first else { return nil }
        if let text = first as? String {
            let hex = text.hasPrefix("#") ? String(text.dropFirst()) : ""
            if text.hasPrefix("#"), hex.count == 6, hex.allSatisfy({ "0123456789abcdefABCDEF".contains($0) }) { return text.lowercased() }
            return nil
        }
        if let number = DiddySanitize.number(first) { return toHex(number) }
        return nil
    }

    /// The best entry of the ZIP (`readNameplateZip`'s choice). `playsWebM` false leaves WebM out:
    /// this system cannot play it.
    static func best(of entries: [DiddyZipEntry], playsWebM: Bool = true) -> DiddyZipEntry? {
        let allowed = preference.filter { playsWebM || $0 != "webm" }
        return entries
            .filter { allowed.contains(DiddyZip.extensionOf($0.name)) }
            .sorted { a, b in
                let rankA = allowed.firstIndex(of: DiddyZip.extensionOf(a.name)) ?? 0
                let rankB = allowed.firstIndex(of: DiddyZip.extensionOf(b.name)) ?? 0
                return rankA != rankB ? rankA < rankB : DiddyZip.localeLess(a.name, b.name)
            }
            .first
    }

    static func read(_ zip: DiddyZip, inflater: DiddyInflater, playsWebM: Bool = true) throws -> Content {
        let entries = zip.usableEntries
        guard let chosen = best(of: entries, playsWebM: playsWebM) else {
            let onlyWebM = !playsWebM && entries.contains { DiddyZip.extensionOf($0.name) == "webm" }
            throw DiddyZipError(onlyWebM ? "This ZIP only has a WebM video, which this device cannot play."
                                         : "This ZIP file has no video or image for a nameplate.")
        }
        let data = try zip.extract(chosen, limit: maxEntryBytes, inflater: inflater)
        var color: String?
        if let json = entries.first(where: { DiddyZip.extensionOf($0.name) == "json" && $0.size <= maxJsonBytes }),
           let text = zip.text(of: json, limit: maxJsonBytes, inflater: inflater) {
            color = colorFromMetadata(text)
        }
        return Content(name: DiddyZip.baseName(chosen.name), type: mimeByExtension[DiddyZip.extensionOf(chosen.name)] ?? "application/octet-stream", data: data, color: color)
    }
}
