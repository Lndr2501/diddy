# Diddy

Chat-Client für Matrix, für macOS und Linux. Basiert auf [Cinny](https://github.com/cinnyapp/cinny) (AGPL-3.0).

## Was anders ist

- **Sprachchat läuft auf macOS** (bei Cinny hängt der Beitritt endlos).
- **Bildschirmübertragung bleibt scharf**, auch wenn Diddy im Hintergrund ist.
- **Stream-Ton** (macOS): Der System-Ton wird mitgesendet, mit An/Aus-Knopf in der Call-Leiste. Diddys eigener Call-Ton ist ausgenommen, es gibt kein Echo.
- **Kopfhörer-Knopf** schaltet Mikro und Ton zusammen stumm und beim zweiten Klick beides wieder an.
- **Alle Räume eines Space mit einem Klick beitreten** ("Join All Rooms") oder automatisch ("Auto-Join Rooms"), im Space-Menü.
- Kein Auto-Update.

## Installation

Die Downloads liegen unter [Releases](../../releases).

**macOS (Apple Silicon)**
1. `Diddy_*_aarch64.dmg` öffnen und Diddy nach *Programme* ziehen.
2. Einmal im Terminal ausführen, weil die App nicht notarisiert ist: `xattr -cr /Applications/Diddy.app`
3. Starten und das Mikrofon erlauben. Für den Stream-Ton zusätzlich *Bildschirm- & Systemaudio-Aufnahme* erlauben.

**Linux**
- AppImage: `chmod +x Diddy_*.AppImage && ./Diddy_*.AppImage`
- Debian/Ubuntu: `sudo apt install ./Diddy_*.deb`
- Sprach- und Videochat gehen unter Linux noch nicht: WebKitGTK hat kein WebRTC.

## Selbst bauen

Voraussetzungen: Node 24, Rust und die [Tauri-Abhängigkeiten](https://v2.tauri.app/start/prerequisites/).

```
(cd cinny && npm ci) && npm ci && npm run tauri -- build
```

## Lizenz

AGPL-3.0, wie Cinny. Siehe `LICENSE`.
