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
| `track` | `state` (`searching`, `downloading`, `playing`, `paused`, `stopped`, `error`), `title`, `artist?`, `duration?` (s), `position?` (s zum Zeitpunkt `startedAt`), `startedAt?` (Bot-Uhr, ms; damit läuft der Balken im Client von selbst), `thumbnail?` (`mxc://`), `url?` (http/https), `source?`, `note?`, `seek?`, `volume?`, `actions?`; Player (optional): `room?`, `requestedBy?`, `upNext?`, `controls?`, `volumeMax?`, `more?` |
| `queue` | `now?` (`title`, `artist?`, `duration?`), `items[]` (gleiche Felder), `total`, `actions?` |
| `help` | `groups[]` mit `title` und `items[]` (`usage`, `desc`), `note?` |
| `list` | `title`, `items[]` (`title`, `subtitle?`, `duration?`), `total?`, `empty?` (Text bei leerer Liste), `actions?`. Für Favoriten, Playlists u. ä. |
| `stats` | `title`, `charts[]` mit `title`, `unit?`, `items[]` (`label`, `value` ≥ 0, `sub?`), `actions?`. Diddy zeichnet Balkendiagramme (Balken relativ zum größten Wert). |
| `note` | `text`, `tone` (`info`, `success`, `warning`, `error`), `icon?` (ein Emoji), `url?` (http/https, als Link-Knopf im Chip), `linkLabel?` (Beschriftung, höchstens 40 Zeichen, Standard „Open“) |

`seek` (z. B. `"!seek"`) macht die Zeitleiste anklickbar: ein Klick sendet `<seek> mm:ss`, die Pfeiltasten auf der
Zeitleiste `<seek> -10` / `<seek> +10`; beim Darüberfahren zeigt Diddy die Zeit unter dem Mauszeiger. `volume` ist die
aktuelle Lautstärke des Bots (wird neben den Zeiten angezeigt). Beide ändern sich, wenn der Bot die Karte bearbeitet.

`actions` sind Knöpfe: `{ "label": "⏸ Pause", "send": "!pause" }`. Ein Klick schreibt `send` als normale Nachricht des
Nutzers in den Raum (der Bot prüft wie immer, ob er den Befehl ausführen darf). `send` muss mit `!` oder `/`
beginnen, höchstens 10 Knöpfe.

### Player-Karte (`controls`)

Eine `track`-Karte kann wie ein Player aussehen: Kopfzeile „Now playing in <Raum>“, quadratisches
Cover (ohne `thumbnail` eine bunte Kachel mit Notensymbol), Titel, darunter „<Künstler> · requested by <Name>“,
Zeitleiste mit Zeiten darunter, eine Knopfreihe und „Up next“. Alle Felder sind optional und zusätzlich, `v` bleibt `1`:

| Feld | Bedeutung |
|---|---|
| `room` | Raumname für die Kopfzeile (höchstens 80 Zeichen) |
| `requestedBy` | Anzeigename, wer den Titel gewünscht hat (höchstens 80 Zeichen); für Autoplay `"Autoplay"` |
| `upNext` | höchstens 3 Einträge `{ "title": "…", "artist": "…"? }`, nummeriert als „Titel · Künstler“ |
| `controls` | `{ "prev"?, "toggle"?, "skip"?, "volume"?, "dashboard"? }`, jeder Wert ein Befehl |
| `volumeMax` | obere Grenze des Lautstärke-Reglers, Standard `100` |
| `more` | höchstens 16 Knöpfe `{ "label", "send" }` wie bei `actions`, im Menü „⋯“ (alle übrigen Funktionen des Bots: Loop, Autoplay, Queue, Favoriten, Stop, ±10 s …) |

- **Mit `controls` zeichnet Diddy den Player und ignoriert `actions`.** Ältere Diddy-Versionen kennen `controls` nicht
  und nehmen weiter `actions`, darum schickt ein Bot beides. Ohne `controls` bleibt die Karte wie bisher.
- `toggle` ist `"!pause"`, solange `state` `playing` ist, sonst `"!resume"`. Diddy beschriftet den Knopf nach `state`
  (Pause bzw. Play), nicht nach dem Befehl.
