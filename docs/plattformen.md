# Features pro Plattform

Stand 2026-11-09, aus dem Code abgeleitet (`src-tauri/`, `electron/`, `ios/`, `cinny/src/app`), README und CHANGELOG. Nicht auf Geräten geprüft.

- **macOS:** Tauri mit der Cinny-Oberfläche.
- **Linux:** Electron mit derselben Oberfläche.
- **iOS:** eigene SwiftUI-App (matrix-rust-sdk), ohne Cinny.
- **Windows:** nur eine Tauri-Konfiguration (`wix`), der Release-Workflow baut es nicht.

✅ vorhanden · 🧪 gebaut, noch nicht im Alltag geprüft · ❌ fehlt · – trifft nicht zu

| Feature | macOS | Linux | iOS |
|---|:---:|:---:|:---:|
| Chat, Räume, Spaces, E2E-Verschlüsselung | ✅ | ✅ | ✅ |
| Antworten, Reaktionen, Bearbeiten, Löschen, @Erwähnungen, Tippanzeige | ✅ | ✅ | ✅ |
| Sprachchat über Element Call, auch verschlüsselt | ✅ | ✅ | ✅ |
| Bildschirmübertragung | ✅ | ✅ | ✅ (ganzer Bildschirm erst ab iOS 27) |
| System-Ton bei Bildschirmübertragung | ✅ (14.2+) | ✅ | ✅ (nur Diddy-Ton) |
| Rauschunterdrückung (RNNoise) | ✅ | ✅ | ✅ |
| Mikrofon ohne Apples Voice-Processing | ✅ | – | – |
| Klingeln in Direktnachrichten | ✅ | ✅ | ✅ (nur bei geöffneter App) |
| Call-Töne und Soundpack | ✅ | ✅ | ✅ |
| Calls wie bei Discord (Kacheln, großer Stream) | ✅ | ✅ | ❌ |
| Soundboard, MyInstants-Import | ✅ | ✅ | ❌ |
| Sprachnachrichten | ✅ | 🧪 | ❌ |
| Bot-Karten (`dev.diddy.card`) und Befehlsvorschläge | ✅ | ✅ | ❌ |
| Diddy-Profile, Badges, Namensschilder | ✅ | ✅ | ❌ |
| Themes | 9 | 9 | nur Diddy |
| Plugins und Plugin-Galerie | ✅ | ✅ | ❌ |
| Redet mit Agent (Agent Voice) | ✅ | ✅ | ❌ |
| Globaler Hotkey für Agent Voice | ✅ | ❌ | – |
| Mehrere Verbindungsprofile / Konten | ✅ (ab macOS 14) | 🧪 | ✅ |
| App-Icon wechseln | ✅ | 🧪 | ✅ |
| Logdatei und Diagnose | ✅ | ✅ | ❌ |
| Hintergrund-Benachrichtigungen | ✅ | ✅ | 🧪 |
| Push bei geschlossener App | – | – | ❌ |
| Online-Status (Presence) | ✅ | ✅ | ❌ (Sliding Sync liefert ihn nicht) |

Anmerkungen:
- macOS und Linux teilen die Oberfläche. Unterschiede liegen im nativen Teil (Mikrofon, System-Ton, Hotkey).
- Der globale Agent-Voice-Hotkey geht unter Wayland nicht. Ersatz: `diddy --agent-voice start|stop|toggle`.
- iOS braucht einen Server mit Simplified Sliding Sync (MSC4186).
