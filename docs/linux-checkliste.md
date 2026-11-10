# Linux: Checkliste zum Prüfen auf echtem X11 und Wayland

Diese Punkte sind gebaut und mit simuliertem Electron getestet (`cd electron && npm test`), aber nicht auf einem echten Linux-Desktop geprüft. Wer sie durchgeht, trägt das Ergebnis in `README.md` und `docs/plattformen.md` ein (#135, #137).

## Globaler Hotkey für Agent Voice (#135)

1. Einstellungen > „Talking to an agent“: „Detect dictation hotkey“ und „Also in the background“ einschalten, eine Taste aufnehmen (z. B. F13 oder Strg+Alt+Leertaste). Die Hotkey-Zeile nennt den Weg (Portal mit Trigger, X11 oder nur Fenster).
2. Wayland (KDE, GNOME 48+): nach dem Portal-Dialog die Taste halten, während ein anderes Fenster den Fokus hat. „Redet mit Agent“ erscheint beim Halten und endet beim Loslassen. Im Modus „toggle“ schaltet jeder Druck um.
3. X11 ohne Portal: Diddy im Hintergrund, Taste drücken. Es schaltet abwechselnd an und aus, im Log steht `x11`.
4. GNOME vor 48 unter Wayland: Die Hotkey-Zeile nennt den Rückfall und den Grund. `diddy --agent-voice toggle` geht weiter.
5. Einzelne Modifikatortaste (rechte Alt-Taste) wählen: Die Zeile erklärt, warum das nicht global geht.
6. In `~/.local/state/diddy/app.log` steht `agent voice: global hotkey ...`.
7. Diddy einmal aus dem Terminal und einmal aus dem Menü starten: Nimmt das Portal beides an?
8. Taste in Diddy ändern: Der neue Trigger wirkt.

## Sprachnachrichten (#137)

1. Mit funktionierendem Mikrofon aufnehmen, anhören, senden. Es kommt keine Berechtigungsabfrage.
2. Im selben Raum und in einem anderen Client (Element, Diddy auf macOS/iOS) abspielen.
3. Springen, Dauer und Wellenform prüfen (Chromium nimmt WebM/Opus auf).

## Verbindungsprofile (#137)

1. Zweiten Login auf einem anderen Homeserver hinzufügen: eigenes Fenster, getrennter Login.
2. Schließen und aus der Liste wieder öffnen: weiterhin angemeldet.
3. Der Haupt-Login ist unberührt.
4. Zweiten Login entfernen: seine Daten sind weg. Grenze von 20 Logins prüfen.
5. Mit `diddy --connection-id <id>` starten, auch während Diddy schon läuft.

## App-Icon (#137)

1. Alle fünf Icons durchschalten. Unter X11 ändern sich Fenster- und Leistensymbol.
2. Neustart: Die Wahl bleibt.
3. Unter Wayland notieren, ob sich das Dock-/Leistensymbol ändert (vermutlich nicht, es kommt aus der `.desktop`-Datei).
4. Nach dem Umschalten ein Verbindungsfenster öffnen: Es nutzt das gewählte Icon.
