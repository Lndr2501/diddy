# Changelog

## 1.6.2 (unveröffentlicht)

- **Aufgeräumte Oberfläche (macOS, Linux):**
  - **Eigene Icons:** Ein einheitliches Icon-Set (rund 70 Symbole, runde Striche, gefüllte Variante mit ausgestanzten Details) ersetzt die folds-Zeichnungen in der ganzen App (`plugins/diddyIcons.tsx`).
  - **Avatare:** Personen sind überall rund, Räume und Spaces bleiben abgerundete Quadrate.
  - **Chat-Kopf:** Lupe, Pin und Glocke sind raus. Die Nachrichtensuche liegt im ⋮-Menü („Search Messages“), der Pin-Knopf erscheint nur, wenn etwas angeheftet ist. Ungelesene Erwähnungen zeigt jetzt ein Punkt am Inbox-Symbol. Die Lupe unten links gibt es nur noch auf dem Handy, sonst übernimmt das Suchfeld (⌘K).
  - **Nachrichten:** Die Uhrzeit steht direkt hinter dem Namen und ohne führende Null („1:11 PM“); der Tooltip zeigt im 12-Stunden-Format jetzt auch Sekunden.
  - **Eingabefeld:** einzeilig, wächst mit dem Text; Anhang links, Aktionen rechts.
  - **Gelesen von:** Statt „… and 1 others are following the conversation.“ kleine Profilbilder mit „Seen by 4“, Namen beim Überfahren, Klick öffnet die Liste.
  - **Raumliste:** „Lobby“ und „Search“ sind zwei kompakte Knöpfe über den Räumen. Badges folgen einer Regel: Akzentfarbe für Erwähnungen, leise für normale Ungelesene.
  - **Mitgliederliste:** „Members“ mit Filter, Sortierung und Einladen als Symbole in der Kopfzeile; die Namenssuche erscheint ab 20 Mitgliedern; die Knöpfe „Invite“ und „Room settings“ unten sind weg (Raumeinstellungen im ⋮-Menü). Zeilen haben erst beim Überfahren eine Fläche.
  - **Nutzerleiste:** Die Gerätewahl-Pfeile erscheinen erst beim Überfahren, der Name hat Platz.
  - **Einstellungen:** Alle Seiten haben denselben schlanken Kopf („Settings / …“). Das Profil hat kein zweites ✕ und keine doppelten Speichern/Abbrechen-Knöpfe mehr (die stehen in der Leiste unten), die Reiter stehen in einer Zeile.
  - **Namensfarben:** Die Standardfarbe der Rolle „Founder“ ist ein ruhiges Indigo statt reinem Blau (`#0000ff`), „Moderator“ ein ruhigeres Grün; eigene Rollenfarben eines Raums bleiben unverändert. Die Ersatzfarben im Light-Theme sind weniger grell (mindestens 5:1 Kontrast auf Weiß).
  - **Ruhiger, zweiter Durchgang:** Die Symbole der linken Leiste stehen ohne Rahmen da, Home ist kein Dauer-Akzent mehr. Ausgewählte Räume, Knöpfe und Zeilen bekommen eine neutrale Fläche statt einer Pink-Tönung, die Akzentfarbe bleibt für Erwähnungen, Senden und Schalter. Private Räume zeigen ein schlichtes „#“ (nur öffentliche Räume tragen den Globus), das Schloss am Space-Namen ist weg. Das Raum-Symbol im Kopf sitzt auf einer neutralen Kachel. Nachrichten stehen enger (Standardabstand eine Stufe kleiner), Antworten zeigen den Namen ohne „@“. Im Eingabefeld sind die Symbole gedämpft, der Senden-Knopf wird erst farbig, wenn es etwas zu senden gibt. Die Nutzerleiste unten links hat keinen Rahmen und Schatten mehr. In den Einstellungen sind Reiter, Umschalter (z. B. Sound/Silent/Off) und die Symbol-Kacheln der Karten neutral statt pink; die Badge-Vorschau folgt der Badge-Regel.
  - **Dritter Durchgang:** Aufeinanderfolgende Raum-Ereignisse (Beitritte, Einladungen, Name/Thema/Bild) stehen als eine Zeile „4 joined · 4 invited · 2 changes“ mit „Show“ zum Aufklappen statt als lange Liste. Suchtreffer sind sanft akzentfarben statt knallgelb markiert, die Auswahl in der Suche ist neutral. Räume ohne Bild bekommen eine zarte Tönung ihrer Farbe statt einer bunten Vollfläche. Die Emoji-Auswahl hat ruhige Kategorienamen und eigene Kategorie-Symbole. Der Fokus im Eingabefeld ist dezent statt eines farbigen Rings. Beim Überfahren einer Nachricht erscheint keine Matrix-ID mehr. Auf „Explore“ sind Filter und „Enter“ neutral. Das Suchfeld im Kopf wird nicht mehr zu „Se…“ gequetscht. Das Profilbild am Anfang einer Direktnachricht ist rund. Symbolknöpfe in Leiste, Kopf und Eingabefeld haben zugängliche Namen.
  - **Einstellungen neu geordnet:** „General“ ist aufgeteilt in **Chat** (Nachrichten, Timeline, Medien, Editor, Datum & Zeit) und **Calls & Audio** (Anrufe, Sounds, Mit Agent reden, Watch together). Die animierten Profilbilder stehen unter **Appearance**, der Willkommens-Guide unter **About**. Die Reihenfolge links ist Appearance, Chat, Notifications, Calls & Audio. Die Orte für animierte Profilbilder sind eine Zeile mit Auswahl-Chips statt fünf Schaltern. Die Farbfelder des eigenen Themes erscheinen nur, wenn „Custom“ aktiv ist. In der Sound-Liste erscheinen Abspielen und Ersetzen erst beim Überfahren der Zeile (Sounds mit eigener Datei und Touch-Geräte zeigen sie immer). Die Suche in den Einstellungen findet alles wie bisher.
  - **Feste Werte:** Bewegung (3 Dauern, 2 Kurven) und Ebenen (z-index) liegen jetzt zentral in `diddyTokens.ts`; Toasts, Anruf-Banner und Sprachnachricht nutzen sie.
  - Texte: „when messages arrive“ statt „when message arrive“.
