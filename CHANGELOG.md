# Changelog

## Unveröffentlicht

### iOS: Rauschunterdrückung (#53)

- Neuer Schalter "Noise suppression" in den iOS-Einstellungen, standardmäßig an, wirkt sofort, auch im Call. Filtert Lüfter und Tippen aus dem Mikrofon, auf dem Gerät und ohne Server oder Konto, mit [RNNoise](https://github.com/xiph/rnnoise) (BSD-3) wie am Desktop. Krisp selbst braucht einen kommerziellen Vertrag, die fertigen LiveKit-Filter sind an LiveKit Cloud gebunden.
- Hintergrund und Messungen: `docs/rauschunterdrueckung-und-benachrichtigungen.md`.

### Teilnehmerliste: online und offline getrennt

- Die Teilnehmerliste rechts sortiert wie bei Discord: wer online oder abwesend ist, steht oben, weiter nach Rang gruppiert. Alle, die offline sind, stehen gesammelt in einer eigenen Gruppe „Offline“ darunter, auch Admins. Vorher konnte ein Offline-Mitglied direkt zwischen Online-Mitgliedern stehen.
- Die Gruppenüberschriften zeigen die Anzahl („Admin — 3“, „Offline — 12“), und die Liste sortiert sich neu, wenn jemand online oder offline geht. Schickt der Server gar keine Presence, bleibt es bei der bisherigen Gruppierung nach Rang. In `features/room/MembersDrawer.tsx`.

### "… is typing" sauber über dem Composer

- Die Tipp-Anzeige hing am linken Fensterrand statt an der Composer-Spalte und lag über der letzten Nachricht und der Ecke des Eingabefelds. Sie steht jetzt in derselben Spalte wie der Composer (zentriert, max. 900 px), bündig mit seiner linken Kante, direkt darüber.
- Kompakter: 24 px hoch, kleinere Punkte und Schrift, kleineres ×, feine Kontur; blendet beim Erscheinen sanft ein. In `features/room/RoomViewTyping.tsx` und `RoomViewTyping.css.ts`. Nicht in der laufenden App geprüft.

### "Jump to Latest" scrollt sanft runter

- Klick auf "Jump to Latest" springt nicht mehr hart ans Ende, sondern fährt in ca. 350–600 ms mit Auslaufen runter. Sind die neuesten Nachrichten schon geladen, wird die Timeline nicht neu geladen; sonst wird sie geladen und die Fahrt startet höchstens 2,5 Bildschirmhöhen über dem Ende.
- Mausrad oder Touch bricht die Animation ab, bei "Bewegung reduzieren" springt es wie vorher. In `features/room/RoomTimeline.tsx`. Nicht in der laufenden App geprüft.

### Call: nur noch ein Rechtsklick-Menü

- Rechtsklick auf eine Kachel öffnete zwei Menüs übereinander: Diddys Personenmenü und das eigene Menü von Element Call (Mute for me, Lautstärke). Diddy nimmt das Ereignis jetzt vor Element Call ab, es erscheint nur noch Diddys Menü.
- "Volume & Mute for me…" öffnet das Menü von Element Call dort, wo man geklickt hat (vorher ein simulierter Klick, der bei der Maus nicht auslöste). Tests in `callFrameMenu.test.cjs`. Nicht in einem echten Call geprüft, die Ursache stammt aus dem Quelltext des mitgelieferten Element Call.

### Redet mit Agent (#57)

- **Neue Einstellung unter Allgemein → „Talking to an agent“ (standardmäßig aus).** Dieselbe Taste wie im Diktier-Tool (OpenWhispr, Wispr Flow, ...) eintragen: solange sie gedrückt ist (oder bis zum zweiten Druck), zeigt Diddy „Talking to agent“ an deinem Bild unten links, schaltet auf Wunsch das Mikro im Call stumm und danach wieder an, und die anderen im Call sehen „redet mit Agent“ an deinem Namen (kurzlebige To-Device-Nachricht nur an die Call-Teilnehmer, abschaltbar).
- Im Diddy-Fenster funktioniert jede Taste. Im Hintergrund liest die macOS-App Fn/Globe, die Modifier-Tasten und F13–F20 direkt vom System. Für alles andere (Linux, eigene Tastenkürzel): `diddy --agent-voice start|stop|toggle`, z. B. aus Karabiner, Hammerspoon, skhd oder sxhkd; Diddy bekommt dabei nicht den Fokus.

### Teilnehmer eines Calls in der Raumliste

- Wer gerade im Call ist, steht jetzt wie bei Discord untereinander direkt unter dem Call-Raum in der Seitenleiste (Profilbild und Name, eine Person pro Zeile). Die kleinen Avatare in der Raumzeile entfallen, das "n Live"-Badge bleibt.
- Klick auf eine Person öffnet das Profil, Rechtsklick das Call-Menü (Profile, Message, Copy Name, ...). Neu `features/room-nav/CallMemberList.tsx`; gilt in Home, Direktnachrichten und Spaces. Nicht in einem echten Call geprüft.

### Rechtsklick-Menü auf Personen im Call

- Rechtsklick auf die Kachel einer Person im Call (und auf die Avatare in der Call-Leiste und der Teilnehmerliste) öffnet ein Menü wie bei Discord: **Profile**, **Message** (privater Chat), **Volume & Mute for me…**, **Copy Name**, **Copy User ID**.
- "Volume & Mute for me…" öffnet das Lautstärke-/Stummschalten-Menü von Element Call an der Kachel der Person. Es erscheint nur bei anderen Personen und solange die Call-Ansicht sichtbar ist.
- Neu `components/CallUserMenu.tsx`; Erkennung der Kachel in `plugins/callFrameMenu.ts`. Nicht in einem echten Call geprüft (Aufbau von Element Call nur aus dem Quelltext gelesen).

### Privat anrufen vom Profil aus (#55)

- Die Profilkarte hat neben "Message" einen **Call**-Knopf: Er startet einen Sprachanruf im privaten Chat mit der Person (so klingelt nur sie, nicht ein ganzer Raum). Gibt es noch keinen privaten Chat, wird ein verschlüsselter angelegt. Der Knopf ist gesperrt, solange man schon in einem Call ist, und fehlt, wenn der Server keine Calls unterstützt.
- Dafür liegt die Profilkarte jetzt innerhalb des Call-Providers (`Router.tsx`). Logik in `plugins/directCall.ts`, 5 Tests.

### Linux: Diddy läuft jetzt in Electron, Calls funktionieren

- **Sprach- und Videoanrufe unter Linux, auch verschlüsselt.** Vorher endete jeder Beitritt mit „Something went wrong“ (`UNKNOWN_ERROR`). Die Ursache ist WebKitGTKs WebRTC (GStreamer): fehlende BUNDLE-Gruppe, ein Deadlock beim Beitritt, kaputte Empfangs-Transceiver und vor allem keine Frame-Verschlüsselung. Damit sind verschlüsselte Calls unmöglich. Unter Linux läuft dasselbe Frontend deshalb in Electron (Chromium, libwebrtc wie Safari auf macOS). macOS bleibt Tauri.
- Das NixOS-Paket `diddy` baut nur noch das Frontend, Electron kommt aus dem Binär-Cache. Das deutlich schneller zu bauende Paket ersetzt `diddy-webrtc`, das entfällt.
- Beim Umstieg einmal neu anmelden und das Gerät verifizieren: Chromium kann den WebKitGTK-Speicher nicht lesen. Verbindungen, App-Icon und Log bleiben erhalten.
- Ein global gesetztes `LD_LIBRARY_PATH` mit neuerer `alsa-lib` (z. B. für JACK) bricht das Paket nicht mehr.
- Details und Messungen: `docs/nixos.md`.

## 1.2.0 (2026-11-07)

### Highlights

- **Neues Apple-Design (#21):** einheitliche Design-Sprache für die ganze App: Seitenleiste und Navigation, Raumansicht, Call, Profilkarte, Dialoge, Menüs und Suche (Material mit Blur, weiche Schatten, ruhige Typografie, Scrollbars nur beim Hover, Hell und Dunkel). Einstellungen öffnen als fast vollflächiges Fenster mit Seitenleiste (Gruppen, Suche, farbige Icon-Kacheln).
- **Standard-Theme ist jetzt das normale Dark** (hell: das normale Hell-Theme). Wer schon ein Theme gewählt hat, behält es.
- **Neue Profilkarte (#28, #29):** vier Layouts (Kompakt, Standard, Erweitert, Tabs), neue Felder (Kurzinfo, Interessen, Links, Aktivität), Karten-Theme, Glass-Effekt, Module ein-/ausblendbar und sortierbar. Der Profil-Editor hat Tabs und eine Live-Vorschau.
- **Sprachchat-Panel in der Seitenleiste (#31):** "Im Sprachchat" über dem Benutzerbereich, mit Mikro, Kopfhörer, Kamera, Mehr-Menü und Auflegen; von jedem Raum aus bedienbar.
- **Einführung für Matrix-Neulinge (#30):** fünf Schritte "Matrix für Discord-Umsteiger", beim ersten Start und im Konto-Menü.
- **Raumliste zeigt, wer im Call ist (#23)** und das Roster über dem Call-Fenster.
- iPhone/iPad: neue native App (Beta) aus PR #32, siehe `ios/README.md`.
- **Logdatei:** Start, Fenster, Audio, Verbindungen, Abstürze (Panic) und JavaScript-Fehler landen in einer Logdatei (macOS `~/Library/Logs/Diddy/app.log`, Windows `%LOCALAPPDATA%\Diddy\Logs`, Linux `~/.local/state/diddy/app.log`), gedreht bei 2 MB. Ordner und Pfad stehen unter Einstellungen → About → Diagnostics; ohne Nachrichtentexte, zum Anhängen an Fehlerberichte.

### Behoben

- Fenster startete nicht sichtbar oder war nicht verschiebbar (#25, #26): Fenster wird auf den Bildschirm begrenzt, kleines Startfenster bis die App geladen ist; hängt der macOS-Audiodienst (`coreaudiod`), meldet Diddy das nach 8 s mit Hinweis.
- Kein Profilbild bei Nutzern ohne Matrix-Avatar, aber mit Diddy-Bild (#27).
- Rechtsklick auf Nachrichten funktionierte nicht, wenn ein Call lief: das unsichtbare Call-Fenster hat die Klicks abgefangen. Im Call-Fenster gibt es ein kleines Copy-Menü.
- Badge-Verleihung an andere Nutzer entfernt (eigene Badges bleiben, #9 erledigt).

### Stand 2026-11-07 (frühere Einträge)

- iPhone/iPad: neue native App (`ios/`, SwiftUI + matrix-rust-sdk + LiveKit) im Discord-Stil: Server-Leiste, Kanäle mit Kategorien, Sprachkanäle kompatibel mit Desktop-Diddy/Element Call, Bildschirmübertragung ohne Erweiterung (ab iOS 27 ganzer Bildschirm, nur eine App-ID beim Sideloaden), mehrere Konten auf verschiedenen Servern, wechselbares App-Icon. Workflow *Build iOS* baut die IPA.
- Systemschrift: SF auf macOS, Inter auf Linux (#21, erster Schritt)
- Optionsraum: Profil und Badges werden nicht mehr bei jedem App-Start neu gesendet, nur bei Beitritten (sonst füllt sich der Raum und ältere Daten fallen aus dem Lesefenster)
- README überarbeitet (#18), VM-Anleitung für Linux/NixOS auf dem Mac (`docs/vm-macos.md`)
- CI: native Rust-Tests auf macOS und Web-Build (#16)
- Linux: Mikrofon, Kamera und WebRTC im WebView eingeschaltet, NixOS-Paket `diddy-webrtc` (#12)

> **Notiz Linux:** Linux-Releases sind vorerst zurückgestellt. Der Code für Linux-Calls ist drin, aber AppImage und .deb können keine Calls, weil das WebKitGTK von Ubuntu, Debian und Fedora ohne WebRTC gebaut ist. Unter NixOS geht es nur mit `diddy-webrtc` (experimentelle WebKit-Funktionen). Ein echter Call über Element Call ist unter Linux noch nicht getestet. Offene Entscheidungen: `diddy-webrtc` als Standard, eigenes WebKit für AppImage/.deb, Testschalter `DIDDY_MEDIA_SELFTEST` behalten.

### Neu

- Favoriten-Bereich für Räume (Cinny #2977)
- Auf Nachrichten mit jeder Dateiart antworten (Cinny #2715)
- Nachrichten mit eigener Erwähnung werden hervorgehoben (Cinny #2723)
- Genaue Uhrzeit beim Darüberfahren über die Nachrichtenzeit (Cinny #2714)
- Nachricht bearbeiten und Text leeren löscht sie (Cinny #2707)
- Entwürfe im Eingabefeld bleiben erhalten (Cinny #2645)
- Raum- und Space-Name im Fenstertitel (Cinny #2658)
- Neue Einstellungsseite "Appearance", Apple-Emoji, globaler Bildbetrachter, Titelfarbe
- Das App-Icon bleibt nach dem Neustart erhalten
- Antworten im Discord-Stil, mit kleinem Avatar und @Name
- Töne beim Stummschalten, Taubschalten und Aufheben (abschaltbar unter Calls)

### Verbessert

- Home zeigt jetzt auch Direktnachrichten, Posteingang steht weiter oben
- Hintergrund gilt für alle Themes, Profilbanner ist schlichter
- Erwähnungs-Hervorhebung ist dezenter
- Echo-Unterdrückung ist standardmäßig aus
- Profil-Knopf in der Kopfzeile entfernt, Fensterknöpfe (macOS) besser ausgerichtet
- Benachrichtigungston läuft über Web Audio und stiehlt nicht mehr die Play/Pause-Taste (Cinny #3017)
- Eigene Titelleiste zeigt den dynamischen Titel
- Raum verlassen wartet auf den Server, Raumlisten aktualisieren sich sofort (Cinny #2459)
- Emoji- und Sticker-Paket-Auswahl ist jetzt ein Dropdown (Cinny #2733)
- Eingebettete Videos: neues Play-Icon, Klick auf den Hintergrund startet (Cinny #2740)
- E-Mail-Benachrichtigungen: Schalter und Layout ohne Springen (Cinny #2668)

### Behoben

- Verlassene Räume verschwinden auch bei Servern, die sie weiter als beigetreten melden
- Bildformat JXL wird erkannt (Cinny #3070)
- Datei-Drop-Fläche bleibt nicht mehr aktiv, wenn man wegzieht (Cinny #3023)
- Versteckte Ereignisse stören keine Datumstrenner und Gruppierung mehr (Cinny #3093)
- Fehler im Markdown-Parser (Cinny #3107)
- Leerzeilen am Anfang und Ende von Nachrichten werden entfernt (Cinny #2864)
- Hintergrundfarbe der Seite gesetzt (Cinny #2795)
- Doppelte Scrollleiste auf der Login-Seite in Firefox (Cinny #2783)
- Login-Seite: keine automatische Großschreibung und Autokorrektur am Handy (Cinny #2735)
- Emojis zeigen den Shortcode statt des Titels im Popup (Cinny #2732)
- Automatisches Scrollen bei hohen Nachrichten blieb zu kurz (Cinny #2661)
- Keine Phantom-Badges in überbrückten Räumen (Cinny #2588)

### Profilsystem und Zusammenarbeit zwischen Diddy-Clients

- Versteckter Datenraum "Diddy Options": neuer Raum oder vorhandener Raum, in dem Diddy-Clients Profile und Badges austauschen; unsichtbar in allen Listen (sichtbar mit Developer Tools)
- Zustandsmodus (Admin) und Nachrichtenmodus (ohne Admin-Rechte, funktioniert auch in verschlüsselten Räumen)
- Profil-Editor unter Einstellungen > Profile: Schriftart, Farbe oder Verlauf, Effekte, Karten-Banner (auch GIF), Bio, Namensschild, animierter Avatar, Status, mit Live-Vorschau
- Banner, Avatar und Namensschild lassen sich per Ziehen und Zoom ausrichten
- Badges: 41 eingebaute, eigene Badges, durchsuchbare Badge-Bibliothek, jeder darf Badges vergeben
- Status (Online, Abwesend, Nicht stören, Unsichtbar) im Profil-Panel unten links; Nicht stören schaltet Töne und Desktop-Meldungen ab
- Spam-Schutz: nur aktuelle Mitglieder zählen, Größen- und Mengenlimits, Prüfung aller fremden Daten, Admin kann Spammer bannen
- Raum-Auswahl zeigt auch noch nicht beigetretene Räume aus den eigenen Spaces ("Join and use"), Debug-Info im Profil
- Willkommens-Leitfaden für neue Nutzer, erkennt Diddy-Server am Raum-Namen "Diddy Options" oder am Marker [diddy-options] im Thema

### Calls und Audio

- Eingabe- und Ausgabegerät sowie Lautstärke neben Mikro und Kopfhörer wählbar
- Neue Call-Leiste: Spotlight, Reactions und Einstellungen als direkte Knöpfe
- Schalter "Voice processing" (Echo, Rauschfilter, automatische Lautstärke), standardmäßig aus, damit Musik im Call nicht verändert wird
- Mute-Töne, ein gemeinsamer Audio-Kontext, Ausgabegerät wird nur bei Änderung gesetzt
- Neue Schieberegler mit sichtbarer Füllung und Knopf

### Behoben (Fehler dieser Runde)

- Raum-Avatar im Header füllte den ganzen Chat (fehlender Rahmen), ebenso beim Reply-Avatar und beim Space-Badge
- Status-Menü schließt bei Klick daneben, Escape und zweitem Klick
- Stream ließ sich nach dem Beenden nicht neu starten: Umbau der Stream-Audio-Technik zurückgenommen
- Keychain-Dialog kam bei jedem Start, weil die Icon-Änderung die Signatur der App beschädigte; das App-Paket wird nicht mehr verändert
- Absturz durch bedingten React-Hook in der Seitenleiste
- Markdown-Listen konnten Text verschlucken ("b. foo")
- Entwürfe: Wettlauf beim Raumwechsel und Speicherfehler abgesichert
- Raum verlassen: Raum wird danach vergessen, damit er verschwindet

### Weitere lokale Call-Korrekturen (Teststand auf dem Mac installiert)

- "Voice processing" aus deaktiviert jetzt auch die angeforderte Sprachisolierung; die Freigabe der Geräteliste verwendet dieselbe Richtlinie.
- Mikrofon-Diagnose protokolliert die erfolgreiche Anfrage statt einer zuvor fehlgeschlagenen Gerätewahl; Geräte-IDs bleiben gekürzt.
- Bildschirmfreigabe: synchroner iframe-Fokus, native Anfrage vor Audio-Vorbereitung, Schutz vor parallelen Starts und genauere Phasen-Diagnose.
- Stream-Ende räumt Audio und Statistik auch bei programmgesteuertem Video-Stopp auf; Abbruch beendet wartende Audio-Vorbereitung ohne verspätetes Anhängen alter Tracks.
- 19 Mock-/Regressionstests auf dem Mac bestanden; Teststand gebaut, mit bestehender Signieridentität installiert und nach dem Start auf gültige Signatur geprüft. Echter Call-/Stream-Neustart und Audio-Ruckler noch zu prüfen. Gesamt-Typcheck weiterhin mit denselben 879 Diagnosen wie HEAD, keine zusätzlichen Diagnosen.

### Zweiter Call-Teststand (auf dem Mac installiert)

- Soundboard und Call-Töne folgen der Plattform-Standard-Abtastrate statt fest 48 kHz anzufordern; noch keine bestätigte Behebung der Musik-Unterbrecher.
- Bildschirmfreigabe fordert die vom Aufrufer maximal gewünschte Auflösung auch als Wunschgröße an und konfiguriert den ausgewählten Live-Track nach; Fehler oder verzögerte Qualitätsanpassung verhindern die Freigabe nicht.
- 26 hardwarefreie Regressionstests auf dem Mac bestanden, im Typvergleich keine zusätzlichen Diagnosen. Zweiten Teststand auf dem Mac gebaut/signiert/installiert und nach dem Start auf gültige Signatur sowie neue Frontend-Codepfade geprüft. Echte Stream-Auflösung und Audio-Verhalten noch ungetestet; der vorherige Teststand zeigte weiterhin Unterbrecher und 360p.

### Homeserver-Ausfall und getrennte Verbindungen (Mac-Teststand installiert)

- Verständliche Verbindungsseite statt unbegrenztem "Connecting": Server-Adresse, Wiederholen und alternative Anmeldung. Discovery und Versionsabfrage haben ein 8-Sekunden-Limit inklusive Antwortkörper; alte Anfragen werden beim Wechsel abgebrochen.
- Neue Verbindungsübersicht aus Titelleiste, Login und Verbindungsfehlern: gespeicherte Server öffnen oder eine neue Anmeldung anlegen.
- Alternative Konten laufen in getrennten persistenten nativen Datenspeichern; die ursprüngliche Anmeldung bleibt erhalten. Keine Wiederverwendung alter Tokens für andere Server und keine Cache-/Schlüssel-Löschung durch den Wechsel.
- Auf macOS benötigen zusätzliche getrennte Anmeldungen macOS 14+. Gespeichert werden nur Kennung und Server-Adresse. Audio-Bridges werden beim Wiederöffnen wiederverwendet.
- 44 JavaScript-Tests, 3 Rust-Tests und 5 Renderprüfungen bestanden; keine zusätzlichen Typdiagnosen. Gebaut, signiert und auf dem Mac gestartet; echte alternative Anmeldung und Wiederöffnen noch manuell zu prüfen.

### Profile auch für später beitretende Mitglieder sichtbar

- Profile bleiben pro Person in genau einem festen Eintrag (State-Ereignis mit der eigenen Nutzerkennung); ein als Diddy-Raum markierter Raum nutzt jetzt immer diesen Weg, auch wenn er vorher als Nachrichtenraum ausgewählt war. Nur wenn der Server das Schreibrecht verweigert, weicht Diddy auf normale Ereignisse aus.
- In Räumen ohne State-Recht schickt Diddy dein Profil erneut, sobald du online kommst und sobald andere Mitglieder beitreten - begrenzt auf eine Übermittlung pro Raum und fünf Minuten, damit kein Spam entsteht.
- Behoben: Eine gleichzeitige Fensteröffnung konnte die Reservierung der ersten Öffnung überschreiben, wodurch eine Verbindung dauerhaft als "wird gerade geöffnet" blockiert blieb.
- 54 JavaScript-Tests, 9 native Tests und 5 Renderzustände bestanden; keine zusätzlichen Typdiagnosen.

### Verbindungsfunktion nach Fremdprüfung nachgebessert

- Die gespeicherte Verbindungsliste kann nicht mehr durch eine zu lange Unicode-Adresse unlesbar werden; Grenzwert gilt jetzt für Eingabe und gespeicherte Form.
- Eine Anmeldung wird erst gespeichert, wenn ihr Fenster wirklich offen ist; ein Fehlversuch belegt keinen Platz mehr. Andere Verbindungsaktionen werden während des Fensterbaus nicht mehr blockiert.
- Nach einem Abbruch wird ein später eingeplantes Fenster nicht mehr nachträglich geöffnet; Mehrfachöffnungen derselben Verbindung werden zusammengefasst. Ein normaler erneutem Programmstart holt das geschlossene Hauptfenster zurück.
- unbehandelte Promise-Fehler bei fehlgeschlagenen Serverabrufen beseitigt.
- 46 JavaScript-Tests, 8 native Tests und 5 Renderzustände bestanden; keine zusätzlichen Typdiagnosen.

## 1.1.0

- Erste Version von Diddy: Matrix-Chat-Client für macOS und Linux, basiert auf Cinny
- Sprachchat läuft auf macOS
- Bildschirmübertragung bleibt scharf, auch im Hintergrund
- Stream-Ton auf macOS mit An/Aus-Knopf, ohne Echo vom eigenen Call-Ton
- Kopfhörer-Knopf schaltet Mikro und Ton zusammen stumm
- "Join All Rooms" und "Auto-Join Rooms" im Space-Menü, kein Auto-Update
