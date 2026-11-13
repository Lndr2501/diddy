# AGENTS.md: Diddy für Agenten

Diddy ist ein Matrix-Client: Tauri 2 (macOS) + Cinny-Fork in `cinny/` (React/TypeScript, vanilla-extract,
folds, jotai). Dazu `electron/` (Linux) und `ios/` (Swift). Repo: Lndr2501/diddy. Anrede im Chat: duzen.

## Erst lesen

1. Dieser Text, dann `docs/agent-guide.md` (Tests, Mac-Build, DMG, Testserver Schritt für Schritt).
2. `docs/plugins.md` (Plugin-System), `docs/ci.md`, `CHANGELOG.md`.

## Befehle (im Ordner `cinny/`)

| Zweck | Befehl |
|---|---|
| Typecheck | `npx tsc --noEmit` |
| Unit-Tests (schnell, überall) | `npm test` (Node-Testrunner, `tests/*.test.cjs`) |
| Web-Build | `cp ../config.json . && npm run build` |
| macOS-UI-Tests (WebKit) | `npm run test:ui:mac`, nur auf dem Mac, siehe Guide |
| README-Screenshots | `npm run shots` (Mac oder Linux mit `DIDDY_SHOTS_CHROME`), nur Beispieldaten, siehe `docs/screenshots/README.md` |
| Linux/Electron-Tests | `cd electron && npm test` |
| Tests wie im Nix-Build (nur `cinny/` bzw. `electron/`) | `node .github/scripts/nix-tree-tests.cjs` (im Repo-Root) |

Vor jedem Commit: `tsc` und `npm test` grün. Tests, die Dateien außerhalb von `cinny/` lesen, müssen sich überspringen, wenn die Datei fehlt (Nix-Build kopiert nur `cinny/`). Neue Logik bekommt einen Test in `cinny/tests/`.
ESLint hat viele Altlasten; neue Dateien trotzdem sauber halten (`npx eslint <datei>`).

## Regeln

- Nach jeder Änderung committen und pushen (vom Nutzer dauerhaft erlaubt). Vorher `git pull --rebase --autostash`.
  Kein Force-Push. Andere Sitzungen und Mitwirkende (Linux/iOS) pushen parallel in `main`.
- Commit-Nachrichten englisch, kurz, Imperativ. Agenten-Attribution am Ende, wenn die Umgebung eine vorgibt.
- Niemals committen: `HANDOVER.md`, `AGENT-HANDOFF.md`, `LETZTE-SITZUNG.md` (enthalten Zugangsdaten), `test-results/`,
  Passwörter, Schlüssel, Keychain-Inhalte.
- Signierte `.app` nie nachträglich verändern. Laufende Diddy-App des Nutzers nicht beenden oder ersetzen, ohne zu fragen.
- Release, Tag, Issue schließen, Kommentare auf GitHub nur auf ausdrückliche Bitte.
- Jede neue Funktion und jeder Fix gilt für alle Plattformen: macOS (Tauri), Linux (Electron) und iOS (Swift in `ios/`).
  Die Web-Oberfläche in `cinny/` deckt macOS und Linux ab; iOS ist eigener Swift-Code und muss im selben Zug mitgebaut
  werden. Geht das nicht (z. B. kein Xcode erreichbar, API fehlt auf einer Plattform), im Commit und im Issue/PR
  ausdrücklich nennen, welche Plattform fehlt und warum. Plattform-Labels auf GitHub: iOS, Linux, macOS.
- iOS bauen: auf dem Mac (`xcodebuild`, siehe `ios/README.md`) oder in der CI (`Build iOS`, läuft bei Pull Requests).
  Ohne Mac-Zugang iOS-Änderungen über einen PR prüfen lassen, nicht ungebaut nach `main` pushen.
- Build auf dem Mac immer mit `nice -n 19`, `CARGO_BUILD_JOBS=2`, `NODE_OPTIONS=--max_old_space_size=4096`.
- Dateien zum Mac mit `rsync` ohne `--delete`.

## Wichtige Ordner (unter `cinny/src/app/`)

- `plugins/call/`: Call-Logik (Audio, Rauschfilter `noiseSuppression.ts`, Soundboard, Ping `streamStats.ts`).
- `plugins/sounds.ts`: alle App-Sounds (Web Audio, pro Sound an/aus, eigene Datei ersetzt). Dateien in `public/sound/diddy/`,
  alle eigen und in SoundCraft gebaut (Steuerung: Marimba, sonst Sinus plus Oktave). iOS spielt dieselben MP3s.
- `plugins/userPlugins.ts`, `plugins/builtin/*.html`, `features/plugins/`: Plugin-System und Standard-Plugins.
- `state/`: jotai-/Store-Zustand (`avatarPrefs`, `callPrefs`, `pluginDock` ...).
- `features/call/`, `components/call-panel/`: Call-Oberfläche. `features/settings/`: Einstellungen.
- `src-tauri/`: Rust-Teil (macOS), `capabilities/` regelt Rechte.

## Stolpersteine

- Der Call (Element Call) läuft als gleichherkunfts-iframe; Einstellungen dort sind `matrix-setting-*` in `localStorage`.
- RNNoise braucht 48 kHz. Der Rauschfilter fällt sonst still aus (Log: `noise suppression`).
- Plugins laufen in `iframe sandbox="allow-scripts"` (opake Herkunft). Nie `allow-same-origin` hinzufügen.
- UI-Tests brauchen `config.json` aus dem Repo (hashRouter an). Sonst scheitern 8 Tests mit "hashRouter disabled".
- Playwright-WebKit läuft nicht im Linux-Container (fehlende Systembibliotheken): UI-Tests laufen auf dem Mac.
