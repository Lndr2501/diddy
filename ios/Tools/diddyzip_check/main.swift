// Checks for Diddy/Matrix/DiddyZip.swift and DiddyDecorImport.swift: safe ZIP reading with desktop's
// limits, and which entry becomes which layer of an own profile effect, profile frame or nameplate,
// like cinny/tests/effectZip.test.cjs, frameZip.test.cjs and nameplateZip.test.cjs. Only stored
// entries are real here; deflated ones go through a stand-in inflater (the app uses the Compression
// framework). Foundation only. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/DiddyProfileDecor.swift Diddy/Matrix/DiddyProfileDraft.swift Diddy/Matrix/DiddyZip.swift Diddy/Matrix/DiddyDecorImport.swift Tools/diddyzip_check/main.swift -o /tmp/diddyzip_check && /tmp/diddyzip_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}
func text(_ value: Any?) -> String {
    let wrapped: [String: Any] = ["v": value ?? NSNull()]
    guard let data = try? JSONSerialization.data(withJSONObject: wrapped, options: [.sortedKeys, .withoutEscapingSlashes]) else { return "?" }
    return String(decoding: data, as: UTF8.self)
}

// MARK: Building test files

/// Joins byte arrays (one call keeps the type checker quick).
func cat(_ parts: [UInt8]...) -> [UInt8] { parts.flatMap { $0 } }
func le16(_ v: Int) -> [UInt8] { [UInt8(v & 255), UInt8((v >> 8) & 255)] }
func le32(_ v: Int) -> [UInt8] { le16(v & 0xFFFF) + le16((v >> 16) & 0xFFFF) }
func be16(_ v: Int) -> [UInt8] { [UInt8((v >> 8) & 255), UInt8(v & 255)] }
func be32(_ v: Int) -> [UInt8] { be16((v >> 16) & 0xFFFF) + be16(v & 0xFFFF) }

/// A ZIP with these files. `method` 8 only labels the entries: the stand-in inflater hands the bytes back.
func makeZip(_ files: [(String, Data)], method: Int = 0) -> Data {
    var out: [UInt8] = []
    var central: [UInt8] = []
    for (name, content) in files {
        let nameBytes = Array(name.utf8)
        let offset = out.count
        out += cat(le32(0x0403_4B50), le16(20), le16(0), le16(method), le16(0), le16(0), le32(0))
        out += cat(le32(content.count), le32(content.count), le16(nameBytes.count), le16(0))
        out += nameBytes
        out += [UInt8](content)
        central += cat(le32(0x0201_4B50), le16(20), le16(20), le16(0), le16(method), le16(0), le16(0), le32(0))
        central += cat(le32(content.count), le32(content.count), le16(nameBytes.count), le16(0), le16(0))
        central += cat(le16(0), le16(0), le32(0), le32(offset))
        central += nameBytes
    }
    let centralOffset = out.count
    out += central
    out += cat(le32(0x0605_4B50), le16(0), le16(0), le16(files.count), le16(files.count), le32(central.count), le32(centralOffset), le16(0))
    return Data(out)
}

struct StandInInflater: DiddyInflater {
    func inflate(_ data: Data, expectedSize: Int, limit: Int) throws -> Data {
        if data.count > limit { throw DiddyZipError("A file in this ZIP is too large.") }
        return data
    }
}
let inflater = StandInInflater()

