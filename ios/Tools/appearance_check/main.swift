// Checks for Diddy/App/AppearanceLogic.swift (theme choice, custom theme colours, text zoom). Foundation only.
// Run from the ios folder:
//   swiftc -swift-version 5 Diddy/App/AppearanceLogic.swift Tools/appearance_check/main.swift -o /tmp/appearance_check && /tmp/appearance_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

// Colours
check(AppearanceLogic.parseHex("#FF4FA3") == 0xFF4FA3, "hash form")
check(AppearanceLogic.parseHex("ff4fa3") == 0xFF4FA3, "plain form")
check(AppearanceLogic.parseHex("#abc") == 0xAABBCC, "short form")
check(AppearanceLogic.parseHex("#12345") == nil, "five digits")
check(AppearanceLogic.parseHex("red") == nil, "word")
check(AppearanceLogic.parseHex("") == nil, "empty")
check(AppearanceLogic.hexString(0x0E0E12) == "#0E0E12", "leading zeros: \(AppearanceLogic.hexString(0x0E0E12))")
check(AppearanceLogic.hexString(0) == "#000000", "black")
check(AppearanceLogic.hexString(0xFFFFFF) == "#FFFFFF", "white")

// Custom theme storage, same keys as desktop
check(CustomThemeConfig.decode(nil) == CustomThemeConfig.defaults, "nothing stored")
check(CustomThemeConfig.decode("not json") == CustomThemeConfig.defaults, "broken json")
let desktop = ##"{"accent":"#112233","background":"#000000","text":"#ffffff","gradient":true,"gradientFrom":"#1B0B2E","surfaceOpacity":0.8}"##
let parsed = CustomThemeConfig.decode(desktop)
check(parsed.accent == "#112233" && parsed.background == "#000000" && parsed.text == "#FFFFFF", "desktop JSON: \(parsed)")
let partial = CustomThemeConfig.decode(##"{"accent":"nope","text":"#ABCDEF"}"##)
check(partial.accent == CustomThemeConfig.defaults.accent && partial.text == "#ABCDEF", "bad colour falls back, good one kept")
check(CustomThemeConfig.decode(parsed.encoded()) == parsed, "round trip")
check(parsed.encoded() == ##"{"accent":"#112233","background":"#000000","text":"#FFFFFF"}"##, "encoded: \(parsed.encoded())")

// Active theme
check(AppearanceLogic.activeThemeId(useSystem: false, systemIsLight: true, themeId: "dark-theme", lightId: "light-theme", darkId: "diddy-theme") == "dark-theme", "fixed theme")
check(AppearanceLogic.activeThemeId(useSystem: true, systemIsLight: true, themeId: "dark-theme", lightId: "light-theme", darkId: "diddy-theme") == "light-theme", "system light")
check(AppearanceLogic.activeThemeId(useSystem: true, systemIsLight: false, themeId: "dark-theme", lightId: "light-theme", darkId: "diddy-theme") == "diddy-theme", "system dark")

// Zoom
check(AppearanceLogic.clampZoom(10) == 75 && AppearanceLogic.clampZoom(500) == 150 && AppearanceLogic.clampZoom(100) == 100, "clamp")
check(AppearanceLogic.typeSizePoints.count == 12, "twelve type sizes like DynamicTypeSize")
for base in 0..<AppearanceLogic.typeSizePoints.count {
    check(AppearanceLogic.typeSizeIndex(base: base, zoomPercent: 100) == base, "100 % keeps step \(base)")
}
check(AppearanceLogic.typeSizeIndex(base: 3, zoomPercent: 150) == 6, "large at 150 % is 25.5 pt, the nearest step is 23")
check(AppearanceLogic.typeSizeIndex(base: 3, zoomPercent: 75) == 0, "large at 75 % is 12.75 pt, the nearest step is 14")
check(AppearanceLogic.typeSizeIndex(base: 3, zoomPercent: 150) > 3, "bigger")
check(AppearanceLogic.typeSizeIndex(base: 11, zoomPercent: 150) == 11, "capped at the largest")
check(AppearanceLogic.typeSizeIndex(base: 0, zoomPercent: 75) == 0, "capped at the smallest")
check(AppearanceLogic.typeSizeIndex(base: 99, zoomPercent: 100) == 11, "base out of range")
var last = 0
for zoom in stride(from: 75, through: 150, by: 5) {
    let index = AppearanceLogic.typeSizeIndex(base: 3, zoomPercent: zoom)
    check(index >= last, "monotonic at \(zoom)")
    last = index
}

if failures == 0 { print("appearance_check: all checks passed") } else { print("appearance_check: \(failures) failures"); exit(1) }
