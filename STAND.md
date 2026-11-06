# Stand 2026-11-06

Letzter Statusbericht des Entwicklungsstands (Diddy, nach 1.1.0, kein neues Release).

## Zustand

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
