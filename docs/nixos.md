# Diddy auf NixOS

Diddy lässt sich als natives Nix-Paket bauen und starten. Unterstützte Ziele:
`x86_64-linux` und `aarch64-linux` (jeweils nativ bauen, kein Cross-Compile).
Die Flake enthält den aktuellen lokalen Quellstand, nicht das alte Release-Paket.

Unter Linux läuft Diddy in **Electron (Chromium)**, auf macOS weiter in Tauri. Oberfläche
und Funktionen sind dieselben, nur die Web-Engine unterscheidet sich. Warum, steht unter
[Warum Electron unter Linux](#warum-electron-unter-linux).

## Lokal bauen und starten

Voraussetzung: Nix mit aktivierten Flakes. Falls noch nicht gesetzt:

```nix
# /etc/nixos/configuration.nix
nix.settings.experimental-features = [ "nix-command" "flakes" ];
```

Im Diddy-Checkout:

```sh
nix build .#diddy
./result/bin/diddy
# Alternativ, ohne result-Link:
nix run .#diddy
```

Gebaut wird nur das Frontend (wenige Minuten). Electron kommt fertig aus
`cache.nixos.org`, Rust und WebKitGTK werden für Linux nicht mehr gebraucht.

Bei einer Git-Flake müssen neue Flake-/Nix-Dateien von Git erfasst sein, bevor
Nix sie sieht. Nicht `git add .` verwenden: Lokale Übergaben können private Daten
enthalten. Nur die zugehörigen Dateien gezielt aufnehmen.

Für eine dauerhafte Installation im Benutzerprofil:

```sh
nix profile install .#diddy
```

Das Paket enthält einen Menüeintrag und Icons. Diddy belegt den lokalen Port `44548`
(nur `127.0.0.1`, keine Firewall-Freigabe nötig).

### Umstieg von der WebKitGTK-Version

- **Einmal neu anmelden:** Logins und Schlüssel der früheren WebKitGTK-Version liegen in
  deren eigenem Speicher, den Chromium nicht lesen kann. Diddy startet deshalb mit der
  Anmeldeseite. Danach das neue Gerät verifizieren (z. B. mit einem anderen Gerät oder dem
  Wiederherstellungsschlüssel), damit der alte Verlauf lesbar wird.
- Gespeicherte Verbindungen (`~/.config/app.diddy.desktop/connections.json`), das gewählte
  App-Icon und das Log (`~/.local/state/diddy/app.log`) bleiben an ihrem Ort.
- Browserdaten liegen jetzt in `~/.local/share/app.diddy.desktop/electron`.
- Die alte Variante `diddy-webrtc` gibt es nicht mehr. `diddy` kann alles.

## In die NixOS-System-Flake einbinden

Für den **aktuellen lokalen Stand** den Checkout als Input verwenden (Pfad anpassen):

```nix
{
  inputs.diddy.url = "path:/home/DEINNAME/src/diddy";

  outputs = { nixpkgs, diddy, ... }: {
    nixosConfigurations.DEINRECHNER = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux"; # oder aarch64-linux
      modules = [
        ./configuration.nix
        ({ pkgs, ... }: {
          environment.systemPackages = [ diddy.packages.${pkgs.stdenv.hostPlatform.system}.diddy ];
        })
      ];
    };
  };
}
```

Das Beispiel ergänzt eine bestehende System-Flake; deren `nixpkgs`-Input bleibt
bestehen. Diddys eigenes, gelocktes nixpkgs nicht mit `follows` ersetzen, wenn der
getestete Abhängigkeitsstand erhalten bleiben soll.

**Achtung:** Ein `path:`-Input kann den ganzen angegebenen Ordner in den Nix-Store
kopieren, auch unversionierte private Dateien. Dafür einen sauberen Checkout ohne
Zugangsdaten/Übergaben verwenden, niemals ungeprüft `/root/diddy` als System-Input.
Der eigentliche Paket-Quellfilter nimmt nur die Anwendungsquellen auf.

Nach einem ausdrücklich gewünschten Push kann stattdessen der private
Git-Input genutzt werden:

```nix
inputs.diddy.url = "git+ssh://git@github.com/Lndr2501/diddy?ref=main";
```

Dieser benötigt einen bereits eingerichteten SSH-Zugang und enthält nur den
gepushten Stand. Keine Tokens in Flake-URLs schreiben. Installation über die
System-Flake: `sudo nixos-rebuild switch --flake /PFAD/ZUR/SYSTEM-FLAKE#DEINRECHNER`.
Home Manager kann entsprechend `home.packages = [ diddy.packages.${pkgs.stdenv.hostPlatform.system}.diddy ];`
verwenden.

## Entwicklung und Prüfung

```sh
nix develop
(cd cinny && npm ci && npm run build)
DIDDY_FRONTEND_DIR=cinny/dist electron electron
```

Mit Hot Reload: in einem Terminal `cd cinny && npm start` (Vite auf Port 8080), im
zweiten `DIDDY_DEV_URL=http://localhost:8080 electron electron`.

Die Shell besteht aus `electron/main.cjs` (Fenster, lokaler Server, Befehle der Seite),
`electron/preload.cjs` (dieselbe kleine API wie bei Tauri: `__TAURI_INTERNALS__.invoke`)
und Hilfsmodulen in `electron/lib/`, die ohne Electron getestet werden:

```sh
(cd electron && npm test)   # Log, Verbindungen, MyInstants, lokaler Server, Fenster
(cd cinny && npm test)
nix flake check --no-build  # Flake/Paketdefinitionen auswerten
nix build .#diddy           # Paket bauen, Frontend- und Shell-Tests laufen mit
nix fmt
```

Die GitHub-Action `Nix` baut das Paket samt Tests bei Pull Requests mit Änderungen am
Paket/Quellcode. Die Action `Test` führt zusätzlich die Shell-Tests aus.

## Calls, Audio und Bildschirmfreigabe

- Sprach- und Videoanrufe laufen über Element Call in Chromiums libwebrtc, inklusive
  **Ende-zu-Ende-Verschlüsselung** (DMs und verschlüsselte Räume).
- Mikrofon, Kamera, Bildschirmfreigabe und Benachrichtigungen erlaubt Diddy nur seinen
  eigenen Seiten (`http://localhost:44548`, auch Element Call); alles andere wird abgelehnt.
- Bildschirmfreigabe läuft unter Wayland über das Desktop-Portal (PipeWire):
  `services.pipewire.enable = true;` und `xdg.portal.enable = true;` mit dem passenden
  Portal-Backend (GNOME: `xdg-desktop-portal-gnome`, KDE: `xdg-desktop-portal-kde`,
  wlroots: `xdg-desktop-portal-wlr`). Unter X11 wird der erste Bildschirm geteilt.
- **EasyEffects:** Ist dort „Alle Eingabe-Streams verarbeiten“ aktiv, landet jede
  Aufnahme auf „Easy Effects Source“. Wählt man in Diddy das echte Mikrofon, kommt dann
  nur Stille an; in Diddy „Easy Effects Source“ als Mikrofon wählen.
- Ein global gesetztes `LD_LIBRARY_PATH` mit einer `alsa-lib` aus einem neueren nixpkgs
  (z. B. für JACK) bricht Programme aus älteren nixpkgs (`GLIBC_2.43 not found`). Der
  Diddy-Wrapper stellt deshalb seine eigene `alsa-lib` voran.

## Warum Electron unter Linux

Tauri nutzt die Web-Engine des Systems: auf macOS WKWebView (Safari) mit **libwebrtc**,
unter Linux WebKitGTK mit **GStreamer `webrtcbin`**. Die JavaScript-APIs sind gleich,
der WebRTC-Unterbau nicht. Mit WebKitGTK 2.52.6 (nixpkgs, mit `enableExperimental`)
scheiterte Element Call an mehreren Stellen:

1. Offers ohne `a=group:BUNDLE` (`webrtcbin` behandelt `balanced` wie `none`); der
   LiveKit-SFU (pion) lehnt dann alle Medien-Abschnitte ab → „Something went wrong“
   (`UNKNOWN_ERROR`, `could not establish pc connection`).
2. Deadlock beim Beitritt zwischen dem ICE-Agenten im Network-Process (librice) und
   dem Main-Thread (`addTransceiver`) → Diddy friert ein.
3. Mit einer PeerConnection kopiert WebKitGTK beim Hinzufügen eines
   Empfangs-Transceivers dessen `mid` → „Cannot re-use mid 'audio0'“, kein Ton.
4. `RTCRtpScriptTransform` ist vorhanden, das GStreamer-Backend dahinter aber ein Stub
   (`notImplemented()`, auch im neuesten Release 2.54.2): Kein Frame erreicht die
   Verschlüsselung. **Verschlüsselte Calls sind mit WebKitGTK unmöglich**; Diddy würde
   unverschlüsselt senden und die Frames der anderen als Knistern abspielen.

1 bis 3 ließen sich per JavaScript umgehen, 4 nicht. Chromium bringt libwebrtc mit wie
Safari, die Calls verhalten sich dort wie in Chrome und Element Desktop.

## Verifikationsstand (2026-11-07, NixOS x86_64, KDE Wayland, LiveKit 1.13.11)

- Paket gebaut (`nix build .#diddy`): Frontend-Tests 119/119, Shell-Tests 13/13.
- Start, Login, Sync, Service Worker und Befehle der Seite (`log_path`,
  `connection_profiles`, Fehlertexte wie bei Tauri) in der echten Sitzung geprüft.
- Frame-Transforms lokal: Chromium 150 mit `createEncodedStreams` 200/200 Frames
  verschlüsselt und wieder entschlüsselt; WebKitGTK 2.52.6 0 Frames.
- **Verschlüsselter DM-Call mit einem macOS-Client: verbunden, Schlüsselaustausch nach
  ca. 0,3 s, Ton in beide Richtungen.**
- Nicht geprüft: Bildschirmfreigabe über das Portal, Kamera, getrennte Verbindungsprofile
  (eigene Fenster), ARM64-Laufzeit.