func chunk(_ type: String, _ body: [UInt8]) -> [UInt8] { cat(be32(body.count), Array(type.utf8), body, [0, 0, 0, 0]) }
let pngSignature: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
let ihdr: [UInt8] = chunk("IHDR", [UInt8](repeating: 0, count: 13))
func stillPng() -> Data { Data(cat(pngSignature, ihdr, chunk("IEND", []))) }
func apng(frames: Int, plays: Int, delayNum: Int = 10, delayDen: Int = 100) -> Data {
    var bytes = cat(pngSignature, ihdr, chunk("acTL", cat(be32(frames), be32(plays))))
    for _ in 0..<frames {
        bytes += chunk("fcTL", cat([UInt8](repeating: 0, count: 20), be16(delayNum), be16(delayDen), [0, 0]))
    }
    bytes += chunk("IEND", [])
    return Data(bytes)
}
func gif(frames: Int, delays: [Int]) -> Data {
    var bytes: [UInt8] = cat(Array("GIF89a".utf8), [1, 0, 1, 0, 0, 0, 0])
    for i in 0..<frames {
        bytes += cat([0x21, 0xF9, 0x04, 0x00], [UInt8(delays[i])], [0x00, 0x00, 0x00])
        bytes += cat([0x2C], [UInt8](repeating: 0, count: 9), [0x02, 0x01, 0x00, 0x00])
    }
    bytes += [0x3B]
    return Data(bytes)
}
func webp(frames: Int, durationMs: Int) -> Data {
    var body: [UInt8] = Array("WEBP".utf8)
    body += cat(Array("VP8X".utf8), le32(10), [0x02, 0, 0, 0], [UInt8](repeating: 0, count: 6))
    body += cat(Array("ANIM".utf8), le32(6), [UInt8](repeating: 0, count: 4), le16(0))
    for _ in 0..<frames {
        body += cat(Array("ANMF".utf8), le32(16), [UInt8](repeating: 0, count: 12), [UInt8(durationMs & 255), UInt8((durationMs >> 8) & 255), 0, 0])
    }
    return Data(cat(Array("RIFF".utf8), le32(body.count), body))
}
func data(_ text: String) -> Data { Data(text.utf8) }

// MARK: Names

typealias Z = DiddyZip
check(Z.extensionOf("a/b/Loop.APNG") == "apng" && Z.extensionOf("noext") == "", "extension")
check(Z.baseName("a/b/c.png") == "c.png" && Z.baseName("c.png") == "c.png", "base name")
check(Z.dirOf("a/b/c.png") == "a/b/" && Z.dirOf("c.png") == "", "folder")
check(Z.isUsableName("a/b.png"), "usable")
check(!Z.isUsableName("a/") && !Z.isUsableName("") && !Z.isUsableName("../x.png") && !Z.isUsableName("a/../x.png"), "folders and .. are not usable")
check(!Z.isUsableName("__MACOSX/a.png") && !Z.isUsableName("a/.hidden.png") && Z.isUsableName("a/b..c.png"), "metadata and hidden files")

// MARK: Reading ZIPs

let sample = makeZip([("one.txt", data("hello")), ("dir/two.png", stillPng())])
do {
    let zip = try DiddyZip(sample)
    check(zip.entries.map { $0.name } == ["one.txt", "dir/two.png"], "entries: \(zip.entries.map { $0.name })")
    check(zip.entries[0].size == 5 && zip.entries[0].method == 0, "size and method")
    let first = try zip.extract(zip.entries[0], limit: 100, inflater: inflater)
    check(String(decoding: first, as: UTF8.self) == "hello", "stored content")
    do { _ = try zip.extract(zip.entries[0], limit: 4, inflater: inflater); check(false, "a file above the limit is refused") }
    catch { check((error as? DiddyZipError)?.message == "A file in this ZIP is too large.", "limit message: \(error)") }
    check(zip.text(of: zip.entries[0], limit: 100, inflater: inflater) == "hello", "text")
    check(zip.text(of: zip.entries[0], limit: 4, inflater: inflater) == nil, "text above the limit is nil")
} catch { check(false, "sample zip: \(error)") }

