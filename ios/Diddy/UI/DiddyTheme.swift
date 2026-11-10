import SwiftUI

/// One of the desktop app's colour themes, mapped to the iOS colour roles (see `Theme`).
///
/// The values come from `cinny/src/colors.css.ts` and `themePalette.ts`: the desktop's Background
/// tone is the sidebar, Surface the chat and SurfaceVariant the raised panels. `rail` (the server
/// rail) is one step further from the chat than the sidebar, like in the Diddy theme.
struct DiddyTheme: Identifiable, Equatable {
    /// The desktop's theme id, for example `diddy-theme`.
    let id: String
    let name: String
    /// Light themes need dark text, the light colour scheme and the dark status bar.
    let isLight: Bool
    let rail: Color
    let sidebar: Color
    let chat: Color
    let elevated: Color
    let input: Color
    let accent: Color
    let online: Color
    let danger: Color
    let text: Color
    let muted: Color
    let faint: Color
    /// Text and icons on top of the accent colour (white, or near black on bright accents).
    let onAccent: Color

    /// The theme in use. `ThemeStore` changes it; `Theme.*` reads it.
    static var current: DiddyTheme = ThemeStore.savedTheme()

    static let defaultID = "diddy-theme"
    static let all: [DiddyTheme] = [
        .diddy, .light, .silver, .dark, .butter,
        .accentOnBlack(id: "red-theme", name: "Red & Black", background: 0x140909, accent: 0xFF4D5A, text: 0xF7E9E9),
        .accentOnBlack(id: "green-theme", name: "Green & Black", background: 0x07120C, accent: 0x42E08C, text: 0xE8F6EE),
        .accentOnBlack(id: "purple-theme", name: "Purple & Black", background: 0x0F0818, accent: 0xB26BFF, text: 0xEFE8F9),
        .accentOnBlack(id: "amber-theme", name: "Amber & Black", background: 0x130C03, accent: 0xFFA726, text: 0xFBEFD9),
        .daaark,
    ]

    static func named(_ id: String?) -> DiddyTheme {
        all.first { $0.id == id } ?? .diddy
    }

    // MARK: Building

    private init(
        id: String, name: String, isLight: Bool,
        rail: UInt32, sidebar: UInt32, chat: UInt32, elevated: UInt32, input: UInt32,
        accent: UInt32, text: UInt32, online: UInt32, danger: UInt32,
        muted: UInt32? = nil, faint: UInt32? = nil
    ) {
        self.id = id
        self.name = name
        self.isLight = isLight
        self.rail = Color(hex: rail)
        self.sidebar = Color(hex: sidebar)
        self.chat = Color(hex: chat)
        self.elevated = Color(hex: elevated)
        self.input = Color(hex: input)
        self.accent = Color(hex: accent)
        self.online = Color(hex: online)
        self.danger = Color(hex: danger)
        self.text = Color(hex: text)
        // Same steps as the Diddy theme: muted and faint are the text faded towards the chat.
        self.muted = Color(hex: muted ?? Self.mix(text, chat, isLight ? 0.38 : 0.28))
        self.faint = Color(hex: faint ?? Self.mix(text, chat, 0.55))
        self.onAccent = Color(hex: Self.luminance(accent) > 0.4 ? 0x141414 : 0xFFFFFF)
    }

    private static let vividOnline: UInt32 = 0x23A55A
    private static let vividDanger: UInt32 = 0xF23F43

    /// The iOS original: plum surfaces and the pink accent.
    static let diddy = DiddyTheme(
        id: "diddy-theme", name: "Diddy", isLight: false,
        rail: 0x0F0711, sidebar: 0x180B1B, chat: 0x200F23, elevated: 0x2B162F, input: 0x2F1A33,
        accent: 0xE5517C, text: 0xF2F2F2, online: vividOnline, danger: vividDanger,
        muted: 0xADADAD, faint: 0x737373)

    static let light = DiddyTheme(
        id: "light-theme", name: "Light", isLight: true,
        rail: 0xE5E5E5, sidebar: 0xF2F2F2, chat: 0xFFFFFF, elevated: 0xF2F2F2, input: 0xE5E5E5,
        accent: 0x1858D5, text: 0x000000, online: 0x00844C, danger: 0xC40E0E)

    static let silver = DiddyTheme(
        id: "silver-theme", name: "Silver", isLight: true,
        rail: 0xC7C7C7, sidebar: 0xDEDEDE, chat: 0xEAEAEA, elevated: 0xDEDEDE, input: 0xD3D3D3,
        accent: 0x1245A8, text: 0x000000, online: 0x017343, danger: 0x9D0F0F)

    static let dark = DiddyTheme(
        id: "dark-theme", name: "Dark", isLight: false,
        rail: 0x0D0D0D, sidebar: 0x1A1A1A, chat: 0x262626, elevated: 0x333333, input: 0x404040,
        accent: 0xBDB6EC, text: 0xF2F2F2, online: vividOnline, danger: vividDanger)

