# Features pro Plattform

Stand 2026-11-16, aus dem Code abgeleitet (`src-tauri/`, `electron/`, `ios/`, `android/`, `cinny/src/app`), README und CHANGELOG. Nicht auf Geräten geprüft, wo nicht anders vermerkt.

- **macOS:** Tauri mit der Cinny-Oberfläche.
- **Linux:** Electron mit derselben Oberfläche.
- **Windows:** dieselbe Electron-App wie Linux (NSIS-Installer, `windows.yml`). Unterschiede nur im nativen Teil.
- **iOS:** eigene SwiftUI-App (matrix-rust-sdk), ohne Cinny.
- **Android:** eigene Kotlin/Compose-App (matrix-rust-sdk, LiveKit), ohne Cinny. Gebaut, mit Unit-Tests, Lint und Emulator-Start in der CI; auf einem echten Gerät noch nicht abgenommen ([Testprotokoll](android-testprotokoll.md)).

✅ vorhanden · 🧪 gebaut, noch nicht im Alltag geprüft · ❌ fehlt · – trifft nicht zu

| Feature | macOS | Linux | Windows | iOS | Android |
|---|:---:|:---:|:---:|:---:|:---:|
| Chat, Räume, Spaces, E2E-Verschlüsselung | ✅ | ✅ | 🧪 | ✅ | 🧪 |
| Antworten, Reaktionen, Bearbeiten, Löschen, @Erwähnungen, Tippanzeige | ✅ | ✅ | 🧪 | ✅ | 🧪 |
| Geräteverifizierung, Wiederherstellungsschlüssel, Schlüssel-Backup | ✅ | ✅ | 🧪 | ✅ | 🧪 (Schlüssel-Ansichten mit `FLAG_SECURE`) |
| Sprachchat über MatrixRTC, auch verschlüsselt | ✅ | ✅ | 🧪 | ✅ | 🧪 |
| Call-Schlüssel nur für `call.member`-Mitglieder, Rotation beim Verlassen, E2EE-Anzeige | ✅ (Element Call) | ✅ (Element Call) | ✅ (Element Call) | 🧪 (seit 1.12.0) | 🧪 |
| Bildschirmübertragung | ✅ | ✅ | 🧪 | ✅ (ganzer Bildschirm erst ab iOS 27) | 🧪 (MediaProjection) |
| System-Ton bei Bildschirmübertragung | ✅ (14.2+) | ✅ | 🧪 (seit 1.12.0, ohne Diddy-Ton) | ✅ (nur Diddy-Ton) | 🧪 (Android 10+, nur Apps, die Aufnahme erlauben; ohne Diddy-Ton) |
| Rauschunterdrückung | ✅ (RNNoise) | ✅ (RNNoise) | 🧪 (RNNoise) | ✅ (RNNoise) | 🧪 (WebRTC, kein RNNoise) |
| Mikrofon ohne Apples Voice-Processing | ✅ | – | – | – | – (eigener Schalter „Voice Processing“) |
| Klingeln in Direktnachrichten | ✅ | ✅ ¹ | 🧪 ¹ | ✅ (nur bei geöffneter App) | 🧪 (Anrufstil mit Annehmen/Ablehnen, auch per Push) |
| Call-Töne und Soundpack | ✅ | ✅ | 🧪 | ✅ | 🧪 |
| Calls wie bei Discord (Kacheln, großer Stream) | ✅ | ✅ | 🧪 | 🧪 | 🧪 |
| Soundboard, MyInstants-Import | ✅ | ✅ | 🧪 | 🧪 | 🧪 |
| Push-to-Talk | 🧪 | 🧪 | 🧪 | 🧪 | ❌ (später) |
| Umfragen (MSC3381) | 🧪 | 🧪 | 🧪 | 🧪 | ❌ (später) |
| Gespeicherte Nachrichten | 🧪 | 🧪 | 🧪 | 🧪 | ❌ (später) |
| Nachricht später senden | 🧪 | 🧪 | 🧪 | 🧪 | ❌ (später) |
| Watch Together | ✅ | ✅ | 🧪 | 🧪 | 🧪 |
| Handy als Kamera und Mikrofon für den Computer | ✅ | ✅ | 🧪 | 🧪 | 🧪 |
| Sprachnachrichten | ✅ | 🧪 (Chromium-Aufnahmepfad automatisch geprüft) | 🧪 | 🧪 (spielt auch Ogg/WebM-Opus vom Linux-Desktop) | 🧪 |
| Bot-Karten (`dev.diddy.card`) und Befehlsvorschläge | ✅ | ✅ | 🧪 | 🧪 | 🧪 (gemeinsame Testfälle mit dem Desktop) |
| Diddy-Profile, Badges, Namensschilder | ✅ | ✅ | 🧪 | 🧪 (anzeigen, bearbeiten, Badges erstellen, Datenraum wählen) | 🧪 |
| Themes | 9 | 9 | 🧪 9 | 🧪 9 | 🧪 |
| Plugins und Plugin-Galerie | ✅ | ✅ | 🧪 | 🧪 (ohne Seitenleisten-Dock) | 🧪 (unter „You“ angeheftet) |
| Redet mit Agent (Agent Voice) | ✅ | ✅ | 🧪 | 🧪 (Button und Kurzbefehl) | ❌ (später) |
| Globaler Hotkey für Agent Voice | ✅ | 🧪 (XDG-Portal, X11-Rückfall nur Umschalten) | 🧪 (Electron `globalShortcut`) | – | – |
| Mehrere Verbindungsprofile / Konten | ✅ (ab macOS 14) | 🧪 | 🧪 | ✅ | 🧪 |
| App-Icon wechseln | ✅ | 🧪 | 🧪 (Fenstersymbol) | ✅ | ❌ (später) |
| Logdatei und Diagnose | ✅ | ✅ | 🧪 | 🧪 (Export über das Teilen-Menü) | 🧪 (Export ohne Nachrichten, Tokens, Schlüssel) |
| Hintergrund-Benachrichtigungen | ✅ | ✅ ¹ | 🧪 ¹ | 🧪 | 🧪 |
| Push bei geschlossener App | – | – | – | ❌ (braucht ein bezahltes Apple-Konto für APNs) | 🧪 (UnifiedPush, z. B. ntfy; kein FCM) |
| App-Store-Vertrieb | – | – | – | ❌ (kein bezahltes Apple-Konto) | 🧪 (F-Droid vorbereitet: reproduzierbarer Build, Rezept, CI-Prüfung; Aufnahme ab der Version nach 1.12.0) |
| Teilen aus anderen Apps (Teilen-Menü), Musik-Karten | – | – (Karten werden angezeigt) | – (Karten werden angezeigt) | 🧪 | 🧪 |
| matrix.to- und `matrix:`-Links öffnen | ✅ | ✅ | 🧪 | 🧪 | 🧪 |
| Tablet-/Foldable-Layout (Liste und Chat nebeneinander) | – | – | – | ✅ (iPad) | 🧪 (ab 720 dp Breite) |
| Animierte Profilbilder | ✅ | ✅ | 🧪 | 🧪 | 🧪 |
| Online-Status (Presence) | ✅ | ✅ | 🧪 | 🧪 (eigener Abruf, da Sliding Sync ihn nicht liefert) | 🧪 |

