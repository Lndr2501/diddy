# Diddy für iPhone und iPad

Eigene, native App (SwiftUI), keine Web-Ansicht: [matrix-rust-sdk](https://github.com/matrix-org/matrix-rust-sdk) (Swift-Paket `MatrixRustSDK` 26.10.27) für Chat und Verschlüsselung, [LiveKit](https://github.com/livekit/client-sdk-swift) 2.18 für Sprachkanäle und Bildschirmübertragung. Aufbau wie die Discord-App, Farben aus den Desktop-Themes (Standard: Diddy).

Die App ist Beta: Alles in der Tabelle ist gebaut und läuft bei den ersten Testern, ist aber noch nicht im Alltag geprüft.

| | |
|---|---|
| Server (Spaces) links, Kanäle daneben, Unter-Spaces als Kategorien | 🧪 |
| Text- und Sprachkanäle, Direktnachrichten unter „Home“ | 🧪 |
| Server beitreten und erstellen, Kanäle erstellen, Einladungen annehmen, „Alle Kanäle beitreten“, Server verlassen | 🧪 |
| Mitgliederliste nach Rollen mit Suche, Profilkarte (Nachricht, Blockieren, Entfernen, Bannen) | 🧪 |
| Live sehen, wer im Sprachkanal ist, mit Namen und Profilbild, auch in der Kanalliste | 🧪 |
| Antworten, Reaktionen (6 schnelle in der Leiste beim langen Drücken, ❤️ per Doppeltipp auf Text, jedes andere Emoji über „+“ und die Emoji-Tastatur), Bearbeiten, Löschen, @-Erwähnungen, Tippanzeige, Bilder senden und ansehen, Dateien öffnen; Nachricht nach links wischen zum Antworten | 🧪 Wischen erst ab iOS 18, davor langes Drücken |
| Eigenen Namen und Profilbild ändern | 🧪 |
| Diddy-Profile vom Desktop (Namensfarbe mit Verlauf, Schrift und Effekt, Banner mit Ausschnitt, Status, Badges, Über mich, Infos, Aktivität, Interessen, Links, Profileffekt und Profilrahmen, Diddy-Version) auf der Profilkarte, in Mitglieder- und DM-Liste und im Chat; Namensschilder (Farbe, Verläufe, Bild, GIF, Video) hinter Mitglieder- und DM-Zeilen; eigenes Profil bearbeiten wie am Desktop (alle Felder oben, Namensschild, gezeigte Badges, Kartenlayout, Effekt und Rahmen aus den Vorlagen) mit Vorschau | 🧪 State-Events und Nachrichtenmodus, auch in verschlüsselten Options-Räumen; eigene Effekt-/Rahmen-Dateien hochladen, Badges erstellen und Options-Raum einrichten nur am Desktop; Effekte und Rahmen nur auf der Profilkarte (wie am Desktop) |
| Sprachnachrichten aufnehmen (Mikrofon im Eingabefeld, Dauer und Wellenform wie am Desktop) und abspielen, auch normale Audiodateien | 🧪 Aufnahme als AAC/m4a; Ogg/Opus vom Linux-Desktop spielt iOS nicht ab |
| Bot-Karten (`dev.diddy.card`: Titel mit Fortschritt, Warteschlange, Listen, Hilfe, Statistik, Hinweise) mit Knöpfen und Zeitleiste, Befehlsvorschläge beim Tippen (`dev.diddy.commands`) | 🧪 |
| Themes wie am Desktop (Diddy, Light, Silver, Dark, Butter, Red, Green, Purple, Amber, DAAARK) unter Einstellungen > Theme, sofort aktiv | 🧪 nur auf dem Gerät gespeichert, kein eigenes Theme |
| Plugins wie am Desktop: 8 mitgelieferte, eigene per https-Adresse, Code, Datei oder GitHub-/Gist-Link; Einstellungen > Plugins, Anzeige über den Puzzle-Knopf neben dem Zahnrad | 🧪 abgeschottet wie am Desktop (iframe-Sandbox ohne Origin, eigener Speicher, nur https); kein Seitenleisten-Dock |
| Einstellungen: Chat (Zeitformat, Beitritte anzeigen, Bilder automatisch laden, Tipp- und Lesestatus teilen), Geräte (umbenennen), blockierte Nutzer, Über Diddy | 🧪 |
| Ende-zu-Ende-Verschlüsselung, Gerät mit Wiederherstellungsschlüssel bestätigen | 🧪 |
| Mehrere Konten auf verschiedenen Servern, jedes mit eigenem Speicher | 🧪 |
| Anmeldung mit Passwort oder über die Login-Seite des Servers (OAuth/MAS), nur über HTTPS | 🧪 |
| Sprachkanäle mit Desktop-Diddy und Element Call (gleiches MatrixRTC, gleiche Medien-Verschlüsselung) | 🧪 |
| Bildschirmübertragung | 🧪 ab iOS 27 ganzer Bildschirm, davor nur Diddy selbst |
| Stummschalten, Taubschalten, Kamera | 🧪 |
| Call-Kacheln wie am Desktop: eine Kachel pro Person und pro Bildschirmübertragung (Avatar oder Kamera, Sprechring, Stumm-Symbol), Tippen holt eine Kachel groß nach vorn, der Rest als Vorschauleiste; Bildschirmübertragungen groß und im Vollbild zoombar (Pinch, Doppeltippen, gezoomt verschieben) | 🧪 |
| „Redet mit Agent“ von Desktop-Nutzern als Hinweis auf Kachel und Profilkarte (`app.diddy.agent_voice`, nur empfangen; selbst mit einem Agenten reden gibt es auf dem iPhone nicht) | 🧪 |
| Soundboard im Sprachkanal: eigene Clips (bis 20 s) aus Dateien oder per MyInstants-Suche (Vorhören, Mehrfachauswahl) importieren, alle im Call hören sie über dein Mikrofon | 🧪 ein Clip gleichzeitig; Clips bleiben auf dem Gerät; bei stummem Mikrofon hört ihn niemand (wie am Desktop) |
| Klingeln in Direktnachrichten mit Annehmen und Ablehnen, kompatibel zu Desktop-Diddy und Element Call | 🧪 nur solange die App geöffnet ist |
| Sounds aus Diddys Soundpack (wie am Desktop) für Anrufe, Bildschirmübertragung, Nachrichten, Erwähnungen und Einladungen, unter Einstellungen > Sounds abschaltbar und anhörbar | 🧪 |
| Offline-Bildschirm: Sitzung bleibt erhalten, wenn der Server nicht erreichbar ist, und verbindet sich von selbst wieder | 🧪 |
| Logdatei und Diagnose-Export (Einstellungen > Über Diddy > Export Diagnostics): Log, Absturzberichte über MetricKit, Gerät und Version als Textdatei | 🧪 |
| App-Icon wechseln (Pink, Blau, Lila, Schwarz, Magenta) | 🧪 |
| Benachrichtigungen im Hintergrund (Nachrichten, Erwähnungen, Einladungen, Anrufe) | 🧪 Einstellung, aus ab Werk: die App läuft dafür im Hintergrund weiter (stilles Audio, kostet Akku). Ohne bezahltes Apple-Konto gibt es keinen Push-Dienst; nach einem Neustart des iPhones oder wenn iOS die App beendet, kommt bis zum nächsten Öffnen nichts |
| Anruf-Alarm bei geschlossener App über die ntfy-App („Name is calling you“), Einstellungen > Call Alerts | 🧪 nur bei Anrufen aus Diddy (Desktop oder iOS) |
| Echte Push-Benachrichtigungen bei geschlossener App | ❌ (braucht einen Push-Gateway und ein bezahltes Apple-Konto) |
| Online-Status (online, abwesend, nicht stören, offline) in DM-Liste, Chat-Kopf, Mitgliederliste und Profilkarte, eigener Status wird gesendet | 🧪 wird alle 60 s beim Server abgefragt (Sliding Sync liefert keine Presence); Server ohne Presence: nur der in Diddy gewählte Status |
| Nachrichten wie am Desktop: Spoiler, Code, Zitate, Listen, Überschriften, Link-Vorschauen (bis 2 pro Nachricht), Video im Chat, Standort, eigene Emoji (MSC2545) im Text und als Reaktion, Sticker | 🧪 |
| Lesebestätigungen („Gesehen von“), Linie „Neue Nachrichten“ mit Springen und Als-gelesen, zum Zitat springen, zu Datum springen, Threads, angeheftete Nachrichten, Link kopieren, Melden, Quelltext, Bearbeitungsverlauf, Löschen mit Grund, „Wer hat reagiert“ | 🧪 |
| Nachrichtensuche im Raum und überall, Schnellwechsler für Räume, DMs und Server | 🧪 |
| Eingabefeld: Dateien, Videos, Kamera, Einfügen, Entwürfe pro Raum, `#raum`- und `:emoji:`-Vorschläge, Emoji- und Sticker-Auswahl, Slash-Befehle, Formatierungsleiste | 🧪 |
| Sprachnachrichten von Linux (Ogg/Opus, WebM/Opus) abspielen | 🧪 |
| Raumliste: Favoriten, Langdruck-Menü (Favorit, gelesen, Benachrichtigungen, Einladen, Link, Einstellungen, Verlassen), Raumverzeichnis, Vorschau vor dem Beitritt, Server verwalten (Räume hinzufügen, empfohlen, erstellen mit allen Optionen), Server-Reihenfolge und Ordner wie am Desktop | 🧪 Reihenfolge vom Desktop kommt erst beim nächsten Öffnen der App an |
| Raum- und Server-Einstellungen: Name, Thema, Bild, Beitrittsregel, Verlauf, Verschlüsselung, Verzeichnis, Adressen, Upgrade; Rollen und Rechte bearbeiten; Mitglieder filtern, Rauswerfen und Bannen mit Grund, Entbannen, Einladung zurückziehen | 🧪 Bild-Icons für Rollen nur behalten, nicht neu anlegen |
| Calls: Lautstärke pro Person (0–200 %) und „Für mich stummschalten“, Stream-Lautstärke, Mikrofon- und Ausgabewahl, Ping, Reaktionen, mehrere Soundboard-Clips gleichzeitig, Abfrage beim Wechsel des Calls, Sounds einzeln an/aus und durch eigene Dateien ersetzen | 🧪 eigene Sounds nur MP3, WAV, M4A |
| Watch together (YouTube, synchron mit dem Desktop, SponsorBlock), Einstellungen > Watch together | 🧪 |
| Benachrichtigungen wie am Desktop: Stufen für DMs und Räume, Erwähnungsregeln, Stichwörter, E-Mail | 🧪 |
| Darstellung: System hell/dunkel, eigenes Theme aus drei Farben, Schwarz-Weiß, Zoom 75–150 % | 🧪 ohne Bild- und Video-Hintergründe |
| Sicherheit: andere Geräte abmelden, Geräte und Personen per Emoji verifizieren, Wiederherstellung einrichten, ändern und zurücksetzen, Schlüssel-Backup, E-Mail-Adressen, Entwicklerwerkzeuge | 🧪 Raumschlüssel exportieren/importieren nur am Desktop (das SDK gibt die Schlüssel nicht heraus) |
| Diddy-Profilwerkzeuge: Optionsraum einrichten, Badges erstellen und vergeben, Profil exportieren und importieren, eigene Effekt-, Rahmen- und Namensschild-Dateien | 🧪 |
| „Bitte nicht stören“ macht Mitteilungen, Töne und Klingeln still | 🧪 |
| Status-Schnellmenü, Plugin-Dock, Einführung beim ersten Start, Update-Hinweis, Verbindungsanzeige, Raum-Links öffnen in der App, Tastenkürzel auf dem iPad | 🧪 |

🧪 Beta: gebaut, läuft bei Testern, noch nicht im Alltag geprüft · ❌ fehlt noch

**Verschlüsselung in Sprachkanälen:** In verschlüsselten Räumen sind die Medien Ende-zu-Ende verschlüsselt wie bei Element Call. Es fehlen aber noch die Schlüsselrotation beim Verlassen (wer den Kanal verlässt, kennt den Schlüssel bis zum Ende des Anrufs weiter), und den eigenen Schlüssel bekommen die Geräte aus der LiveKit-Teilnehmerliste statt nur die Geräte mit einer MatrixRTC-Mitgliedschaft im Raum. Die Härtung ist geplant, siehe [SECURITY-TODO.md](SECURITY-TODO.md).

**Sounds:** Alle Sounds kommen aus Diddys eigenem Soundpack in `cinny/public/sound/diddy` (MP3, in SoundCraft gebaut), das auch die Desktop-App spielt; `project.yml` nimmt den Ordner in die App auf, die Zuordnung steht in `Sound.packFile` (`Diddy/App/Sounds.swift`). Der eigene Beitritt spielt wie am Desktop `user_join`. Mitteilungen können kein MP3 abspielen, deshalb liegen in `Diddy/Resources/Sounds` CAF-Kopien von Nachricht, Erwähnung, Einladung und Klingeln (`afconvert -f caff -d ima4 -c 1 message1.mp3 notification_message.caf`, ebenso `mention.mp3` → `mention.caf`, `invite.mp3` → `invite.caf`, `call_ringing.mp3` → `notification_ringtone.caf`). Der Klingelton folgt dem Stummschalter des iPhones und vibriert zusätzlich.

**Anruf-Alarm über ntfy:** Ein kostenloses Apple-Konto kann keine Push-Nachrichten empfangen. Deshalb schickt stattdessen der Anrufer den Alarm. Wer unter Einstellungen > Call Alerts den Alarm einschaltet, bekommt ein zufälliges ntfy-Topic. Diddy legt es als State-Event `app.diddy.call_push` (`{"server", "topic"}`, State-Key ist die eigene User-ID) in jeder Direktnachricht ab. Ruft dich jemand mit Diddy an, schickt seine App „Name is calling you“ an dieses Topic, und die ntfy-App zeigt es an. Das Topic können der Chatpartner und sein Server lesen. Anrufe aus Element und anderen Clients lösen keinen Alarm aus. Erlaubt sind nur HTTPS-Server.

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

Die App-Icons kommen aus dem Logo in `branding/`. Neu erzeugen: `python3 branding/export.py` (braucht `rsvg-convert` und Pillow).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `Diddy/App` | App-Start, Kontoliste, App-Icon |
| `Diddy/Matrix` | Login, Sessions im Schlüsselbund, Sync, Räume/Spaces, Timeline, Medien |
| `Diddy/Call` | Sprachkanal: MatrixRTC-Mitgliedschaft, JWT vom `lk-jwt-service`, LiveKit, Medien-Schlüssel, Rauschunterdrückung |
| `Vendor/rnnoise` | [RNNoise](https://github.com/xiph/rnnoise) für die Rauschunterdrückung (BSD-3, siehe README dort) |
| `Diddy/UI` | SwiftUI-Ansichten |

Sprachkanäle sprechen das Protokoll von Element Call 0.20 (Desktop-Diddy):
- Mitgliedschaft als Zustand `org.matrix.msc3401.call.member` mit Schlüssel `_@user:server_GERÄT_m.call`.
- LiveKit-Server des ältesten Teilnehmers (`oldest_membership`).
- Token vom `/sfu/get` des JWT-Dienstes.
- Pro Teilnehmer ein 16-Byte-Medienschlüssel als verschlüsselte To-Device-Nachricht `io.element.call.encryption_keys`, abgeleitet mit HKDF.
