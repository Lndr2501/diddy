# Diddy übersetzen (Desktop und iOS)

Desktop und iOS verwenden **dieselben** UTF-8-Dateien unter `cinny/locales/<code>.json` (keine Kopien). `en.json` ist die Vorlage und Rückfallebene für fehlende Texte. Nur iOS-spezifische Texte stehen unter `ios.*`; auch diese müssen in `en.json` stehen und werden vom Check geprüft. Eine neue Sprachdatei wird beim nächsten iOS-Build automatisch mitgebündelt.

## Sprache hinzufügen

1. Kopiere `cinny/locales/en.json` nach `cinny/locales/<code>.json` (z. B. `fr.json`). Bearbeite `_meta`: `code` muss dem Dateinamen entsprechen; `name` ist der Eigenname der Sprache, `englishName` ihr englischer Name, `authors` eine Liste von Namen.
2. Übersetze die Werte, nicht die Schlüssel. Behalte Platzhalter wie `{{name}}` unverändert. Für Mehrzahl stehen `_one` und `_other` (je nach Sprache auch `_few`, `_many` usw.); `{{count}}` kann in einer Mehrzahlform entfallen. Nicht übersetzte Einträge darfst du weglassen – sie erscheinen dann auf Englisch.
3. Führe in `cinny/` `npm run i18n:check` und `npm test` aus. Der Check zeigt den Fertigstellungsgrad, unbekannte Schlüssel und Platzhalterfehler. Eine gültige Datei im Ordner erscheint automatisch in der Sprachauswahl.

## Eigene Datei ohne Neubau laden

Auf dem Desktop unter **Einstellungen → Erscheinungsbild → Sprache** kannst du mit **Export template** die aktuelle Sprache als JSON-Vorlage speichern. Übersetze sie und wähle **Load language file…**. Diddy prüft die Datei und zeigt Fehler an; eine gültige Datei wird nur auf diesem Gerät gespeichert, sofort ausgewählt und kann dort wieder entfernt werden. Eine eigene Datei mit demselben Sprachcode ersetzt bis zum Entfernen die mitgelieferte Datei. **System** folgt der Systemsprache, andernfalls nutzt Diddy Englisch.

Auf iOS findest du **Einstellungen → Sprache** direkt in der App. Du kannst dort jede mitgelieferte Sprache samt Fertigstellungsgrad wählen oder über **Sprachdatei laden…** eine eigene JSON-Datei importieren und wieder entfernen. Der Wechsel wirkt sofort. Der Check `npm run i18n:check` prüft auch statische `L("…")`-Schlüssel im Swift-Code. System-Berechtigungsdialoge (Mikrofon, Kamera, Fotos, lokales Netzwerk) lesen hingegen ausschließlich `ios/Diddy/{en,de}.lproj/InfoPlist.strings`; diese Dateien bitte separat übersetzen.
