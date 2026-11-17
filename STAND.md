# Stand 2026-11-17

Aktueller Stand von Diddy: **Version 1.12.2** (Release vom 17.11.2026). Details je Version: [CHANGELOG.md](CHANGELOG.md).
Funktionen je Plattform: [docs/plattformen.md](docs/plattformen.md). Der alte Teststand vom 6.11.2026 (macOS-Audio, nach 1.1.0)
liegt in [docs/archiv/STAND-2026-11-06.md](docs/archiv/STAND-2026-11-06.md).

## Plattformen

| Plattform | Technik | Stand |
|---|---|---|
| macOS | Tauri 2 mit Cinny-Oberfläche | Hauptplattform, im Alltag geprüft |
| Linux | Electron (AppImage, DEB, RPM, NixOS) | Chat und Calls geprüft, Sprachnachrichten und Wayland/X11-Geräte offen ([Checkliste](docs/linux-checkliste.md)) |
| Windows | Electron (NSIS-Installer, ohne Signatur) | gebaut, noch nicht im Alltag geprüft |
| iPhone / iPad | eigene SwiftUI-App, matrix-rust-sdk, LiveKit | Beta, nur in der CI gebaut, Auslieferung per Sideloading |
| Android | Kotlin/Compose, signierte APK, F-Droid vorbereitet | Beta, auf Emulatoren in der CI geprüft, nicht auf einem echten Gerät ([Abnahme](android/ACCEPTANCE.md)) |

## Zuletzt dazugekommen (1.11 bis 1.12.2)

- Android als eigene App (1.11.1), danach Anrufe wie das Telefon, App-Ton beim Bildschirmteilen, Tablets, F-Droid-Vorbereitung, Konto-Abgleich und sichere Call-Schlüssel (#233).
- Windows-Build mit Systemton beim Bildschirmteilen und automatischer Mikro-Lautstärke.
- Sprachen am Desktop und auf iOS, gemeinsame JSON-Dateien ([docs/translating.md](docs/translating.md)).
- Abgleich zwischen Geräten und Nutzern: Optionsräume, Profile, Badges, Einstellungen, MyInstants-Sounds (#235, #248).
- Nachrichten automatisch löschen pro Raum (`m.room.retention`, #245), auf matrix.tllx.eu am Server aktiv.
- Benachrichtigungen verschwinden, sobald anderswo gelesen (#256), Update-Hinweis zeigt immer die neueste Version (#246).
- Bot-Library `diddybot` (Python, `sdk/python`) und Argument-Vorschläge für Bot-Befehle.
- iOS: Teilen aus anderen Apps, Ogg/Opus-Sprachnachrichten, Bildschirm teilen auch außerhalb der App, weniger Ruckeln und Einfrieren.

## Offen

- **Unveröffentlicht:** Call-Menü über den Namensschildern der anderen Kacheln (#260), steht im CHANGELOG unter „Unveröffentlicht“.
- Geräteabnahme: Android (Push, Bluetooth, Langzeit, Interop), iOS-Änderungen seit 1.12.1, Windows im Alltag.
- iOS: Passphrase für den lokalen Krypto-Store, braucht eine Migration der installierten Beta-Instanzen ([ios/SECURITY-TODO.md](ios/SECURITY-TODO.md)). Schlüsselwechsel in Calls beim Gehen ist seit 1.12.0 drin.
- Android: Sprachauswahl und gespeicherte Nachrichten fehlen noch; macOS ist nicht notarisiert, Windows-Installer nicht signiert.

## Tests (Stand heute)

- `cd cinny && npm test`: 873 Tests grün. Weitere Befehle: [AGENTS.md](AGENTS.md), [docs/agent-guide.md](docs/agent-guide.md).
