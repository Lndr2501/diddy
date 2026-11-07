# Vorschaubilder

Die Bilder in diesem Ordner zeigen die echte App (WebKit, wie in der macOS-App) und werden mit
einem Playwright-Lauf erzeugt, nicht von Hand.

| Datei | Inhalt |
|---|---|
| `chat-<theme>.png` | Chat in einem der neun Themes (`light`, `silver`, `dark`, `butter`, `diddy`, `red`, `green`, `purple`, `amber`) |
| `themes.png` | Montage aller neun Themes (aus den `chat-*.png`) |
| `settings-appearance.png`, `settings-profile.png` | Einstellungen im Diddy-Theme |

## Neu erzeugen

Voraussetzung wie bei den UI-Tests (`cinny/tests/ui-mac`): macOS mit Docker, lokaler Synapse-Testserver
auf `http://127.0.0.1:8008` und eine Datei `~/diddy-testserver/accounts.txt` (Zeilen `benutzer passwort`).

```sh
cd cinny
cp ../config.json . && npm run build   # mit der config.json aus dem Repo (hashRouter an)
npx playwright install webkit
RESEED=1 npm run shots                  # RESEED=1 baut die Beispiel-Chats (Mara und Jonas) neu auf
```

Der Lauf legt beim ersten Mal die Wegwerf-Konten `shota` (Mara) und `shotb` (Jonas) mit drei Räumen an
(`cinny/tests/screenshots/seed.cjs`). Danach `python3 cinny/tests/screenshots/montage.py` (Pillow): setzt `themes.png` aus den `chat-*.png`
zusammen (3×3, je 640×400) und verkleinert die Einzelbilder auf 1280×800 (`chat-diddy.png` bleibt groß).
