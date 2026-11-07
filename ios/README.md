# Diddy für iPhone und iPad

Eigene, native App (SwiftUI), keine Web-Ansicht: [matrix-rust-sdk](https://github.com/matrix-org/matrix-rust-sdk) (Swift-Paket `MatrixRustSDK` 26.10.27) für Chat und Verschlüsselung, [LiveKit](https://github.com/livekit/client-sdk-swift) 2.18 für Sprachkanäle und Bildschirmübertragung. Aufbau wie die Discord-App, Farben wie das Diddy-Theme.

Die App ist Beta: Alles in der Tabelle ist gebaut und läuft bei den ersten Testern, ist aber noch nicht im Alltag geprüft.

| | |
|---|---|
| Server (Spaces) links, Kanäle daneben, Unter-Spaces als Kategorien | 🧪 |
| Text- und Sprachkanäle, Direktnachrichten unter „Home“ | 🧪 |
| Antworten, Reaktionen, Bilder senden, Nachrichten löschen | 🧪 |
| Ende-zu-Ende-Verschlüsselung, Gerät mit Wiederherstellungsschlüssel bestätigen | 🧪 |
| Mehrere Konten auf verschiedenen Servern, jedes mit eigenem Speicher | 🧪 |
| Anmeldung mit Passwort oder über die Login-Seite des Servers (OAuth/MAS), nur über HTTPS | 🧪 |
| Sprachkanäle mit Desktop-Diddy und Element Call (gleiches MatrixRTC, gleiche Medien-Verschlüsselung) | 🧪 |
| Bildschirmübertragung | 🧪 ab iOS 27 ganzer Bildschirm, davor nur Diddy selbst |
| Stummschalten, Taubschalten, Kamera | 🧪 |
| App-Icon wechseln (Pink, Blau, Lila, Schwarz, Magenta) | 🧪 |
| Push-Benachrichtigungen | ❌ (braucht einen Push-Gateway und ein bezahltes Apple-Konto) |

🧪 Beta: gebaut, läuft bei Testern, noch nicht im Alltag geprüft · ❌ fehlt noch

**Verschlüsselung in Sprachkanälen:** In verschlüsselten Räumen sind die Medien Ende-zu-Ende verschlüsselt wie bei Element Call. Es fehlen aber noch die Schlüsselrotation beim Verlassen (wer den Kanal verlässt, kennt den Schlüssel bis zum Ende des Anrufs weiter), und den eigenen Schlüssel bekommen die Geräte aus der LiveKit-Teilnehmerliste statt nur die Geräte mit einer MatrixRTC-Mitgliedschaft im Raum. Die Härtung ist geplant, siehe [SECURITY-TODO.md](SECURITY-TODO.md).

## Voraussetzungen am Server

- **Simplified Sliding Sync (MSC4186).** Das Rust-SDK synchronisiert nur so. Synapse ab 1.114, Continuwuity und matrix.org können das.
- **Für Sprachkanäle:** ein MatrixRTC-Backend (LiveKit + `lk-jwt-service`), angekündigt über `org.matrix.msc4143.rtc_foci` in `/.well-known/matrix/client`, also dasselbe, das der Desktop-Call braucht.

## Installieren

Die IPA baut der Workflow [Build iOS](../.github/workflows/ios.yml), Artefakt `diddy-ios`.

**Ohne bezahltes Apple-Konto:** `Diddy_*_iOS_unsigned.ipa` mit [AltStore](https://altstore.io), [SideStore](https://sidestore.io) oder [Sideloadly](https://sideloadly.io) installieren. Sie signieren die App mit deiner Apple-ID.

Grenzen einer kostenlosen Apple-ID:
- Die App läuft 7 Tage und muss dann neu signiert werden (AltStore/SideStore machen das automatisch).
- Höchstens 3 eigene Apps gleichzeitig.
- Diddy hat keine Erweiterungen und belegt nur eine App-ID (eine kostenlose Apple-ID bekommt 10 pro Woche). Der Workflow bricht ab, falls doch eine Erweiterung in die IPA gerät.

**Mit bezahltem Konto:** Repository-Secrets `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` setzen (siehe Kopf des Workflows), dann ist die IPA signiert.

## Bildschirm übertragen

Im Sprachkanal auf das Bildschirm-Symbol tippen. Diddy nimmt ohne Erweiterung direkt in der App auf.

- **ab iOS 27:** Der iOS-Dialog fragt, was geteilt wird. Das kann der ganze Bildschirm sein, auch andere Apps, und es läuft im Hintergrund weiter (ScreenCaptureKit).
- **iOS 16 bis 26:** nur Diddy selbst. Apple erlaubt die Aufnahme anderer Apps dort nur aus einer Broadcast-Erweiterung, und die würde beim Sideloaden eine zweite App-ID kosten.

Für den iOS-27-Weg muss die App mit dem iOS-27-SDK (Xcode 27) gebaut sein. Mit älterem Xcode läuft die App auch auf iOS 27, überträgt dann aber nur Diddy selbst. Der Workflow nimmt das neueste Xcode des Runners und warnt, wenn es älter ist.

## Selbst bauen

Auf einem Mac mit Xcode 16.3 oder neuer. Xcode 16.3 bis 26 reicht zum Bauen, die Bildschirmübertragung zeigt dann aber auf jedem iOS nur Diddy selbst. Für die ganze Bildschirmübertragung ab iOS 27 braucht es Xcode 27 (siehe oben).

```sh
brew install xcodegen
cd ios
DIDDY_DEVELOPMENT_TEAM=DEINTEAMID xcodegen generate   # Team-ID optional, sonst in Xcode wählen
open Diddy.xcodeproj
```

Das Xcode-Projekt und die `Info.plist` entstehen aus `project.yml` und sind nicht eingecheckt. Entitlements hat die App keine.

Die App-Icons kommen aus `src-tauri/app-icons`. Neu erzeugen: `python3 ios/Tools/make_icons.py` (braucht Pillow und NumPy).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `Diddy/App` | App-Start, Kontoliste, App-Icon |
| `Diddy/Matrix` | Login, Sessions im Schlüsselbund, Sync, Räume/Spaces, Timeline, Medien |
| `Diddy/Call` | Sprachkanal: MatrixRTC-Mitgliedschaft, JWT vom `lk-jwt-service`, LiveKit, Medien-Schlüssel |
| `Diddy/UI` | SwiftUI-Ansichten |

Sprachkanäle sprechen das Protokoll von Element Call 0.20 (Desktop-Diddy):
- Mitgliedschaft als Zustand `org.matrix.msc3401.call.member` mit Schlüssel `_@user:server_GERÄT_m.call`.
- LiveKit-Server des ältesten Teilnehmers (`oldest_membership`).
- Token vom `/sfu/get` des JWT-Dienstes.
- Pro Teilnehmer ein 16-Byte-Medienschlüssel als verschlüsselte To-Device-Nachricht `io.element.call.encryption_keys`, abgeleitet mit HKDF.
