# Linux und NixOS auf dem MacBook testen (UTM)

Für: MacBook mit Apple Silicon (M-Chip). **UTM ist dort schon installiert.**
Zeitbedarf: NixOS-VM ca. 45 min, Ubuntu-VM ca. 30 min, jeweils plus Download.

> [!IMPORTANT]
> Immer **ARM64 / aarch64**-Images nehmen. Ein `amd64`/`x86_64`-Image läuft in UTM nur emuliert und ist sehr langsam.

## Was in einer VM geht und was nicht

| Funktion | In der UTM-VM |
|---|---|
| Oberfläche, Login, Chat, Optionsraum, Verbindungsfenster | ✅ voll testbar |
| Ton hören (Lautsprecher) | ✅ |
| Mikrofon des Macs | ⚠️ möglich, aber wackelig (siehe [Mikrofon und Kamera](#mikrofon-und-kamera)) |
| Eingebaute FaceTime-Kamera | ❌ lässt sich nicht durchreichen |
| USB-Webcam | ⚠️ nur mit QEMU-Backend über USB-Weitergabe |
| Bildschirmübertragung | ✅ Bildschirm *der VM* (über PipeWire/Portal) |

Eine VM ersetzt keinen echten Linux-Rechner für den Call-Test. Für Oberfläche und „startet WebRTC überhaupt“ reicht sie.

---

## A. NixOS in UTM (empfohlen)

### 1. ISO laden (5–15 min)
1. [nixos.org/download](https://nixos.org/download/#nixos-iso) öffnen.
2. Unter **NixOS: the Linux distribution** → **Graphical ISO image** → **GNOME**, Architektur **64-bit ARM** wählen.
   - Gibt es dort kein ARM-Grafik-Image, das **Minimal ISO, 64-bit ARM** nehmen und Schritt 4 im Terminal machen (siehe [NixOS-Handbuch, Installation](https://nixos.org/manual/nixos/stable/#sec-installation-manual)).

### 2. VM anlegen (5 min)
1. UTM öffnen → **+** → **Virtualize** (nicht *Emulate*) → **Linux**.
2. **Use Apple Virtualization** *aus* lassen (QEMU-Backend: USB-Weitergabe und flexiblere Audio-Einstellungen).
3. **Boot ISO Image**: die NixOS-ISO auswählen.
4. Hardware: **8 GB RAM**, **4 CPU-Kerne**. *Enable display output* an.
5. Speicher: **64 GB** (Diddy-Build braucht viel Platz im Nix-Store).
6. **Shared Directory**: optional einen Ordner auf dem Mac wählen, z. B. `~/diddy-vm-share` (siehe [Daten teilen](#e-daten-zwischen-mac-und-vm-teilen)).
7. Name `nixos`, **Save**.

### 3. VM-Einstellungen nachziehen (2 min)
VM auswählen → **Bearbeiten** (Schieberegler-Symbol):
1. **Display** → Emulated Display Card: **virtio-gpu-gl-pci (GPU Supported)**.
2. **Sound** → Emulated Audio Card: **Intel HD Audio Controller (ich9)** oder **virtio-sound**, falls angeboten.
3. **Network** → Network Mode: **Shared Network**.
4. **Input** → USB Sharing: **USB 3.0 (XHCI)** (nur für eine USB-Webcam nötig).
5. **Save**.

### 4. Installieren (15–20 min)
1. VM starten. Der grafische Installer (Calamares) öffnet sich.
2. Sprache Deutsch, Tastatur Schweiz/Deutschland, Benutzername z. B. `lndr`.
3. Desktop: **GNOME**. „Unfreie Software“ ist nicht nötig.
4. Partitionierung: **Festplatte löschen** (betrifft nur die virtuelle 64-GB-Platte).
5. Installieren, danach **ausschalten**.
6. In UTM bei **CD/DVD** die ISO auswerfen (**Clear**), sonst startet wieder der Installer.
7. VM starten, einloggen.

### 5. Für Diddy einrichten (10 min + Build)
1. Terminal öffnen.
2. Die fertige Konfiguration aus diesem Repo übernehmen: [`docs/vm/nixos-configuration.nix`](vm/nixos-configuration.nix) als `/etc/nixos/configuration.nix` und [`docs/vm/flake.nix`](vm/flake.nix) als `/etc/nixos/flake.nix` (Befehle oben in der Datei). Die von der Installation erzeugte `hardware-configuration.nix` bleibt liegen. Vorher `users.users.lndr` an deinen Benutzernamen anpassen und deinen SSH-Schlüssel eintragen.
3. Diddy-Checkout nach `~/diddy` holen (Shared Directory oder `git clone`, privates Repo braucht deinen SSH-Schlüssel).
4. `sudo nixos-rebuild switch --flake /etc/nixos#diddy-vm`
5. Neu starten. Diddy ist danach im App-Menü.
   - Ohne Systemumbau geht auch nur: `cd ~/diddy && nix run .#diddy` (siehe [NixOS-Anleitung](nixos.md)).

Der erste Build dauert auf 4 Kernen etwa **15–30 min** (Schätzung).

Die Konfiguration wertet mit `nixos-26.05` und `nixos-25.11` fehlerfrei aus. In einer echten UTM-VM gebootet wurde sie noch nicht.

---

## B. Ubuntu 24.04 ARM64 in UTM

### 1. ISO laden (5–10 min)
1. [ubuntu.com/download/server/arm](https://ubuntu.com/download/server/arm) **oder** die Desktop-ARM64-ISO von [cdimage.ubuntu.com/releases/24.04](https://cdimage.ubuntu.com/releases/24.04/release/) (`ubuntu-24.04.x-desktop-arm64.iso`).
2. Achtung: Die normale Seite *ubuntu.com/download/desktop* liefert `amd64`. Das ist falsch für den Mac.

### 2. VM anlegen (5 min)
Wie bei NixOS ([A.2](#2-vm-anlegen-5-min) und [A.3](#3-vm-einstellungen-nachziehen-2-min)), nur die Ubuntu-ISO wählen. 40 GB Platte reichen.

### 3. Installieren (15 min)
1. VM starten → **Try or Install Ubuntu** → Installer durchklicken.
2. Bei der Server-ISO danach: `sudo apt update && sudo apt install -y ubuntu-desktop` (20–30 min), neu starten.
3. Gast-Werkzeuge: `sudo apt install -y spice-vdagent spice-webdavd` (Zwischenablage, Fenstergröße, Ordnerfreigabe), neu starten.

### 4. Diddy in Ubuntu
Der Linux-Workflow baut derzeit x86_64-Pakete; für die ARM-VM Diddy aus dem
aktuellen Checkout mit Electron bauen. ARM64-Laufzeit und VM-Audio sind separat abzunehmen.

```sh
# 1. Compiler und native Audio-Abhängigkeiten
sudo apt install -y build-essential pkg-config libpulse-dev libasound2-plugins git curl

# 2. Node 24 (bei bereits vorhandenem nvm nur nvm install ausführen)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
. "$HOME/.nvm/nvm.sh" && nvm install 24

# 3. Frontend und Electron-Pakete bauen
cd ~/diddy
cp config.json cinny/config.json
(cd cinny && npm ci && npm run build)
(cd electron && npm ci && npm run dist:linux)

# 4. Installieren
sudo apt install ./electron/dist/Diddy_*_arm64.deb
```

Rust, WebKitGTK und GStreamer werden für diesen Linux-Build nicht benötigt. Für
Bildschirmfreigabe unter Wayland müssen Desktop-Portal und passendes Backend laufen;
Systemton benötigt PipeWire mit `pipewire-pulse` oder PulseAudio. Details und Grenzen:
[Linux-Audio und Bildschirmfreigabe](nixos.md#calls-audio-und-bildschirmfreigabe).

---

## Mikrofon und Kamera

Ehrlicher Stand (Recherche Nov. 2026, nicht selbst an der Hardware geprüft):

1. **Mikrofon:** UTM fragt beim ersten VM-Start nach Mikrofon-Zugriff → **Erlauben**. Mit dem QEMU-Backend ist die Aufnahme über CoreAudio laut Nutzerberichten manchmal stumm. Dann in **UTM → Einstellungen → QEMU → Audio-Backend** von *CoreAudio* auf *SPICE (GStreamer)* umstellen und die VM neu starten ([UTM-Issue #6404](https://github.com/utmapp/UTM/issues/6404)).
2. **Eingebaute Kamera:** Die FaceTime-Kamera ist kein USB-Gerät und kann nicht in die VM gereicht werden.
3. **USB-Webcam:** Nur mit QEMU-Backend: VM läuft → Symbolleiste **USB** → Kamera wählen. Muss nach jedem UTM-Start neu verbunden werden ([UTM-Diskussion #3147](https://github.com/utmapp/UTM/discussions/3147)).
4. **Testkamera ohne Hardware:** Die NixOS-Konfiguration enthält ein auskommentiertes `v4l2loopback`. Damit erscheint eine virtuelle Kamera mit Testbild (`gst-launch-1.0 videotestsrc ! v4l2sink device=/dev/video10`).

---

## E. Daten zwischen Mac und VM teilen

**Shared Directory (einfachste Variante, QEMU-Backend):**
1. In den VM-Einstellungen unter **Sharing** → Directory Share Mode **VirtFS**, Ordner wählen.
2. In der VM einhängen:
   ```sh
   sudo mkdir -p /mnt/mac
   sudo mount -t 9p -o trans=virtio,version=9p2000.L share /mnt/mac
   ```
   Die NixOS-Konfiguration erledigt das automatisch.
3. Bei *Apple Virtualization* heißt es VirtioFS: `sudo mount -t virtiofs share /mnt/mac`.

**SSH (für Logs, Bildschirmfotos, `rsync`):**
1. In der VM: IP mit `ip -4 addr` nachsehen (meist `192.168.64.x`).
2. Auf dem Mac: `ssh lndr@192.168.64.x`. Die NixOS-Konfiguration schaltet SSH ein (nur Schlüssel, kein Passwort).
3. Dateien holen: `scp lndr@192.168.64.x:~/.local/share/app.diddy.desktop/... .`

---

## F. Ohne VM: Docker-Container (nur Oberfläche)

Auf dem Mac läuft schon Docker Desktop. Am 2026-11-06 wurde Diddy so als natives ARM64-Nix-Paket gebaut und unter **Xvfb/Openbox** gestartet (Login-Seite, Zweitfenster, Wiederholen-Knopf, Verbindungsmenü: alle bestanden).

- Gut für: automatische Oberflächentests, Bildschirmfotos, Start-/Fenstertests.
- **Nicht** für: Ton, Mikrofon, Kamera, Calls, Wayland, echten Desktop. Der Container braucht außerdem abgeschaltete WebKit-/Nix-Sandboxen, ist also kein Abbild eines echten Systems.
- Die Skripte liegen im Container-Host unter `/root/diddy-linux-test/` (`docker-host.sh`, `run-build.sh`, `run-desktop.sh`).

---

## Quellen

- [NixOS-Download](https://nixos.org/download/) und [NixOS-Handbuch](https://nixos.org/manual/nixos/stable/)
- [UTM-Dokumentation](https://docs.getutm.app/) (Gastwerkzeuge, Ordnerfreigabe)
- [Ubuntu ARM64-Images](https://cdimage.ubuntu.com/releases/24.04/release/)
- [UTM-Issue #6404: Mikrofon stumm mit CoreAudio](https://github.com/utmapp/UTM/issues/6404)
- [UTM-Diskussion #3147: USB-Geräte dauerhaft verbinden](https://github.com/utmapp/UTM/discussions/3147)
- [virtiofs im Linux-Kernel](https://docs.kernel.org/filesystems/virtiofs.html)