Anmerkungen:
- ¹ Linux: gilt nur, solange ein Diddy-Fenster offen ist (auch im Hintergrund oder minimiert). Schließt du das letzte Fenster, beendet sich die App (`window-all-closed` in `electron/main.cjs`), und es kommen keine Benachrichtigungen und kein Klingeln mehr.
- Die Linux-Pakete (AppImage, DEB, RPM) gibt es nur für x86_64; die CI baut keine arm64-Pakete.
- macOS und Linux teilen die Oberfläche. Unterschiede liegen im nativen Teil (Mikrofon, System-Ton, Hotkey).
- Der globale Agent-Voice-Hotkey läuft unter Linux über das XDG-Portal `GlobalShortcuts` (Halten geht), ohne Portal unter X11 als Umschalter; sonst bleibt `diddy --agent-voice start|stop|toggle`. Einschalten unter Einstellungen > „Also in the background“. Prüfliste: [linux-checkliste.md](linux-checkliste.md).
- Der Agent-Voice-Befehl (und der globale Hotkey) wirkt nur, wenn in den Einstellungen unter „Talking to an agent" der Schalter „Detect dictation hotkey" an ist (sonst ignoriert die Oberfläche den Befehl). Ohne Portal-Hotkey lässt er sich unter Linux auch an eine eigene Taste binden:
  - GNOME: Einstellungen > Tastatur > Tastaturkürzel anzeigen und anpassen > Eigene Tastenkürzel, Befehl `diddy --agent-voice toggle`.
  - KDE Plasma: Systemeinstellungen > Tastenkürzel > Eigene Kürzel > Neu > Globales Kürzel > Befehl/URL, Befehl `diddy --agent-voice toggle`.
  - Sway: `bindsym $mod+v exec diddy --agent-voice toggle`. Hyprland: `bind = SUPER, V, exec, diddy --agent-voice toggle`.
- iOS und Android brauchen einen Server mit Simplified Sliding Sync (MSC4186).
- Windows: System-Ton beim Teilen läuft seit 1.12.0 über einen mitinstallierten Helfer, der alles außer Diddy aufnimmt.
- Android: Push läuft über UnifiedPush (eine Verteiler-App wie ntfy, deren Server auch das Matrix-Push-Gateway stellt). Ohne Verteiler hält eine Hintergrundverbindung die Benachrichtigungen. Nach „Beenden erzwingen“ in den Android-Einstellungen kommt nichts mehr an, bis Diddy wieder geöffnet wird; Energiesparmodi mancher Hersteller können verzögern. Details: [android/README.md](../android/README.md).