- **Eingehende Anrufe oben statt als Dialog (macOS, Linux):** Ein Anruf erscheint nicht mehr als Fenster in der Mitte mit abgedunkeltem Hintergrund, sondern oben, in einer Bewegung von knapp 1 s: Eine grüne Kachel fällt herein, das Telefon springt hinein und klingelt, dann öffnet sich die Karte um die Kachel. Die Karte ist neutral wie der Rest der App; nur Kachel, Ablehnen (rot) und Annehmen (grün) sind farbig, mit eigenen, schlichten, ausgefüllten Symbolen. Darauf Raumname und „Incoming call“ bzw. „Ben is calling“ in Gruppen (dort Ignorieren statt Ablehnen). Solange es klingelt, wackelt das Telefon kurz und sendet einen leisen Ring aus. Der Rest der App bleibt dabei bedienbar. Beim Annehmen, Ablehnen oder Ablaufen gleitet die Karte nach oben weg. Bei „Bewegung reduzieren“ blendet sie nur ein. Klingelton, „Bitte nicht stören“ und Ablauf wie bisher.
- **Benachrichtigungen im Fenster (macOS, Linux):** Ist Diddy im Vordergrund, kommen neue Nachrichten und Einladungen jetzt als Karte oben in der Mitte statt als System-Benachrichtigung: Raumbild, Raumname und eine einzeilige Vorschau („Name: Text“, in DMs nur der Text; Spoiler, Bilder und Sprachnachrichten nur als Wort). Erwähnungen haben einen Ring in der Akzentfarbe. Mehrere stapeln sich, die neueste vorn, die älteren lugen darunter hervor und fächern sich beim Überfahren auf. Pro Raum gibt es eine Karte, die bei neuen Nachrichten aktualisiert wird. Nach 5 s verschwinden sie, beim Überfahren nicht. Klick öffnet den Raum; wegwischen nach oben, das ✕ oder Esc schließt. Ist Diddy im Hintergrund, bleibt es bei der System-Benachrichtigung. Es gilt der bestehende Schalter „Benachrichtigungen“ und „Bitte nicht stören“.
- **Sprachnachrichten neu gestaltet (macOS, Linux):** Die Kapsel ist ruhiger, mit dünneren Balken. Beim Abspielen teilt sich das Play-Dreieck in die Pause-Balken, und weiche Lichter in der Akzentfarbe kreisen innen am Rand. Bei Pause laufen sie aus, bei „Bewegung reduzieren“ bleiben sie weg. Gespult wird per Ziehen über die Wellenform oder, wenn sie den Fokus hat, mit den Pfeiltasten (5 s), Bild auf/ab (10 %), Pos1 und Ende. iOS ist unverändert.

## 1.6.1 (2026-11-12)

- **iOS: fast alles vom Desktop:** Die iOS-App kann jetzt den Großteil dessen, was Desktop-Diddy kann. Alles ist gebaut und kompiliert, aber noch nicht auf einem iPhone ausprobiert; die Liste steht in `ios/README.md`. Neu sind unter anderem:
  - **Nachrichten:** Spoiler, Code, Zitate, Listen, Link-Vorschauen, Video im Chat, Standort, eigene Emoji, Sticker; Sprachnachrichten von Linux (Ogg/Opus) spielen ab.
  - **Im Chat:** Lesebestätigungen, „Neue Nachrichten“-Linie, zum Zitat und zu einem Datum springen, Threads, Anheften, Melden, Quelltext, Bearbeitungsverlauf, Löschen mit Grund; Nachrichtensuche und Schnellwechsler.
  - **Eingabefeld:** Dateien, Videos, Kamera, Einfügen, Entwürfe, Vorschläge für `#raum` und `:emoji:`, Emoji- und Sticker-Auswahl, Slash-Befehle, Formatierungsleiste.
  - **Räume und Server:** Favoriten, Langdruck-Menü, Raumverzeichnis, Vorschau vor dem Beitritt, Server verwalten, Server-Ordner; Raum-Einstellungen mit Rollen, Rechten und Moderation.
  - **Calls:** Lautstärke pro Person, Geräteauswahl, Ping, Reaktionen, Soundboard mit mehreren Clips, Sounds einzeln und mit eigenen Dateien, Watch together.
  - **Einstellungen:** Benachrichtigungsregeln, Darstellung (System hell/dunkel, eigenes Theme, Zoom), Geräte abmelden und verifizieren, Wiederherstellung einrichten, Entwicklerwerkzeuge, Diddy-Optionsraum, Badges, Profil-Export und -Import.
  - **„Bitte nicht stören“** macht auf iOS jetzt wirklich still, die Server-Suche beim Login gibt nach 8 s auf.
- **iOS: aufgeräumte Oberfläche:**
  - **Einstellungen:** in Gruppen (Account, App, Help) mit Symbolen. Darstellung hat eine eigene Seite, Abmelden steht unten und fragt nach.
  - **Chat:** Kopfzeile mit Anruf, Suche und einem Menü. Das Nachrichtenmenü ist in Gruppen sortiert, Löschen steht unten in Rot. Das Eingabefeld wächst mit dem Text, Anhänge liegen hinter „+“, und Vorschläge für @, # und :emoji: gelten an der Cursorstelle.
  - **Raumliste:** ein gemeinsames Server-Menü für Leiste und Kopf, eine einzige Suche, Hinweise bei leeren Listen.
  - **Calls:** eine Leiste unten (Lautsprecher, Kamera, Mikro, Teilen, Mehr, Auflegen). Reaktionen, Soundboard, Watch together, Taub schalten und Audiogeräte liegen unter „Mehr“. Die Statuszeile zeigt Neu verbinden und schwache Verbindung.
  - **Profile und Räume:** Die Profilkarte hat eine klare Reihenfolge, Moderation steht unten. Raum-Einstellungen sind gruppiert, und wo man ungespeicherte Änderungen verlassen würde, fragt die App nach. Im Profil-Editor bleibt die Vorschau sichtbar.
- **iOS: kleinere Fehler:**
  - „Edit Profile“ im Status-Menü hatte keinen Speichern-Knopf.
  - Plugins und Einladungen ließen sich per Wischen ohne Rückfrage entfernen.
  - Fünf Chat-Schalter ohne Wirkung sind weg.
  - „Aktivität ausblenden“ blendet wie am Desktop auch das Tippen anderer aus.
  - Escape schließt nur noch das oberste Fenster.
- **iOS: „Mit Agent reden“ entfernt:** Auf dem iPhone ergibt das keinen Sinn. Wer am Desktop mit einem Agenten redet, wird auf iOS weiter als „Redet mit Agent“ angezeigt.
- **iOS: Löschen fragt nach:** Eigene Nachrichten wurden sofort gelöscht; jetzt kommt wie am Desktop eine Abfrage mit optionalem Grund.
- **iOS: Einladungs-Sound** ist ab Werk aus, wie am Desktop.

## 1.6.0 (2026-11-11)

- **Nutzer-Lautstärke bis 200 %:** Leise Stimmen lassen sich im Call-Menü auf bis zu doppelte Lautstärke verstärken. Der Wert bleibt pro Person gespeichert, auch nach Stummschalten und erneutem Beitritt.

