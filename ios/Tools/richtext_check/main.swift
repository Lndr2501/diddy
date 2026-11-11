// Checks for Diddy/Matrix/RichText.swift and MessageEmbeds.swift: formatted messages, link
// previews, locations and sticker sizes. Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/RichText.swift Diddy/Matrix/MessageEmbeds.swift Tools/richtext_check/main.swift -o /tmp/richtext_check && /tmp/richtext_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

func plain(_ text: String = "") -> RichInline { .text(text, RichStyle()) }
func html(_ source: String) -> RichDocument { RichText.parse(html: source) }
func markdown(_ source: String) -> RichDocument { RichText.parse(markdown: source) }

// MARK: HTML

do {
    let doc = html("<b>hi</b> <i>there</i>")
    check(doc.blocks.count == 1, "bold and italic make one paragraph")
    check(doc.plainText == "hi there", "text of bold and italic: \(doc.plainText)")
    if case .paragraph(let inlines)? = doc.blocks.first, inlines.count == 3,
       case .text(_, let first) = inlines[0], case .text(_, let last) = inlines[2] {
        check(first.bold && !first.italic, "first run is bold")
        check(last.italic && !last.bold, "last run is italic")
    } else {
        check(false, "paragraph with three runs")
    }
}

do {
    let doc = html("<span data-mx-spoiler>secret</span> visible")
    check(doc.spoilers == 1, "one spoiler")
    check(doc.plainText == "secret visible", "spoiler text kept: \(doc.plainText)")
    if case .paragraph(let inlines)? = doc.blocks.first, case .text(_, let style) = inlines[0] {
        check(style.spoiler == 0, "first run belongs to spoiler 0")
    } else {
        check(false, "spoiler paragraph")
    }
    let two = html("<span data-mx-spoiler=\"why\">a</span> <span data-mx-spoiler>b</span>")
    check(two.spoilers == 2, "two spoilers are numbered apart")
}

do {
    let doc = html("<pre><code class=\"language-swift\">let x = 1\n</code></pre>")
    check(doc.blocks == [.code("let x = 1", label: "swift")], "code block with language: \(doc.blocks)")
    let plainPre = html("<pre>a\nb</pre>")
    check(plainPre.blocks == [.code("a\nb", label: nil)], "pre without code: \(plainPre.blocks)")
    let inline = html("use <code>x</code> here")
    if case .paragraph(let inlines)? = inline.blocks.first, inlines.count == 3, case .text(let text, let style) = inlines[1] {
        check(text == "x" && style.code, "inline code")
    } else {
        check(false, "inline code paragraph")
    }
}

do {
    let doc = html("<blockquote>q</blockquote><ul><li>a</li><li>b</li></ul>")
    check(doc.blocks.count == 2, "quote and list")
    check(doc.blocks.first == .quote([.paragraph([plain("q")])]), "quote content")
    check(doc.blocks.last == .list(ordered: false, start: 1, items: [[.paragraph([plain("a")])], [.paragraph([plain("b")])]]), "list items")
    let ordered = html("<ol start=\"3\"><li>x</li></ol>")
    check(ordered.blocks == [.list(ordered: true, start: 3, items: [[.paragraph([plain("x")])]])], "ordered list start")
    let heading = html("<h2>Title</h2>")
    check(heading.blocks == [.heading(level: 2, [plain("Title")])], "heading")
    check(html("<hr>").blocks == [.rule], "rule")
}

do {
    let doc = html("hi <img data-mx-emoticon src=\"mxc://s/e\" alt=\":smile:\" height=\"32\"> there <img data-mx-emoticon src=\"mxc://s/e\" alt=\":smile:\">")
    check(doc.emojiURLs == ["mxc://s/e"], "custom emoji found once: \(doc.emojiURLs)")
    check(doc.plainText == "hi :smile: there :smile:", "emoji alt in text: \(doc.plainText)")
    let outside = html("<img src=\"https://example.org/a.png\" alt=\"pic\">")
    check(outside.emojiURLs.isEmpty, "an outside picture is no custom emoji")
    check(outside.plainText == "pic", "an outside picture is shown by its name")
}