    static let butter = DiddyTheme(
        id: "butter-theme", name: "Butter", isLight: false,
        rail: 0x0D0C0B, sidebar: 0x1A1916, chat: 0x262621, elevated: 0x33322C, input: 0x403F38,
        accent: 0xBDB6EC, text: 0xFFFBDE, online: vividOnline, danger: vividDanger)

    /// Pure black content with #111 side columns and a blue accent (T3 Code's dark theme).
    static let daaark = DiddyTheme(
        id: "daaark-theme", name: "DAAARK", isLight: false,
        rail: 0x000000, sidebar: 0x111111, chat: 0x000000, elevated: 0x111111, input: 0x1A1A1A,
        accent: 0x346BF1, text: 0xF5F5F5, online: vividOnline, danger: vividDanger)

    /// The desktop's `darkPalette()`: a near-black background tinted by the accent.
    private static func accentOnBlack(id: String, name: String, background: UInt32, accent: UInt32, text: UInt32) -> DiddyTheme {
        DiddyTheme(
            id: id, name: name, isLight: false,
            rail: mix(background, 0x000000, 0.4),
            sidebar: background,
            chat: mix(background, 0xFFFFFF, 0.07),
            elevated: mix(background, 0xFFFFFF, 0.13),
            input: mix(background, 0xFFFFFF, 0.2),
            accent: accent, text: text, online: vividOnline, danger: vividDanger)
    }

    /// Mixes `a` towards `b` by `t` (0 gives a, 1 gives b), per channel.
    static func mix(_ a: UInt32, _ b: UInt32, _ t: Double) -> UInt32 {
        func channel(_ shift: UInt32) -> UInt32 {
            let x = Double((a >> shift) & 0xFF), y = Double((b >> shift) & 0xFF)
            return UInt32(min(255, max(0, (x + (y - x) * t).rounded()))) << shift
        }
        return channel(16) | channel(8) | channel(0)
    }

    /// Relative luminance (0...1), the desktop's `onColor()` uses the same cut at 0.4.
    static func luminance(_ hex: UInt32) -> Double {
        func linear(_ shift: UInt32) -> Double {
            let c = Double((hex >> shift) & 0xFF) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(16) + 0.7152 * linear(8) + 0.0722 * linear(0)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255)
    }
}

/// The chosen theme, stored on this device. Changing it rebuilds the UI (`DiddyApp` and `MainView`
/// watch `id`), because the `Theme` colours are plain values and not observed by single views.
@MainActor
final class ThemeStore: ObservableObject {
    static let shared = ThemeStore()
    static let key = "diddy.theme"

    @Published private(set) var id: String

    var theme: DiddyTheme { DiddyTheme.named(id) }

    private init() {
        id = DiddyTheme.current.id
    }

    nonisolated static func savedTheme() -> DiddyTheme {
        DiddyTheme.named(UserDefaults.standard.string(forKey: key))
    }

    func select(_ theme: DiddyTheme) {
        guard theme.id != id else { return }
        UserDefaults.standard.set(theme.id, forKey: Self.key)
        DiddyTheme.current = theme
        id = theme.id
    }
}

/// Settings > Theme: a tile per theme, drawn with the theme's own surfaces like the desktop's.
struct ThemeSection: View {
    @ObservedObject private var store = ThemeStore.shared

    var body: some View {
        Section {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 12)], spacing: 14) {
                ForEach(DiddyTheme.all) { theme in
                    Button { store.select(theme) } label: { tile(theme) }
                        .buttonStyle(.plain)
                        .accessibilityLabel(theme.name)
                        .accessibilityAddTraits(store.id == theme.id ? .isSelected : [])
                }
            }
            .padding(.vertical, 6)
        } header: {
            Text("Theme")
        } footer: {
            Text("The same colour themes as the desktop app. Light themes switch the whole app to light mode.")
        }
    }

    private func tile(_ theme: DiddyTheme) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 0) {
                theme.rail.frame(width: 10)
                theme.sidebar.frame(width: 18)
                ZStack(alignment: .topLeading) {
                    theme.chat
                    VStack(alignment: .leading, spacing: 4) {
                        Capsule().fill(theme.text).frame(width: 22, height: 4)
                        Capsule().fill(theme.muted).frame(width: 30, height: 3)
                        Spacer(minLength: 0)
                        HStack(spacing: 3) {
                            Capsule().fill(theme.input).frame(height: 6)
                            Circle().fill(theme.accent).frame(width: 8, height: 8)
                        }
                    }
                    .padding(6)
                }
            }
            .frame(height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(store.id == theme.id ? Theme.accent : Color.gray.opacity(0.35), lineWidth: store.id == theme.id ? 3 : 1)
            )
            Text(theme.name)
                .font(.caption)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(store.id == theme.id ? Theme.text : Theme.muted)
        }
    }
}
