# Diddy auf NixOS

Diddy lässt sich als natives Nix-Paket bauen und starten. Unterstützte Ziele:
`x86_64-linux` und `aarch64-linux` (jeweils nativ bauen, kein Cross-Compile).
Die Flake enthält den aktuellen lokalen Quellstand, nicht das alte Release-Paket.
Node 24, Rust, GTK/WebKitGTK, TLS und GStreamer werden durch Nix bereitgestellt.
Es sind weder `nix-ld` noch `appimage-run` oder eine globale Bibliotheksinstallation nötig.

## Lokal bauen und starten

Voraussetzung: Nix mit aktivierten Flakes. Falls noch nicht gesetzt:

```nix
# /etc/nixos/configuration.nix
nix.settings.experimental-features = [ "nix-command" "flakes" ];
```

Im Diddy-Checkout:

```sh
nix build .#diddy --max-jobs 1 --cores 2
./result/bin/diddy
# Alternativ, ohne result-Link:
nix run .#diddy
```

Bei einer Git-Flake müssen neue Flake-/Nix-Dateien von Git erfasst sein, bevor
Nix sie sieht. Nicht `git add .` verwenden: Lokale Übergaben können private Daten
enthalten. Nur die zugehörigen Dateien gezielt aufnehmen.

Für eine dauerhafte Installation im Benutzerprofil:

```sh
nix profile install .#diddy
```

Das Paket enthält einen Menüeintrag und Icons. Die GTK-Wrapper liefern die
benötigten TLS-/GIO-Module, GStreamer-Plugins und `xdg-open` mit. Vorhandene
Diddy-Konten und Einstellungen werden nicht migriert oder gelöscht; die
Anwendungskennung bleibt `app.diddy.desktop`. Im Nix-Store wird nichts verändert.

Der erste Build kann lange dauern und mehrere GB RAM/Plattenplatz benötigen.
Nicht auf einem kleinen Server oder während eines wichtigen Calls bauen.

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
(cd cinny && npm ci)
npm ci
npm run tauri -- dev
```

Die Entwicklungsumgebung enthält Node 24, Cargo/Rust, Tauri und native
Abhängigkeiten. `npm ci` benötigt Netzwerk; der eigentliche Nix-Paketbuild
verwendet dagegen die Integritätswerte aus `cinny/package-lock.json` und die
Prüfsummen aus `src-tauri/Cargo.lock`.

```sh
nix flake check --no-build  # Flake/Paketdefinitionen auswerten
nix flake check --max-jobs 1 --cores 2  # Paket bauen, JS- und Rust-Tests
nix fmt
```

Die separate GitHub-Action `Nix` führt den Build samt Tests auf Linux aus,
bei Pull Requests mit Änderungen am Paket/Quellcode sowie manuell. Ein grafischer
NixOS-Laufzeittest ist damit nicht ersetzt. ARM wird als Paket angeboten, aber
nicht durch den x86_64-CI-Job laufzeitgetestet.

## Wayland, Audio und bekannte Grenzen

- Das native GTK/WebKit-Fenster kann je nach Desktop unter Wayland oder X11 laufen.
  Das Paket erzwingt keinen Backend-Wechsel. Zum Eingrenzen eines Darstellungsfehlers
  kann einmalig `GDK_BACKEND=x11 nix run .#diddy` probiert werden (benötigt XWayland).
- Für Dateiauswahl und Desktop-Integration sollte auf NixOS
  `xdg.portal.enable = true;` mit dem zum Desktop passenden Portal-Backend aktiviert
  sein. Das ist eine System-/Desktop-Einstellung und wird vom Paket nicht überschrieben.
- Normale Medienwiedergabe nutzt die mitgelieferten GStreamer-Plugins. Audio setzt
  zusätzlich einen funktionierenden Audio-Server in der Desktop-Sitzung voraus.
- **Sprach-/Videoanrufe brauchen das Paket `diddy-webrtc`** (siehe unten). Das
  normale Paket `diddy` startet, chattet und spielt Medien ab, kann aber keinen Call
  aufbauen.
- Der lokale Frontend-Port bleibt `44548`. Dafür ist keine Firewall-Freigabe
  nach außen erforderlich.

## Sprach- und Videoanrufe

Element Call (die Calls in Diddy) braucht WebRTC (`RTCPeerConnection`) in der WebView.
nixpkgs baut WebKitGTK ohne WebRTC: Es gehört dort zu den experimentellen Funktionen
(`enableExperimental`). Im normalen Paket fehlt `RTCPeerConnection` deshalb, und ein
Call kann nicht verbinden. Diddy selbst schaltet unter Linux Mikrofon, Kamera,
Bildschirmfreigabe und WebRTC in der WebView ein und erlaubt die Geräte-Anfragen.

Für Calls gibt es die Paketvariante `diddy-webrtc`. Sie nutzt WebKitGTK mit dessen
experimentellen Funktionen, darunter WebRTC über GStreamer:

```sh
nix run .#diddy-webrtc
```

- Dieses WebKitGTK liegt derzeit fertig im offiziellen Binär-Cache (`cache.nixos.org`,
  x86_64 und ARM64), es wird nur heruntergeladen. Fehlt es nach einem nixpkgs-Update
  einmal im Cache, baut Nix es selbst: das dauert Stunden und braucht viel RAM.
  Vorher prüfen: `nix build .#diddy-webrtc --dry-run` zeigt, ob `webkitgtk` gebaut
  oder geladen würde.
- In einer System-Flake entsprechend `diddy.packages.${system}.diddy-webrtc` verwenden.
- Bildschirmfreigabe läuft über PipeWire und das Desktop-Portal:
  `services.pipewire.enable = true;` und `xdg.portal.enable = true;` mit dem passenden
  Portal-Backend (GNOME: `xdg-desktop-portal-gnome`, KDE: `xdg-desktop-portal-kde`,
  wlroots: `xdg-desktop-portal-wlr`).
- Die WebRTC-Unterstützung von WebKitGTK (GStreamer) ist neuer als die von Chromium.
  Ob ein Call mit Element Call zuverlässig klappt, ist erst nach einem echten Test belegt.

## Verifikationsstand

Bei dieser Änderung geprüft (Nix 2.26.3):

- `nix flake check --all-systems --no-build --no-update-lock-file` erfolgreich:
  Paket, Frontend, Apps, Overlay, Entwicklungsshell und Formatter für beide Architekturen.
- Gepinnte nixpkgs-Quelle heruntergeladen und deren Lock-Prüfsumme durch Nix bestätigt.
- Paket-Quellfilter sowie Prüfsummenabdeckung der npm-/Cargo-Lockdateien geprüft.

Noch offen: vollständiger Build samt JS-/Rust-Tests und Start in einer echten
NixOS-Desktop-Sitzung. Eine erfolgreiche Auswertung allein beweist weder
Kompilierung noch Login, Profilisolation, Medienwiedergabe oder Anrufe.
