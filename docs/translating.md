# Diddy übersetzen (Desktop)

Diddy verwendet je Sprache eine UTF-8-Datei unter `cinny/locales/<code>.json`. `en.json` ist die Vorlage und die Rückfallebene für fehlende Texte. `ios` ist als eigener Namensraum für die spätere iOS-App reserviert.

## Sprache hinzufügen

1. Kopiere `cinny/locales/en.json` nach `cinny/locales/<code>.json` (z. B. `fr.json`). Bearbeite `_meta`: `code` muss dem Dateinamen entsprechen; `name` ist der Eigenname der Sprache, `englishName` ihr englischer Name, `authors` eine Liste von Namen.
2. Übersetze die Werte, nicht die Schlüssel. Behalte Platzhalter wie `{{name}}` unverändert. Für Mehrzahl stehen `_one` und `_other` (je nach Sprache auch `_few`, `_many` usw.); `{{count}}` kann in einer Mehrzahlform entfallen. Nicht übersetzte Einträge darfst du weglassen – sie erscheinen dann auf Englisch.
3. Führe in `cinny/` `npm run i18n:check` und `npm test` aus. Der Check zeigt den Fertigstellungsgrad, unbekannte Schlüssel und Platzhalterfehler. Eine gültige Datei im Ordner erscheint automatisch in der Sprachauswahl.

## Eigene Datei ohne Neubau laden

Unter **Einstellungen → Erscheinungsbild → Sprache** kannst du mit **Export template** die aktuelle Sprache als JSON-Vorlage speichern. Übersetze sie und wähle **Load language file…**. Diddy prüft die Datei und zeigt Fehler an; eine gültige Datei wird nur auf diesem Gerät gespeichert, sofort ausgewählt und kann dort wieder entfernt werden. Eine eigene Datei mit demselben Sprachcode ersetzt bis zum Entfernen die mitgelieferte Datei. **System** folgt der Systemsprache, andernfalls nutzt Diddy Englisch.
