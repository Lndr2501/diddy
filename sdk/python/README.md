# diddybot: Matrix-Bots in wenigen Zeilen, perfekt in Diddy

`diddybot` ist eine Python-Library für Matrix-Bots. Ein Bot läuft in jedem Matrix-Client (Element usw.
sehen normalen Text), in Diddy bekommt er alles, was Diddy für Bots kann:

- **Karten** statt Textwände: Hinweis-Chips, Listen, Balkendiagramme, Hilfe, Warteschlange, Player mit
  Cover, Zeitleiste und Lautstärkeregler ([Protokoll](../../docs/bot-cards.md)).
- **Knöpfe**, die Befehle senden. Diddy blendet diese Befehle im Chat aus, die Karte ändert sich stattdessen.
- **Befehlsvorschläge beim Tippen** (`dev.diddy.commands`) und eine fertige `!help`-Karte.
- **Bot-Profil**: BOT-Abzeichen, eigene Gruppe in der Mitgliederliste, Banner und Text auf der Profilkarte
  (`dev.diddy.bot`).

Dazu das, was jeder Bot braucht und meistens falsch macht: Ende-zu-Ende-Verschlüsselung, Login mit gespeichertem
Token, Einladungen annehmen, Direktnachrichten, keine Antworten auf alte Nachrichten oder andere Bots.

```python
from diddybot import Bot, cards

bot = Bot.from_env(about="Sagt Hallo.", banner=("#ff6fa5", "#7a5cff"))

@bot.command("hallo", desc="begrüßt dich")
async def hallo(ctx, name: str = ""):
    await ctx.reply(cards.note(f"Hallo {name or ctx.sender_name}!", icon="👋"))

bot.run()
```

## Schnellstart (5 Minuten)

1. Installieren (Python 3.10 oder neuer):
   ```sh
   pip install "git+https://github.com/Lndr2501/diddy.git#subdirectory=sdk/python"
   ```
2. Projekt anlegen: `diddybot new meinbot`, dann `cd meinbot`.
3. Ein Matrix-Konto für den Bot anlegen (wie ein normales Konto) und `.env.example` nach `.env` kopieren:
   ```sh
   DIDDY_BOT_HOMESERVER=https://matrix.example.org
   DIDDY_BOT_USER=@meinbot:example.org
   DIDDY_BOT_PASSWORD=...
   ```
4. `python bot.py` starten und den Bot in einen Raum einladen. Er tritt selbst bei.
5. Im Raum `!help` tippen.
6. Für das BOT-Abzeichen und die Befehlsvorschläge den Bot im Raum zum **Moderator** machen (Zustandsereignisse
   brauchen Stufe 50). Ohne das funktioniert der Bot trotzdem, Diddy zeigt dann nur keine Vorschläge.

