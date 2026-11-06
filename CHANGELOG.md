# Changelog

## Unveröffentlicht (nach 1.1.0)

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

## 1.1.0

- Erste Version von Diddy: Matrix-Chat-Client für macOS und Linux, basiert auf Cinny
- Sprachchat läuft auf macOS
- Bildschirmübertragung bleibt scharf, auch im Hintergrund
- Stream-Ton auf macOS mit An/Aus-Knopf, ohne Echo vom eigenen Call-Ton
- Kopfhörer-Knopf schaltet Mikro und Ton zusammen stumm
- "Join All Rooms" und "Auto-Join Rooms" im Space-Menü, kein Auto-Update
