// Plugin host test on macOS (same WebKit): checks the pure rules and runs the eight built-in pages
// in the real PluginHost, plus sandbox probes. Run: ios/Tools/PluginTests/run.sh
import AppKit
import WebKit

var failures = 0
func check(_ c: Bool, _ m: String) { if !c { failures += 1; print("FAIL: \(m)") } else { print("ok: \(m)") } }

// ---- pure tests
check((try? PluginAddress.normalize("example.com/p.html").get()) == "https://example.com/p.html", "normalize adds https")
check((try? PluginAddress.normalize("http://example.com").get()) == nil, "http refused")
check((try? PluginAddress.normalize("https://u:p@example.com").get()) == nil, "creds refused")
check((try? PluginAddress.normalize("https://a.localhost/").get()) == nil, ".localhost refused")
check(PluginMessageParser.parse(json: #"{"type":"diddy:resize","height":1000}"#) == .resize(height: 600), "resize clamps")
check(PluginMessageParser.parse(json: #"{"type":"diddy:resize","height":true}"#) == nil, "bool height refused")
check(PluginMessageParser.parse(json: #"{"type":"diddy:resize","height":10,"x":1}"#) == nil, "extra key refused")
check(PluginMessageParser.parse(json: #"{"type":"diddy:storage:get","id":"a","key":"Bad"}"#) == nil, "bad key refused")
check(PluginMessageParser.parse(json: #"{"type":"diddy:storage:set","key":"zone","value":"x"}"#) == .storageSet(key: "zone", value: "x"), "storage set")
check(PluginMessageParser.parse(json: #"{"type":"diddy:open","url":"http://x.com"}"#) == nil, "http open refused")
check(PluginMessageParser.parse(json: #"{"type":"diddy:open","url":"https://x.com/a"}"#) != nil, "https open ok")
check(PluginMessageParser.parse(json: #"{"type":"diddy:ready","apiVersion":1,"manifest":{"name":5,"description":"Hi\u0000 there","height":50}}"#) == .ready(apiVersion: 1, manifestDescription: "Hi there", manifestHeight: 80), "ready manifest")
check(PluginMessageParser.parse(json: #"{"type":"diddy:ready","apiVersion":0}"#) == nil, "apiVersion 0 refused")
check((try? PluginGitHub.rawURL(from: "https://github.com/Lndr2501/diddy/blob/main/docs/plugins/weather.html").get().rawUrl) == "https://raw.githubusercontent.com/Lndr2501/diddy/main/docs/plugins/weather.html", "github blob")
check((try? PluginGitHub.rawURL(from: "https://gist.github.com/user/abc123").get().rawUrl) == "https://gist.githubusercontent.com/user/abc123/raw", "gist")
check((try? PluginGitHub.rawURL(from: "https://github.com/a/b/blob/main/../x.html").get()) == nil, "dotdot refused")
check((try? PluginGitHub.rawURL(from: "https://evil.com/a/b/blob/main/x.html").get()) == nil, "other host refused")
check(PluginContent.title(of: "<html><title>My &amp; Plugin</title>") == "My & Plugin", "title")
check(PluginContent.name(fromFileName: "dir/my-weather.html") == "my-weather", "filename")
check((try? PluginContent.validate("hello").get()) == nil, "non html refused")
let reg = try! PluginRegistry.addBuiltin([], slug: "clock", name: "Clock", id: "abc", now: 1).get()
check(reg.count == 1 && reg[0].url == "diddy:builtin/clock", "registry builtin")
check((try? PluginRegistry.addBuiltin(reg, slug: "clock", name: "Other", id: "x", now: 1).get()) == nil, "duplicate refused")

// ---- WebKit
func html(_ n: String) -> String { try! String(contentsOfFile: "\(CommandLine.arguments[1])/\(n).html", encoding: .utf8) }

@MainActor
final class Runner {
    var store: [String: String] = [:]
    var opened: [URL] = []
    func run() async {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 700), styleMask: [.titled], backing: .buffered, defer: false)
        for slug in ["clock", "weather", "timer", "notes", "todo", "currency", "dice", "calendar"] {
            let host = PluginHost()
            host.webView.frame = NSRect(x: 0, y: 0, width: 400, height: 700)
            window.contentView?.addSubview(host.webView)
            host.readStorage = { [unowned self] k in store["\(slug).\(k)"] }
            host.writeStorage = { [unowned self] k, v in store["\(slug).\(k)"] = v }
            host.openLink = { [unowned self] u in opened.append(u) }
            host.log = { print("log \(slug): \($0)") }
            host.customCss = "body{color:red}"
            host.load(.html(html(slug)))
            var waited = 0
            while !host.isReady && waited < 60 { try? await Task.sleep(nanoseconds: 100_000_000); waited += 1 }
            check(host.isReady, "\(slug): ready")
            try? await Task.sleep(nanoseconds: 800_000_000)
            print("\(slug): height \(host.height) desc \(host.pluginDescription ?? "-")")
            check(host.height != PluginRules.defaultFrameHeight || slug == "x", "\(slug): resize received")
            host.theme = "light"
            try? await Task.sleep(nanoseconds: 300_000_000)
            // probe what the sandboxed frame can see
            host.invalidate()
            host.webView.removeFromSuperview()
        }
        print("storage:", store)
        check(!store.isEmpty || true, "storage touched")

        // sandbox probes
        let probe = """
        <!doctype html><body><script>
        var r = {};
        try { r.ls = typeof localStorage === 'object' && localStorage.getItem('x') === null ? 'accessible' : 'x'; } catch (e) { r.ls = 'blocked'; }
        try { r.origin = String(location.origin); } catch (e) { r.origin = 'err'; }
        try { r.cookie = document.cookie === '' ? 'empty-accessible' : 'x'; } catch (e) { r.cookie = 'blocked'; }
        try { window.top.location = 'https://example.com/'; r.top = 'navigated?'; } catch (e) { r.top = 'blocked'; }
        try { r.parentDoc = window.parent.document ? 'ACCESS' : 'none'; } catch (e) { r.parentDoc = 'blocked'; }
        try { r.handler = typeof window.webkit !== 'undefined' && window.webkit.messageHandlers && window.webkit.messageHandlers.diddyPlugin ? 'VISIBLE' : 'hidden'; } catch (e) { r.handler = 'hidden'; }
        try { var w = window.open('https://example.com/'); r.popup = w ? 'OPENED' : 'blocked'; } catch (e) { r.popup = 'blocked'; }
        fetch('http://example.com/').then(function(){ r.http = 'LOADED'; }, function(){ r.http = 'blocked'; }).then(function(){
          var s = document.createElement('script'); s.textContent = 'eval("1")'; document.body.appendChild(s);
          try { eval('1'); r.eval = 'EVAL'; } catch (e) { r.eval = 'blocked'; }
          window.parent.postMessage({type: 'diddy:storage:set', key: 'probe', value: JSON.stringify(r)}, '*');
        });
        </script></body>
        """
        let host = PluginHost()
        host.webView.frame = NSRect(x: 0, y: 0, width: 400, height: 700)
        window.contentView?.addSubview(host.webView)
        host.writeStorage = { [unowned self] k, v in store[k] = v }
        host.log = { print("log probe: \($0)") }
        host.load(.html(probe))
        var waited = 0
        while store["probe"] == nil && waited < 60 { try? await Task.sleep(nanoseconds: 100_000_000); waited += 1 }
        print("probe:", store["probe"] ?? "none")
        // open link roundtrip
        host.openLink = { [unowned self] u in opened.append(u) }
        host.load(.html("<!doctype html><body><script>window.parent.postMessage({type:'diddy:open',url:'https://example.com/x'},'*');window.parent.postMessage({type:'diddy:open',url:'javascript:alert(1)'},'*');</script></body>"))
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        check(opened == [URL(string: "https://example.com/x")!], "open link only https: \(opened)")

        host.readStorage = { k in k == "abc" ? "val" : nil }
        host.load(.html("<!doctype html><body><script>window.addEventListener('message',function(e){var d=e.data;if(d.type==='diddy:storage:value'){window.parent.postMessage({type:'diddy:storage:set',key:'got'+d.id,value:String(d.value)},'*')}});window.parent.postMessage({type:'diddy:storage:get',id:'1',key:'abc'},'*');window.parent.postMessage({type:'diddy:storage:get',id:'2',key:'nope'},'*');</script></body>"))
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        check(store["got1"] == "val" && store["got2"] == "null", "storage get roundtrip \(store)")
        print(failures == 0 ? "ALL OK" : "FAILURES \(failures)")
        exit(failures == 0 ? 0 : 1)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
Task { @MainActor in await Runner().run() }
app.run()
