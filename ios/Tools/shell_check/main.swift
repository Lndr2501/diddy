// Checks for Diddy/App/ShellLogic.swift (status menu, sync banner, update check, matrix.to links,
// plugin dock, keyboard navigation, welcome guide). Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/App/ShellLogic.swift Tools/shell_check/main.swift -o /tmp/shell_check && /tmp/shell_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

// MARK: Own status

check(OwnStatusOptions.all.map(\.status) == ["online", "idle", "dnd", "invisible"], "status order like desktop")
check(OwnStatusOptions.info("dnd").shownLabel == "Busy", "DND is short in the panel")
check(OwnStatusOptions.info("dnd").label == "Do Not Disturb", "DND label")
check(OwnStatusOptions.info("idle").shownLabel == "Idle", "idle has no short label")
check(OwnStatusOptions.info(nil).status == "online", "missing status is online")
check(OwnStatusOptions.info("weird").status == "online", "unknown status is online")

// MARK: Sync banner

check(SyncBannerLogic.banner(state: "running", started: true, everRan: true) == nil, "running shows nothing")
check(SyncBannerLogic.banner(state: "idle", started: true, everRan: false) == .connecting, "idle before first run connects")
check(SyncBannerLogic.banner(state: "idle", started: true, everRan: true) == nil, "idle after a run shows nothing")
check(SyncBannerLogic.banner(state: "offline", started: true, everRan: true) == .reconnecting, "offline reconnects")
check(SyncBannerLogic.banner(state: "error", started: true, everRan: true) == .error, "error")
check(SyncBannerLogic.banner(state: "terminated", started: true, everRan: true) == nil, "stopped shows nothing")
check(SyncBannerLogic.banner(state: "error", started: false, everRan: false) == nil, "not started shows nothing")
check(SyncBannerKind.reconnecting.text == "Verbindung verloren – erneuter Versuch …", "desktop wording")

// MARK: Update check

check(UpdateCheckLogic.compareVersions("1.10.0", "1.9.2") == 1, "1.10 > 1.9")
check(UpdateCheckLogic.compareVersions("1.6", "1.6.0") == 0, "missing part is 0")
check(UpdateCheckLogic.compareVersions("1.5.9", "1.6.0") == -1, "older")
check(UpdateCheckLogic.version(fromTag: "v1.6.0") == "1.6.0", "desktop tag")
check(UpdateCheckLogic.version(fromTag: "ios-v1.6.1") == "1.6.1", "iOS tag")
check(UpdateCheckLogic.version(fromTag: "ios-v1.1.0-beta.1") == nil, "beta tag is not a version")
check(UpdateCheckLogic.version(fromTag: "nightly") == nil, "other tag")
check(UpdateCheckLogic.isGithubUrl("https://github.com/Lndr2501/diddy/releases/tag/v1.6.0"), "github page")
check(UpdateCheckLogic.isGithubUrl("https://objects.githubusercontent.com/x.ipa"), "github cdn")
check(!UpdateCheckLogic.isGithubUrl("http://github.com/x"), "http refused")
check(!UpdateCheckLogic.isGithubUrl("https://evil.example/github.com"), "other host refused")

func release(_ tag: String, draft: Bool = false, pre: Bool = false, assets: [String]) -> [String: Any] {
    [
        "tag_name": tag, "draft": draft, "prerelease": pre,
        "html_url": "https://github.com/Lndr2501/diddy/releases/tag/\(tag)",
        "assets": assets.map { ["name": $0, "browser_download_url": "https://github.com/Lndr2501/diddy/releases/download/\(tag)/\($0)"] },
    ]
}
let list: [Any] = [
    release("ios-v1.8.0-beta.1", pre: true, assets: ["Diddy_1.8.0_iOS_unsigned.ipa"]),
    release("v1.7.1", draft: true, assets: ["Diddy_1.7.1_iOS_unsigned.ipa"]),
    release("v1.7.0", assets: ["Diddy_1.7.0_aarch64.dmg", "Diddy_1.7.0_iOS.ipa", "Diddy_1.7.0_iOS_unsigned.ipa"]),
    release("ios-v1.6.2", assets: ["Diddy_1.6.2_iOS_unsigned.ipa"]),
    release("v1.9.0", assets: ["Diddy_1.9.0_aarch64.dmg"]),
    "garbage",
]
let newest = UpdateCheckLogic.newest(in: list)
check(newest?.version == "1.7.0", "newest stable release with an IPA, got \(String(describing: newest?.version))")
check(newest?.ipaUrl?.hasSuffix("Diddy_1.7.0_iOS_unsigned.ipa") == true, "unsigned IPA preferred")
check(newest?.pageUrl == "https://github.com/Lndr2501/diddy/releases/tag/v1.7.0", "release page")
check(UpdateCheckLogic.newest(in: ["x": 1]) == nil, "not a list")
var evil = release("v2.0.0", assets: ["Diddy_2.0.0_iOS_unsigned.ipa"])
evil["html_url"] = "https://evil.example/"
evil["assets"] = [["name": "Diddy_2.0.0_iOS_unsigned.ipa", "browser_download_url": "https://evil.example/a.ipa"]]
check(UpdateCheckLogic.parseRelease(evil) == nil, "a release whose IPA is not on GitHub is ignored")
check(UpdateCheckLogic.isUpdateWanted(latest: "1.7.0", current: "1.6.0", skipped: ""), "newer wanted")
check(!UpdateCheckLogic.isUpdateWanted(latest: "1.7.0", current: "1.6.0", skipped: "1.7.0"), "dismissed")
check(!UpdateCheckLogic.isUpdateWanted(latest: "1.6.0", current: "1.6.0", skipped: ""), "same version")

