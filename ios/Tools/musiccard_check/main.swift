// Checks for Diddy/Matrix/MusicCard.swift and Diddy/App/ShareHandoff.swift. Run from the ios folder:
//   swiftc Diddy/Matrix/MusicCard.swift Diddy/App/ShareHandoff.swift Tools/musiccard_check/main.swift -o /tmp/musiccard_check && /tmp/musiccard_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

func event(_ card: String) -> String {
    #"{"type":"m.room.message","content":{"msgtype":"m.text","body":"x","app.diddy.music":\#(card)}}"#
}
func parse(_ card: String) -> MusicCard? { MusicCard.card(originalJson: event(card), latestEditJson: nil) }

// reading
if let card = parse(#"{"v":1,"title":" Love Sosa ","artist":"Chief Keef","url":"https://music.apple.com/de/song/love-sosa/1440841363","artwork":"mxc://example.org/abc","preview":"https://audio-ssl.itunes.apple.com/x.m4a","lyrics":["You can meet my llama",""," ",3],"time":1.5,"service":"apple"}"#) {
    check(card.title == "Love Sosa", "title trimmed")
    check(card.artist == "Chief Keef", "artist")
    check(card.artwork == "mxc://example.org/abc", "mxc kept")
    check(card.preview?.host == "audio-ssl.itunes.apple.com", "apple preview kept")
    check(card.lyrics == ["You can meet my llama"], "only text lines")
    check(card.time == 1.5 && card.service == "apple", "time and service")
} else { check(false, "card parses") }
check(parse(#"{"v":2,"title":"x","url":"https://a.b/c"}"#) == nil, "unknown version")
check(parse(#"{"v":1,"url":"https://a.b/c"}"#) == nil, "title needed")
check(parse(#"{"v":1,"title":"x","url":"http://a.b/c"}"#) == nil, "https only")
check(parse(#"{"v":1,"title":"x","url":"javascript:alert(1)"}"#) == nil, "no script links")
if let card = parse(#"{"v":1,"title":"x","url":"https://a.b/c","preview":"https://evil.example/x.m4a","artwork":"https://a.b/x.png","service":"evil","time":-3}"#) {
    check(card.preview == nil, "preview from other hosts dropped")
    check(card.artwork == nil, "artwork must be mxc")
    check(card.service == "other" && card.time == nil, "service and time checked")
} else { check(false, "card with bad extras still parses") }
let many = (0..<20).map { "\"line \($0)\"" }.joined(separator: ",")
check(parse(#"{"v":1,"title":"x","url":"https://a.b/c","lyrics":[\#(many)]}"#)?.lyrics.count == MusicCard.maxLines, "lines capped")
let edit = #"{"type":"m.room.message","content":{"body":"x","m.new_content":{"body":"y","app.diddy.music":{"v":1,"title":"New","url":"https://a.b/c"}}}}"#
check(MusicCard.card(originalJson: event(#"{"v":1,"title":"Old","url":"https://a.b/c"}"#), latestEditJson: edit)?.title == "New", "edit wins")

// writing: round trip
var card = MusicCard(title: "Love Sosa", artist: "Chief Keef", url: URL(string: "https://music.apple.com/de/song/x/1")!,
                     artwork: "mxc://example.org/a", preview: URL(string: "https://audio-ssl.itunes.apple.com/x.m4a"),
                     lyrics: ["You can meet my <llama>"], time: 1, service: "apple")
let content = card.content()
check(content["msgtype"] as? String == "m.text", "text message")
check((content["body"] as? String)?.contains("Love Sosa — Chief Keef") == true, "body has title and artist")
check((content["formatted_body"] as? String)?.contains("&lt;llama&gt;") == true, "html escaped")
check(MusicCard(content: content) == card, "round trip")
card.remoteArtwork = URL(string: "https://is1-ssl.mzstatic.com/x.jpg")
check((card.content()[MusicCard.key] as? [String: Any])?["remoteArtwork"] == nil, "web cover never sent")
check(MusicCard.clock(65) == "1:05" && MusicCard.clock(1.9) == "0:01", "clock")

// Apple Music links
check(MusicCard.appleMusicSong(URL(string: "https://music.apple.com/de/song/love-sosa/1440841363")!)! == ("1440841363", "de"), "song link")
check(MusicCard.appleMusicSong(URL(string: "https://music.apple.com/us/album/finally-rich/1440841000?i=1440841363&l=en")!)! == ("1440841363", "us"), "album link with track")
check(MusicCard.appleMusicSong(URL(string: "https://music.apple.com/us/album/finally-rich/1440841000")!) == nil, "album alone")
check(MusicCard.appleMusicSong(URL(string: "https://evil.example/de/song/x/1")!) == nil, "other hosts")
let lookup: [String: Any] = ["results": [["wrapperType": "track", "trackName": "Love Sosa", "artistName": "Chief Keef", "collectionName": "Finally Rich",
                                         "previewUrl": "https://audio-ssl.itunes.apple.com/p.m4a", "artworkUrl100": "https://is1-ssl.mzstatic.com/a/100x100bb.jpg"]]]
if let found = MusicCard.fromLookup(lookup, link: URL(string: "https://music.apple.com/de/song/x/1")!) {
    check(found.title == "Love Sosa" && found.album == "Finally Rich" && found.service == "apple", "lookup fields")
    check(found.remoteArtwork?.absoluteString == "https://is1-ssl.mzstatic.com/a/600x600bb.jpg", "large cover")
    check(found.preview != nil, "preview")
} else { check(false, "lookup parses") }

// lyrics from shared text
let known = MusicCard(title: "Love Sosa", artist: "Chief Keef", url: URL(string: "https://a.b/c")!)
check(MusicCard.lyrics(from: "“You can meet my llama”\nLove Sosa — Chief Keef\nhttps://music.apple.com/x", card: known) == ["You can meet my llama"], "link and heading dropped")
check(MusicCard.lyrics(from: "Line one\n\nLine two\nApple Music", card: nil) == ["Line one", "Line two"], "empty and service lines dropped")

// hand-off between the share extension and the app
check(ShareHandoff.groupId(bundleId: "app.diddy.ios.ABCDE12345") == "group.app.diddy.ios.ABCDE12345", "group of the app")
check(ShareHandoff.groupId(bundleId: "app.diddy.ios.ABCDE12345.share") == "group.app.diddy.ios.ABCDE12345", "group of the extension")
check(ShareHandoff.groupId(bundleId: "app.diddy.ios.share") == "group.app.diddy.ios", "group without team")
let inline = ShareHandoff.inlineURL(text: "You can meet my llama", urls: ["https://music.apple.com/de/song/x/1"])!
if case .inline(let text, let urls)? = ShareHandoff.request(from: inline) {
    check(text == "You can meet my llama" && urls == ["https://music.apple.com/de/song/x/1"], "inline round trip")
} else { check(false, "inline parses") }
if case .stored(let id)? = ShareHandoff.request(from: ShareHandoff.storedURL(id: "0F9A6C1E-1B2C-4D5E-8F90-123456789ABC")) {
    check(id == "0F9A6C1E-1B2C-4D5E-8F90-123456789ABC", "stored id")
} else { check(false, "stored parses") }
check(ShareHandoff.request(from: URL(string: "diddy://share?id=../../etc")!) == nil, "ids are UUIDs only")
check(ShareHandoff.request(from: URL(string: "https://share?id=x")!) == nil, "other schemes")
check(ShareHandoff.safeFileName("../a/b.jpg") == "b.jpg" && ShareHandoff.safeFileName("") == "file", "file names")

if failures == 0 { print("musiccard checks passed") } else { print("\(failures) failures"); exit(1) }