do {
    let zip = try DiddyZip(makeZip([("a.bin", data("abc"))], method: 8))
    check(String(decoding: try zip.extract(zip.entries[0], limit: 10, inflater: inflater), as: UTF8.self) == "abc", "deflated entries go through the inflater")
    let odd = try DiddyZip(makeZip([("a.bin", data("abc"))], method: 99))
    do { _ = try odd.extract(odd.entries[0], limit: 10, inflater: inflater); check(false, "unknown method") }
    catch { check((error as? DiddyZipError)?.message == "This ZIP file uses an unsupported compression.", "method message: \(error)") }
} catch { check(false, "method zips: \(error)") }

func refused(_ bytes: Data, _ expected: String, line: Int = #line) {
    do { _ = try DiddyZip(bytes); check(false, "expected '\(expected)'", line: line) }
    catch { check((error as? DiddyZipError)?.message == expected, "message '\((error as? DiddyZipError)?.message ?? "\(error)")' instead of '\(expected)'", line: line) }
}
refused(data("this is not a zip file at all, just text"), "This is not a ZIP file.")
refused(Data(), "This is not a ZIP file.")
refused(makeZip((0..<201).map { ("f\($0).txt", data("x")) }), "This ZIP file has too many files.")
check((try? DiddyZip(makeZip((0..<200).map { ("f\($0).txt", data("x")) }))) != nil, "200 files are fine")
refused(Data(count: DiddyZip.maxArchiveBytes + 1), "This ZIP file is too large.")
var damaged = [UInt8](sample)
damaged[damaged.count - 22 - 46 - 11] = 0 // inside the second central header: its signature
refused(Data(damaged), "This ZIP file is damaged.")
// an entry that points outside the file
var bad = [UInt8](makeZip([("a.txt", data("x"))]))
let eocdAt = bad.count - 22
let centralAt = Int(bad[eocdAt + 16]) | Int(bad[eocdAt + 17]) << 8
bad[centralAt + 42] = 0xFF; bad[centralAt + 43] = 0xFF
do {
    let zip = try DiddyZip(Data(bad))
    do { _ = try zip.extract(zip.entries[0], limit: 10, inflater: inflater); check(false, "offset outside the file") }
    catch { check((error as? DiddyZipError)?.message == "This ZIP file is damaged.", "offset message: \(error)") }
} catch { check(false, "bad offset zip: \(error)") }
check(DiddyZip.maxArchiveBytes == 24 * 1024 * 1024 && DiddyZip.maxEntries == 200, "limits of desktop")

// MARK: Picture types

let animatedPng = DiddyImageSniffer.info(apng(frames: 2, plays: 0))
check(animatedPng?.type == "image/png" && animatedPng?.animated == true && animatedPng?.durationMs == 200 && animatedPng?.plays == 0, "apng: \(String(describing: animatedPng))")
let stillInfo = DiddyImageSniffer.info(stillPng())
check(stillInfo?.animated == false && stillInfo?.durationMs == 0 && stillInfo?.plays == 1, "still png")
let slow = DiddyImageSniffer.info(apng(frames: 3, plays: 2, delayNum: 1, delayDen: 0))
check(slow?.durationMs == 30, "delay denominator 0 means 100: \(String(describing: slow?.durationMs))")
let animatedGif = DiddyImageSniffer.info(gif(frames: 2, delays: [5, 0]))
check(animatedGif?.type == "image/gif" && animatedGif?.animated == true && animatedGif?.durationMs == 150, "gif: \(String(describing: animatedGif))")
check(DiddyImageSniffer.info(gif(frames: 1, delays: [5]))?.animated == false, "one gif frame is not animated")
let animatedWebp = DiddyImageSniffer.info(webp(frames: 2, durationMs: 40))
check(animatedWebp?.type == "image/webp" && animatedWebp?.animated == true && animatedWebp?.durationMs == 80, "webp: \(String(describing: animatedWebp))")
check(DiddyImageSniffer.info(Data([0xFF, 0xD8, 0xFF] + [UInt8](repeating: 0, count: 20)))?.type == "image/jpeg", "jpeg")
check(DiddyImageSniffer.info(data("not a picture, just some text"))  == nil, "text is no picture")
check(DiddyImageSniffer.info(Data([0x89, 0x50, 0x4E]))  == nil, "too short")
check(DiddyImageSniffer.info(Data(cat(pngSignature, [0, 0, 0, 0xFF], [0x49, 0x48, 0x44, 0x52]))) != nil, "a cut-off png does not crash")

