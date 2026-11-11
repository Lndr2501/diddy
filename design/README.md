# Diddy — Issue Design Handoff

13 visuelle Soll-Konzepte zu allen am 07.11.2026 gelesenen offenen GitHub-Issues. Grundlage: Issue-Texte, sämtliche zu diesem Zeitpunkt vorhandenen Kommentare, beigefügte Referenzbilder und README des Repos.

## Öffnen / weitergeben

- `gallery-local.html` öffnen; Ordner `mockups/` daneben belassen.
- `gallery-portable.html`: eigenständige Galerie inklusive eingebetteter PNGs (ohne Netzwerk nutzbar).
- `diddy-design-handoff.zip`: Galerie, 13 PNGs, editierbare HTML-Vorlagen und Manifest.
- `mockups/issue-NN.png`: jeweils 1440 × 1080 px; die dargestellte Hauptoberfläche misst in der Regel 1250 × 800 px.
- Jede Vorlage enthält drei Umsetzungshinweise. Auf ausdrücklichen Nutzerwunsch werden die Dateien auf einem separaten Design-Branch archiviert und die PNGs in den jeweils zugehörigen Issue-Kommentaren eingebettet. App-Code und `main` bleiben unverändert.

## Zuordnung

| Issue | Datei | Fokus |
| --- | --- | --- |
| [#30](https://github.com/Lndr2501/diddy/issues/30) | `mockups/issue-30.png` | Fünfstufige Einführung; Matrix-Begriffe verständlich erklären |
| [#29](https://github.com/Lndr2501/diddy/issues/29) | `mockups/issue-29.png` | Vier Kartenlayouts, Modulreihenfolge, lokale Anzeige-Einstellungen |
| [#28](https://github.com/Lndr2501/diddy/issues/28) | `mockups/issue-28.png` | Editor für eigene öffentliche Profildaten mit Live-Vorschau |
| [#27](https://github.com/Lndr2501/diddy/issues/27) | `mockups/issue-27.png` | Diddy-Avatar konsistent in großer und kleiner Anzeige |
| [#26](https://github.com/Lndr2501/diddy/issues/26) | `mockups/issue-26.png` | Recovery bei Startfehlern; Audio-Watchdog und sichtbare Fenster |
| [#25](https://github.com/Lndr2501/diddy/issues/25) | `mockups/issue-25.png` | Kleines, verschiebbares Startfenster → bereit geladenes Hauptfenster |
| [#23](https://github.com/Lndr2501/diddy/issues/23) | `mockups/issue-23.png` | Teilnehmerleiste oberhalb des eingebetteten Calls |
| [#21](https://github.com/Lndr2501/diddy/issues/21) | `mockups/issue-21.png` | Einheitliches macOS-nahes App-Design inkl. Konto-Menü und Composer |
| [#12](https://github.com/Lndr2501/diddy/issues/12) | `mockups/issue-12.png` | Linux-Fähigkeiten und ehrlicher Diagnose-/Freigabestatus |
| [#11](https://github.com/Lndr2501/diddy/issues/11) | `mockups/issue-11.png` | Capture, Sender und Gegenstelle getrennt prüfen |
| [#9](https://github.com/Lndr2501/diddy/issues/9) | `mockups/issue-09.png` | Grenze bei offline vergebenen Badges verständlich machen |
| [#7](https://github.com/Lndr2501/diddy/issues/7) | `mockups/issue-07.png` | Getrennte Verbindungskonten und sichere Fehlerzustände |
| [#2](https://github.com/Lndr2501/diddy/issues/2) | `mockups/issue-02.png` | Zuschauer-Umschalter für mehrere Screen-Tracks |

## Design-Tokens / Umsetzung

- Basis: dunkles, weitgehend neutrales `#14131C`; Aurora-Licht nur großflächig und diffus.
- Sidebar: 210 px; Vorschau: 260 px. Hauptfenster: 1250 × 800 px, später responsiv skalieren.
- Karten: Radius 16 px, üblicherweise 16–18 px Innenabstand, 12–14 px Abstand; dezenter weißer 1-px-Rahmen.
- Controls: Radius 8–12 px; Violett `#A76AEC` für aktive Zustände und wichtige Aktionen. Pink nur als sekundäre Lichtfarbe.
- Typografie: Systemfont-Stack; unter macOS SF Pro. Die PNGs wurden unter Linux gerendert und nutzen dort verfügbare Ersatzfonts. Die SVGs sind illustrative Symbole, keine eingebetteten originalen SF Symbols.
- Interaktion: Hover minimal heller; Fokus sichtbar; 150–250 ms Ease-out; Reduce Motion beachten. Wichtige Klickflächen mindestens 44 pt, auch bei kleinerer visueller Kapsel.
- Glas: unter macOS `NSVisualEffectView`, im Web zurückhaltender `backdrop-filter`. Nicht jede Karte einzeln stark blurren. Transparenz bei reduzierter Transparenz deaktivieren; Textkontrast prüfen.
- Live-Vorschau soll in der Implementierung echte Änderungen unmittelbar spiegeln. Die Einzelbilder und HTML-Screens sind visuelle Vorlagen, keine funktionale App.

## Wichtige Abgrenzungen

- #28 / #29: Eigene öffentliche Angaben sind nicht dasselbe wie lokale Einstellungen zur Darstellung fremder Profile. Zusatzfelder in #28 sind Vorschläge, die noch abgestimmt werden müssen.
- #26: Kommentare nennen erst einen ungültigen Fensterzustand und später einen blockierten macOS-Audiodienst. Der Entwurf behauptet keine zur Laufzeit bewiesene Diagnose für jeden Startfehler. Keine Datenlöschung / kein automatischer privilegierter Eingriff.
- #12: NixOS-Sonderpaket nicht mit AppImage/.deb gleichsetzen. Kein grüner Freigabestatus ohne reale Laufzeitprüfung.
- #11: 1080p/29 fps war laut Issue-Kommentar im Sender-Log sichtbar; die Zuschauerqualität bleibt separat zu bestätigen.
- #9: Im Nachrichtenmodus clientseitig nicht vollständig lösbar. Ein State-Modus wurde laut Kommentar abgelehnt; der Entwurf führt ihn nicht ein.
- #7: Registry-Unit-Tests ersetzen keine echten WebKit-Store-Isolationstests.
- #2: Multi-Screen ist ein Architekturkonzept, nicht durch einen UI-Schalter im bestehenden Element Call erledigt. Track-/Audio-Zuordnung ist vor Umsetzung zu klären.

## Erzeugung / Prüfung

`python3 design/build_mockups.py` erzeugt die Vorlagen. `node design/render.mjs` rendert sie nacheinander mit einem Browser und einem Tab. `python3 design/build_gallery.py` baut Galerien und Handoff-ZIP.

Renderer-Pfade sind für diese Arbeitsumgebung konfiguriert. Keine neue npm-Abhängigkeit installiert. PNGs visuell geprüft; die Desktop-Layouts zusätzlich auf horizontales Überlaufen und abgeschnittene Hauptbereiche geprüft. Galerie zusätzlich geprüft: alle 13 Bilder laden mit 1440 × 1080 px, PNG-Einzeldownload und ZIP-Download funktionieren, ZIP-CRC ist gültig, Zoom funktioniert, bei 390 px Breite kein horizontales Überlaufen und keine JavaScript-Fehler. Während des Renderns blieb der Swap bei 0 B; lokale Browser wurden danach geschlossen. Keine App-, Hardware- oder nativen Plattformtests durchgeführt.
