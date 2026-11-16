# iOS: offene Sicherheitspunkte

Aus dem Review von PR #32. Bewusst noch nicht umgesetzt, weil sie das Speicherformat oder die Schlüsselverteilung im Sprachkanal ändern und es schon installierte Beta-Instanzen gibt, deren Daten erhalten bleiben müssen.

## Braucht eine Migration der installierten Beta-Instanzen

- **Krypto-Store mit Passphrase.** Der SQLite-Store des Rust-SDK liegt derzeit ohne Passphrase in `Application Support/Accounts/<id>/data` (geschützt nur durch die iOS-Datenverschlüsselung). Eine Passphrase (zufällig, im Schlüsselbund) lässt sich nicht einfach nachträglich setzen: bestehende Stores müssen migriert werden, sonst verlieren Tester ihre Schlüssel.

