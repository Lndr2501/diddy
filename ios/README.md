# Diddy für iPhone und iPad

Eigene, native App (SwiftUI), keine Web-Ansicht: [matrix-rust-sdk](https://github.com/matrix-org/matrix-rust-sdk) (Swift-Paket `MatrixRustSDK` 26.10.27) für Chat und Verschlüsselung, [LiveKit](https://github.com/livekit/client-sdk-swift) 2.18 für Sprachkanäle und Bildschirmübertragung. Aufbau wie die Discord-App, Farben wie das Diddy-Theme.

| | |
|---|---|
| Server (Spaces) links, Kanäle daneben, Unter-Spaces als Kategorien | ✅ |
| Text- und Sprachkanäle, Direktnachrichten unter „Home“ | ✅ |
| Antworten, Reaktionen, Bilder senden, Nachrichten löschen | ✅ |
| Ende-zu-Ende-Verschlüsselung, Gerät mit Wiederherstellungsschlüssel bestätigen | ✅ |
| Mehrere Konten auf verschiedenen Servern, jedes mit eigenem Speicher | ✅ |
| Anmeldung mit Passwort oder über die Login-Seite des Servers (OAuth/MAS) | ✅ |
| Sprachkanäle mit Desktop-Diddy und Element Call (gleiches MatrixRTC, gleiche Medien-Verschlüsselung) | ✅ |
| Bildschirmübertragung (ganzer Bildschirm, auch andere Apps, mit Ton) | ✅ |
| Stummschalten, Taubschalten, Kamera | ✅ |
| App-Icon wechseln (Pink, Blau, Lila, Schwarz, Magenta) | ✅ |
| Push-Benachrichtigungen | ❌ (braucht einen Push-Gateway und ein bezahltes Apple-Konto) |

## Voraussetzungen am Server

- **Simplified Sliding Sync (MSC4186).** Das Rust-SDK synchronisiert nur so. Synapse ab 1.114, Continuwuity und matrix.org können das.
- **Für Sprachkanäle:** ein MatrixRTC-Backend (LiveKit + `lk-jwt-service`), angekündigt über `org.matrix.msc4143.rtc_foci` in `/.well-known/matrix/client`, also dasselbe, das der Desktop-Call braucht.

## Installieren

Die IPA baut der Workflow [Build iOS](../.github/workflows/ios.yml), Artefakt `diddy-ios`.

**Ohne bezahltes Apple-Konto:** `Diddy_*_iOS_unsigned.ipa` mit [AltStore](https://altstore.io), [SideStore](https://sidestore.io) oder [Sideloadly](https://sideloadly.io) installieren. Sie signieren App und Bildschirm-Erweiterung mit deiner Apple-ID.

Grenzen einer kostenlosen Apple-ID:
- Die App läuft 7 Tage und muss dann neu signiert werden (AltStore/SideStore machen das automatisch).
- Höchstens 3 eigene Apps gleichzeitig.
- Diddy belegt zwei App-IDs (App und Bildschirm-Erweiterung) und eine App-Gruppe.

**Mit bezahltem Konto:** Repository-Secrets `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` setzen (siehe Kopf des Workflows), dann ist die IPA signiert.

## Bildschirm übertragen

Im Sprachkanal auf das Bildschirm-Symbol tippen und im iOS-Dialog **Diddy Screen Share** wählen. Übertragen wird der ganze Bildschirm, auch wenn du in eine andere App wechselst, samt App-Ton. Beenden über denselben Knopf oder die rote Statusleiste.

Ab iOS 27 nimmt LiveKit direkt in der App mit ScreenCaptureKit auf, die Erweiterung wird dann nicht gebraucht.

## Selbst bauen

Auf einem Mac mit Xcode 16.3 oder neuer:

```sh
brew install xcodegen
cd ios
DIDDY_DEVELOPMENT_TEAM=DEINTEAMID xcodegen generate   # Team-ID optional, sonst in Xcode wählen
open Diddy.xcodeproj
```

Das Xcode-Projekt, `Info.plist` und die Entitlements entstehen aus `project.yml` und sind nicht eingecheckt.

Die App-Icons kommen aus `src-tauri/app-icons`. Neu erzeugen: `python3 ios/Tools/make_icons.py` (braucht Pillow und NumPy).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `Diddy/App` | App-Start, Kontoliste, App-Icon |
| `Diddy/Matrix` | Login, Sessions im Schlüsselbund, Sync, Räume/Spaces, Timeline, Medien |
| `Diddy/Call` | Sprachkanal: MatrixRTC-Mitgliedschaft, JWT vom `lk-jwt-service`, LiveKit, Medien-Schlüssel |
| `Diddy/UI` | SwiftUI-Ansichten |
| `DiddyBroadcast` | ReplayKit-Erweiterung für die Bildschirmübertragung |

Sprachkanäle sprechen das Protokoll von Element Call 0.20 (Desktop-Diddy):
- Mitgliedschaft als Zustand `org.matrix.msc3401.call.member` mit Schlüssel `_@user:server_GERÄT_m.call`.
- LiveKit-Server des ältesten Teilnehmers (`oldest_membership`).
- Token vom `/sfu/get` des JWT-Dienstes.
- Pro Teilnehmer ein 16-Byte-Medienschlüssel als verschlüsselte To-Device-Nachricht `io.element.call.encryption_keys`, abgeleitet mit HKDF.