// MARK: matrix.to

check(MatrixToLink.parse("https://matrix.to/#/@lndr:matrix.tllx.eu") == .user("@lndr:matrix.tllx.eu"), "user")
check(MatrixToLink.parse("https://matrix.to/#/%40lndr%3Amatrix.tllx.eu") == .user("@lndr:matrix.tllx.eu"), "encoded user")
check(MatrixToLink.parse("https://matrix.to/#/#community:server.org") == .room("#community:server.org", via: []), "alias")
check(MatrixToLink.parse("https://matrix.to/#/%23community%3Aserver.org") == .room("#community:server.org", via: []), "encoded alias")
check(MatrixToLink.parse("https://matrix.to/#/!abc:server.org?via=server.org&via=other.org")
      == .room("!abc:server.org", via: ["server.org", "other.org"]), "room id with via")
check(MatrixToLink.parse("https://matrix.to/#/!abc:server.org/$event123?via=server.org")
      == .event("!abc:server.org", eventId: "$event123", via: ["server.org"]), "event")
check(MatrixToLink.parse("https://matrix.to/#/!abc:server.org/%24ev%3Aa?via=s.org")
      == .event("!abc:server.org", eventId: "$ev:a", via: ["s.org"]), "encoded event")
check(MatrixToLink.parse("https://example.com/#/!abc:server.org") == nil, "other host")
check(MatrixToLink.parse("https://matrix.to/") == nil, "no target")
check(MatrixToLink.viaServers("?via=a&x=1&via=") == ["a"], "via parsing")

// MARK: Plugin dock

var dock = PluginDockState.decode(Data(#"{"pinned":["a","b",3],"collapsed":"x","styles":{"a":{"height":1000,"zoom":10},"b":{"height":"x","zoom":75.4}}}"#.utf8))
check(dock.pinned == ["a", "b"], "only strings pinned")
check(dock.collapsed.isEmpty, "broken collapsed list is empty")
check(dock.height(of: "a") == 320 && dock.zoom(of: "a") == 50, "clamped")
check(dock.height(of: "b") == 96 && dock.zoom(of: "b") == 75, "default height, rounded zoom")
check(dock.height(of: "zzz") == 96 && dock.zoom(of: "zzz") == 100, "defaults")
dock.setPinned("a", true)
check(dock.pinned == ["b", "a"], "pinning again moves to the end like desktop")
dock.setPinned("b", false)
check(dock.pinned == ["a"], "unpinned")
dock.setCollapsed("a", true)
check(dock.collapsed == ["a"], "collapsed")
dock.setHeight("c", 33)
dock.setZoom("c", 80)
check(dock.height(of: "c") == 60 && dock.zoom(of: "c") == 80, "set and clamp")
let roundTrip = PluginDockState.decode(dock.encoded())
check(roundTrip == dock, "encode and decode")
check(PluginDockState.decode(Data("nope".utf8)) == PluginDockState(), "broken JSON")
check(PluginDockState.frameHeight(pluginHeight: 240, look: 96, zoom: 50) == 48, "capped and zoomed")
check(PluginDockState.frameHeight(pluginHeight: 80, look: 96, zoom: 100) == 80, "smaller plugin")

// MARK: Keyboard navigation

let ids = ["a", "b", "c"]
check(ShellNavigation.neighbor(of: "b", in: ids, step: 1) == "c", "next")
check(ShellNavigation.neighbor(of: "b", in: ids, step: -1) == "a", "previous")
check(ShellNavigation.neighbor(of: "c", in: ids, step: 1) == nil, "no wrap at the end")
check(ShellNavigation.neighbor(of: nil, in: ids, step: 1) == "a", "first")
check(ShellNavigation.neighbor(of: "x", in: ids, step: -1) == "c", "unknown goes to the last")
check(ShellNavigation.neighbor(of: "a", in: [], step: 1) == nil, "empty")

// MARK: Welcome guide

check(OnboardingLogic.isDiddyRoom(name: " diddy options ", topic: nil, tag: "[diddy-options]"), "name")
check(OnboardingLogic.isDiddyRoom(name: "x", topic: "hi [diddy-options]", tag: "[diddy-options]"), "topic tag")
check(!OnboardingLogic.isDiddyRoom(name: "General", topic: nil, tag: "[diddy-options]"), "other room")
var stored = OnboardingStored()
check(OnboardingLogic.show(stored: stored, pendingKeys: []) == .welcome, "first run")
stored.done = true
check(OnboardingLogic.show(stored: stored, pendingKeys: []) == nil, "done, nothing pending")
check(OnboardingLogic.show(stored: stored, pendingKeys: ["!space"]) == .server, "server prompt")
stored.dismiss(["!space", "!space"])
check(stored.dismissedSpaces == ["!space"], "dismiss once")
check(OnboardingLogic.show(stored: stored, pendingKeys: ["!space"]) == nil, "dismissed")
check(OnboardingStored.decode(stored.encoded()) == stored, "stored round trip")
check(OnboardingStored.decode(Data("[]".utf8)) == OnboardingStored(), "broken stored")
check(IntroSteps.all.count == 5, "five intro steps like desktop")
check(IntroSteps.all.allSatisfy { !$0.points.isEmpty }, "every step has points")

check(PluginDockState.clamp(Double.greatestFiniteMagnitude, min: 60, max: 320) == 320, "huge finite height cannot overflow")
check(UpdateCheckLogic.version(fromTag: "1.6.0") == nil, "only release tag prefixes")
check(!UpdateCheckLogic.isGithubUrl("https://user:pass@github.com/release"), "reject credential URLs")

if failures > 0 {
    print("\(failures) check(s) failed")
    exit(1)
}
print("shell_check: all checks passed")
