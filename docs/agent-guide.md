# Agent-Anleitung: testen, bauen, DMG

Zugangsdaten stehen hier nie. Mac-Adresse und Keychain-Passwort liegen beim Nutzer (Handover-Datei, nicht im Repo).
Im Text steht `$MAC` für `lndr@<IP des Macs>`; SSH-Optionen: `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`.

## 1. Schnelltest (überall, ~1 Minute)

```sh
cd cinny
npm install
npx tsc --noEmit      # muss leer sein
npm test              # alle Tests grün (197 Stand 2026-11-08)
```

## 2. Stand auf den Mac bringen

```sh
rsync -az --exclude .git --exclude node_modules --exclude target --exclude dist \
  --exclude .claude --exclude test-results ./ $MAC:diddy-build/        # nie --delete
ssh $MAC 'export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; cd ~/diddy-build/cinny && npm install --no-audit --no-fund'
```

Auf dem Mac liegt der Build-Ordner `~/diddy-build`. Ist `$MAC` nicht erreichbar, hat sich die IP geändert
(WireGuard-Adresse vs. normales LAN): den Nutzer nach der aktuellen IP fragen, nicht das Netz scannen.

## 3. macOS-UI-Tests (Playwright WebKit)

Sie laufen gegen den Web-Build mit gefälschter Tauri-Brücke und einen lokalen Synapse-Testserver.

Einmalig auf dem Mac (Docker Desktop, Synapse):
1. Container `diddy-synapse-test` aus `matrixdotorg/synapse`, Servername `localhost`, Port `127.0.0.1:8008`,
   `--restart unless-stopped`, Daten in `~/diddy-testserver/data`.
2. Testkonten anlegen (`register_new_matrix_user` im Container) und in `~/diddy-testserver/accounts.txt`
   eintragen, je Zeile `benutzer passwort` (Konten: `testa`, `testb`, `shota`, `shotb`).
3. Prüfen: `curl http://127.0.0.1:8008/health` gibt `200`.
4. In SSH-Sitzungen scheitert Docker oft am Keychain-Credential-Helper. Workaround:
   `DOCKER_CONFIG=$HOME/.docker-nocreds` und `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock`. Docker-Pfad: `/usr/local/bin/docker` oder `/Applications/Docker.app/Contents/Resources/bin`.

Jeder Lauf:
```sh
ssh $MAC 'export PATH=/opt/homebrew/bin:$PATH; cd ~/diddy-build/cinny \
  && cp ../config.json . && npm run build && npm run test:ui:mac'
```
- Ohne `cp ../config.json .` brechen 8 Tests mit "hashRouter disabled" ab.
- `chat.spec.cjs` ist selten flaky (einmal 25 s Timeout, danach 3 von 3 grün): erst einzeln wiederholen
  (`npx playwright test -c playwright.mac.config.cjs chat`).
- Bei Fehlern liegen Bilder unter `cinny/test-results/ui-mac/<test>/test-failed-1.png`. Mit `scp` holen und ansehen.
- Detektor-Tests prüfen, dass sich Buttons nicht überlappen; neue Seiten in `settings.spec.cjs` ergänzen.

## 4. README-Screenshots erneuern

```sh
ssh $MAC 'export PATH=/opt/homebrew/bin:$PATH; cd ~/diddy-build/cinny && npm run shots'   # ~1 Minute
scp $MAC:diddy-build/docs/screenshots/\*.png docs/screenshots/
python3 cinny/tests/screenshots/montage.py     # baut themes.png (braucht Pillow), lokal
```
Dann `docs/screenshots` committen. Neues Theme: in `THEMES` in `cinny/tests/screenshots/shots.spec.cjs`
und `montage.py` eintragen.

## 5. App bauen, signieren, DMG

```sh
rsync ...   # wie oben
ssh $MAC 'cd ~/diddy-build && nohup nice -n 19 env CARGO_BUILD_JOBS=2 NODE_OPTIONS=--max_old_space_size=4096 \
  npm run tauri -- build --bundles app --config "{\"bundle\":{\"createUpdaterArtifacts\":false}}" > build.log 2>&1 &'
# warten: until ! ssh $MAC 'pgrep -f "npm run tauri"'; do sleep 30; done   (dauert ~10-20 Minuten)
```
Signieren (Keychain `cinny-dev` mit Identität "Diddy Signing"; Passwort steht in der Handover-Datei des Nutzers):
```sh
security unlock-keychain -p "<Passwort>" ~/Library/Keychains/cinny-dev.keychain-db
codesign --force --deep --keychain ~/Library/Keychains/cinny-dev.keychain-db -s "Diddy Signing" <Diddy.app>
```
DMG: `.app` nach `~/dmg-stage` kopieren (zusammen mit Link auf `/Applications`), dann
`hdiutil create -volname Diddy -srcfolder ~/dmg-stage -ov -format UDZO ~/diddy-app-backups/Diddy-<version>-test-<zeitstempel>.dmg`.
`shasum -a 256` an den Nutzer melden. Öffnen nur auf Bitte: `hdiutil attach`, vorher laufende Diddy-App beenden lassen.
Die App wird nach dem Signieren nicht mehr verändert; installiert wird sie nicht ungefragt.

Logs der laufenden App: `~/Library/Logs/Diddy/app.log` (z. B. `noise suppression on (RNNoise)`).

## 6. Linux / Electron

`cd electron && npm test`. Systemaudio-Tests (`native-audio.py`) brauchen PulseAudio/PipeWire. CI: `docs/ci.md`.

## 7. Nach der Arbeit

1. `git status`: nur beabsichtigte Dateien. 2. `git pull --rebase --autostash`. 3. `git push`.
4. Dem Nutzer in 3 Zeilen melden: was geändert ist, wie er es prüft, was offen ist.