- **Stream zoomen und Vollbild:** Im großen Stream-Fenster eines Calls zoomen Mausrad und Trackpad-Pinch zur Mausposition (bis 800 %), der gezoomte Ausschnitt lässt sich mit der Maus verschieben. Oben rechts sitzt eine Leiste mit −, Zoomstufe (Klick setzt zurück), + und Vollbild. Im Vollbild füllt der Stream den ganzen Bildschirm ohne Rahmen; Leiste, Name und Mauszeiger blenden sich nach 2,5 s Ruhe aus. Tasten im Vollbild: `+`/`-` zoomen, `0` setzt zurück, `F`, `Esc` oder Doppelklick verlassen es. Solange gezoomt oder im Vollbild, schließt ein Klick die große Ansicht nicht mehr versehentlich.
- **iOS: Stream zoomen:** Der Pinch-Zoom in Bildschirmübertragungen sprang beim Loslassen zurück. Jetzt bleibt der Zoom (bis 800 %, ab iOS 17 zu den Fingern hin, davor zur Mitte), gezoomt verschiebt ein Wischen den Ausschnitt, Doppeltippen zoomt an der Stelle auf 250 % oder wieder heraus, ein Knopf mit der Zoomstufe setzt zurück. Gilt für den großen Stream und das Vollbild. Solange gezoomt, schließt Tippen die große Ansicht nicht. Gleiche Regeln wie am Desktop (`ios/Diddy/Call/StreamZoom.swift`, geprüft von `ios/Tools/streamzoom_check`).
- **iOS: Profilbilder fehlten:** DMs zeigten nur das (meist leere) Raumbild statt des Bildes des Gegenübers. Im Chat wurden die Mitglieder nie geladen, deshalb fehlten bei älteren Nachrichten Bild und Name. Das eigene Bild verschwand, wenn die Abfrage beim Start fehlschlug. Fehlgeschlagene Downloads werden jetzt nach 2 s und 8 s wiederholt; Gründe stehen im Diagnose-Log (`media: image load failed`).
- **iOS: Online-Status:** DM-Liste, Chat-Kopf, Mitgliederliste und Profilkarte zeigen jetzt online, abwesend, nicht stören oder offline, nach denselben Regeln wie am Desktop (Matrix-Presence plus der in Diddy gewählte Status). Weil Sliding Sync keine Presence liefert, fragt die App den Status beim Server ab (höchstens 6 Anfragen pro 10 s, Pause bei Fehlern und 429) und sendet den eigenen Status. Server ohne Presence: nur der in Diddy gewählte Status.
- **iOS: Profileffekte und -rahmen:** Die Profilkarte zeigt Effekt und Rahmen wie am Desktop (Vorlagen und eigene Ebenen), dazu den gewählten Banner-Ausschnitt und die Diddy-Version. Bei „Bewegung reduzieren“ und im Stromsparmodus stehen sie still. Profile mit vielen Links, Umlauten oder Emoji wurden auf iOS fälschlich als zu groß abgelehnt; gemessen wird jetzt wie am Desktop.
- **iOS: Profil-Editor wie am Desktop:** Namensverlauf, Schrift, Effekt, fett/kursiv, Kartenfarben, Banner hochladen mit Ausschnitt, Interessen, Links, Namensschild (Verläufe, Farbe, Bild, GIF, Video), gezeigte Badges, Kartenlayout sowie Effekt und Rahmen aus den Vorlagen, mit Vorschau. Gespeichert werden nur geänderte Felder, unbekannte bleiben erhalten; geschrieben wird erst, wenn das eigene Profil geladen ist. Eigene Effekt-/Rahmen-Dateien hochladen bleibt am Desktop.
- **iOS: Wischen zum Antworten:** Eine Nachricht nach links wischen setzt die Antwort, mit Pfeil und kurzer Haptik (ab iOS 18; davor langes Drücken). VoiceOver hat eine „Reply“-Aktion.
- **iOS: Chat aufgeräumt:** Die erste Nachricht nach einer Systemzeile verlor Bild und Namen, weil z. B. „Luis was invited“ als Nachricht des Einladenden zählte. DMs zeigen im Kopf und am Anfang Bild und Namen des Gegenübers statt „@“. Die Einrichtungszeilen einer neuen DM (beigetreten, eingeladen) sind ausgeblendet; Systemzeilen haben je Art ein eigenes Symbol und nur die Uhrzeit.

## 1.5.4 (2026-11-11)