do {
    check(html("<mx-reply><blockquote>old</blockquote></mx-reply>new").plainText == "new", "reply quote dropped")
    check(html("<script>alert(1)</script>ok").plainText == "ok", "script dropped")
    check(html("a &amp; b &lt;c&gt; &#x41;&#66;").plainText == "a & b <c> AB", "entities: \(html("a &amp; b &lt;c&gt; &#x41;&#66;").plainText)")
    check(html("line one<br>line two").plainText == "line one\nline two", "line break")
    check(html("<b>unclosed <i>text").plainText == "unclosed text", "unclosed tags")
    check(html("</b>stray end").plainText == "stray end", "stray end tag")
    check(html("1 < 2 and 3 > 2").plainText == "1 < 2 and 3 > 2", "angle brackets in text: \(html("1 < 2 and 3 > 2").plainText)")
    check(html("").blocks.isEmpty, "empty html")
    let link = html("<a href=\"https://example.org\">site</a>")
    if case .paragraph(let inlines)? = link.blocks.first, case .text(_, let style) = inlines[0] {
        check(style.link == "https://example.org", "link target")
    } else {
        check(false, "link paragraph")
    }
}

do {
    // Hostile input must not crash or stall.
    let nested = html(String(repeating: "<b>", count: 3000) + "x")
    check(nested.plainText == "x", "deep nesting: \(nested.plainText.prefix(20))")
    let quotes = html(String(repeating: "<blockquote>", count: 500) + "deep" + String(repeating: "</blockquote>", count: 500))
    check(quotes.plainText.contains("deep"), "deep quotes keep their text")
    let tags = html(String(repeating: "<a \"", count: 4000))
    check(!tags.blocks.isEmpty || tags.blocks.isEmpty, "unclosed tags finish")
}

do {
    let doc = html("<p>a</p>").italicized()
    if case .paragraph(let inlines)? = doc.blocks.first, case .text(_, let style) = inlines[0] {
        check(style.italic, "italicized text")
    } else {
        check(false, "italicized paragraph")
    }
}

// MARK: Markdown

do {
    let doc = markdown("**bold** and _it_")
    check(doc.plainText == "bold and it", "markers dropped: \(doc.plainText)")
    if case .paragraph(let inlines)? = doc.blocks.first, inlines.count == 3,
       case .text(_, let bold) = inlines[0], case .text(_, let italic) = inlines[2] {
        check(bold.bold, "bold")
        check(italic.italic, "italic")
    } else {
        check(false, "bold and italic runs: \(doc.blocks)")
    }
}

do {
    let doc = markdown("this is ||secret|| ok")
    check(doc.spoilers == 1, "markdown spoiler")
    check(doc.plainText == "this is secret ok", "spoiler text: \(doc.plainText)")
    let code = markdown("use `x*y*z` now")
    check(code.plainText == "use x*y*z now", "code span keeps its stars: \(code.plainText)")
    check(markdown("snake_case_name").plainText == "snake_case_name", "snake case stays")
    check(markdown("see https://x.org/a_b_c ok").plainText == "see https://x.org/a_b_c ok", "links keep underscores")
    check(markdown("\\*not italic\\*").plainText == "*not italic*", "escapes")
    check(markdown("~~gone~~").plainText == "gone", "strike")
    check(markdown("__under__").plainText == "under", "underline")
}

do {
    let doc = markdown("```swift\nlet a = 1\n```\nafter")
    check(doc.blocks.count == 2, "fence and paragraph: \(doc.blocks)")
    check(doc.blocks.first == .code("let a = 1", label: "swift"), "fenced code")
    let unclosed = markdown("```\nnot closed")
    if case .code? = unclosed.blocks.first { check(false, "an unclosed fence is no code block") }
}

do {
    let doc = markdown("> quoted\n- one\n- two\n1. first")
    check(doc.blocks.count == 3, "quote and two lists: \(doc.blocks)")
    check(doc.blocks.first == .quote([.paragraph([plain("quoted")])]), "quote")
    if doc.blocks.count == 3 {
        check(doc.blocks[1] == .list(ordered: false, start: 1, items: [[.paragraph([plain("one")])], [.paragraph([plain("two")])]]), "bullet list")
        check(doc.blocks[2] == .list(ordered: true, start: 1, items: [[.paragraph([plain("first")])]]), "numbered list")
    }
    check(markdown("## Title").blocks == [.heading(level: 2, [plain("Title")])], "heading")
    if case .heading? = markdown("#nospace").blocks.first { check(false, "no heading without a space") }
    let nested = markdown("- a\n  - b\n- c")
    if case .list(_, _, let items)? = nested.blocks.first, nested.blocks.count == 1 {
        check(items.count == 2, "nested list keeps two top items")
        check(items.first?.count == 2, "first item has its text and the nested list")
    } else {
        check(false, "nested list: \(nested.blocks)")
    }
}

do {
    let doc = markdown("[site](https://example.org/x) done")
    if case .paragraph(let inlines)? = doc.blocks.first, case .text(let text, let style) = inlines[0] {
        check(text == "site" && style.link == "https://example.org/x", "markdown link")
    } else {
        check(false, "markdown link paragraph")
    }
    let mention = markdown("[@Na\\_me](https://matrix.to/#/@a:b.c) hi")
    if case .paragraph(let inlines)? = mention.blocks.first, case .text(let text, let style) = inlines[0] {
        check(text == "@Na_me" && style.link == "https://matrix.to/#/@a:b.c", "mention link with escaped name: \(text)")
    } else {
        check(false, "mention paragraph")
    }
}

do {
    // Hostile input must not crash or stall.
    _ = markdown(String(repeating: "*", count: 6000))
    _ = markdown(String(repeating: "*a ", count: 3000))
    _ = markdown(String(repeating: "[a](", count: 3000))
    _ = markdown(String(repeating: "```x\n", count: 2000))
    _ = markdown(String(repeating: "> ", count: 200) + "deep")
    _ = markdown(String(repeating: "  - x\n", count: 3000))
    check(true, "hostile markdown finished")
    check(RichText.accepts("short"), "short text is formatted")
    check(!RichText.accepts(String(repeating: "a", count: 60_000)), "very long text keeps the plain rendering")
}

// MARK: Which messages get the rich rendering

do {
    check(RichSource.choose(body: "hello", html: nil) == nil, "plain text stays plain")
    check(RichSource.choose(body: "hi ||x||", html: nil) == .markdown("hi ||x||"), "plain body with a spoiler")
    check(RichSource.choose(body: "hi", html: "<b>hi</b>") == .html("<b>hi</b>"), "html body")
    check(RichSource.choose(body: "x", html: "<mx-reply>x</mx-reply>") == nil, "html with nothing to show")
    check(RichSource.looksFormatted("1. a"), "numbered line")
    check(RichSource.looksFormatted("- dash"), "dash line")
    check(RichSource.looksFormatted("# tag"), "heading line")
    check(RichSource.looksFormatted("text\n> quote"), "quote line")
    check(!RichSource.looksFormatted("#tag"), "hash tag is no heading")
    check(!RichSource.looksFormatted("version 1.5 is out"), "version is no list")
    check(!RichSource.looksFormatted("a > b"), "greater than is no quote")
    check(!RichSource.looksFormatted("[x](https://matrix.to/#/@a:b.c) hi"), "mention link stays plain")
}

// MARK: Link previews

do {
    check(LinkPreviewURLs.find(in: "see https://example.org/a, and http://foo.bar/x.") == ["https://example.org/a", "http://foo.bar/x"], "two links, punctuation dropped: \(LinkPreviewURLs.find(in: "see https://example.org/a, and http://foo.bar/x."))")
    check(LinkPreviewURLs.find(in: "https://a.org/1 https://b.org/2 https://c.org/3").count == 2, "at most two previews")
    check(LinkPreviewURLs.find(in: "https://a.org/1 https://a.org/1").count == 1, "no repeats")
    check(LinkPreviewURLs.find(in: "https://matrix.to/#/@a:b.c").isEmpty, "matrix.to is a mention, no preview")
    check(LinkPreviewURLs.find(in: "[site](https://example.org/p) x") == ["https://example.org/p"], "markdown link")
    check(LinkPreviewURLs.find(in: "just words, no links").isEmpty, "no links")
    check(LinkPreviewURLs.find(in: "https://").isEmpty, "scheme alone")
    check(LinkPreviewURLs.find(in: "(see https://example.org/q)") == ["https://example.org/q"], "closing bracket ends the link")

    let json = "{\"og:title\":\"T\",\"og:description\":\"D\",\"og:image\":\"mxc://s/x\",\"og:site_name\":\"Site\"}"
    let data = LinkPreviewData(json: json)
    check(data?.title == "T" && data?.description == "D" && data?.siteName == "Site" && data?.imageURL == "mxc://s/x", "preview fields")
    check(LinkPreviewData(json: "{\"og:image\":\"https://x.org/a.png\",\"og:title\":\"T\"}")?.imageURL == nil, "only mxc pictures are used")
    check(LinkPreviewData(json: "{}") == nil, "empty preview is none")
    check(LinkPreviewData(json: "not json") == nil, "bad json is none")
    check(LinkPreviewData(json: "{\"og:title\":\"   \"}") == nil, "blank title is none")
}

// MARK: Locations and sizes

do {
    let place = GeoLocation(geoURI: "geo:52.52,13.40;u=35")
    check(place?.latitude == 52.52 && place?.longitude == 13.4, "geo uri")
    check(GeoLocation(geoURI: "geo:52.5,13.4,100") != nil, "geo uri with altitude")
    check(GeoLocation(geoURI: "geo:abc") == nil, "bad geo uri")
    check(GeoLocation(geoURI: "geo:91,0") == nil, "latitude out of range")
    check(GeoLocation(geoURI: "geo:0,181") == nil, "longitude out of range")
    check(GeoLocation(geoURI: "https://example.org") == nil, "not a geo uri")
    let osm = place?.openStreetMapURL?.absoluteString ?? ""
    check(osm.hasPrefix("https://www.openstreetmap.org/?mlat=52.52&mlon=13.4"), "osm link: \(osm)")
    let apple = place?.appleMapsURL(label: "Café")?.absoluteString ?? ""
    check(apple.hasPrefix("https://maps.apple.com/") && apple.contains("q=Caf"), "apple maps link: \(apple)")
    check(place?.appleMapsURL(label: nil)?.absoluteString.contains("q=") == false, "no label, no query")

    let small = MessageMediaSize.sticker(width: 304, height: 152)
    check(small.width == 152 && small.height == 76, "sticker scaled to 152 wide: \(small)")
    check(MessageMediaSize.sticker(width: nil, height: nil).height == 152, "sticker without size")
    check(MessageMediaSize.sticker(width: 1000, height: 10).height == 48, "very flat sticker is at least 48")
    check(MessageMediaSize.sticker(width: 100, height: 10000).height == 456, "very tall sticker is capped")
    check(MessageMediaSize.aspect(width: nil, height: nil) == 4.0 / 3.0, "unknown aspect")
    check(MessageMediaSize.aspect(width: 200, height: 100) == 2, "aspect")
    check(MessageMediaSize.aspect(width: 1000, height: 100) == 3, "very wide is capped")
    check(MessageMediaSize.aspect(width: 100, height: 1000) == 0.4, "very tall is capped")
}

if failures == 0 { print("ALL OK") } else { print("\(failures) FAILED"); exit(1) }
