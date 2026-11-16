# Android: Testprotokoll

Gehört zu [#233](https://github.com/Lndr2501/diddy/issues/233). Hier steht, was **wirklich** geprüft ist. Ein erfolgreicher Build ist kein Gerätetest.

Legende: **CI** automatisch bei jedem PR · **Gerät** von Hand auf echter Hardware · ⬜ offen · ✅ bestanden · ❌ fehlgeschlagen (mit Issue)

## Automatisch (CI, `Build Android`)

| Prüfung | Wo | Stand |
|---|---|---|
| Unit-Tests (Call-Logik, Schlüsselregeln, Push, Plugins, Profile, Bot-Karten-Fixtures, Layout) | `testDebugUnitTest` | ✅ lokal 16.11.2026 |
| Android Lint | `lintDebug` | ✅ lokal 16.11.2026 |
| Debug-APK baut, Signatur geprüft | `assembleDebug`, `apksigner verify` | ✅ lokal 16.11.2026 (ohne Signaturprüfung) |
| App startet, Login erscheint, Keystore versiegelt (API 26) | Job „Emulator smoke“ | ⬜ erster Lauf im PR |
| Dasselbe mit 16-KB-Speicherseiten (API 35) | Job „Emulator smoke“ | ⬜ erster Lauf im PR |
| Bot-Karten lesen wie am Desktop | `docs/fixtures/bot-cards.json`, beide Testsuiten | ✅ lokal 16.11.2026 |

Kein Emulator ersetzt Mikrofon, Bluetooth, Echo, Bildschirmteilen oder Akku.

## Geräte

Pflicht vor „alltagstaugliche Beta“: mindestens ein Pixel/AOSP-Gerät mit aktuellem Android und ein Gerät eines Herstellers mit strengem Energiesparen (z. B. Xiaomi, Samsung). Bei Google-freiem Einsatz zusätzlich ein Gerät ohne Google-Dienste mit zwei UnifiedPush-Verteilern.

| Gerät | Android | Hersteller-Energiesparen | Getestet von / am |
|---|---|---|---|
| – | – | – | noch keins |

## Abnahme auf dem Gerät

Für jede Zeile: Gerät, Gegenseite (macOS, Linux, Windows, iOS) und Datum eintragen.

### Konto und Verschlüsselung

| Fall | Stand |
|---|---|
| Login mit Passwort, mit OAuth/MAS (System-Browser), Registrierung | ⬜ |
| App beenden (Prozessende), neu starten: Session und Schlüssel noch da | ⬜ |
| Update über eine neue APK derselben Signatur: Session und Schlüssel noch da | ⬜ |
| Verschlüsselter Raum: senden/empfangen mit allen vier anderen Plattformen | ⬜ |
| Emoji-Verifizierung mit Desktop und iOS; Wiederherstellungsschlüssel eingeben | ⬜ |
| Wiederherstellungsschlüssel erscheint nicht in Screenshot und Bildschirmfreigabe | ⬜ |
| Logout ohne Netz: Hinweis, dass der Server nichts weiß | ⬜ |
| Bilder, Videos, Dateien, Sprachnachrichten (auch Ogg/Opus vom Linux-Desktop) | ⬜ |

### Push und Hintergrund

| Fall | Stand |
|---|---|
| UnifiedPush mit ntfy: Nachricht bei geschlossener App, Tap öffnet richtiges Konto und Raum | ⬜ |
| Verschlüsselte Nachricht per Push lesbar | ⬜ |
| Eingehender DM-Anruf bei geschlossener App: Anrufbenachrichtigung, Annehmen, Ablehnen | ⬜ |
| Verspäteter Anruf-Push (Flugmodus während des Klingelns) klingelt nicht mehr | ⬜ |
| Doze, Neustart vor/nach dem ersten Entsperren, Mitteilungsberechtigung verweigert | ⬜ |
| „Beenden erzwingen“: kein Empfang bis zum Öffnen (erwartet, dokumentiert) | ⬜ |

### Calls

| Fall | Stand |
|---|---|
| Sprachkanal mit Desktop und iOS, verschlüsselt; Anzeige „End-to-end encrypted“ | ⬜ |
| Jemand verlässt den Call: Schlüssel rotiert, Ton läuft ohne Aussetzer weiter (Log `rotated the media key`) | ⬜ |
| Fremdes Gerät ohne Mitgliedschaft bekommt keinen Schlüssel | ⬜ |
| 30 Minuten Audio-Call mit gesperrtem Display | ⬜ |
| Lautsprecher ↔ Hörmuschel ↔ Kabel ↔ Bluetooth wechseln | ⬜ |
| WLAN ↔ Mobilfunk während des Calls | ⬜ |
| Normaler Telefonanruf während des Diddy-Calls | ⬜ |
| Auflegen aus der Benachrichtigung; danach kein offenes Mikrofon | ⬜ |
| Kamera, Kamera drehen, Bildschirm teilen, Teilen beim Sperren beendet | ⬜ |
| App-Ton beim Teilen (YouTube-App, ein Spiel); Diddys eigener Ton kommt nicht zurück | ⬜ |
| Soundboard, MyInstants, Watch Together, Handy als Kamera für den Computer | ⬜ |
| Akku, CPU, Daten in 30 Minuten Call gemessen | ⬜ |

### Oberfläche

| Fall | Stand |
|---|---|
| Tablet oder offenes Foldable: Liste und Chat nebeneinander, Drehen | ⬜ |
| Zurück-Geste, Tastatur, große Schrift, TalkBack | ⬜ |
| Teilen aus anderen Apps, matrix.to-Links | ⬜ |
| Themes, Diddy-Profile, Bot-Karten, Plugins | ⬜ |
