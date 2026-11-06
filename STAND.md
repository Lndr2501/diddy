# Stand 2026-11-06

Statusbericht des Entwicklungsstands (Diddy, nach 1.1.0, kein neues Release).

## Profile für später beitretende Mitglieder (2026-11-06)

- Entscheidung des Nutzers: Der Nachrichtenmodus ist der Standardweg, es sollen keine Admin-Rechte nötig sein (ein Admin legt den Raum einmal an und markiert ihn). State-Modus wird abgelehnt, weil State-Ereignisse nie verschlüsselt sind und der Schutz zählt. Umsetzung: Daten werden nur noch als State geschrieben, wenn der Raum **unverschlüsselt** ist **und** wir State schreiben dürfen (`stateTransport()` in `profiles.ts`, Rechteprüfung vorab statt erst `M_FORBIDDEN`). Ein nur vom Admin markierter Raum ohne Schreibrechte gilt jetzt als Nachrichtenmodus (vorher als State: Neuübermittlung und Backfill wurden dort übersprungen).
- Neuübermittlung verwirft Joins in der Ruhephase nicht mehr, sondern beantwortet sie nach deren Ende (Issue #8). Typvergleich weiterhin 879 ohne Zugaben, 55 JavaScript-Tests grün.
- Badge-Schutz (Issue #15) behoben: Der Nachrichten-Cache hält jetzt pro Schlüssel **und Absender** einen eigenen Slot, die Regeln stehen in `diddy/trust.ts` (pure Logik, `tests/trust.test.cjs`). Neue Badge-IDs tragen ein Kürzel des Erstellers (`c.<11 Zeichen>.<Zeit><Zufall>`), nur dieser darf sie definieren. Ältere IDs: weiterhin "erster Schreiber gewinnt" (Neuübermittlung kann dort die Reihenfolge für Neue verfälschen, bleibt Restrisiko). Verleihungen gelten pro Vergebendem; entfernen kann sie nur der Vergebende selbst oder der Empfänger. Folge für die Oberfläche: Das Abwählen eines Badges im Vergabemenü wirkt nur auf eigene Vergaben bzw. wenn man selbst Empfänger ist. Im State-Modus (unverschlüsselt) bleibt der einzelne State-Slot überschreibbar. 63 JavaScript-Tests grün, Typvergleich 879 ohne Zugaben, nicht gebaut.
- Badges werden jetzt ebenfalls neu übermittelt (Nutzerentscheidung): Jeder Client schickt in Nachrichtenmodus-Räumen nur seine **eigenen** Badge-Definitionen und **selbst vergebenen** Verleihungen erneut (an den echten Absender gebunden, Widerrufe nicht), neueste zuerst bis zu den Absender-Grenzen (25/200), nacheinander mit 300 ms Abstand. Eigener Zeitplan: 60 s Sammelphase, pro Raum höchstens alle 15 Minuten. Einträge, die schon als State im Raum liegen, werden übersprungen. Grenze: Verleihungen eines abwesenden Vergebenden erreichen Neue nicht. Nur per Node-Test der Zeitregeln geprüft, noch nicht getippt/gebaut/an Hardware getestet.
- Ausgangspunkt: In einem Optionsraum, dessen Daten als ganz normale Timeline-Ereignisse laufen ("Nachrichtenmodus"), sieht ein Mitglied, das heute beitritt, die Profile von letztem Jahr nicht - Matrix schickt keinem Beitretenden alte Timeline-Ereignisse.
- Reguläre Optionsräume sind davon nicht betroffen: dort liegt jedes Profil als State-Ereignis `app.diddy.profile` mit `state_key` = Nutzerkennung, also genau ein fester Slot pro Person, den jeder Beitretende automatisch erhält.
- Schreibweg umgestellt: Ein Raum mit der Markierung `app.diddy.options` versucht jetzt immer zuerst das State-Ereignis, auch wenn er früher als Nachrichtenmodus-Raum ausgewählt wurde. Nur bei `M_FORBIDDEN` wird umgeschaltet (pro Sitzung gemerkt, damit nicht jeder Schreibversuch scheitert).
- Neu `diddy/reannounce.ts`: In Räumen ohne State-Zugang wird das eigene Profil erneut geschickt, wenn der eigene Client beitritt/online kommt und wenn andere Mitglieder danach beitreten. Begrenzt gegen Spam: 20 s Sammelphase, pro Raum mindestens 5 Minuten Abstand, ältere Joins als die letzte eigene Antwort werden ignoriert, maximal 50 Räume wartend. Ein eigener Profil-Schreibvorgang zählt als Antwort.
- Tests: 7 neue Fälle für die Regeln der Neuübermittlung, 1 neuer Fall für Trim-Parität mit dem nativen Host (U+0085 gilt nativ als Leerzeichen, JavaScript sonst nicht) - insgesamt 54 JavaScript-, 9 native und 5 Renderzustände grün, Typvergleich unverändert 879 ohne Zugaben.
- Beim neuen Rust-Test zuerst ein echter Fehler: eine abgelehnte Fensterreservierung hat den bisherigen Inhaber überschrieben, wodurch die laufende Öffnung ihren Label nie wieder freigegeben hätte (der Raum wäre für immer "wird gerade geöffnet" geblieben). Behoben mit einer Reservierung, die nur bei freier Stelle einträgt.
- Vierter Teststand gebaut, signiert (identitätsgleich) und installiert; Hauptfenster plus drei gespeicherte Dev-Profile laufen wieder in einem Prozess.

## Versehen: gelöschte Sicherungskopien auf dem Mac (2026-11-06)

- Ein `rsync --delete` vom Container in `~/diddy-build` hat dort das nicht versionierte Verzeichnis `previous-apps/` samt älterer `.app`-Kopien und die Build-Protokolle gelöscht. Ursache: Zielverzeichnis gemischt ( Quellbaum und Arbeitsablage desselben Ordners).
- Nicht betroffen: Code (`git rev-parse HEAD` identisch auf beiden Seiten), die installierte App, alle Konten/Verschlüsselungsdaten. Ältere Pakete existieren weiterhin in `~/Diddy-B.app`, `~/diddy-prev`, `~/diddy-dmg` und im Papierkorb.
- Konsequenz für alle weiteren Schritte: Synchronisierung nur noch ohne `--delete`; Sicherungen und Protokolle liegen außerhalb des übertragenen Baums in `~/diddy-app-backups/` (dort jetzt auch eine Kopie der zuvor installierten Version).

## Review-Runde 1 der Verbindungsfunktion und dritter Teststand (2026-11-06)

- Read-only-Fremdprüfung (Pi/GPT-6.1 Sol, Thinking high) fand sechs Punkte; alle wurden gegen den Code verifiziert und sechs behoben bzw. abgefangen. Kein Punkt betraf Kontodaten, Schlüssel oder die Isolation des Hauptspeichers.
- Verbindungsliste kann nicht mehr unlesbar werden: Längenlimit gilt jetzt für Eingabe und prozentcodiertes Ergebnis (UTF-8-Bytes,Frontend und nativ identisch). Vorher konnte eine Unicode-Adresse einen Eintrag speichern, den `read_profiles` danach ablehnt und damit die gesamte Liste blockiert.
- Konten werden erst nach erfolgreich geöffneter Fenstererstellung gespeichert; ein Fehlversuch belegt keinen der 20 Plätze mehr. Der Registrierungs-Lock wird während der Fenstererstellung nicht mehr gehalten, wodurch andere Verbindungsaufrufe bis zu 30 Sekunden blockiert waren.
- Späte Fenstererstellung nach einem Timeout wird abgebrochen (Cancel-Flag plus Label-Prüfung auf dem Main-Thread); laufende Öffnungen werden über eine `opening`-Menge dedupliziert. Ein normaler Zweitstart ohne Verbindungsoptionen stellt das Hauptfenster wieder her, wenn es geschlossen war, der Prozess aber mit Zweitfenster weiterläuft.
- Behobene Upstream-Schwachstelle: `useAsyncCallbackValue` startete seinen Ladeaufruf ohne Behandlung der Ablehnung; jeder fehlgeschlagene Abruf (z. B. Discovery-Timeout) war ein unbehandelter Promise-Fehler in der Konsole.
- Tests: 46 JavaScript-, 8 native (inkl. Unicode-Längenroundtrip) und 5 Renderzustände bestanden; Typvergleich unverändert 879 bestehende Diagnosen, keine zusätzlichen. Gebaut, mit gleicher Signieridentität installiert und gestartet.
- Nach dem Austausch laufen wieder drei getrennte Dev-Fenster gegen `http://127.0.0.1:8008` (zwei automatisch, eines vom Nutzer über die Oberfläche angelegt). Beobachtung: Die Fenstererstellung dauert am Mac rund 45–55 Sekunden und ist damit deutlich langsamer als erwartet; Ursache noch offen. Das lokale Synapse-Volumen enthält weiterhin keine Testkonten.

## Neuer Teststand: Homeserver-Ausfall und Verbindungsübersicht (2026-11-06)

- Auf dem Mac gebaut, mit unveränderter Signieridentität installiert und gestartet. Signatur nach dem Start gültig; ausgelieferte Frontend-Dateien und installierte native Binärdatei entsprechen dem geprüften Build. Vorversion gesichert, keine Browser-/Accountdaten gelöscht. Kein Commit, Push oder Release.
- Statt endlosem "Connecting to server": klare Verbindungsseite mit Server-Adresse, "Erneut versuchen" und "Anderen Server verbinden". Versionsabfrage und Discovery sind einschließlich Antwortkörper auf 8 Sekunden begrenzt und bei Wiederholung/Unmount abbrechbar. Auch bei langsamer Client-Initialisierung/Synchronisierung sind Verbindungsoptionen erreichbar.
- "Verbindungen" ist zusätzlich in Titelleiste, Login-Kopfzeile und Verbindungsfehler-Banner verfügbar. Ursprüngliches Fenster und gespeicherte Alternativen können geöffnet werden; der lokale Testserver kann ausdrücklich ausgewählt werden.
- Andere Server öffnen eine eigene native Anmeldung innerhalb Diddys, keine zusätzliche App-Kopie. Die ursprüngliche Anmeldung verwendet unverändert ihren bisherigen Datenspeicher. Auf macOS 14+ werden persistente WKWebsiteDataStores mit eigener UUID verwendet; weil Wry bei eigener WK-Konfiguration den Builder-Identifier ignoriert, wird der Store direkt in der WK-Konfiguration gesetzt und ein Rückfall auf den Default-Store verweigert. Andere Plattformen verwenden getrennte Datenverzeichnisse, wurden aber nicht gestartet.
- Gespeichert werden nur Profilkennung und Server-Adresse, keine Tokens/Passwörter. Bestehende Profilkennungen dürfen nicht auf andere Server umgebogen werden. HTTPS erforderlich, HTTP nur für Loopback-Testserver. Keine automatischen Logouts oder Cache-Löschungen durch diese neuen Aktionen; bisherige destruktive Startmenü-Aktionen sind entfernt. Audio-Bridge-Listener werden pro Verbindungsfenster wiederverwendet statt bei jedem Wiederöffnen neu anzuwachsen.
- Prüfung: 44 JavaScript-Regressionstests, 3 native Rust-Tests und 5 serverseitige Renderprüfungen mit den echten UI-Komponenten bestanden. Typvergleich bleibt bei 879 vorhandenen Diagnosen, ohne zusätzliche. Browserautomatisierung war nicht verfügbar; echte Anmeldung, Wechsel zurück und persistentes Wiederöffnen eines alternativen Profils sind noch durch den Nutzer zu prüfen.
- Der lokale Synapse-Testserver auf dem Mac ist unter `http://127.0.0.1:8008` erreichbar. Docker Desktop veröffentlichte am rein internen Netzwerk den Port nicht; nach Konfigurationssicherung wurde Föderation ausdrücklich mit leerer Whitelist gesperrt, nur die Client-API aktiviert und ein normales Zugriffsnetz ergänzt. Port ausschließlich an Loopback gebunden, Föderations-API liefert 404, vorhandenes Datenvolume erhalten. Das ist noch kein vollständiger lokaler MatrixRTC-/LiveKit-Call-Stack.

## Rückmeldung zum ersten Teststand und zweiter Teststand (2026-11-06)

- Nutzer meldet weiter kurze Musik-Unterbrecher beim Call-Beitritt und Mikrofonwechsel sowie schlechte Stream-Qualität. Der Schlüsselbund-Dialog zum lokalen WebCrypto-Schlüssel erschien nach dem Update; die App-Signatur ist dennoch gültig. Nicht als erneute Paketbeschädigung ausgelegt. Ob der Dialog nach "Immer erlauben" wiederkehrt, ist offen; keine Schlüsselbund-Einträge gelöscht oder Zugriffsregeln pauschal geändert.
- Aktuelle Logs bestätigen korrekt angeforderte `voiceIsolation: false`, aber tatsächlich gesendete 640×360 bei etwa 29 fps. Die frühere 1080p-Messung belegt daher nicht die Qualität dieses Testlaufs.
- Nur lesende Geräteprüfung: USB-Audio, Standardausgang 44,1 kHz und Standardeingang 48 kHz; WebKit lieferte Mikrofon-Audio mit 44,1 kHz. Kein Bluetooth-Profilwechsel als Erklärung angenommen.
- Zweiter Teststand, am 2026-11-06 gegen 17:33 auf dem Mac installiert und gestartet: gemeinsamer Soundboard-/Ton-Kontext verwendet die Plattform-Standardrate statt erzwungener 48 kHz. Der separate 48-kHz-Kontext für native Stream-PCM-Daten bleibt unverändert. Wirkung auf echte Unterbrecher unbewiesen.
- Stream-Kandidat ergänzt bei nur als Obergrenze angegebenen Dimensionen die passende Wunschauflösung (`ideal`) und wendet sie nach der Auswahl auf den Live-Track an, mit begrenzter Wartezeit und Video-Fallback bei Fehlern. Bestehende explizite Wünsche/Grenzen bleiben erhalten. Noch keine verbesserte echte Auflösung behauptet.
- 26 hardwarefreie Mock-/Regressionstests auf dem Mac bestanden. Gesamt-Typvergleich mit HEAD: weiterhin 879 Diagnosen, keine zusätzlichen. Nach Freigabe des Nutzers außerhalb des Calls auf dem Mac gebaut, mit unveränderter Signieridentität installiert, nach dem Start auf gültige Signatur geprüft; ausgelieferte Einstiegsskripte und beide neuen Codepfade verifiziert. Vorversion separat gesichert. Echter Audio-/Qualitäts-Test dieses zweiten Stands steht noch aus. Keine parallelen Agenten, kein Container-Build, kein Push/Release.

## Nachprüfung und erste lokale Korrekturen (2026-11-06)

- Nutzer bestätigt: Profil-Aussehen synchronisiert zwischen zwei Accounts/Clients. Die Diddy-Datenereignisse sind absichtlich ausgeblendet; das ist kein fehlender Chat-Verkehr.
- Audio-Ruckler bestehen weiter. Konkreter Codefehler: "Voice processing" aus ließ `voiceIsolation: true` durch. Lokal korrigiert, auch bei der Mikrofon-Freigabe für die Geräteliste. Diagnose zeigt die tatsächlich erfolgreichen Constraints und fehlende Browser-Angaben als `null`.
- Stream-Start/Neustart hängt laut Nutzer und Logs; Ursache noch nicht bewiesen. Lokale Absicherungen: synchroner iframe-Fokus, native Freigabe vor Audio-Vorbereitung, nur eine laufende Anfrage, eindeutige Phasen-Logs und sauberes Aufräumen auch bei `video.stop()`. Abbruch beendet nun auch wartende Audio-Verbindungen und Worklet-Vorbereitung.
- Die anfänglichen 640×360 sind kein belegtes Sender-Limit: vorhandene Sender-Statistik zeigte später auch 1864×1080 bei 29 fps. Qualität weiterhin praktisch zu prüfen.
- 19 Mock-/Regressionstests auf dem Mac bestanden. Vollständiger Typcheck mit dem vorhandenen TypeScript 4.9.4 bleibt rot: 879 Diagnosen sowohl im HEAD-Vergleich als auch mit den Änderungen; keine zusätzlichen Diagnosen. Kein erfolgreicher Gesamt-Typcheck behauptet.
- Teststand am 2026-11-06 auf dem Mac gebaut, mit der bisherigen lokalen Identität signiert und installiert. Signatur auch nach dem Start gültig; die bisherige App wurde separat gesichert, nicht gelöscht. Haupt-App und Zweitclient wurden gestartet; der Zweitclient lädt das neue Frontend der Haupt-App, sein eigenes App-Paket wurde nicht neu gebaut. Ausgelieferte Einstiegsskripte und neue Call-Korrekturen im laufenden Server geprüft. Echter Call-/Stream-Test durch den Nutzer steht noch aus.
- Die Korrekturen sind weiterhin uncommittet und nicht gepusht; kein Release erstellt.
- Ressourcenregel: keine parallelen Hilfsagenten mehr für diese Arbeit; keine Builds/Typchecks im Container. Tests/Typchecks auf dem Mac nacheinander mit niedriger Priorität. App-Build erst, wenn der Nutzer nicht im Call/Stream ist.

### Vergleich anderer Clients

- Element trennt Call-/Browserlogik und nativen Electron-Host. Der Desktop-Host nutzt den macOS-15+-Systempicker; ausstehende Picker-Callbacks werden nur einmal verbraucht. Das sind sinnvolle Lebenszyklus-Muster, aber keine direkt auf WKWebView übertragbaren Electron-APIs. [Host-Code](https://github.com/element-hq/element-web/blob/f0211b94364dd86387ce2b592d389e540b6b073e/apps/desktop/src/electron-main.ts#L374-L397), [Callback](https://github.com/element-hq/element-web/blob/f0211b94364dd86387ce2b592d389e540b6b073e/apps/desktop/src/displayMediaCallback.ts#L18-L30).
- Die exakt eingebettete Element-Call-Version sieht bereits 1080p/30 als Screen-Share-Encoding vor. Die aktuellen 360p erfordern daher eine Prüfung der tatsächlichen Capture-/Track-Dimensionen statt nur eine Erhöhung des Encoder-Bitratenlimits. [Eingebettete Version, Publish-Optionen](https://github.com/element-hq/element-call/blob/2d74c48151d9edc01c65a22a91478aac81bf24d0/src/livekit/options.ts#L18-L31).
- Nheko ist keine belegte funktionierende macOS-Call-Vorlage: VoIP ist für Apple standardmäßig aus, und das gelesene macOS-CI-Skript schaltet es nicht ein. Calls setzen den optionalen GStreamer-Build voraus. [Build-Schalter](https://github.com/Nheko-Reborn/nheko/blob/b15dcd137e5384e0aabfd35583b5a6eba5f71ed9/CMakeLists.txt#L74-L84).

## Historischer Zustand vor dem neuen Teststand

- GitHub `main` ist der aktuelle Stand, Version 1.1.0 ist weiter das einzige Release.
- Der aktuelle Stand läuft auf dem Mac des Entwicklers (signiert, per Hand installiert), ein zweites Fenster "Diddy-B" (`~/Diddy-B.app`) dient zum Testen mit einem zweiten Account.
- Nichts davon wurde auf Linux gestartet. Die neuen Funktionen sind nur gebaut und kurz benutzt, kein automatisierter Test.

## Letzte Nachricht (Wortlaut)

Die neue Version läuft auf dem Mac, und die Signatur ist wieder gültig (`codesign --verify` besteht). Vorher war eine kaputte Icon-Datei im App-Ordner, die ist entfernt, und die Rust-Seite fügt sie nicht mehr ein. Auch das zweite Programm Diddy-B ist frisch gestartet. Es hat einen eigenen Login-Speicher, wird aber von der Hauptinstanz bedient: beendet man die Haupt-Diddy, lädt Diddy-B nicht mehr.

### Zu den Punkten

- Keychain-Dialog ("Diddy WebCrypto Master Key"): kam, weil der App-Ordner durch die Icon-Datei beschädigt war und der Schlüsselbund die App nicht wiedererkannte. Einmal "Immer erlauben" klicken.
- Stream wieder starten: Der Umbau der Stream-Audio-Technik wurde zurückgenommen, weil die zweite Freigabe im Picker festhing. Die Ruckler beim Stream-Start sind dadurch möglicherweise wieder da.
- Mikrofonwechsel ruckelt: Ein Teil liegt vermutlich am Mac selbst, weil das Gerät neu geöffnet wird. Ganz weg bekommt man es wohl nicht.
- Anderer Account sieht das Profil nicht: Hauptvermutung ist ein verschlüsselter Raum, in dem die Profil-Nachrichten nie ankamen. Das ist behoben, und es gibt Debug-Info unter Profile.
- Raum auswählen: Räume aus den eigenen Spaces, denen man noch nicht beigetreten ist, stehen in der Liste ("Join and use").
- Profil-Layout: neu und luftiger (Karten, zwei Spalten, schwebende Speicher-Leiste).
- Banner und Avatar ausrichten: Ausschnitt per Ziehen und Zoom-Regler.
- Öffentliche Badges: 41 eingebaute und eine durchsuchbare Bibliothek aller Badges, "Add to me" nimmt eines davon.
- Call-Leiste: Spotlight, Reactions und Settings sind direkte Knöpfe.
- Willkommens-Leitfaden: startet einmal pro Account, auf Servern mit Diddy-Raum zusätzlich ein Hinweis zum Beitreten, unter Einstellungen > General erneut anzeigbar.

### Spam-Schutz im geteilten Raum

- Nur Absender, die gerade Mitglied des Raums sind, zählen. Ein Admin bannt einen Spammer (Kicken reicht nicht), dann verschwinden dessen Daten bei allen.
- Fremde Daten werden vor der Anzeige geprüft; Inhalte über 4 KB oder mit Zeitstempel zu weit in der Zukunft fallen weg; Profile sind an den echten Absender gebunden.
- Pro Nutzer gibt es feste Obergrenzen für Badges und Vergaben. Nicht-Diddy-Nutzer können nur ungültiges Zeug schicken, das ignoriert wird.

## Test (5 Minuten)

1. Bei Account B (Diddy-B): Einstellungen > Profile > "Use an existing room", Kanal wählen, "Join and use".
2. Dort Name oder Farbe ändern und auf dem Hauptaccount prüfen, ob es erscheint.
3. "Debug info" im Profil öffnen. Wenn nichts erscheint, Foto davon machen.

## Noch offen / bekannt

- Ruckler beim Join, Gerätewechsel und Stream-Start: Ursache nicht abschließend geklärt (Hardware-Wechsel am Mac möglich). Diagnose steht in `~/Library/Logs/Diddy/app.log` (Zeile "mic asked ... got ...").
- System-Audio wird beim Stream "etwas lauter": nicht reproduziert und nicht erklärt.
- Der Mac-Build der Rust-Seite hat noch eine andere Funktion: Dock-Icon-Wahl wird beim Start aus einer Datei gesetzt, das Icon im Dock bei beendeter App bleibt das Standard-Icon.
