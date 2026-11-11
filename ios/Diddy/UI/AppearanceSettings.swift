import SwiftUI
import UIKit

/// The app-wide appearance: the colour scheme and tint of the theme (or the system's with "Match
/// System Appearance"), the page zoom on top of Dynamic Type and monochrome mode. Applied once, to
/// the root of the app.
struct DiddyAppearance: ViewModifier {
    @ObservedObject private var store = ThemeStore.shared
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var systemTypeSize
    @AppStorage(ThemeStore.monochromeKey) private var monochrome = false
    @AppStorage(ThemeStore.zoomKey) private var zoom = AppearanceLogic.defaultZoom

    /// Following the system, the app leaves the colour scheme to iOS.
    private var scheme: ColorScheme? {
        if store.useSystem { return nil }
        return store.theme.isLight ? ColorScheme.light : ColorScheme.dark
    }

    private var typeSize: DynamicTypeSize {
        let all = DynamicTypeSize.allCases
        let base = all.firstIndex(of: systemTypeSize) ?? 3
        let index = AppearanceLogic.typeSizeIndex(base: base, zoomPercent: zoom)
        return all.indices.contains(index) ? all[index] : systemTypeSize
    }

    func body(content: Content) -> some View {
        content
            .preferredColorScheme(scheme)
            .tint(store.theme.accent)
            .dynamicTypeSize(typeSize)
            .grayscale(monochrome ? 1 : 0)
            .onAppear { store.systemAppearanceChanged(isLight: colorScheme == .light) }
            .onChange(of: colorScheme) { value in store.systemAppearanceChanged(isLight: value == .light) }
    }
}

/// Monochrome mode for the screens that iOS shows outside the root view, such as sheets.
struct DiddyMonochrome: ViewModifier {
    @AppStorage(ThemeStore.monochromeKey) private var monochrome = false

    func body(content: Content) -> some View {
        content.grayscale(monochrome ? 1 : 0)
    }
}

extension View {
    func diddyAppearance() -> some View { modifier(DiddyAppearance()) }
    func diddyMonochrome() -> some View { modifier(DiddyMonochrome()) }
}

/// Settings > Display: monochrome mode and page zoom, like desktop's Display section.
struct DisplaySection: View {
    @AppStorage(ThemeStore.monochromeKey) private var monochrome = false
    @AppStorage(ThemeStore.zoomKey) private var zoom = AppearanceLogic.defaultZoom

    var body: some View {
        Section {
            Toggle("Monochrome Mode", isOn: $monochrome)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Page Zoom")
                    Spacer()
                    Text("\(AppearanceLogic.clampZoom(zoom))%").foregroundStyle(Theme.muted).monospacedDigit()
                    Button("Reset") { zoom = AppearanceLogic.defaultZoom }
                        .buttonStyle(.borderless)
                        .disabled(zoom == AppearanceLogic.defaultZoom)
                }
                Slider(
                    value: Binding(
                        get: { Double(AppearanceLogic.clampZoom(zoom)) },
                        set: { zoom = AppearanceLogic.clampZoom(Int($0.rounded())) }),
                    in: Double(AppearanceLogic.zoomRange.lowerBound)...Double(AppearanceLogic.zoomRange.upperBound),
                    step: 5)
            }
        } header: {
            Text("Display")
        } footer: {
            Text("Page Zoom is between 75% and 150% and works on top of the text size set in iOS Settings.")
        }
    }
}

/// The colours of the "Custom" theme, like desktop's Custom Theme settings: accent, background and
/// text. Applied with Save; pick the Custom theme in the theme list to use them.
struct CustomThemeView: View {
    @ObservedObject private var store = ThemeStore.shared
    @State private var draft = ThemeStore.savedCustomConfig()

    var body: some View {
        List {
            Section {
                HStack {
                    Spacer()
                    DiddyThemeTile(theme: DiddyTheme.custom(draft), isSelected: store.selectedId == AppearanceLogic.customThemeId)
                        .frame(width: 120)
                    Spacer()
                }
            }
            Section {
                ColorPicker("Accent", selection: binding(\.accent), supportsOpacity: false)
                ColorPicker("Background", selection: binding(\.background), supportsOpacity: false)
                ColorPicker("Text", selection: binding(\.text), supportsOpacity: false)
            } footer: {
                Text("Pick the \u{201C}Custom\u{201D} theme in the theme list to use these colors.")
            }
            Section {
                Button("Save Colors") { store.setCustom(draft) }
                    .disabled(draft == store.custom)
                Button("Reset Colors") { draft = CustomThemeConfig.defaults }
                    .disabled(draft == CustomThemeConfig.defaults)
            } footer: {
                Text("Saving rebuilds the app screens with the new colors.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Custom Theme")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func binding(_ keyPath: WritableKeyPath<CustomThemeConfig, String>) -> Binding<Color> {
        Binding(
            get: { Color(hex: AppearanceLogic.parseHex(draft[keyPath: keyPath]) ?? 0) },
            set: { draft[keyPath: keyPath] = AppearanceLogic.hexString(Self.hex(of: $0)) }
        )
    }

    private static func hex(of color: Color) -> UInt32 {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        func byte(_ value: CGFloat) -> UInt32 { UInt32(min(255, max(0, (value * 255).rounded()))) }
        return (byte(red) << 16) | (byte(green) << 8) | byte(blue)
    }
}
