# Features pro Plattform

Stand 2026-11-17, aus Code und CI abgeleitet (`src-tauri/`, `electron/`, `ios/`, `android/`, `cinny/src/app`). Vorhandene Implementierung ist keine Geräteabnahme. Android-Geräteabnahme offen: [Prüfliste](../android/ACCEPTANCE.md).

- **macOS:** Tauri mit der Cinny-Oberfläche.
- **Linux:** Electron mit derselben Oberfläche.
- **iOS:** eigene SwiftUI-App (matrix-rust-sdk), ohne Cinny.
- **Windows:** Electron, gemeinsamer Cinny-Client; NSIS-Installer im Release.
- **Android:** eigene Kotlin-/Compose-App mit Matrix-Rust-SDK und LiveKit; signierte APK im Release.

✅ vorhanden · 🧪 gebaut, noch nicht im Alltag geprüft · ❌ fehlt · – trifft nicht zu

| Feature | macOS | Linux/Windows | iOS | Android |
|---|:---:|:---:|:---:|:---:|
| Chat, Räume, Spaces, Verschlüsselung | ✅ | ✅ | ✅ | 🧪 |
| Antworten, Reaktionen, Bearbeiten, Löschen, Erwähnungen, Tippanzeige | ✅ | ✅ | ✅ | 🧪 |
| Verifizierung, Recovery, Schlüssel-Backup | ✅ | ✅ | ✅ | 🧪 |
| MatrixRTC-Calls, Kamera und fremde Bildschirmfreigabe | ✅ | ✅ | ✅ | 🧪 |
| Eigene Bildschirmfreigabe | ✅ | ✅ | ✅ (Broadcast-Erweiterung) | 🧪 (MediaProjection) |
| Systemton teilen | ✅ (14.2+) | ✅ (Windows ab Build 19041) | nur Diddy-Ton | ❌ |
| Rauschunterdrückung | RNNoise | RNNoise | RNNoise | WebRTC |
| Klingeln in Direktnachrichten | ✅ | ✅ | 🧪 | 🧪 |
| Call-Töne, eigene Sounds und Themes | ✅ | ✅ | 🧪 | 🧪 |
| Soundboard und MyInstants-Import | ✅ | ✅ | 🧪 | 🧪 |
| MyInstants-Liste über das Konto synchronisieren | ✅ | ✅ | 🧪 | 🧪 (Änderung für #233) |
| Watch Together und Handy als Kamera/Mikrofon | ✅ | ✅ | 🧪 | 🧪 |
| Sprachnachrichten | ✅ | 🧪 | 🧪 | 🧪 (Codec-/Geräteabnahme offen) |
| Bot-Karten und Befehlsvorschläge | ✅ | ✅ | 🧪 | 🧪 |
| Diddy-Profile, Badges, Namensschilder | ✅ | ✅ | 🧪 | 🧪 |
| Plugins und Galerie | ✅ | ✅ | 🧪 | 🧪 (Sandbox-Code/Logiktests; Geräteabnahme offen) |
| Mehrere Konten | ✅ | ✅ | ✅ | 🧪 |
| Globale Desktop-Hotkeys | ✅ | ✅ (Wayland eingeschränkt) | – | – |
| Sprachauswahl/eigene Übersetzungen | ✅ | ✅ | 🧪 (teilweise) | ❌ |
| Gespeicherte Nachrichten | ✅ | ✅ | 🧪 | ❌ |
| Diagnoseexport | ✅ | ✅ | 🧪 | 🧪 |
| Push bei geschlossenem Fenster/Prozess | – | – | eingeschränkt (ntfy-Anrufpfad, kein APNs) | 🧪 (UnifiedPush; Geräte-/Gateway-Nachweis offen) |
| Teilen aus anderen Apps und Deep Links | ✅ | ✅ | 🧪 | 🧪 |
| Android: Fehlerbehandlung beim Abmelden/Call-Schlüsselwechsel | – | – | – | 🧪 (Logiktests; Interop offen) |

Anmerkungen:
- Desktop-Benachrichtigungen benötigen einen laufenden Client. Android hat UnifiedPush und optional eine dauerhafte Hintergrundverbindung; diese ist kein Ersatz für einen getesteten Push-Pfad.
- Die Linux-Pakete (AppImage, DEB, RPM) gibt es nur für x86_64; die CI baut keine arm64-Pakete.
- macOS und Linux teilen die Oberfläche. Unterschiede liegen im nativen Teil (Mikrofon, System-Ton, Hotkey).
- Der globale Agent-Voice-Hotkey läuft unter Linux über das XDG-Portal `GlobalShortcuts` (Halten geht), ohne Portal unter X11 als Umschalter; sonst bleibt `diddy --agent-voice start|stop|toggle`. Einschalten unter Einstellungen > „Also in the background“. Prüfliste: [linux-checkliste.md](linux-checkliste.md).
- Der Agent-Voice-Befehl (und der globale Hotkey) wirkt nur, wenn in den Einstellungen unter „Talking to an agent" der Schalter „Detect dictation hotkey" an ist (sonst ignoriert die Oberfläche den Befehl). Ohne Portal-Hotkey lässt er sich unter Linux auch an eine eigene Taste binden:
  - GNOME: Einstellungen > Tastatur > Tastaturkürzel anzeigen und anpassen > Eigene Tastenkürzel, Befehl `diddy --agent-voice toggle`.
  - KDE Plasma: Systemeinstellungen > Tastenkürzel > Eigene Kürzel > Neu > Globales Kürzel > Befehl/URL, Befehl `diddy --agent-voice toggle`.
  - Sway: `bindsym $mod+v exec diddy --agent-voice toggle`. Hyprland: `bind = SUPER, V, exec, diddy --agent-voice toggle`.
- iOS braucht einen Server mit Simplified Sliding Sync (MSC4186).