// MARK: Timing of a picture used on its own

typealias E = DiddyEffectImport
let loopsByItself = E.timing(for: animatedPng)
check(loopsByItself.duration == 0 && loopsByItself.loop && loopsByItself.start == 0 && loopsByItself.w == 450 && loopsByItself.h == 880, "a forever-looping picture is never restarted")
let threePlays = E.timing(for: DiddyImageSniffer.info(apng(frames: 2, plays: 3)))
check(threePlays.duration == 250, "a short play lasts at least 250 ms: \(threePlays.duration)")
let longer = E.timing(for: DiddyImageSniffer.info(apng(frames: 2, plays: 3, delayNum: 100, delayDen: 100)))
check(longer.duration == 2000, "two seconds: \(longer.duration)")
check(E.timing(for: nil).duration == 0, "no info")
check(E.checkLayer(nil, bytes: 10) == "Please choose an animated PNG, WebP or GIF with a transparent background.", "no picture")
check(E.checkLayer(DiddyImageInfo(type: "image/jpeg", animated: false, durationMs: 0, plays: 1), bytes: 10) != nil, "jpeg is no layer")
check(E.checkLayer(animatedPng, bytes: 3 * 1024 * 1024) == nil && E.checkLayer(animatedPng, bytes: 3 * 1024 * 1024 + 1) == "A picture of this effect is too large (max 3 MB each).", "3 MB per layer")

// MARK: Effect plan and reading

let config = #"{"title":"Blossom","effects":[{"src":"https://x/a.apng","start":500,"duration":4000,"loop":true,"loopDelay":1000,"position":{"x":10,"y":20},"w":300,"h":600,"z":2},{"src":"https://x/b.apng"}],"reducedMotionSrc":"https://x/red.png","thumbnailPreviewSrc":"https://x/prev.png"}"#
let meta = #"{"name":"Meta name","assets":[{"file":"Phasen/loop_b.apng","roles":["effects[0].src"],"url":"https://x/a.apng"},{"file":"reduziert.png","roles":["reducedMotionSrc"]},{"file":"Vorschau.png","roles":["thumbnailPreviewSrc"]}]}"#
let names = ["Effect/konfiguration.json", "Effect/metadaten.json", "Effect/Phasen/loop_a.apng", "Effect/Phasen/loop_b.apng",
             "Effect/Vorschau.png", "Effect/reduziert.png", "__MACOSX/x.png", "Effect/.hidden.png"]
let plan = E.makePlan(entryNames: names, configText: config, metaText: meta, configPath: "Effect/konfiguration.json")
check(plan.layers.map { $0.entry } == ["Effect/Phasen/loop_b.apng", "Effect/Phasen/loop_a.apng"], "layers: \(plan.layers.map { $0.entry })")
check(plan.layers.first?.timing.start == 500 && plan.layers.first?.timing.duration == 4000 && plan.layers.first?.timing.loopDelay == 1000, "timing of layer 1")
check(plan.layers.first?.timing.x == 10 && plan.layers.first?.timing.y == 20 && plan.layers.first?.timing.w == 300 && plan.layers.first?.timing.h == 600 && plan.layers.first?.timing.z == 2, "box of layer 1")
check(plan.layers.last?.timing.duration == 0 && plan.layers.last?.timing.w == 450, "defaults of layer 2")
check(plan.still == "Effect/reduziert.png" && plan.preview == "Effect/Vorschau.png" && plan.name == "Blossom", "still, preview, name: \(String(describing: plan.still)) \(String(describing: plan.preview)) \(String(describing: plan.name))")
check(plan.fallback == nil, "no fallback with layers")

