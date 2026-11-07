<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="128" alt="Diddy-Icon">

# Diddy

**Matrix-Chat für macOS, Linux und iOS, mit Sprachchat, der wirklich funktioniert.**

[![Release](https://img.shields.io/github/v/release/Lndr2501/diddy?label=Release&color=e6007e)](../../releases/latest)
[![Tests](https://github.com/Lndr2501/diddy/actions/workflows/test.yml/badge.svg)](../../actions/workflows/test.yml)
[![Lizenz](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)](LICENSE)
![Plattformen](https://img.shields.io/badge/macOS%20%7C%20Linux%20%7C%20iOS-lightgrey)

[Download](../../releases/latest) · [Installation](#installation) · [Selbst bauen](#selbst-bauen) · [Änderungen](CHANGELOG.md)

</div>

---

Diddy basiert auf [Cinny](https://github.com/cinnyapp/cinny) und ergänzt alles, was im Alltag mit Sprachchat und Bildschirmübertragung fehlt.

## Auf einen Blick

| | macOS | Linux | iOS / iPadOS |
|---|:---:|:---:|:---:|
| Chat, Räume, Verschlüsselung | ✅ | 🧪 gebaut, aber ungetestet | 🧪 |
| Sprachchat | ✅ | 🧪 nur NixOS-Paket `diddy-webrtc` | 🧪 (iOS 15+) |
| Bildschirmübertragung | ✅ | ❌ | ❌ |
| davon mit System-Ton | ✅ (macOS 14.2+) | ❌ | ❌ |
| Mehrere Verbindungsprofile | ✅ (ab macOS 14) | 🧪 ungetestet | ❌ |
| Sprachnachrichten | ✅ | 🧪 | 🧪 |

✅ läuft und wird getestet · 🧪 gebaut, aber noch nicht im Alltag geprüft · ❌ funktioniert (noch) nicht


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
> Sprach- und Videochat gehen mit AppImage und .deb nicht: Das WebKitGTK von Ubuntu, Debian und Fedora ist ohne WebRTC gebaut. Unter NixOS gibt es dafür das Paket `diddy-webrtc` (WebKitGTK mit WebRTC aus dem NixOS-Cache), siehe [NixOS-Anleitung](docs/nixos.md#sprach--und-videoanrufe).

Kein Linux-Rechner? Linux und NixOS lassen sich auf dem Mac in UTM testen: [VM-Anleitung](docs/vm-macos.md).

</details>

<details>
<summary><b>iOS / iPadOS</b></summary>

Die IPA baut der Workflow [Build iOS](.github/workflows/ios.yml) (Artefakt `diddy-ios`, manuell startbar unter *Actions*).

- **Ohne Signier-Secrets** ist sie unsigniert (`Diddy_*_iOS_unsigned.ipa`). [AltStore](https://altstore.io), [SideStore](https://sidestore.io) oder [Sideloadly](https://sideloadly.io) signieren sie beim Installieren mit deiner Apple-ID.
- **Mit Signier-Secrets** (`IOS_CERTIFICATE`, `IOS_CERTIFICATE_PASSWORD`, `IOS_MOBILE_PROVISION`, `APPLE_DEVELOPMENT_TEAM`, siehe Kopf des Workflows) ist sie signiert und lässt sich direkt auf registrierten Geräten installieren.

Beim ersten Call Mikrofon (und für Video die Kamera) erlauben. Ein laufender Sprachchat bleibt hörbar, wenn Diddy im Hintergrund ist oder der Bildschirm gesperrt wird.

Auf iOS gibt es keine getrennten Anmeldungen (ein Fenster, ein Datenspeicher) und keine Bildschirmübertragung (WKWebView kann den Bildschirm nicht aufnehmen).

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
cd cinny && npm run build && npm run test:e2e         # Browser-Smoke (Playwright, Chromium)
```

Auf macOS die nativen Tests mit `DYLD_LIBRARY_PATH=/usr/lib/swift` starten.

### iOS

Auf einem Mac mit Xcode, XcodeGen (`brew install xcodegen`) und `rustup target add aarch64-apple-ios`:

```sh
(cd cinny && npm ci) && npm ci
npm run tauri -- ios init                       # erzeugt src-tauri/gen/apple (nicht eingecheckt)
npm run tauri -- icon src-tauri/icons/ios-source.png -o src-tauri/.ios-icons && rm -rf src-tauri/.ios-icons
npm run tauri -- ios build                      # signiert mit deinem Team (APPLE_DEVELOPMENT_TEAM)
```

Was Diddy am Xcode-Projekt ändert, steht in `src-tauri/tauri.ios.conf.json` und `src-tauri/Info.ios.plist`.

## Lizenz

[AGPL-3.0](LICENSE), wie Cinny.

---

<div align="center">

**Diddy** · gebaut auf [Cinny](https://github.com/cinnyapp/cinny) und [Tauri 2](https://tauri.app/)

</div>
