# Bot-Karten (`dev.diddy.card`)

Ein Bot (z. B. der Musikbot) kann Diddy strukturierte Daten schicken, aus denen Diddy eine Karte zeichnet
(Titel mit Fortschrittsbalken, Warteschlange, gegliederte Hilfe, Hinweis-Chips, Knöpfe). Andere Clients
(Element usw.) zeigen weiter den normalen Text.

## Aufbau

Eine normale Nachricht (`m.notice` oder `m.text`) mit einem Zusatzfeld im `content`:

```json
{
  "msgtype": "m.notice",
  "body": "🎵 Modern Talking – Cheri Cheri Lady (3:17)",
  "dev.diddy.card": { "v": 1, "kind": "track", "state": "playing", "title": "…", "duration": 197 }
}
```

- `body` bleibt immer der lesbare Rückfall-Text (und für Suche, Benachrichtigungen, Vorschau).
- Wird die Nachricht per Bearbeitung (`m.replace`) aktualisiert, muss `dev.diddy.card` auch in
  `m.new_content` stehen. So läuft Suchen → Laden → Spielt in **einer** Karte statt in drei Nachrichten.
- `v` ist die Version (aktuell `1`). Unbekannte Versionen oder Arten ignoriert Diddy (dann gilt `body`).

## Arten (`kind`)

| `kind` | Felder |
|---|---|
| `track` | `state` (`searching`, `downloading`, `playing`, `paused`, `stopped`, `error`), `title`, `artist?`, `duration?` (s), `position?` (s zum Zeitpunkt `startedAt`), `startedAt?` (Bot-Uhr, ms; damit läuft der Balken im Client von selbst), `thumbnail?` (`mxc://`), `url?` (http/https), `source?`, `note?`, `seek?`, `volume?`, `actions?` |
| `queue` | `now?` (`title`, `artist?`, `duration?`), `items[]` (gleiche Felder), `total`, `actions?` |
| `help` | `groups[]` mit `title` und `items[]` (`usage`, `desc`), `note?` |
| `note` | `text`, `tone` (`info`, `success`, `warning`, `error`), `icon?` (ein Emoji) |

`seek` (z. B. `"!seek"`) macht die Zeitleiste anklickbar: ein Klick sendet `<seek> mm:ss`, die Pfeiltasten auf der
Zeitleiste `<seek> -10` / `<seek> +10`; beim Darüberfahren zeigt Diddy die Zeit unter dem Mauszeiger. `volume` ist die
aktuelle Lautstärke des Bots (wird neben den Zeiten angezeigt). Beide ändern sich, wenn der Bot die Karte bearbeitet.

`actions` sind Knöpfe: `{ "label": "⏸ Pause", "send": "!pause" }`. Ein Klick schreibt `send` als normale Nachricht des
Nutzers in den Raum (der Bot prüft wie immer, ob er den Befehl ausführen darf). `send` muss mit `!` oder `/`
beginnen, höchstens 10 Knöpfe.

## Verschlüsselte Räume

Bearbeitungen funktionieren auch dort. Der Bot muss `m.relates_to` wie gewohnt senden (nio kopiert es unverschlüsselt
mit). Diddy zeichnet die Karte nach dem Entschlüsseln der Bearbeitung neu (`RoomTimeline.tsx`, `useLiveEventArrive`).

## Sicherheit

Die Daten sind fremde Eingaben. Diddy (`cinny/src/app/plugins/botCard.ts`) lässt nur bekannte Arten zu, kürzt Texte,
verlangt endliche Zahlen, nimmt Bilder nur als `mxc://` und Links nur als http/https, und zeigt alles als Text
(kein HTML). Getestet in `cinny/tests/botCard.test.cjs`; das Aussehen in allen Themes in
`cinny/tests/preview/bot-card.spec.cjs` (`npm run test:tiles`).