- **Profil wurde beim Start überschrieben:** In Optionsräumen im Nachrichtenmodus oder mit Verschlüsselung kommt das eigene Profil erst mit dem Nachladen des Verlaufs. Die automatische Versionsangabe, der Status, die Einführung und der Profil-Editor konnten vorher speichern und so ein leeres Profil für alle schreiben. Schreiben wartet jetzt, bis das Profil geladen ist; „Save changes“ ist bis dahin gesperrt.
- **Gelöschte Badges kamen zurück:** Seit Badge-Zustand nur noch Admins gehört (#168), ist das Löschen oder Zurückziehen eines Mitglieds nur noch eine Nachricht, während die alte Version im Raumzustand bleibt. Solche Löschungen werden jetzt wie eigene Badges an später Beitretende wiederholt. Eigene Badges in einem Platz, den ein anderer im Zustand belegt, werden ebenfalls wieder weitergegeben.
- **Keine Badge-Flut mehr bei Namens- oder Bildänderungen:** Eine Änderung von Anzeigename oder Avatar zählte als neuer Beitritt, und jeder Client schickte daraufhin alle eigenen Badges erneut. Nur echte Beitritte lösen das jetzt aus.
- **Zu große Profile:** Daten über 4096 Zeichen nahm der Server an, aber jeder Leser verwarf sie, das Speichern sah erfolgreich aus. Jetzt erscheint ein Fehler mit der Größe.
- **Optionsraum erneut betreten:** Nach Verlassen und erneutem Beitreten in derselben Sitzung wurde der Verlauf nicht nachgeladen.
- **Plugin-Speicher begrenzt:** Ein Plugin konnte mit 50 Werten aus Steuerzeichen den ganzen Speicher der App füllen; danach scheiterten Anmeldung und Einstellungen. Pro Plugin gelten jetzt höchstens 256 KB.
- **Server-Adresse mit Leerzeichen:** Bei neuen Verbindungen wurde das erste Leerzeichen irgendwo in der Adresse entfernt statt nur am Anfang („my server.org“ wurde zu „myserver.org“).
- **Linux: Anmeldung per SSO:** Die Linux-App schickte die Anmeldung beim Identitätsanbieter in den System-Browser; angemeldet war danach der Browser, nicht die App. Die Anmeldung läuft jetzt in einem eigenen Fenster und kehrt in die App zurück.
- **Call verlassen:** Nach dem Auflegen entfernte Diddy die Call-Seite sofort, bevor sie das Verlassen melden konnte; andere sahen dich noch bis zu ~18 s im Call. Die Seite darf sich jetzt bis zu 5 s abmelden. Das Mikrofon (natives Mikrofon, Mischer, Rauschfilter) wird beim Auflegen sofort freigegeben; vorher konnte es offen bleiben.
- **Kamera-/Mikrofon-Knopf blieb gesperrt:** Ohne Kamera oder ohne Berechtigung wartete der Knopf ewig auf eine Antwort des Calls. Nach 1,5 s ist er wieder frei.
- **Anruf klingelte weiter:** Ein eingehender Anruf hört jetzt nach seiner Laufzeit auf, wenn du auf einem anderen Gerät annimmst, und taucht nicht mehr veraltet auf, nachdem du einen anderen Call beendet hast.
- **Downloads:** Eine Fehlerseite des Servers (404, 403, 429) wurde als die heruntergeladene Datei gespeichert. Jetzt gibt es einen Fehler.
- **Kleinere Call-Fehler:** Ein fehlgeschlagenes OpenID-Token meldet der Call sofort statt nach 10 s; ein nicht gesendetes Ablehnen steht im Log; der Hinweis „kein WebRTC“ erscheint wieder.
- **macOS: Update-Fenster schließen:** Der rote Knopf beendete Diddy, statt „Nicht jetzt“ zu bedeuten. Konnte das Update-Fenster nicht geöffnet werden, öffnete sich nie ein Hauptfenster.
- **macOS: Dock-Symbol:** Ein Klick auf das Dock-Symbol öffnet das Hauptfenster wieder, wenn es geschlossen wurde und nur noch ein Verbindungsfenster offen war.

## 1.5.3 (2026-11-11)

- **macOS: Dateien herunterladen (#176):** Downloads (Dateien aus Nachrichten, Bilder, Wiederherstellungsschlüssel) passierten in der Mac-App gar nicht, weil WebKit ohne Download-Handler jeden Download verwirft. Sie landen jetzt im Ordner „Downloads“; eine vorhandene Datei bekommt eine Nummer angehängt statt überschrieben zu werden. Das Log nennt Ziel und Erfolg.
- **Profil exportieren (#175, #179):** Auf macOS war das Datei-Plugin nie gestartet, deshalb meldete der Export „The file could not be saved.“ und das Einfügen kopierter Dateien scheiterte. Auf Linux fehlten Speichern-Fenster und Datei-Plugin ganz; dort nimmt der Export jetzt den normalen Download mit eigenem Speichern-Fenster. Unbenutzte Dateirechte (Ordner lesen, kopieren, löschen, umbenennen) sind entfernt.
- **macOS: Verbindungen entfernen und Konto-Labels (#178):** Drei Befehle hatten keine Freigabe und wurden abgelehnt. Ein neuer Vertragstest (`cinny/tests/tauriAcl.test.cjs`) prüft für jeden Befehl Manifest und Freigabe und dass jedes genutzte Plugin gestartet ist.
- **macOS: nur Web- und Mail-Links öffnen das System (#180):** `ftp:`, `magnet:` und andere Schemata aus Nachrichten werden nicht mehr ans System weitergereicht, wie schon unter Linux.
- **Rust-Mindestversion (#181):** `rust-version` ist jetzt 1.89, die tatsächlich nötige Version.
- **Badges im Optionsraum geschützt (#168):** Der Speicherplatz eines Badges im Raumzustand gehört keinem Nutzer, deshalb konnte jedes Mitglied fremde Badges leeren oder alte Badges ohne Besitzer-Kennung übernehmen. Badges als Raumzustand dürfen jetzt nur noch Admins schreiben; alle anderen senden sie automatisch als Nachricht. Nachrichten anderer überschreiben nichts, die Leser wählen wie bisher die richtige Version (Besitzer-Kennung, sonst der erste Schreiber). Bestehende Optionsräume stellt der Client eines Admins einmal um (Log: `badge state limited to admins`). Schon überschriebene Badges kommen dadurch nicht zurück. Nicht mit mehreren echten Nutzern geprüft.
- **Watch together kam beim Gegenüber nicht an (#171):** Die verschlüsselte Zustellung überspringt Geräte, deren Schlüssel der Client nicht kennt, ohne Fehler. In Call-Räumen ohne Verschlüsselung ging dadurch gar nichts raus. Diese Geräte bekommen die Nachricht jetzt unverschlüsselt, wie schon beim bisherigen Fallback; bekannte Geräte weiter verschlüsselt. Ohne Ziel steht `watchTogether: no other call device` im Log. Nicht mit zwei echten Clients geprüft.
- **Keine unbehandelten Fehler mehr nach Knöpfen (#174):** „Join“, „Retry“, Einladungen annehmen/ablehnen und rund 30 weitere Knöpfe zeigten Fehler (z. B. 403 bei Invite-only-Räumen) korrekt an, warfen sie aber zusätzlich als unbehandelte Ausnahme. Ein Test verhindert, dass solche Knöpfe wieder direkt gebunden werden.
- **Einstellungen bei kleinem Fenster (#172):** Bis 760 px Fensterhöhe scrollt die ganze Seitenleiste, „Logout“ folgt der Liste statt „About“ zu verdecken.
- **Raumkopf bei schmalem Fenster (#170):** Raumname und Mitgliederzahl schrumpfen jetzt innerhalb ihres Bereichs: zuerst wird die Zahl gekürzt, der Name behält ein paar Buchstaben, nichts rutscht mehr über die Knöpfe. Nur am Code geprüft, nicht in Chromium bei 800×600.

- **Linux-CI: Audiotest stabilisiert:** Wartet auf Server, Spielerstreams und vollständige PCM-Messfenster mit begrenzten Zeitbudgets; synthetische Spieler haben mehr Puffer. PulseAudio und PipeWire erscheinen getrennt in CI. Fehler zeigen Server-/Helferlogs und Streamzustand; Grenzwerte und Ausschlussprüfung bleiben erhalten.

- **iOS: Quelle für AltStore und SideStore:** `.github/scripts/altstore-source.cjs` erzeugt aus einem Release die Quelldatei `altstore.json` (Bundle-ID `app.diddy.ios`, Version, Größe, Download-Link, Release-Notizen). Sie wird nicht im Release mitgebaut, sondern vom Homelab-Dienst bei jedem neuen Release erzeugt und samt IPA gespiegelt. In AltStore oder SideStore einmal als Quelle eintragen, danach erscheinen neue Versionen unter „Updates“. Keine App-Änderung; getestet mit `cinny/tests/altstoreSource.test.cjs`.

## 1.5.2 (2026-11-11)

- **Neues Logo:** Das Diddy-Zeichen ist jetzt ein fettes kleines „d“, dessen Innenraum eine Sprechblase ist; die Flasche ist überall ersetzt. Es gilt für alle fünf Farbtöne (Pink, Blue, Purple, Black, Magenta) auf macOS (Dock, App, DMG), Linux (Fenster, Pakete), Web (Favicon, Apple- und Android-Symbole, App-Icon-Auswahl, Logos in der Oberfläche) und iOS (App-Icon, alternative Icons, Anmeldebild). Die Vorlagen liegen als Vektorgrafik in `branding/`, `python3 branding/export.py` erzeugt daraus alle Bilder. Keine neue Funktion, nur das Bild. Nicht auf einem echten Mac, Linux-Desktop und iPhone angesehen: Dock, `icon.icns` und iOS-Icons bitte beim ersten Start prüfen.

- **Linux: Kontenliste zeigt Matrix-Kennungen:** Die Oberfläche meldete die Konten bereits an die App, aber Electron fehlten die beiden zugehörigen Kommandos. Es speichert die öffentlichen Matrix-IDs jetzt getrennt von den Anmeldedaten, validiert sie und entfernt Einträge gelöschter Verbindungen. Der Plattform-Vertragstest und neue Persistenztests prüfen den zuvor fehlenden Pfad.
- **Kopfhörer aus in der Call-Liste (#160):** Unter dem Call-Raum zeigt deine Zeile jetzt auch das durchgestrichene Kopfhörer-Symbol, wenn du taub geschaltet bist (bisher nur das Mikrofon). Bei den anderen bleibt nur das Mikrofon sichtbar: Ob jemand seine Kopfhörer aus hat, überträgt Matrix nicht.
- **Konten in den Einstellungen (#156):** Einstellungen > Account hat den Abschnitt „Accounts“: alle getrennten Anmeldungen mit Matrix-ID (Benutzername) des jeweiligen Kontos, Öffnen und Entfernen (zweimal tippen) sowie „Add“ für ein weiteres Konto oder einen weiteren Server. Jedes Fenster meldet seine Matrix-ID beim Start (`account-labels.json`, nur die öffentliche ID); ein Fenster, das noch nicht in dieser Version lief, zeigt sie erst nach einmaligem Öffnen.
- **Profil exportieren und importieren (#157):** Im Profil-Editor speichert „Export“ die Anpassung (Namensstil, Karte, Namensfeld, Effekt, Rahmen, Texte, Layout) als `diddy-profile.json`. „Export“ öffnet das Speichern-Fenster von macOS, du wählst Ordner und Namen. „Import“ füllt den Editor damit; gespeichert wird erst mit „Save changes“. Status und Diddy-Version reisen nicht mit, die Datei läuft durch denselben Prüfer wie fremde Profile. Bilder bleiben Verweise auf den Server, auf dem sie liegen.
- **Wer spricht, auch unter dem Call:** Die Avatare in der Liste unter dem Call-Raum bekommen denselben Akzent-Ring wie die Kacheln, solange die Person spricht.
- **Call-Kacheln (#155):** Das Bild einer Kachel ohne Kamera ist wieder halb so groß wie die kleinere Kachelseite (vorher ein kleiner Punkt in hohen und abgeschnitten in flachen Kacheln). In der schmalen Nutzerleiste steht „Busy“ statt „Do Not Di…“ (Tooltip: Do Not Disturb). Nicht auf dem echten Call geprüft.
- **Call-Beitritt messen (#161):** Das Log (`~/Library/Logs/Diddy/app.log`) schreibt jetzt Zeilen `call join: <Schritt> +<ms> (<ms>)` vom Klick bis zur ersten Kachel und zur ersten weiteren Person. Ein nicht beantworteter Schlüssel-Transport (`Request timed out`) ist keine unbehandelte Ausnahme mehr: er steht im Log und wird einmal nach 2 s erneut zugestellt. Ursache der Langsamkeit ist damit noch nicht behoben, sondern messbar.
- **Call-Beitritt: `Request timed out` eingeordnet (#161):** Eine unbehandelte Ausnahme `Request timed out` etwa 10 s nach dem Beitritt ließ sich im Chromium-Testaufbau durch den Theme-Wechsel reproduzieren: Diddy schickte ihn an die Call-Seite, bevor deren Widget-Schnittstelle zuhörte. Er ging verloren und lief nach 10 s ab. Wurde der Call vorher beendet, stand stattdessen `Transport stopped` im Log. Diddy wartet jetzt, bis die Call-Seite bereit ist, schickt das Theme aus der URL nicht noch einmal und schreibt Fehler ins Log. Belegt mit echtem Element Call 0.20.1 im Chromium-Testaufbau (vorher Ablauf nach 10 s, nachher keiner); auf dem Mac nicht geprüft. Neue Logzeilen für die Strecke nach `call joined`: `OpenID requested`, `LiveKit token request done` (Dauer und, wo der Web-View sie meldet, HTTP-Status) und `media connected`. Die Kacheln der anderen erscheinen erst, wenn diese Strecke fertig ist. Die Langsamkeit selbst ist damit nicht behoben: Erst ein Mac-Log mit diesen Zeilen zeigt, welcher Abschnitt dauert.
- **Schlüsselbund-Dialog in Dev-Builds (#164):** Keine Codeänderung. „Diddy Dev“ ist eine eigene App mit eigenem „WebCrypto Master Key“; die CI signiert Dev-Builds nur ad hoc, deshalb fragt macOS bei jedem neuen Build erneut. Lokal gebaute Dev-DMGs werden mit der festen Identität „Diddy Signing“ signiert (docs/agent-guide.md), dann reicht einmal „Immer erlauben“.
- **iOS: mit jedem Emoji reagieren (#166):** Das Lang-Drücken-Menü „Add Reaction“ bot nur die 8 festen Schnell-Reaktionen. Darunter steht jetzt „More Emoji…“: ein Blatt öffnet die Emoji-Tastatur von iOS, das erste getippte Emoji wird als Reaktion gesendet (über dasselbe `toggleReaction` des Rust-SDK wie die Schnell-Reaktionen, also auch in verschlüsselten Räumen; ein Emoji, mit dem du schon reagiert hast, nimmt die Reaktion wie bisher zurück). Hautfarben (Taste halten), ZWJ-Folgen, Flaggen und Tasten-Emoji gehen als ein Schlüssel durch, Variationszeichen bleiben erhalten (❤️ passt zu ❤️ vom Desktop). Buchstaben und Ziffern werden ignoriert; Bei einer anderen aktiven Tastatur lässt sich über den Globus wechseln; fehlt die Emoji-Tastatur ganz, zeigt das Blatt den Weg zu den iOS-Tastatureinstellungen. Der Zugriff auf aktive Tastaturen ist im Datenschutzmanifest deklariert. Die Prüfregel ist mit `ios/Tools/reaction_check` getestet (Swift 6.1 unter Linux); das Blatt selbst ist nicht gebaut und nicht auf einem Gerät geprüft (kein Mac verfügbar).
- #158 und #159 sind bereits mit PR #163 auf `main` (Status-Symbole, Flackern beim Sprechen).
### iOS holt auf (#113, #126–#132, #134, #138)

Alle Punkte gebaut, aber noch nicht auf einem Gerät geprüft (🧪).

- **Call-Kacheln (#126):** Eine Kachel pro Person und pro Bildschirmübertragung, Tippen holt eine Kachel groß nach vorn, der Rest als Vorschauleiste.
- **Soundboard (#113) und MyInstants-Import (#134):** Eigene Clips bis 20 s, alle im Call hören sie über dein Mikrofon; Suche, Vorhören und Mehrfachimport von MyInstants.
- **Sprachnachrichten (#127):** Aufnehmen im Eingabefeld, Player mit Wellenform im Verlauf; Format wie am Desktop (`org.matrix.msc3245.voice`).
- **Bot-Karten und Befehlsvorschläge (#128):** `dev.diddy.card` als native Karte mit Knöpfen, Vorschläge aus `dev.diddy.commands`.
- **Diddy-Profile, Badges, Namensschilder (#129):** Auch aus verschlüsselten Options-Räumen (Nachrichtenmodus), Namensschilder hinter Mitglieder- und DM-Zeilen.
- **Themes (#130):** Alle Desktop-Themes unter Einstellungen > Theme.
- **Redet mit Agent (#131):** Button und Kurzbefehl, Anzeige der anderen auf Kachel und Profilkarte.
- **Plugins (#132):** Plugin-Host mit derselben Sandbox und Schnittstelle wie am Desktop, 8 mitgelieferte Plugins.
- **Logdatei und Diagnose (#138):** `app.log`, Absturzberichte über MetricKit, Export über das Teilen-Menü.
- **Linux: globaler Hotkey für Agent Voice (#135):** Über das XDG-Portal `GlobalShortcuts` mit Halten und Loslassen, ohne Portal unter X11 als Umschalter, sonst Rückfall auf Fenster-Hotkey und `diddy --agent-voice`. Opt-in unter „Also in the background“. Kleiner GIO-Helfer `diddy-global-shortcut`, in Electron-Paket und Nix enthalten. Nur gegen einen Portal-Nachbau getestet.
- **Linux: Tests für Sprachnachrichten, Verbindungsprofile und App-Icon (#137):** Logik aus `main.cjs` in testbare Module verschoben, Tests mit simuliertem Electron; Prüfliste für echtes X11/Wayland in [docs/linux-checkliste.md](docs/linux-checkliste.md).

## 1.5.1 (2026-11-09)

### Highlights

- **Updater vor dem Start (#120):** Diddy sucht beim Start nach einer neuen Version, bevor das Hauptfenster aufgeht. Gibt es eine, fragt ein kleines Fenster „Auf vX aktualisieren?“ mit den Release-Notizen und den Knöpfen Aktualisieren, Diese Version überspringen und Nicht jetzt. Unter macOS lädt es das DMG mit Fortschrittsbalken, ersetzt `/Applications/Diddy.app` (nur dort, wo die laufende App liegt) und startet neu. Schlägt das fehl, steht die Meldung im Fenster und die Release-Seite lässt sich öffnen. Ohne Netz oder nach 3 s startet die App sofort. Unter Linux und Windows öffnet der Knopf die Release-Seite. Unter Einstellungen > Über Diddy lässt sich die Suche abschalten und das Update-Repository (`owner/name`, Standard `Lndr2501/diddy`) ändern; der Hinweis im laufenden Programm nutzt dieselben Einstellungen. Noch nicht auf einem echten Mac durchgespielt (nur Logik-Tests und `cargo check`).
- **Fenster verschwindet beim Ziehen (#143):** In der gespeicherten Fensterdatei eines betroffenen Macs stand eine Größe von 5×5 Pixeln. Das Fenster wurde also winzig und damit unsichtbar, nur Fenster > Zoomen holte es zurück. Es gibt jetzt eine Mindestgröße (480×360), ein zu kleines Fenster wird bei jeder Größenänderung und beim Start wieder auf eine brauchbare Größe gebracht und auf den Hauptbildschirm gesetzt; gespeichertes „sichtbar/Rahmen“ wird nicht mehr wiederhergestellt. Was das Fenster beim Ziehen zusammenfallen lässt, ist damit nicht gefunden, die Folgen sind abgefangen. Bitte auf dem Mac prüfen.

### Weitere Änderungen

- **Hoher Ping und hängendes Audio im Call (#144):** Die Statistikabfrage beim Bildschirmteilen läuft nicht mehr überlappend, hat ein Zeitlimit, beendet sich selbst und hält die Liste der Verbindungen klein. Dazu bevorzugen Anrufe H264 (VideoToolbox) statt Software-VP8, und die Bildschirmübertragung ist auf 1080p30 begrenzt. Beste Annahme für die Ursache, nicht in einem echten Call bestätigt.
- **iOS: Absturz nach dem Verlassen eines Anrufs (#116):** Beim Auflegen werden zuerst alle Videos aus der Oberfläche entfernt und ein noch laufender Verbindungsaufbau wird abgebrochen. Beste Annahme, nicht auf einem Gerät bestätigt.

## 1.5.0 (2026-11-08)

### Highlights

- **Watch together (#83):** Ein YouTube-Video gemeinsam im Call schauen. Play, Pause und Springen sind für alle synchron, Lautstärke und Qualität stellt jeder für sich ein. Läuft über den offiziellen YouTube-Player; SponsorBlock-Segmente werden für alle übersprungen (Kategorien in Einstellungen > Allgemein). Werbung wird nicht geblockt.
- **Profileffekte (#86) und Profilrahmen (#87):** Animierte Overlays und Rahmen um die Profilkarte. Eingebaute Effekte und Rahmen, dazu Import eigener ZIP-Dateien oder Bilder (keine Discord-Dateien im Lieferumfang). Schalter „Profile effects“ und „Profile frames“ in Einstellungen > Allgemein.
- **Plugins ohne Hosting (#98):** Ein Plugin lässt sich aus einer HTML-Datei, per eingefügtem Code oder per GitHub-/Gist-Link hinzufügen und wird lokal gespeichert, ohne Server oder Docker. Dazu ein eigenständiges GitHub-Issues-Plugin und Bot-Karten (`dev.diddy.card`) mit Live-Änderungen, auch in verschlüsselten Räumen.
- **Profil-Editor überarbeitet (#105):** Einheitliche Abstände, eine Karten-Komponente für alle Bereiche und Vorschauen für alle Ansichten (Profilkarte in vier Layouts, großes Profil, Mitglieder, DMs, Panel, Call-Kachel), die den ungespeicherten Entwurf mit den echten Komponenten zeigen.
- **Profilbild nur noch über Matrix (#93):** Das eigene Diddy-Profilbild („Animated avatar“) ist entfernt, alle sehen das normale Matrix-Profilbild. Unter Einstellungen > Account lässt sich jetzt auch ein GIF, WebP oder APNG hochladen; die Datei wird unverändert hochgeladen und bewegt sich überall, wo es unter „Animated profile pictures“ eingeschaltet ist. Wer ein altes Diddy-Bild hatte, bekommt einmalig das Angebot, es als Matrix-Profilbild zu übernehmen.

### Weitere Änderungen

- **Nutzer-Lautstärke bleibt gespeichert (#103):** Stimm-Lautstärke und „Für mich stumm“ werden pro Person gemerkt, auch nach dem Verlassen des Calls und nach einem Neustart. „Reset volumes“ in Einstellungen > Allgemein > Calls.
- **Mute-Anzeige stimmt (#107):** Kachel, Statusleiste, Avatar-Ring und Seitenleiste lesen denselben Zustand (eigenes Mikro aus Diddys Call-Steuerung, andere aus ihrem LiveKit-Mikrofon). „Für mich stumm“ zeigt niemanden mehr für alle als stumm.
- **Doppelte Call-Knöpfe weg (#94):** Mikrofon und Kopfhörer nur noch unten neben dem Namen, oben Bildschirmübertragung, Kamera und Soundboard.
- **Suche (#109):** Eine bearbeitete Nachricht erscheint einmal, mit dem aktuellen Text und „(edited)“.
- **Badges (#108):** Ein manipuliertes `content.at` kann einen Widerruf nicht mehr überstimmen.
- **Dev-Builds (#95):** „Diddy Dev“ nutzt den eigenen Port 44549 und zeigt nicht mehr die Seite der installierten Diddy-App; jedes Fenster zeigt ein Wasserzeichen mit Branch und Commit.
- **Linux/Nix (#100):** Der Nix-Build enthält `docs/plugins` im Frontend-Paket.

## 1.4.0 (2026-11-08)

### Highlights

- **Do Not Disturb funktioniert (#71):** DND gilt jetzt auch, wenn es in den Profileinstellungen oder auf einem anderen Gerät gesetzt wurde. Nachrichten- und Einladungstöne, Systembenachrichtigungen und das Klingeln eingehender Anrufe sind stumm, das Anruffenster erscheint trotzdem. Die Badges für Ungelesenes bleiben.
- **Anruf-Alarm über ntfy (#49):** Wer auf iOS unter Einstellungen > Call Alerts den Alarm einschaltet, bekommt bei geschlossener App „Name is calling you“ über die ntfy-App. Den Alarm schickt das Diddy des Anrufers (Desktop oder iOS) an das Topic, das in der Direktnachricht hinterlegt ist. Nur HTTPS-Server.
- **iOS: Diddy-Profile (#44):** Banner, Status, Namensfarbe, Badges und Profilabschnitte auf der Profilkarte, in der Mitgliederliste und im Chat. Das eigene Profil lässt sich unter Einstellungen > Diddy Profile bearbeiten.
- **iOS: mehr Einstellungen (#45):** Chat (Zeitformat, Beitritt/Verlassen anzeigen, Bilder automatisch laden, Tipp- und Lesestatus), Geräte, blockierte Nutzer, Über Diddy.

### Weitere Änderungen

- **iOS: @-Erwähnungen (#41):** Erwähnungen aus Desktop-Diddy und Element erscheinen als @Name und öffnen das Profil, Erwähnungen von dir sind markiert. Die Autovervollständigung kommt mit Namen zurecht, die mit einem anderen Namen beginnen.
- **iOS: Chat öffnet unten (#42):** Der Chat bleibt bei der neuesten Nachricht, bis du selbst scrollst, auch wenn Seiten oder Bilder spät laden.
- **Verbindungsprofile (#7):** Ein neues Verbindungsfenster, das länger als 30 s zum Öffnen brauchte, wurde nicht gespeichert, nach einem Neustart fehlte die Anmeldung. Dazu Tests für den Lebenszyklus und die Trennung der Datenspeicher.
- **Stream-Auflösung (#11):** Wer zuschaut, schreibt ins Log, in welcher Größe jedes empfangene Video ankommt und in welcher Kachel es gezeigt wird (`receive watch`). In kleinen Kacheln kommt mit Absicht die halbe Auflösung an, erst „is upscaled“ ist ein echter Qualitätsverlust.
- **Bildschirmübertragungen umschalten (#2, #66):** Auch in der Element-Call-Ansicht holt ein Klick eine Übertragung groß nach vorn, Escape führt zurück. Mehrere Bildschirme einer Person gehen weiterhin nicht.
- **Statusmenü (#21):** Pfeiltasten, Home/End, Escape gibt den Fokus an den Profilknopf zurück, für Screenreader als Menü lesbar, DND mit kurzer Erklärung.

## 1.3.2 (2026-11-08)

Erste veröffentlichte Version mit allen Neuerungen aus 1.3.1 (der Build von 1.3.1 schlug fehl und wurde nicht veröffentlicht).

- **Systemton bei der Bildschirmfreigabe (Linux):** auf älteren PipeWire-Versionen lässt sich der Ton einer gerade gestarteten App oft erst nach ein paar Versuchen abgreifen. Diese Versuche zählen nicht mehr als Fehler, der Ton neuer Apps kommt wieder an. Der Audio-Test der CI gibt bei einem Fehlschlag die Meldungen des Helfers aus.

## 1.3.1 (2026-11-08, nicht veröffentlicht)

### Highlights

- **Calls wie bei Discord:** Diddy zeichnet den Call selbst. Jede Person und jede Bildschirmübertragung ist eine eigene Kachel ("Luis' Stream" mit LIVE-Abzeichen). Ein Klick holt eine Kachel groß nach vorn, die anderen rücken in eine Leiste darunter; Escape führt zurück zum Raster. Übertragungen erscheinen groß in ihrem eigenen Seitenverhältnis, ohne schwarze Balken.
- **Neue Call-Leiste:** Mikrofon und Ausgabe mit Geräteauswahl als ein Knopf, Freigabe-Menü mit Systemton an/aus und "Stop sharing", "Mehr"-Menü für Ansicht und Call-Einstellungen, Statuszeile über der Leiste statt loser Text daneben.
- **Anrufen während eines Calls:** der Anruf-Knopf im Profil, "Join" in anderen Räumen und die Call-Knöpfe im Raumkopf sind nicht mehr ausgegraut. Diddy fragt "Leave your current call?" und wechselt nach Bestätigung.
- **Einstellungen im Stil von T3 Code:** schlanker Kopf mit Breadcrumb, Suche mit `/`, schlichte Symbole, beschriftete Gruppen, Abschnittsüberschriften; auch für Raum- und Space-Einstellungen.
- **Großes Profil:** ein Klick auf das Profilbild (oder auf einen Namen in "Im Gespräch") öffnet ein großes Profilfenster. Im Profil-Editor lassen sich Layout, Banner-Höhe und Bildgröße dafür einstellen.
- **Neues Theme "DAAARK"** mit den Farben des Dark-Themes von T3 Code: reines Schwarz, #111-Spalten, blauer Akzent.
- **Apple-Emoji unter Linux,** wenn die Schrift "Apple Color Emoji" installiert ist (Anleitung im README, optionales Nix-Paket `apple-color-emoji`; die Schrift selbst liegt aus Lizenzgründen nicht im Paket).

### Weitere Änderungen

- **Systemton bei der Bildschirmfreigabe (Linux):** fällt die Aufnahme einer einzelnen App aus, läuft der Ton der übrigen weiter, statt die Freigabe mit "Application audio monitor failed" zu beenden. Der genaue Grund steht jetzt im App-Log.
- Das Menü von Element Call (Lautstärke, "Mute for me") sieht aus wie Diddys eigene Menüs; das überflüssige "Copy"-Menü beim Öffnen erscheint nicht mehr.
- Die Seitenspalten liegen tonal zwischen Fensterhintergrund und Chat (keine helle graue Fläche mehr).
- App-Version in der Oberfläche korrigiert (1.3.0 zeigte noch 1.2.0 an).

## 1.3.0 (2026-11-08)

### Highlights

- **Linux läuft in Electron, Calls funktionieren auch verschlüsselt (#58).** AppImage und DEB sind jetzt Electron-Pakete mit Anwendungston bei der Bildschirmfreigabe (PulseAudio/PipeWire). Neu: auch ein RPM. macOS bleibt Tauri. Beim Umstieg von Tauri einmal neu anmelden und das Gerät verifizieren.
- **Releases entstehen automatisch.** Ein Tag `vX.Y.Z` baut macOS-DMG, Linux-AppImage, DEB und RPM sowie die iOS-IPA und veröffentlicht alles in einem GitHub-Release samt `SHA256SUMS` (Workflow *Release*).
- **Neues Hauptfenster-Layout:** Raumliste, Chat und Teilnehmerliste sitzen in einer gemeinsamen Karte neben der Space-Leiste. Das Konto-Menü öffnet sich über das Bild im Benutzerbereich, Kick/Ban/Einladen stehen im Optionsmenü der Profilkarte.
- **Calls:** alle Bildschirmübertragungen gleichzeitig (#66), Rechtsklick-Menü auf Personen im Call, privat anrufen vom Profil aus (#55), Mute-Anzeige und Teilnehmer in der Raumliste (#67), neue Töne für Rufton, Beitritt, Erwähnung, Abgelehnt und Verbindungsverlust (#68).
- **Rauschunterdrückung (RNNoise)** am Desktop und auf iOS (#53), acht eingebaute Plugins mit Plugin-Galerie.
- **iOS:** Rauschunterdrückung, Benachrichtigungen im Hintergrund (ohne bezahltes Apple-Konto), Soundpack.
- Teilnehmerliste nach online und offline getrennt, "Redet mit Agent" (#57), sanftes "Jump to Latest" (#63), Badge-Bibliothek mit Löschen (#33, #34), animierte Avatare überall (#35 bis #37).

### Weitere Änderungen

- **Töne (#68):** eigene Töne mit Schalter und eigener Datei unter Einstellungen → Allgemein → Sounds für ausgehenden Rufton (läuft bis jemand beitritt, ablehnt oder 30 s vergehen), eigenen Beitritt, Erwähnungen (statt des normalen Nachrichtentons), abgelehnte Anrufe und Verbindungsverlust.
- **Verbindungsbanner:** "Connecting..." erscheint nicht mehr, wenn der Client schon synchronisiert; nach einem Neuladen blieb das Banner sonst bis zum nächsten Sync (bis zu 30 s). Logik in `plugins/syncBanner.ts` mit Tests.
- **Rauschunterdrückung:** beide Kanäle werden verarbeitet, ein Stereo-Mikrofon ist nicht mehr nur links hörbar.
- **Profil-Editor:** die Tab-Leiste bricht um, statt Tabs abzuschneiden.
- **Hauptfenster:** Raumliste, Chat und Teilnehmerliste teilen eine Karte; die Seitenspalten heben sich durch einen vom Theme abgeleiteten Ton ab statt durch Linien und Lücken, die Kopfzeilen sind gleich hoch. Das doppelte Konto-Bild unten in der Space-Leiste entfällt: das Bild im Benutzerbereich öffnet ein Menü mit Konto, Status, Verbindungen, Einstellungen und Einführung. Kick, Ban und Einladen wandern aus der Profilkarte in deren Optionsmenü, mit Bestätigung und optionalem Grund.
- **Plugins:** eingebaute Plugin-Galerie, Plugin-Speicher und "Link öffnen"-Schnittstelle, acht eingebaute Plugins.
- **Fehlercodes:** Matrix-Upload-Fehler behalten ihren Fehlercode (#64). Optionsraum: der Ersteller steht beim Anlegen nicht mehr in `power_levels.users`. MyInstants-Import zeigt, welche Töne gewählt sind (#59). Soundboard und Call-Töne folgen dem gewählten Ausgabegerät.
- **Tests und CI:** UI-Tests für Einstellungen, Profil-Editor und Überlappungen, lokale macOS-UI-Tests (Playwright WebKit), Linux-Audio-Tests in der gepackten App; schnellere Builds durch Caches (Rust, Nix).
- **README:** Vorschaubilder mit allen neun Themes, direkt aus der laufenden App erzeugt.

### Release-Pakete

- Linux: `Diddy_<Version>_x86_64.AppImage`, `Diddy_<Version>_amd64.deb`, `Diddy_<Version>_x86_64.rpm` (nicht signiert).
- macOS: `Diddy_<Version>_aarch64.dmg` (ad hoc signiert, solange keine Apple-Zertifikate als Secrets gesetzt sind).
- iOS: `Diddy_<Version>_iOS_unsigned.ipa` (zum Sideloaden).
- Der Update-Hinweis in der App vergleicht die eigene Version mit dem neuesten Release; dafür trägt `cinny/src/app/appInfo.ts` die Versionsnummer. Release-Builds setzen sie aus dem Tag.

### Details zu den einzelnen Änderungen

### Call: alle Bildschirmübertragungen gleichzeitig (#66)

- Teilen mehrere Leute ihren Bildschirm, zeigt der Call alle Übertragungen nebeneinander als eigene Kacheln mit dem Namen unten, statt sie einzeln durchzublättern (keine Pfeile und Striche mehr). Die Kamera-Kacheln bzw. Profilbilder bleiben unverändert daneben.
- Das Layout bestimmt der eingebettete Element Call; Diddy formt dessen Bildschirm-Karussell per Stylesheet zum Raster um (`plugins/call/screenShareGrid.ts`). Die Übertragungen bleiben deshalb im großen Bereich und werden nicht zwischen die Kamera-Kacheln gemischt. Der Lautstärke-Knopf für Übertragungston wirkt weiter nur auf eine Übertragung.

### Teilnehmerliste: Offline-Mitglieder dunkler ausgegraut

- Wer in der Gruppe „Offline“ steht, ist jetzt deutlich abgedunkelt (halbe Deckkraft), damit man auf einen Blick sieht, wer da ist. Unter dem Mauszeiger, bei Tastaturfokus und bei geöffnetem Profil ist die Zeile wieder voll lesbar. In `features/room/MembersDrawer.tsx`.

### Raumliste: Mute-Anzeige bei Leuten im Call (#67)

- In der Seitenleiste steht bei jedem im Call jetzt ein rotes durchgestrichenes Mikrofon, wenn die Person stummgeschaltet ist (auch wenn du sie für dich selbst stummgeschaltet hast). Der Mute-Status der anderen steht nicht in Matrix, deshalb kommt er aus dem Call, in dem du gerade bist; in Calls, in denen du nicht bist, gibt es keine Anzeige. In `features/room-nav/CallMemberList.tsx`.

### iOS: Rauschunterdrückung (#53)

- Neuer Schalter "Noise suppression" in den iOS-Einstellungen, standardmäßig an, wirkt sofort, auch im Call. Filtert Lüfter und Tippen aus dem Mikrofon, auf dem Gerät und ohne Server oder Konto, mit [RNNoise](https://github.com/xiph/rnnoise) (BSD-3) wie am Desktop. Krisp selbst braucht einen kommerziellen Vertrag, die fertigen LiveKit-Filter sind an LiveKit Cloud gebunden.
- Hintergrund und Messungen: `docs/rauschunterdrueckung-und-benachrichtigungen.md`.

### iOS: Benachrichtigungen im Hintergrund

- Neuer Schalter "Notifications in the background" (aus ab Werk). Diddy läuft dann im Hintergrund weiter und zeigt neue Nachrichten, Erwähnungen, Einladungen und Anrufe als Mitteilung, auch ohne bezahltes Apple-Konto. Kostet Akku; nach einem Neustart des iPhones muss die App einmal geöffnet werden.

### iOS: Soundpack

- Die iOS-App spielt jetzt die Sounds aus Diddys Soundpack (dieselben MP3s wie am Desktop). Wo das Pack nichts hat (Freizeichen, Erwähnung, Einladung, ...), bleiben die bisherigen Töne.

### Linux: Bildschirmfreigabe mit Anwendungston und einheitliche Pakete

- Linux kann fremde Wiedergabe-Apps als separaten Screenshare-Audiotrack teilen. Der native Helfer nutzt PulseAudio oder PipeWires Pulse-Schnittstelle und schließt Diddys eigenen Prozessbaum aus. Der Systemton-Schalter ist vor und während der Freigabe sichtbar; Audiofehler werden angezeigt, während das Bild weiterläuft.
- Unter X11 gibt es eine Bildschirm-/Fensterauswahl mit Abbruch. Wayland verwendet weiterhin das Desktop-Portal. Erfasst wird der Ton aller erkennbaren anderen Apps, unabhängig vom gewählten Fenster.
- AppImage und DEB verwenden jetzt wie NixOS Electron. CI baut die Pakete mit Audiohelfer und prüft synthetische PulseAudio-/PipeWire-Streams sowie den tatsächlichen Audioempfang über WebRTC in der gepackten X11-App. Eine reale Wayland-/Endgeräteabnahme steht aus; beim Umstieg von Tauri ist eine neue Anmeldung und Geräteverifikation nötig.

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