`pytest` im Projektordner testet den Bot ohne Server (siehe [Testen](#testen)).

## Befehle

```python
@bot.command("timer", desc="Countdown", group="Werkzeuge", aliases=("t",))
async def timer(ctx, sekunden: int, name: str = "Timer"):
    ...
```

- Die Parameter nach `ctx` sind die Argumente, umgewandelt nach Typ (`int`, `float`, `bool`, `str` oder eine
  eigene Funktion). `!timer 30 Pizza im Ofen` gibt `sekunden=30, name="Pizza im Ofen"`: der **letzte**
  `str`-Parameter nimmt den Rest der Zeile. `"In Anführungszeichen"` zählt als ein Wort.
- Ein Parameter nach `*` nimmt immer den Rest (`async def say(ctx, *, text: str)`), `*worte: str` sammelt alle
  übrigen Wörter einzeln. `bool` versteht `an/aus`, `on/off`, `ja/nein`, `1/0`.
- Fehlt ein Argument oder passt es nicht, antwortet der Bot mit der Gebrauchszeile (`!timer <sekunden> [name]`,
  aus der Signatur erzeugt). Selbst auslösen: `raise UsageError("höchstens 60 Sekunden")` oder `await ctx.usage()`.
- Optionen: `desc` (Text in Hilfe und Vorschlägen, sonst die erste Zeile des Docstrings), `usage` (eigene
  Gebrauchszeile), `group` (Abschnitt der Hilfe-Karte), `aliases`, `power=50` (nur Moderatoren), `hidden=True`
  (nicht in Hilfe und Vorschlägen, z. B. für Knopf-Befehle), `dm_only=True`.
- Groß-/Kleinschreibung egal. Der Präfix ist `!` (änderbar: `Bot(prefix=".")`; Diddy schlägt nur bei
  Satzzeichen-Präfixen vor, nie bei Buchstaben oder `/`).
- Eine Ausnahme in deinem Befehl landet im Log, der Nutzer bekommt eine kurze Fehlerkarte (`error_text=`).
- `!help` (und `!hilfe`) kommt mit. Eigene Hilfe: einfach selbst `@bot.command("help")` definieren.

`ctx` hat: `sender`, `sender_name`, `room_id`, `room_name`, `body`, `arg` (Text nach dem Befehl), `args` (Wörter),
`power` (Stufe des Absenders), `is_dm`, `from_button` (kam von einem Diddy-Knopf), `event_id`, `content`.

## Antworten

| Aufruf | Was passiert |
|---|---|
| `await ctx.reply("Text")` | `m.notice` im Raum. `html=` für formatierten Text, `quote=True` als Antwort zitiert, `notice=False` als `m.text` |
| `await ctx.reply(cards.note(...))` | eine Karte, `body` (Rückfall-Text) baut die Library selbst |
| `await ctx.show(karte)` | **eine** Karte, die stehen bleibt: der erste Aufruf sendet, jeder weitere mit demselben `key` bearbeitet sie |
| `await ctx.react("👍")` | Reaktion auf die Nachricht |
| `await ctx.dm("psst")` | Direktnachricht (verschlüsselt, nutzt einen bestehenden Privatchat aus `m.direct`) |
| `msg = await bot.send(room_id, ...)` | senden ohne Befehl (z. B. aus `@bot.every`) |
| `await msg.update(...)` / `msg.delete()` | Nachricht bearbeiten / löschen |

Bots antworten mit `m.notice`. Darum reagiert ein `diddybot` nie auf `m.notice`: zwei Bots können sich nicht
gegenseitig endlos antworten. Bearbeitungen alter Nachrichten und Nachrichten von vor dem Start (Standard: älter
als 60 s, `ignore_older_than=`) lösen keine Befehle aus.

## Karten

Alle Bausteine liegen in `diddybot.cards` und prüfen ihre Eingaben sofort (`ValueError` bei falscher Farbe, einem
Knopf ohne `!` usw.).

| Baustein | Diddy zeigt |
|---|---|
| `cards.note(text, tone="info", icon="", url="", link_label="")` | Hinweis-Chip; `tone`: `info`, `success`, `warning`, `error`; `url` als Link-Knopf |
| `cards.listing(titel, items, empty="", buttons=[])` | Liste; Einträge als Text oder `cards.item(titel, untertitel, dauer)` |
| `cards.stats(titel, [cards.chart(titel, [("alice", 42), cards.bar("bob", 7, "sub")], unit="")])` | Balkendiagramme |
| `cards.help([cards.help_group("Titel", ("!a", "macht a"))], note="")` | gegliederte Hilfe |
| `cards.queue([cards.song(titel, künstler, dauer)], now=cards.song(...))` | Warteschlange |
| `cards.track(state, titel, duration=, position=, seek="!seek", ...)` | Fortschritt mit Balken, auf Wunsch als Player |

**Knöpfe** (`buttons=`, höchstens 10): `("⏸ Pause", "!pause")` oder `cards.button(...)`. Ein Klick sendet den
Befehl als Nachricht des Nutzers; dein Bot behandelt ihn wie getippt (Rechte inklusive), `ctx.from_button` ist
`True`. Diddy blendet solche Klick-Nachrichten im Chat aus.

**Fortschritt**: `cards.track("playing", "Build #42", duration=300, position=0)` zeichnet einen Balken, der in Diddy
von selbst läuft (`startedAt` setzt die Library). Bearbeite die Karte nur, wenn sich etwas ändert
(`paused`, `stopped`, `error`), nicht jede Sekunde. `seek="!seek"` macht die Zeitleiste anklickbar: Diddy sendet
`!seek 1:23`, `!seek +10` oder `!seek -10`. Zustände: `searching`, `downloading`, `playing`, `paused`, `stopped`, `error`.

**Player**: `controls=cards.player(prev="!prev", toggle="!pause", skip="!skip", volume="!volume", dashboard="")`
zeichnet den Player (Cover, Titel, „requested by“, Knopfreihe, Lautstärkeregler, „Up next“). `toggle` ist `!pause`
während `playing`, sonst `!resume`. Der Regler sendet `!volume 80` (Obergrenze `volume_max=`). `more=[...]`
(bis 16) füllt das Menü „⋯“, `up_next=[cards.song(...)]` (bis 3), `room=`, `requested_by=`. Schick `buttons` mit,
ältere Diddy-Versionen zeigen diese statt des Players. Ein vollständiges Beispiel ist `examples/player.py`.

**Bilder**: `thumbnail` nimmt nur `mxc://` (Diddy lädt aus Datenschutzgründen keine fremden Bild-Links):
`uri = await bot.upload("cover.jpg")`.

**Prüfen**: `karte.problems()` (oder `cards.check(content)`) listet, was Diddy kürzen oder verwerfen würde.
Beim Senden schreibt der Bot solche Punkte als Warnung ins Log, mit `Bot(strict=True)` wird daraus ein Fehler.
`diddybot check karte.json` prüft eine Karte aus einer Datei. Die Prüfung ist eine Kopie von Diddys eigenem
Parser, ein Test vergleicht sie mit dem Original (siehe [Entwicklung](#entwicklung)).

### Live-Karten

```python
@bot.command("count")
async def count(ctx, n: int = 0):
    await ctx.show(cards.listing(f"Zähler: {n}", [], empty="Drück einen Knopf",
                                 buttons=[("➖", f"!count {n - 1}"), ("➕", f"!count {n + 1}")]))
```

`ctx.show` merkt sich die Karte pro Raum unter `key` (Standard: Name des Befehls). Ein Knopf, der wieder `!count`
schickt, bearbeitet also dieselbe Karte. `new=True` beginnt eine neue, `bot.live(room_id, key)` holt die Nachricht,
`bot.forget(room_id, key)` vergisst sie. Bearbeitungen innerhalb von `edit_interval` (Standard 1 s) werden
zusammengefasst, nur die neueste geht raus. Bearbeitet wird mit `m.replace`, die Karte steht wie verlangt auch in
`m.new_content`, auch in verschlüsselten Räumen.

## Ereignisse

```python
@bot.on_message                 # jede Textnachricht, die kein Befehl ist
async def echo(ctx): ...

@bot.on_reaction                # ctx.reaction = "👍", ctx.target = Event-ID der Nachricht
async def vote(ctx): ...

@bot.on_join                    # der Bot ist einem Raum beigetreten
async def hello(bot, room_id): ...

@bot.on_member_join             # jemand anderes ist beigetreten
async def welcome(bot, room_id, user_id): ...

@bot.on_start                   # eingeloggt und synchronisiert
async def ready(bot): ...

@bot.every(3600)                # stündlich, solange der Bot läuft
async def report(bot): ...
```

Alle Handler laufen als eigene Tasks: ein langsamer Befehl hält den Sync und andere Befehle nicht auf.

## Testen

```python
from diddybot.testing import TestClient
from bot import bot

async def test_count():
    chat = TestClient(bot)
    [karte] = await chat.say("!count 1")
    assert await chat.press(karte, "➕") == []      # keine neue Nachricht: die Karte wurde bearbeitet
    assert karte.card["title"] == "Zähler: 2"
```

- `say(text, user=...)` gibt die neuen Nachrichten des Bots zurück. `karte.card` ist die Karte **so, wie Diddy sie
  liest**, nach allen Bearbeitungen; `karte.body` der Rückfall-Text.
- `press(karte, "Label")` klickt einen Knopf (auch Player-Knöpfe: `"toggle"`, `"skip"`, `"volume"` mit `arg="80"`),
  `seek(karte, 83)` die Zeitleiste, `react(karte, "👍")` reagiert.
- `join(user, power=50)`, `set_power(...)`, `start()` (Bekanntmachung), dann `commands()` und `profile()`: was Diddy
  als Vorschläge und Profil zeigt.
- Der TestClient läuft **strikt**: eine Karte, die Diddy kürzen würde, ist ein Fehler. Grüne Tests heißen also:
  Diddy zeigt genau, was du geschickt hast.

`pytest-asyncio` mit `asyncio_mode = auto` (steht im Projekt von `diddybot new` schon drin).

## Einstellungen

`Bot.from_env()` liest die Umgebung und eine `.env`-Datei; Argumente gewinnen. `Bot(...)` geht auch direkt.

| Umgebung / Argument | Bedeutung |
|---|---|
| `DIDDY_BOT_HOMESERVER` / `homeserver` | z. B. `https://matrix.example.org` |
| `DIDDY_BOT_USER` / `user_id` | `@bot:example.org` |
| `DIDDY_BOT_PASSWORD` / `password` | nur für den ersten Login, danach gilt der gespeicherte Token |
| `DIDDY_BOT_TOKEN` / `access_token` | statt Passwort |
| `DIDDY_BOT_STORE` / `store_path` | Ordner für Token und E2EE-Schlüssel, Standard `./store` |
| `DIDDY_BOT_PREFIX` / `prefix` | Standard `!` |
| `display_name`, `avatar` (Bilddatei) | Profil des Kontos, wird beim Start gesetzt, wenn es sich geändert hat |
| `about`, `banner=("#von", "#bis"[, winkel])`, `accent` | Bot-Profil in Diddy |
| `encryption`, `auto_join`, `announce`, `help_command`, `help_note` | Standard alles an |
| `strict`, `edit_interval`, `ignore_older_than`, `error_text` | siehe oben |

Für alles andere: `bot.client` ist der `nio.AsyncClient` darunter ([matrix-nio](https://matrix-nio.readthedocs.io/)).

## Betrieb

- **Der `store`-Ordner ist das Gedächtnis des Bots** (Token, Geräte-ID, Schlüssel). Behalten (Docker: Volume)
  und nie kopieren, solange der Bot läuft. Zwei Instanzen mit demselben Konto bedeuten doppelte Antworten und
  nicht entschlüsselbare Nachrichten.
- Verschlüsselte Räume funktionieren ohne Zutun. Der Bot vertraut allen Geräten im Raum (kein Verifizieren);
  kann er eine Nachricht nicht entschlüsseln, fragt er den Absender nach dem Schlüssel.
- Docker:
  ```dockerfile
  FROM python:3.12-slim
  WORKDIR /app
  COPY . .
  RUN pip install --no-cache-dir -r requirements.txt
  VOLUME ["/app/store"]
  CMD ["python", "bot.py"]
  ```

## Beispiele

| Datei | Zeigt |
|---|---|
| [`examples/hello.py`](examples/hello.py) | kleinster Bot: Befehle mit Argumenten, Hinweis-Karten |
| [`examples/poll.py`](examples/poll.py) | Umfrage mit Knöpfen, Balken aktualisieren sich bei jeder Stimme |
| [`examples/timer.py`](examples/timer.py) | Countdown mit selbst laufendem Balken, Pause, Spulen auf der Zeitleiste |
| [`examples/player.py`](examples/player.py) | der Diddy-Player mit allem: Steuerung, Regler, Menü, Up next, Warteschlange |

## Entwicklung

```sh
cd sdk/python
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest                                              # Unit-, Paritäts- und Beispieltests
DIDDY_TEST_HOMESERVER=http://127.0.0.1:8008 .venv/bin/pytest  # dazu Ende-zu-Ende mit echtem Server
```

- `diddybot/protocol.py` ist eine Zeile-für-Zeile-Kopie von Diddys Parsern (`cinny/src/app/plugins/botCard.ts`,
  `botCommands.ts`, `botProfile.ts`), bis hin zu UTF-16-Längen und JavaScripts Leerzeichen-Regeln.
  `tests/test_parity.py` lässt die TypeScript-Originale (Node ≥ 22.6) auf dieselben Grenzfälle und 2400 Zufallsfälle
  los. **Wer das Protokoll in Diddy ändert, ändert `protocol.py` mit**; die CI (`Bot SDK`) fällt sonst durch.
- `tests/test_integration.py` startet den Bot gegen einen echten Homeserver in einem verschlüsselten Raum: Beitritt,
  Profil und Befehlsliste, Karte, Knopf mit Bearbeitung, Direktnachricht, Neustart mit gespeichertem Token. Einen
  lokalen Synapse beschreibt `.github/workflows/bot-sdk.yml`.
- Neue Kartenfelder: erst in Diddy (`botCard.ts`, `docs/bot-cards.md`), dann hier in `protocol.py` und `cards.py`.
