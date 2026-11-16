# iOS: offene Sicherheitspunkte

Aus dem Review von PR #32. Bewusst noch nicht umgesetzt, weil sie das Speicherformat oder die Schlüsselverteilung im Sprachkanal ändern und es schon installierte Beta-Instanzen gibt, deren Daten erhalten bleiben müssen.

## Braucht eine Migration der installierten Beta-Instanzen

- **Krypto-Store mit Passphrase.** Der SQLite-Store des Rust-SDK liegt derzeit ohne Passphrase in `Application Support/Accounts/<id>/data` (geschützt nur durch die iOS-Datenverschlüsselung). Eine Passphrase (zufällig, im Schlüsselbund) lässt sich nicht einfach nachträglich setzen: bestehende Stores müssen migriert werden, sonst verlieren Tester ihre Schlüssel.

## Konten und Sitzungen

- **Verwaiste Konten aufräumen.** Ordner unter `Accounts/` und Schlüsselbund-Einträge ohne Eintrag in der Kontoliste (z. B. nach einem Absturz mitten im Login) werden nie gelöscht.
- **Fehler von `client.logout()` melden.** Schlägt das Abmelden am Server fehl, wird das Konto lokal trotzdem entfernt, ohne Hinweis. Das Gerät bleibt dann am Server angemeldet.

## Privatsphäre

- **Lesebestätigungen abschaltbar.** Die App sendet sie immer; es fehlt eine Einstellung (privat/aus) wie am Desktop.
- **Warnhinweis bei Vollbild-Screenshare.** Ab iOS 27 überträgt die Bildschirmfreigabe auch andere Apps und die Einstellungen von Diddy, darunter das Feld für den Wiederherstellungsschlüssel. Vor dem Start (oder beim Öffnen des Feldes während einer Übertragung) sollte ein Hinweis kommen, oder das Feld wird während der Übertragung verdeckt.
