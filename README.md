<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="128" alt="Diddy-Icon">

# Diddy

**Matrix-Chat für macOS und Linux, mit Sprachchat, der wirklich funktioniert.**

[![Release](https://img.shields.io/github/v/release/Lndr2501/diddy?label=Release&color=e6007e)](../../releases/latest)
[![Tests](https://github.com/Lndr2501/diddy/actions/workflows/test.yml/badge.svg)](../../actions/workflows/test.yml)
[![Lizenz](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)](LICENSE)
![Plattformen](https://img.shields.io/badge/macOS%20%7C%20Linux-lightgrey)

[Download](../../releases/latest) · [Installation](#installation) · [Selbst bauen](#selbst-bauen) · [Änderungen](CHANGELOG.md)

</div>

---

Diddy basiert auf [Cinny](https://github.com/cinnyapp/cinny) und ergänzt alles, was im Alltag mit Sprachchat und Bildschirmübertragung fehlt.

## Was Diddy anders macht

### 🎙️ Sprachchat
- **Läuft auf macOS.** Bei Cinny hängt der Beitritt endlos.
- **Musik bleibt laut.** Mit *Voice processing* aus nimmt Diddy das Mikrofon direkt über Core Audio auf. macOS senkt dann andere Apps beim Beitritt oder Mikrofonwechsel nicht mehr ab.
- **Kopfhörer-Knopf** schaltet Mikro und Ton zusammen stumm, ein zweiter Klick schaltet beides wieder an.

### 🖥️ Bildschirmübertragung
- **Bleibt scharf**, auch wenn Diddy im Hintergrund ist.
- **Mit System-Ton** (macOS 14.2+): An/Aus-Knopf in der Call-Leiste. Diddys eigener Call-Ton ist ausgenommen, es gibt kein Echo.

### 💬 Chat
- **Sprachnachrichten** aufnehmen und abspielen. Element und andere Clients zeigen sie als Sprachnachricht.
- **Eigenes Rechtsklick-Menü** mit *Copy Text*, statt dem Menü des Web-Views.
- **Alle Räume eines Space mit einem Klick beitreten** (*Join All Rooms*) oder automatisch (*Auto-Join Rooms*), im Space-Menü.
- **Konto-Menü** am Profilbild unten links: Konto, Verbindungen, Einstellungen.

### 🔌 Wenn ein Homeserver ausfällt
Die Verbindungsseite zeigt den betroffenen Server und bietet **Erneut versuchen** oder **Anderen Server verbinden**.

- Unter **Verbindungen** lassen sich gespeicherte Anmeldungen wieder öffnen.
- Ein anderer Server bekommt ein eigenes Fenster mit getrenntem Login und Datenspeicher. Das bisherige Konto und seine Schlüssel bleiben erhalten.
- Accounts werden nicht zwischen Servern übertragen.
- Zusätzliche getrennte Anmeldungen brauchen auf macOS mindestens Version 14.

Kein Auto-Update: Diddy ändert sich nur, wenn du eine neue Version installierst.

## Installation

Alle Downloads liegen unter [Releases](../../releases/latest).

<details open>
<summary><b>macOS (Apple Silicon)</b></summary>

1. `Diddy_*_aarch64.dmg` öffnen und Diddy nach *Programme* ziehen.
2. Einmal im Terminal ausführen, weil die App nicht notarisiert ist:
   ```sh
   xattr -cr /Applications/Diddy.app
   ```
3. Diddy starten und das Mikrofon erlauben. Für den Stream-Ton zusätzlich *Bildschirm- & Systemaudio-Aufnahme* erlauben.

</details>

<details>
<summary><b>Linux</b></summary>

| Paket | Befehl |
|---|---|
| AppImage | `chmod +x Diddy_*.AppImage && ./Diddy_*.AppImage` |
| Debian/Ubuntu | `sudo apt install ./Diddy_*.deb` |
| NixOS | `nix run .#diddy` im Checkout, siehe [NixOS-Anleitung](docs/nixos.md) |

> [!NOTE]
> Sprach- und Videochat sind im Linux-Client (WebKitGTK) nicht verlässlich unterstützt. Das Nix-Paket ändert daran nichts.

Kein Linux-Rechner? Linux und NixOS lassen sich auf dem Mac in UTM testen: [VM-Anleitung](docs/vm-macos.md).

</details>

## Selbst bauen

Voraussetzungen: Node 24, Rust und die [Tauri-Abhängigkeiten](https://v2.tauri.app/start/prerequisites/).

```sh
(cd cinny && npm ci) && npm ci && npm run tauri -- build
```

Tests ohne Hardware:

```sh
cd cinny && npm test                                  # JavaScript
cd src-tauri && cargo test --lib -- --test-threads=1  # nativ
```

Auf macOS die nativen Tests mit `DYLD_LIBRARY_PATH=/usr/lib/swift` starten.

## Lizenz

[AGPL-3.0](LICENSE), wie Cinny.
