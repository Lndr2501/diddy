# Rauschunterdrückung und Hintergrund-Benachrichtigungen

Branch `claude/issue-53-noise-suppression`, vier Commits auf Upstream `main` 2998d0d: iOS-Rauschunterdrückung, iOS-Benachrichtigungen, dieses Dokument und das Soundpack auf iOS.

## 1. Kurzfassung

Der Branch bringt:

- **Rauschunterdrückung für das Mikrofon auf iOS**, passend zur Desktop-Version, die schon in `main` ist (`0037d57`). Sie läuft auf dem Gerät, nutzt [RNNoise](https://github.com/xiph/rnnoise) und braucht weder Server noch Konto. Sie funktioniert mit selbst gehostetem LiveKit. Schalter "Noise suppression", standardmäßig an.
- **Benachrichtigungen im Hintergrund auf iOS** ohne bezahltes Apple-Konto, als Einstellung "Notifications in the background", standardmäßig aus.
- **Das Soundpack des Desktops auf iOS:** Die iOS-App spielt jetzt dieselben MP3-Sounds wie die Desktop-App.

Der erste Teil beantwortet Issue [#53 "Add Krisp intigration"](https://github.com/Lndr2501/diddy/issues/53). Krisp selbst wird nicht eingebaut, die Gründe stehen in Abschnitt 2. Der zweite Teil gehört nicht zu #53; er ist im Branch, weil iOS ohne bezahltes Apple-Konto keine Push-Benachrichtigungen kann (Abschnitt 4.3).

Nicht in einem echten Anruf mit echtem Mikrofon geprüft, siehe Abschnitt 7.

## 2. Warum nicht Krisp

- Das Krisp SDK ist ein kommerzielles Produkt und braucht eine kommerzielle Lizenz von Krisp Technologies: [Licensing information](https://developers-docs.krisp.ai/docs/licensing-information.md).
- Zugang gibt es nur über ein Vertriebsformular, das Firmenname und Anzahl der Nutzer (Seats) abfragt; der Preis wird individuell vereinbart: [krisp.ai/contact-sales](https://krisp.ai/contact-sales/?product=sdk).
- LiveKits Swift-Krisp-Filter: Die README nennt ihn ein Feature von LiveKit Cloud, die LICENSE verweist nur auf die LiveKit-Cloud-Bedingungen: [livekit/swift-krisp-noise-filter](https://github.com/livekit/swift-krisp-noise-filter).
- Das JS-Paket `@livekit/krisp-noise-filter` hat die Lizenzangabe "SEE LICENSE IN https://livekit.io/legal/terms-of-service": [package.json](https://unpkg.com/@livekit/krisp-noise-filter/package.json).
- Auf die Frage nach Krisp mit selbst gehostetem LiveKit hat LiveKit das Issue als "not planned" geschlossen und auf Krisps eigenes JS-SDK verwiesen: [client-sdk-js#1510](https://github.com/livekit/client-sdk-js/issues/1510).
- Krisps iOS-Weg braucht einen gepatchten WebRTC-Build auf Basis von Chrome 121: [WebRTC iOS](https://developers-docs.krisp.ai/docs/webrtc-ios.md).

Diddy nutzt selbst gehostetes LiveKit, die an LiveKit Cloud gebundenen Filter passen deshalb nicht. Ob sie technisch auch ohne Cloud scheitern würden, wurde nicht getestet.

## 3. Warum RNNoise

| | RNNoise | GTCRN | DeepFilterNet |
|---|---|---|---|
| Lizenz | BSD-3 ([xiph/rnnoise](https://github.com/xiph/rnnoise)) | MIT ([Xiaobin-Rong/gtcrn](https://github.com/Xiaobin-Rong/gtcrn)) | MIT oder Apache-2.0 ([Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet)) |
| Abtastrate | echte 48 kHz | intern 16 kHz | 48 kHz (Vollband) |
| Web | fertiges AudioWorklet in `@sapphi-red/web-noise-suppressor` (MIT) | im selben Paket, rechnet auf 16 kHz um | kein offizielles Web-Paket, nur ein Wrapper eines Dritten |
| iOS | C-Code, wird direkt in die App kompiliert | müsste portiert werden | kein offizieller iOS-Weg |

- GTCRN schneidet in der Tabelle seiner Autoren besser ab als RNNoise. Es wurde hier **nicht** in einem Hörvergleich gemessen.
- DeepFilterNet ist laut der Vergleichstabelle der GTCRN-Autoren rund zehnmal rechenintensiver als RNNoise.
- Ausschlaggebend für RNNoise war der Aufwand: Für Web und iOS gibt es fertige, lizenzmäßig unkritische Wege, und es arbeitet bei 48 kHz, der Rate von WebRTC/LiveKit.

## 4. Was der Branch ändert

### 4.1 Desktop: schon in `main`

Die Desktop-Rauschunterdrückung kam unabhängig von diesem Branch mit `0037d57` nach `main`: dasselbe Paket (`@sapphi-red/web-noise-suppressor`), derselbe Schalter "Noise suppression" und derselbe Einstellungsschlüssel. Dieser Branch hatte eine eigene Desktop-Umsetzung; beim Aufsetzen auf `main` wurde sie zugunsten der Version in `main` verworfen. Drei Unterschiede der verworfenen Variante, falls sie nützlich sind:

- **Ausgabegeräte mit 44,1 kHz:** `main` lässt die Rauschunterdrückung dann aus. Die verworfene Variante ließ den Filter in einem eigenen 48-kHz-AudioContext laufen und reichte das Ergebnis per MediaStream an den Mixer. Das funktionierte im WKWebView, kostete dort aber etwa 47 ms zusätzliche Verzögerung.
- **Stummes Mikrofon vermeiden:** Das Worklet meldet nicht, wenn es das Wasm nicht laden kann, und bleibt dann still. Die verworfene Variante prüfte das Wasm vorher mit `WebAssembly.compile` und fiel sonst aufs normale Mikrofon zurück.
- **Aufräumen:** Sie rief beim Beenden `RnnoiseWorkletNode.destroy()` auf, damit der Zustand im Worklet freigegeben wird.

### 4.2 iOS: Rauschunterdrückung

- `ios/Vendor/rnnoise`: RNNoise v0.2 als C-Quelle in der App (nur ARM-Dateien; eine Änderung, damit v0.2 auf ARM kompiliert, siehe die dortige README). Einbindung über `Diddy-Bridging-Header.h` und `project.yml`.
- `ios/Diddy/Call/RNNoiseFilter.swift`: RNNoise auf einem Kanal mit 10-ms-Frames (480 Samples bei 48 kHz), in place. Bei anderer Framelänge wird auf 480 Samples gestreckt und zurück. Erwartet Samples im 16-Bit-Bereich.
- `ios/Diddy/Call/NoiseSuppressor.swift`: hängt sich als `capturePostProcessingDelegate` von LiveKits `AudioManager` ein, ein Filter pro Kanal, auf WebRTCs Audio-Thread. Kann RNNoise nicht starten, läuft das Audio unverändert durch.
- Schalter "Noise suppression" in den iOS-Einstellungen, Standard an. Er wirkt sofort (`NoiseSuppression.apply()`), auch mitten im Call. `CallManager` ruft `apply()` ebenfalls auf.

### 4.3 iOS: Benachrichtigungen im Hintergrund

Warum: Ein kostenloses Apple-ID-Provisioning-Profil enthält kein `aps-environment`, also gibt es keinen Apple-Push, und nichts kann eine angehaltene App wecken.

Wie:

- Einstellung "Notifications in the background", **standardmäßig aus** (kostet Akku). Beim Einschalten fragt die App nach der Berechtigung für Mitteilungen; wird sie verweigert, bleibt der Schalter aus.
- `BackgroundKeepAlive.swift`: Im Hintergrund spielt die App Stille (`AVAudioEngine`, Kategorie `.playback` mit `.mixWithOthers`) im bereits vorhandenen Hintergrundmodus `audio`. Andere Apps (Musik) laufen weiter. Der Sync läuft damit weiter. Es startet beim Wechsel in den Hintergrund, stoppt im Vordergrund und startet nach Unterbrechungen (Telefonat, Siri) und nach einem Reset der Mediendienste neu.
- Während eines Calls pausiert das Keep-Alive: Der Call besitzt die Audiosession und hält die App selbst am Laufen. Nach dem Call startet es wieder.
- `LocalNotifications.swift`: lokale Mitteilungen für neue Nachrichten, Erwähnungen, Einladungen und eingehende Anrufe, nur wenn die App nicht im Vordergrund ist und die Einstellung an ist.
  - Eine Mitteilung pro Raum, die neuere ersetzt die ältere. Mit Absender und Text, wenn die Nachricht lesbar ist; sonst "New message" bzw. "You were mentioned".
  - Das App-Icon zeigt die Anzahl ungelesener als Badge. Mitteilungen für Räume, die anderswo gelesen wurden, werden entfernt.
  - Tippen auf eine Mitteilung öffnet den Raum.
  - Im Hintergrund klingelt statt des Klingeltons eine Anruf-Mitteilung ("Incoming call"), damit der Stumm-Schalter gilt. Im Vordergrund bleibt der Klingelton.
  - Im Vordergrund zeigt iOS keine Banner; dort spielt die App wie bisher ihre eigenen Töne.
- Es synchronisiert nur das aktive Konto, also benachrichtigt auch nur dieses.

### 4.4 iOS: Soundpack

- Die MP3s aus `cinny/public/sound/diddy` (das Soundpack aus `82b2b75`) kommen über `project.yml` direkt in die iOS-App, es gibt also nur eine Quelle für beide Apps.
- 13 der 20 iOS-Sounds nutzen eine Pack-Datei (`Sound.packFile` in `Sounds.swift`): Klingeln, Nachricht, Mute/Unmute, Deafen/Undeafen, Kamera an/aus, Bildschirmübertragung Start/Ende, jemand kommt/geht, du verlässt den Call (`disconnect`).
- Für Freizeichen, eigenen Beitritt, Erwähnung, Einladung, abgelehnten Anruf, keine Antwort und Verbindungsabbruch hat das Pack keinen Sound (die Einladung gibt es nur als `.ogg`, das iOS nicht abspielt). Dafür bleiben die synthetisierten Töne aus `ios/Tools/make_sounds.py`; die 13 ersetzten wurden aus Skript und Ordner entfernt.
- Mitteilungen können kein MP3 abspielen. Nachricht und Klingeln liegen deshalb zusätzlich als CAF-Kopie in `ios/Diddy/Resources/Sounds` (mit `afconvert` umgewandelt, siehe `ios/README.md`).

### 4.5 Dateien

| Datei | Inhalt |
|---|---|
| `ios/Vendor/rnnoise/` | RNNoise v0.2 (BSD-3, `COPYING`) |
| `ios/Diddy/Call/RNNoiseFilter.swift` | RNNoise auf Audioframes |
| `ios/Diddy/Call/NoiseSuppressor.swift` | LiveKit-Delegate, Schalter-Logik |
| `ios/Diddy/Call/CallManager.swift` | `apply()`, Keep-Alive um Calls, Anruf-Mitteilung |
| `ios/Diddy/App/BackgroundKeepAlive.swift` | stilles Audio im Hintergrund (neu) |
| `ios/Diddy/App/LocalNotifications.swift` | lokale Mitteilungen (neu) |
| `ios/Diddy/App/AppModel.swift`, `DiddyApp.swift`, `Sounds.swift`, `Matrix/MatrixAccount.swift`, `UI/MainView.swift`, `UI/SettingsView.swift` | Anbindung, Einstellungen |
| `ios/project.yml`, `ios/Diddy/Call/Diddy-Bridging-Header.h` | Build-Einbindung von RNNoise |
| `ios/Diddy/App/Sounds.swift`, `ios/Tools/make_sounds.py`, `ios/Diddy/Resources/Sounds/` | Soundpack statt synthetisierter Töne, CAF-Kopien für Mitteilungen |
| `CHANGELOG.md`, `ios/README.md` | Einträge |

## 5. Messungen

Testsignal: synthetische Sprache aus macOS `say` (deutsche Stimme), gemischt mit synthetischem Lüfterrauschen, Tastenklicks und einer leisen zweiten Stimme, 48 kHz. "Noise-only" ist der Pegel in dem Abschnitt ohne Sprache (niedriger ist besser). SI-SDR misst die Sprachqualität (höher ist besser).

| Messung | Noise-only | SI-SDR | Verzögerung |
|---|---|---|---|
| Mix aller Störgeräusche, Eingang | -26,4 dB | 1,2 dB | - |
| Web-Filter (dasselbe RNNoise-Worklet wie in `main`) im echten WKWebView (WebKit, Engine der macOS-App), im 48-kHz-Kontext | -52,7 dB | 7,0 dB | +21 ms (68 ms gegenüber 47 ms Grundwert der Testkette ohne Filter) |
| Web-Filter in Chromium (über den eigenen 48-kHz-Kontext) | -50,8 dB | 7,0 dB | - |
| iOS-Filter (`RNNoiseFilter` der App, nativ auf dem Mac kompiliert) | -82,1 dB | 8,5 dB | 20 ms; Echtzeitfaktor ca. 0,007 |
| Nur Lüfter, Eingang | -28,9 dB | 5,0 dB | - |
| Nur Lüfter, WKWebView | -62,3 dB | 9,0 dB | - |
| Nur Lüfter, iOS | -113,3 dB | 9,4 dB | - |

- Die Web-Werte stammen aus der verworfenen Desktop-Variante. Bei 48 kHz läuft sie wie die Version in `main` (dasselbe Worklet direkt im Kontext des Mixers), die Zahlen sollten also übertragbar sein; gemessen wurde die Version in `main` nicht.
- Der iOS-Filter ist stärker als der Web-Filter. Vermutlicher Grund (Schlussfolgerung, nicht geprüft): Das Web-Paket liefert ein kleineres Wasm (ca. 150 KB) als das Modell von RNNoise 0.2.
- Es sind synthetische Signale, keine Aufnahmen echter Umgebungen. Die Werte sagen nichts darüber, wie es bei echten Stimmen und Räumen klingt.

## 6. Geprüft

- Der Branch ändert am Web-Client nichts mehr. Die Web-Unit-Tests, `tsc` und der Vite-Build laufen auf dem Branch durch.
- Die iOS-App baut für Simulator und Gerät und wurde auf einem iPhone installiert.
- WebRTC-Quellcode (webrtc-sdk m125/m137, `audio_buffer.cc`): `rawBuffer` liefert Samples im 16-Bit-Bereich (FloatS16). Das ist der Bereich, den RNNoise erwartet.

## 7. Nicht getestet / offene Punkte

- Kein echter Call mit echtem Mikrofon auf iOS.
- Die iOS-Schalter wurden im Simulator nicht gesehen (kein Login).
- Hintergrund-Benachrichtigungen wurden noch nicht auf einem Gerät mit echtem Konto probiert; der Akkuverbrauch ist nicht gemessen.
- Nur das aktive Konto synchronisiert, nur dieses benachrichtigt.
- iOS kann die App trotzdem beenden (Neustart, wenig Speicher). Dann kommt nichts an, bis Diddy wieder geöffnet wird.
- Der App Store würde den Ansatz mit stillem Audio ablehnen; für Sideloading ist er in Ordnung.
- Echter Push bräuchte ein bezahltes Apple-Konto und ein Push-Gateway (z. B. Sygnal).
- Die Pack-Sounds auf iOS wurden im Simulator-Build geprüft (alle 20 Sounds finden ihre Datei), aber noch nicht auf dem iPhone angehört; Lautstärke gegenüber dem Call ist nicht abgestimmt.
- Der Workflow *Build iOS* startet nur bei Änderungen unter `ios/`. Ändert sich nur das Soundpack, baut er nicht von selbst neu.

## 8. Lizenzen

- RNNoise: BSD-3-Clause, mitgeliefert unter `ios/Vendor/rnnoise` mit `COPYING`.
- `@sapphi-red/web-noise-suppressor`: MIT. Das enthaltene Wasm stammt aus shiguredo/rnnoise-wasm (Apache-2.0).
- Diddy selbst: AGPL-3.0.

## 9. Ausprobieren

**Desktop:** Einstellungen → Calls → "Noise suppression" (Version aus `main`).

**iOS:** Einstellungen → "Noise suppression" (standardmäßig an, wirkt sofort, auch im Call). Darunter "Notifications in the background" (standardmäßig aus). Beim Einschalten fragt iOS nach der Erlaubnis für Mitteilungen. Zum Testen: Schalter an, App in den Hintergrund legen, aus einem anderen Konto eine Nachricht oder einen Anruf schicken.
