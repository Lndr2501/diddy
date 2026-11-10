# Features pro Plattform

Stand 2026-11-10, aus dem Code abgeleitet (`src-tauri/`, `electron/`, `ios/`, `cinny/src/app`), README und CHANGELOG. Nicht auf Geräten geprüft.

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
| Calls wie bei Discord (Kacheln, großer Stream) | ✅ | ✅ | 🧪 |
| Soundboard, MyInstants-Import | ✅ | ✅ | 🧪 |
| Sprachnachrichten | ✅ | 🧪 | 🧪 (Ogg/Opus vom Linux-Desktop spielt iOS nicht ab) |
| Bot-Karten (`dev.diddy.card`) und Befehlsvorschläge | ✅ | ✅ | 🧪 |
| Diddy-Profile, Badges, Namensschilder | ✅ | ✅ | 🧪 (anzeigen; Badges erstellen nur am Desktop) |
| Themes | 9 | 9 | 🧪 9 |
| Plugins und Plugin-Galerie | ✅ | ✅ | 🧪 (ohne Seitenleisten-Dock) |
| Redet mit Agent (Agent Voice) | ✅ | ✅ | 🧪 (Button und Kurzbefehl) |
| Globaler Hotkey für Agent Voice | ✅ | 🧪 (XDG-Portal, X11-Rückfall nur Umschalten) | – |
| Mehrere Verbindungsprofile / Konten | ✅ (ab macOS 14) | 🧪 | ✅ |
| App-Icon wechseln | ✅ | 🧪 | ✅ |
| Logdatei und Diagnose | ✅ | ✅ | 🧪 (Export über das Teilen-Menü) |
| Hintergrund-Benachrichtigungen | ✅ | ✅ | 🧪 |
| Push bei geschlossener App | – | – | ❌ |
| Online-Status (Presence) | ✅ | ✅ | ❌ (Sliding Sync liefert ihn nicht) |

Anmerkungen:
- macOS und Linux teilen die Oberfläche. Unterschiede liegen im nativen Teil (Mikrofon, System-Ton, Hotkey).
- Der globale Agent-Voice-Hotkey läuft unter Linux über das XDG-Portal `GlobalShortcuts` (Halten geht), ohne Portal unter X11 als Umschalter; sonst bleibt `diddy --agent-voice start|stop|toggle`. Einschalten unter Einstellungen > „Also in the background“. Prüfliste: [linux-checkliste.md](linux-checkliste.md).
- iOS braucht einen Server mit Simplified Sliding Sync (MSC4186).