let noConfig = E.makePlan(entryNames: ["pack/anim.gif", "pack/readme.txt", "pack/preview.png", "pack/loop.webp"], configText: nil, metaText: nil)
check(noConfig.layers.isEmpty && noConfig.fallback == ["pack/loop.webp", "pack/anim.gif", "pack/preview.png"], "fallback order: \(String(describing: noConfig.fallback))")

do {
    let zip = try DiddyZip(makeZip([
        ("Effect/konfiguration.json", data(config)), ("Effect/metadaten.json", data(meta)),
        ("Effect/Phasen/loop_a.apng", apng(frames: 2, plays: 0)), ("Effect/Phasen/loop_b.apng", apng(frames: 3, plays: 0)),
        ("Effect/Vorschau.png", stillPng()), ("Effect/reduziert.png", stillPng()),
    ]))
    let effect = try E.readZip(zip, inflater: inflater)
    check(effect.layers.count == 2 && effect.layers[0].file.name == "loop_b.apng" && effect.layers[1].file.name == "loop_a.apng", "read layers")
    check(effect.layers[0].file.type == "image/png" && effect.layers[0].timing.start == 500, "read timing")
    check(effect.still?.name == "reduziert.png" && effect.preview?.name == "Vorschau.png" && effect.name == "Blossom", "read still, preview, name")
    let value = E.profileValue(effect, layerMxcs: ["mxc://h/AAA", "mxc://h/BBB"], stillMxc: "mxc://h/SSS", previewMxc: nil)
    check(text(value) == #"{"v":{"layers":[{"duration":4000,"h":600,"loop":true,"loopDelay":1000,"mxc":"mxc://h/AAA","start":500,"w":300,"x":10,"y":20,"z":2},{"duration":0,"h":880,"loop":true,"loopDelay":0,"mxc":"mxc://h/BBB","start":0,"w":450,"x":0,"y":0,"z":0}],"name":"Blossom","stillMxc":"mxc://h/SSS"}}"#, "profile value: \(text(value))")
    let reread = DiddyProfileEffect(value)
    check(reread?.layers.count == 2 && reread?.stillMxc == "mxc://h/SSS" && reread?.name == "Blossom", "desktop's reader accepts the value")
} catch { check(false, "effect zip: \(error)") }

do {
    let zip = try DiddyZip(makeZip([("pack/anim.gif", gif(frames: 2, delays: [5, 0])), ("pack/readme.txt", data("hi"))]))
    let effect = try E.readZip(zip, inflater: inflater)
    check(effect.layers.count == 1 && effect.layers[0].file.type == "image/gif" && effect.layers[0].timing.duration == 250, "an unknown layout uses its best animated picture")
    let none = try DiddyZip(makeZip([("pack/readme.txt", data("hi")), ("pack/still.png", stillPng())]))
    do { _ = try E.readZip(none, inflater: inflater); check(false, "no animated picture") }
    catch { check((error as? DiddyZipError)?.message == "This ZIP file has no animated PNG, WebP or GIF for a profile effect.", "message: \(error)") }
    let oversize = try DiddyZip(makeZip([("konfiguration.json", data(#"{"effects":[{}]}"#)), ("a.apng", Data(apng(frames: 2, plays: 0) + Data(count: 3 * 1024 * 1024)))]))
    do { _ = try E.readZip(oversize, inflater: inflater); check(false, "layer too large") }
    catch { check((error as? DiddyZipError)?.message == "A picture of this effect is too large (max 3 MB each).", "layer size message: \(error)") }
} catch { check(false, "fallback zips: \(error)") }

do {
    let single = try E.readImage(name: "My Effect.apng", data: apng(frames: 2, plays: 0))
    check(single.name == "My Effect" && single.layers.count == 1 && single.layers[0].timing.duration == 0, "a single picture")
    do { _ = try E.readImage(name: "x.png", data: data("not a picture at all, sorry")); check(false, "text as an effect") } catch {}
    do { _ = try E.readImage(name: "x.jpg", data: Data([0xFF, 0xD8, 0xFF] + [UInt8](repeating: 0, count: 20))); check(false, "jpeg as an effect") } catch {}
} catch { check(false, "single picture: \(error)") }

// MARK: Frame

typealias F = DiddyFrameImport
let frameConfig = #"{"inner_width":1000,"overflow_top":50,"layers":[{"id":"top01","order":"front","anchor":"top"},{"id":"bot02","anchor":"bottom","order":"back"},{"id":12}]}"#
let framePlan = F.makePlan(entryNames: ["konfiguration.json", "Ebenen/frame_top01.png", "Ebenen/frame_bot02.png", "Ebenen/spare.webp", "Vorschau.png"],
                           configText: frameConfig, metaText: nil, configPath: "konfiguration.json")
check(framePlan.layers.map { $0.entry } == ["Ebenen/frame_top01.png", "Ebenen/frame_bot02.png", "Ebenen/spare.webp"], "frame layers: \(framePlan.layers.map { $0.entry })")
check(framePlan.layers.map { $0.anchor } == ["top", "bottom", "top"] && framePlan.layers.map { $0.order } == ["front", "back", "front"], "frame order and anchor: \(framePlan.layers.map { $0.anchor })")
check(framePlan.geometry.innerWidth == 1000 && framePlan.geometry.overflowTop == 50 && framePlan.geometry.overflowBottom == 0, "frame geometry")
let pair = F.makePlan(entryNames: ["set_top.png", "set_bottom.png", "readme.txt"], configText: nil, metaText: nil)
check(pair.layers.map { $0.entry } == ["set_top.png", "set_bottom.png"] && pair.layers.map { $0.anchor } == ["top", "bottom"], "top and bottom pair: \(pair.layers.map { $0.entry })")
check(pair.geometry == DiddyProfileFrame.clampGeometry([:]) && pair.geometry.innerWidth == 1200, "default geometry")
let fill = F.makePlan(entryNames: ["ring.png", "contact-sheet.png"], configText: nil, metaText: nil)
check(fill.layers.map { $0.entry } == ["ring.png"] && fill.layers.first?.anchor == "fill" && fill.layers.first?.order == "front", "one picture covers the card")
check(F.makePlan(entryNames: ["a.txt"], configText: nil, metaText: nil).layers.isEmpty, "nothing to use")
check(F.checkLayer(type: "image/gif", bytes: 10) == "Please choose a PNG or WebP with a transparent background.", "gif is no frame layer")
check(F.checkLayer(type: "image/png", bytes: 2 * 1024 * 1024 + 1) == "A picture of this frame is too large (max 2 MB each).", "2 MB per frame layer")

do {
    let zip = try DiddyZip(makeZip([
        ("konfiguration.json", data(frameConfig)), ("Ebenen/frame_top01.png", stillPng()), ("Ebenen/frame_bot02.png", stillPng()), ("Ebenen/spare.webp", webp(frames: 1, durationMs: 10)),
    ]))
    let frame = try F.readZip(zip, inflater: inflater)
    check(frame.layers.count == 3 && frame.layers[2].file.type == "image/webp" && frame.geometry.innerWidth == 1000, "frame zip")
    let value = F.profileValue(frame, layerMxcs: ["mxc://h/A", "mxc://h/B", "mxc://h/C"])
    check(text(value) == #"{"v":{"innerWidth":1000,"layers":[{"anchor":"top","mxc":"mxc://h/A","order":"front"},{"anchor":"bottom","mxc":"mxc://h/B","order":"back"},{"anchor":"top","mxc":"mxc://h/C","order":"front"}],"overflowBottom":0,"overflowHorizontal":0,"overflowTop":50}}"#, "frame value: \(text(value))")
    let reread = DiddyProfileFrame(value)
    check(reread?.layers.count == 3 && reread?.geometry.innerWidth == 1000, "desktop's reader accepts the frame")
    let one = try F.readImage(name: "Gold Ring.png", data: stillPng())
    check(one.name == "Gold Ring" && one.layers[0].anchor == "fill" && one.geometry.innerWidth == 1200, "a single frame picture")
    do { _ = try F.readImage(name: "x.gif", data: gif(frames: 2, delays: [1, 1])); check(false, "gif as frame") } catch {}
    let empty = try DiddyZip(makeZip([("readme.txt", data("hi"))]))
    do { _ = try F.readZip(empty, inflater: inflater); check(false, "no picture") }
    catch { check((error as? DiddyZipError)?.message == "This ZIP file has no PNG or WebP for a profile frame.", "message: \(error)") }
} catch { check(false, "frame zip: \(error)") }

// MARK: Nameplate

typealias N = DiddyNameplateImport
do {
    let zip = try DiddyZip(makeZip([
        ("a/loop.webm", data("video")), ("a/still.png", stillPng()), ("a/loop.gif", gif(frames: 2, delays: [5, 5])),
        ("a/meta.json", data(#"{"x":{"gradient_colours":"[16711680, 255]"}}"#)), ("__MACOSX/a/loop.apng", data("x")),
    ]))
    let content = try N.read(zip, inflater: inflater)
    check(content.name == "loop.gif" && content.type == "image/gif" && content.color == "#ff0000", "nameplate pick: \(content.name) \(content.type) \(String(describing: content.color))")
    let videoOnly = try DiddyZip(makeZip([("loop.webm", data("video")), ("loop.mp4", data("video"))]))
    check(try N.read(videoOnly, inflater: inflater).name == "loop.webm", "webm before mp4 on desktop")
    check(try N.read(videoOnly, inflater: inflater, playsWebM: false).name == "loop.mp4", "mp4 when webm cannot be played")
    let webmOnly = try DiddyZip(makeZip([("loop.webm", data("video"))]))
    do { _ = try N.read(webmOnly, inflater: inflater, playsWebM: false); check(false, "webm only") }
    catch { check((error as? DiddyZipError)?.message == "This ZIP only has a WebM video, which this device cannot play.", "webm message: \(error)") }
    let nothing = try DiddyZip(makeZip([("readme.txt", data("hi"))]))
    do { _ = try N.read(nothing, inflater: inflater); check(false, "nothing") }
    catch { check((error as? DiddyZipError)?.message == "This ZIP file has no video or image for a nameplate.", "nothing message: \(error)") }
} catch { check(false, "nameplate zip: \(error)") }
check(N.colorFromMetadata(#"{"gradient_colours":["#ABCDEF"]}"#) == "#abcdef", "string colour")
check(N.colorFromMetadata(#"{"gradient_colours":[65280]}"#) == "#00ff00", "number colour with zeros")
check(N.colorFromMetadata(#"{"gradient_colours":[]}"#) == nil && N.colorFromMetadata("{}") == nil && N.colorFromMetadata("nope") == nil, "no colour")
check(N.colorFromMetadata(#"{"gradient_colours":[16777216]}"#) == nil && N.colorFromMetadata(#"{"gradient_colours":[-1]}"#) == nil, "out of range")
check(N.colorFromMetadata(#"{"gradient_colours":["red"]}"#) == nil, "colour names are not accepted")
check(N.colorFromMetadata(#"{"a":{"b":{"c":{"d":{"gradient_colours":[1]}}}}}"#) == nil, "too deep")
check(N.colorFromMetadata(#"{"a":{"b":{"c":{"gradient_colours":[1]}}}}"#) == "#000001", "three levels deep")

if failures == 0 { print("diddyzip_check: all checks passed") } else { print("diddyzip_check: \(failures) failure(s)"); exit(1) }
