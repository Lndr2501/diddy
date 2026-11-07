# Changelog

## Unveröffentlicht (nach 1.1.0)

### Stand 2026-11-07

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