- `volume` ist ein Befehlsanfang: Der Knopf zeigt `<volume-Feld der Karte>%`, ein Klick öffnet einen Regler von 0 bis
  `volumeMax`, beim Loslassen sendet Diddy `<volume> N` (z. B. `!volume 120`).
- `dashboard` ist ein Knopf „Dashboard“ in der Knopfreihe. Diddy sendet nur den Befehl; der Bot antwortet mit einem
  persönlichen Link (beim Musikbot per Direktnachricht).
- Lautstärke-Regler und „⋯“ öffnen sich als eigene Zeile unter den Knöpfen in der Karte.
- Befehle in `controls` sind `!befehl` oder `!befehl argument` (Präfix `!` oder `/`, höchstens 30 bzw. 20 Zeichen), damit
  auch `<volume> N` noch als Knopf-Befehl gilt und im Chat ausgeblendet wird. Anderes verwirft Diddy.
- Die Zeitleiste (`seek`) funktioniert im Player genauso.

```json
"dev.diddy.card": {
  "v": 1, "kind": "track", "state": "playing", "title": "Neon Highway", "artist": "The Midnight Drivers",
  "duration": 214, "position": 63, "startedAt": 1763000000000, "seek": "!seek", "volume": 70,
  "room": "Lounge", "requestedBy": "Luis", "volumeMax": 150,
  "controls": { "prev": "!previous", "toggle": "!pause", "skip": "!skip", "volume": "!volume", "dashboard": "!dashboard" },
  "more": [{ "label": "🔁 Loop", "send": "!loop" }, { "label": "⏹ Stop", "send": "!stop" }],
  "upNext": [{ "title": "Paper Planets", "artist": "Kim & the Comets" }],
  "actions": [{ "label": "⏸ Pause", "send": "!pause" }, { "label": "⏭ Weiter", "send": "!skip" }]
}
```

Knöpfe und die Zeitleiste senden ihre Befehle mit dem Zusatzfeld `"dev.diddy.card_action": true`. Diddy blendet solche
Nachrichten im Chat aus (nur kurze, befehlsförmige Texte, also nie eine echte Nachricht), damit der Raum nicht mit
`!pause`, `!seek 1:23` usw. zugemüllt wird. Der Bot liest sie wie jede andere Nachricht.

## Befehle anmelden (Vorschläge beim Tippen)

Ein Bot meldet seine Befehle als Raum-Zustand (State-Event) an. Diddy schlägt sie dann beim Tippen vor
(Tab oder Klick vervollständigt):

```json
PUT /_matrix/client/v3/rooms/{roomId}/state/dev.diddy.commands/{botUserId}
{
  "v": 1,
  "prefix": "!",
  "commands": [
    { "name": "play", "usage": "!play <Link oder Suchbegriff>", "desc": "Titel abspielen" },
    { "name": "pause", "usage": "!pause", "desc": "pausieren" }
  ]
}
```

- `prefix`: ein oder zwei Satzzeichen (`!`, `%`, `.` …), nie ein Buchstabe. `name` ohne Präfix, nur Buchstaben,
  Ziffern, `_`, `-`, `/`. `usage` und `desc` sind optional; höchstens 100 Befehle.
- `state_key` ist die Matrix-ID des Bots, so kann jeder Bot im Raum seine eigene Liste haben.
- Zustandsereignisse zu setzen braucht die entsprechende Berechtigung im Raum (Standard: Moderator, Stufe 50). Fehlt sie,
  bleibt es still bei „keine Vorschläge“, der Bot funktioniert trotzdem.
- Räume mit Ende-zu-Ende-Verschlüsselung: Zustandsereignisse sind nie verschlüsselt, die Liste ist also für alle im Raum
  lesbar. Das ist gewollt, sie enthält nur Befehlsnamen.
- Der Musikbot macht das beim Start, beim Beitritt und vor dem ersten Befehl in einem Raum.

## Bot-Profil (`dev.diddy.bot`)

Ein Bot meldet sich als Bot an, wieder als Raum-Zustand mit seiner Matrix-ID als `state_key`:

```json
PUT /_matrix/client/v3/rooms/{roomId}/state/dev.diddy.bot/{botUserId}
{
  "v": 1,
  "about": "Plays music in voice rooms. Try the buttons on my cards.",
  "banner": { "from": "#ff6fa5", "to": "#2bd9a8", "angle": 135 },
  "accent": "#7a5cff"
}
```

