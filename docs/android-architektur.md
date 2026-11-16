# Android: Architekturentscheidung

Stand 16.11.2026. Gehört zu [#233](https://github.com/Lndr2501/diddy/issues/233).

## Entscheidung

Diddy für Android ist eine **native App in Kotlin und Jetpack Compose** (`android/`), mit

- **matrix-rust-sdk** über die offiziellen Kotlin-Bindings (`org.matrix.rustcomponents:sdk-android`), derselbe Rust-Kern wie in der iOS-App,
- **LiveKit Android** für Calls (MatrixRTC, Element-Call-Medienschlüssel),
- **UnifiedPush** für Push bei geschlossener App.

Keine WebView-Hülle um die Desktop-Oberfläche, kein Tauri-Android, kein Kotlin Multiplatform. Alle Versionen stehen fest in `android/gradle/libs.versions.toml`.

## Warum

- Lebenszyklus, Berechtigungen, Audio-Routing, Teilen-Menü, Anrufbenachrichtigungen und Bildschirmaufnahme laufen nur nativ zuverlässig. Eine WebView löst Push, gesperrtes Gerät und MediaProjection nicht.
- Sync und Kryptografie kommen aus demselben SDK wie auf iOS. Diddy baut keine eigene Matrix-Kryptografie.
- Die iOS-App ist die Vorlage für Bildschirme und Verhalten (Datei für Datei, z. B. `CallSession.kt` ↔ `CallSession.swift`). Swift-Code läuft nicht auf Android, das Protokoll aber ist dasselbe.

## Festgelegte Eckwerte

| Punkt | Wert | Wo |
|---|---|---|
| Mindestversion | Android 8.0 (API 26) | `minSdk` in `app/build.gradle.kts` |
| Ziel-/Compile-SDK | 37 | ebenda |
| ABIs | `arm64-v8a` (Telefone), `x86_64` (Emulator) | `abiFilters` |
| 16-KB-Speicherseiten | native Bibliotheken unkomprimiert und ausgerichtet; CI startet die App auf einem 16-KB-Emulator | `jniLibs.useLegacyPackaging = false`, `android.yml` |
| App-IDs | `app.diddy.android` (Release), `app.diddy.android.debug` (Test-Builds) | `applicationId`, `applicationIdSuffix` |
| Version | zentrale Diddy-Version, `versionCode = major·10000 + minor·100 + patch` | `stamp-version.sh` |
| Signierung | Release-Keystore nur als CI-Secret, PR-Builds sind Debug | `android.yml`, `release.yml` |
| Erster Push-Weg | UnifiedPush (Google-frei); FCM nicht eingebaut | `push/UnifiedPushing.kt` |
| Distribution | signierte APK im GitHub-Release; Play Store/F-Droid separat zu entscheiden | `release.yml` |

## Sicherheit

- **Zugangsdaten:** Sessions und der Schlüssel der SDK-Datenbanken sind mit einem AES-GCM-Schlüssel im Android Keystore versiegelt (`SessionStore.kt`). Kein Token im Klartext in den Einstellungen.
- **Store-Verschlüsselung:** Jedes Konto hat eigene SDK-Datenbanken mit eigenem, zufälligem Schlüssel und eigene Ordner. Daten verwaister Logins (App mitten im Login beendet) räumt der Start auf.
- **Backup:** Logins, Stores und Schlüssel sind von Cloud-Backup und Gerätewechsel ausgeschlossen (`data_extraction_rules.xml`, `allowBackup=false`). Wiederherstellung läuft über Matrix (Wiederherstellungsschlüssel).
- **Call-Schlüssel:** Der eigene Medienschlüssel geht nur an Geräte mit gültiger `call.member`-Mitgliedschaft; fremde Schlüssel gelten nur, wenn sie Olm-verschlüsselt vom genannten Gerät eines Mitglieds kommen. Verlässt jemand den Call, gibt es einen neuen Schlüssel (nach 5 s benutzt, wie Element Call). Der Call zeigt, ob er Ende-zu-Ende-verschlüsselt ist und wessen Schlüssel fehlt. Damit übernimmt Android die offenen Punkte aus [`ios/SECURITY-TODO.md`](../ios/SECURITY-TODO.md) nicht.
- **Sensible Ansichten:** Wiederherstellungsschlüssel und Passphrase erscheinen nicht in Screenshots, beim Bildschirmteilen oder im App-Umschalter (`FLAG_SECURE`).
- **Login:** OAuth/MAS im System-Browser (Custom Tabs) mit PKCE über das SDK.
- **Plugins:** laufen in einer abgeschotteten WebView ohne JS-Bridge zu Nachrichten oder Tokens, gleicher Vertrag wie Desktop und iOS (`docs/plugins.md`).

## Push

Homeserver → Matrix-Push-Gateway auf dem Server des UnifiedPush-Verteilers (z. B. ntfy, `/_matrix/push/v1/notify`; bietet er keins, `matrix.gateway.unifiedpush.org`) → Verteiler-App → Diddy. Wer das öffentliche Gateway nicht will, nimmt einen eigenen ntfy-Server. Diddy registriert pro Konto einen HTTP-Pusher mit `event_id_only` und lädt und entschlüsselt die Nachricht selbst über den Notification-Client des SDK. Ein Anruf-Push klingelt nur, solange der Anruf nicht abgelaufen ist. Ohne Verteiler gibt es eine Hintergrundverbindung (Foreground-Service vom Typ `remoteMessaging`, abschaltbar).

FCM ist bewusst nicht drin: Es bräuchte ein Firebase-Projekt, `google-services.json` und ein Gateway mit FCM-Zugangsdaten. Das ist eine Betreiber-Entscheidung (siehe unten).

## Bekannte Grenzen

- Nach **„Beenden erzwingen“** kommt kein Push an, bis Diddy wieder geöffnet wird (Android-Regel).
- Energiesparmodi mancher Hersteller verzögern Push und Hintergrundverbindung.
- **App-Ton beim Teilen** gibt es nur ab Android 10 und nur für Apps, die Aufnahme erlauben; DRM-Inhalte bleiben stumm. Er läuft über das Mikrofon-Signal, ist also bei stummem Mikro ebenfalls stumm.
- **Bildschirmteilen** endet, wenn Android es beendet (z. B. Sperren auf neueren Versionen); der Audio-Call läuft weiter.
- **Telefonie-Integration:** Diddy nutzt Anrufbenachrichtigungen (CallStyle) und einen Foreground-Service vom Typ `phoneCall`, aber noch nicht Core-Telecom. Was bei einem normalen Telefonanruf mitten im Diddy-Call passiert, muss auf Geräten geprüft werden.
- Noch nicht auf Android: Agent Voice, App-Icon wechseln.

## Offene Entscheidungen (Betreiber)

1. Soll es zusätzlich **FCM** geben (Geräte ohne Verteiler-App)? Dafür braucht es ein Firebase-Projekt und ein Push-Gateway (z. B. Sygnal) mit FCM-Zugang, und eine zweite Build-Variante.
2. **Play Store / F-Droid:** Konten, Richtlinien, Datenschutzerklärung, AAB, Signierstrategie (Play App Signing).
3. Welche Geräte sind Pflicht für die Abnahme ([Testprotokoll](android-testprotokoll.md))?
