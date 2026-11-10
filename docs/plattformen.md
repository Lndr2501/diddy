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
| Klingeln in Direktnachrichten | ✅ | ✅ ¹ | ✅ (nur bei geöffneter App) |
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
| Hintergrund-Benachrichtigungen | ✅ | ✅ ¹ | 🧪 |
| Push bei geschlossener App | – | – | ❌ |
| Online-Status (Presence) | ✅ | ✅ | ❌ (Sliding Sync liefert ihn nicht) |

Anmerkungen:
- ¹ Linux: gilt nur, solange ein Diddy-Fenster offen ist (auch im Hintergrund oder minimiert). Schließt du das letzte Fenster, beendet sich die App (`window-all-closed` in `electron/main.cjs`), und es kommen keine Benachrichtigungen und kein Klingeln mehr.
- Die Linux-Pakete (AppImage, DEB, RPM) gibt es nur für x86_64; die CI baut keine arm64-Pakete.
- macOS und Linux teilen die Oberfläche. Unterschiede liegen im nativen Teil (Mikrofon, System-Ton, Hotkey).
- Der globale Agent-Voice-Hotkey läuft unter Linux über das XDG-Portal `GlobalShortcuts` (Halten geht), ohne Portal unter X11 als Umschalter; sonst bleibt `diddy --agent-voice start|stop|toggle`. Einschalten unter Einstellungen > „Also in the background“. Prüfliste: [linux-checkliste.md](linux-checkliste.md).
- Der Agent-Voice-Befehl (und der globale Hotkey) wirkt nur, wenn in den Einstellungen unter „Talking to an agent" der Schalter „Detect dictation hotkey" an ist (sonst ignoriert die Oberfläche den Befehl). Ohne Portal-Hotkey lässt er sich unter Linux auch an eine eigene Taste binden:
  - GNOME: Einstellungen > Tastatur > Tastaturkürzel anzeigen und anpassen > Eigene Tastenkürzel, Befehl `diddy --agent-voice toggle`.
  - KDE Plasma: Systemeinstellungen > Tastenkürzel > Eigene Kürzel > Neu > Globales Kürzel > Befehl/URL, Befehl `diddy --agent-voice toggle`.
  - Sway: `bindsym $mod+v exec diddy --agent-voice toggle`. Hyprland: `bind = SUPER, V, exec, diddy --agent-voice toggle`.
- iOS braucht einen Server mit Simplified Sliding Sync (MSC4186).