- `about` (höchstens 200 Zeichen), `banner` (`from`/`to` als `#rgb` oder `#rrggbb`, `angle` 0–360, optional) und `accent`
  sind optional. `{"v": 1}` allein reicht, um als Bot zu gelten; leerer Inhalt `{}` nimmt es zurück.
- Ein `state_key`, der mit `@` beginnt, darf nur dieser Nutzer selbst setzen. Diddy prüft zusätzlich, dass Absender und
  `state_key` gleich sind. Niemand kann also einen anderen zum Bot erklären.
- Wer `dev.diddy.commands` (siehe oben) gesetzt hat, gilt ebenfalls als Bot.
- Diddy zeigt dann: ein kleines „BOT“ neben dem Namen im Chat, eine eigene Gruppe „Bots — n“ in der Mitgliederliste mit
  „Bot“ als Statuszeile, und auf der Profilkarte das Abzeichen „🤖 Bot“, „● Bot“ statt des Online-Status, `about` als
  „About“ und den Verlauf aus `banner`. Der Anruf-Knopf fehlt auf der Karte eines Bots.
- Hat der Bot ein Diddy-Profil (Options-Raum), gewinnt dieses; `dev.diddy.bot` füllt nur, was dort fehlt (Banner,
  Akzentfarbe, Text).

## Schnellstart für einen neuen Bot

1. Normale Nachricht senden, `body` bleibt lesbar: `{"msgtype":"m.notice","body":"Hallo","dev.diddy.card":{"v":1,"kind":"note","text":"Hallo","tone":"info","icon":"👋"}}`
2. Etwas, das sich ändert (Fortschritt, Status)? Karte **bearbeiten** (`m.replace`, Karte auch in `m.new_content`)
   statt neue Nachrichten zu senden, und dem Rückfall-Text `* ` voranstellen wie bei jeder Bearbeitung.
3. Knöpfe: `actions` mit `send`-Befehlen, die dein Bot versteht. Die Zeitleiste (`seek`) nur, wenn der Bot
   `<seek> mm:ss` und `+N`/`-N` kann.
4. Bilder: erst per Matrix hochladen (`/_matrix/media/v3/upload`), dann die `mxc://`-Adresse in `thumbnail` setzen.
   Externe Bild-Links zeigt Diddy aus Datenschutzgründen nicht.
5. Befehle anmelden (Abschnitt oben), damit Nutzer sie nicht auswendig lernen müssen, und `dev.diddy.bot` setzen,
   damit Diddy den Bot als Bot zeigt.
6. Prüfe jede Karte mit `parseBotCard` (siehe unten): was Diddy verwirft, siehst du in den Tests von
   `cinny/tests/botCard.test.cjs`.

Für `note` mit Link siehe den Issue-Bot ([Lndr2501/issuebotmatrix](https://github.com/Lndr2501/issuebotmatrix), `issuebot/cards.py`).
Als Vorlage dient der Musikbot (`musikbot/cards.py`: Bausteine `track_card`, `queue_card`, `list_card`, `stats_card`,
`note_card`, `help_card`, `commands_content`; Bearbeitung `edit_content`).

## Verschlüsselte Räume

Bearbeitungen funktionieren auch dort. Der Bot muss `m.relates_to` wie gewohnt senden (nio kopiert es unverschlüsselt
mit). Diddy zeichnet die Karte nach dem Entschlüsseln der Bearbeitung neu (`RoomTimeline.tsx`, `useLiveEventArrive`).

## Sicherheit

Die Daten sind fremde Eingaben. Diddy (`cinny/src/app/plugins/botCard.ts`) lässt nur bekannte Arten zu, kürzt Texte,
verlangt endliche Zahlen, nimmt Bilder nur als `mxc://` und Links nur als http/https, und zeigt alles als Text
(kein HTML). Getestet in `cinny/tests/botCard.test.cjs` und `cinny/tests/botProfile.test.cjs` (`dev.diddy.bot`); das Aussehen in allen Themes in
`cinny/tests/preview/bot-card.spec.cjs` (`npm run test:tiles`).
