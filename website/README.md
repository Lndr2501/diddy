# Diddy-Website

Statische Seite ohne Build-Schritt: HTML, CSS, ein kleines Skript. Keine Cookies, keine externen Anfragen.

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite (Englisch, wie README und App) |
| `impressum.html`, `datenschutz.html` | Rechtliches (Deutsch) |
| `assets/site.css` | Design-Tokens aus dem Theme „Diddy“ (`cinny/src/colors.css.ts`), 12/8/4-Spalten-Raster |
| `assets/site.js` | Version, Download-Links, OS-Erkennung, Theme-Vorschau, Tabs, Kopieren |
| `assets/img/` | WebP aus `docs/screenshots/`, Logo aus `branding/logo/diddy-pink-rounded.svg` |
| `assets/fonts/` | Inter (latin, latin-ext) aus `@fontsource/inter`, Lizenz `OFL.txt` |
| `demo/` | Interaktive Demo (eigene Sitzung, nicht Teil dieser Dateien) |

## Vor dem Veröffentlichen

1. In `impressum.html` und `datenschutz.html` alle gelben Platzhalter (`class="placeholder"`) ausfüllen.
2. In `datenschutz.html` Abschnitt 3 an den Hoster anpassen (Vorlagen für GitHub Pages und Cloudflare Pages
   stehen als Kommentar darüber).
3. In `index.html` `og:image` auf eine absolute Adresse setzen (`https://<domain>/assets/img/og.png`).

Prüfen, ob noch Platzhalter da sind:

```sh
grep -n 'class="placeholder"' website/*.html
```

## Bei jedem Release

`VERSION` oben in `assets/site.js` setzen. Download-Knöpfe zeigen dann direkt auf
`releases/download/vX.Y.Z/Diddy_X.Y.Z_<suffix>`. Neue Screenshots neu konvertieren (WebP, 1280 px breit, Qualität 82).

## Lokal ansehen

```sh
python3 -m http.server 8080 -d website
```

Dann <http://localhost:8080> öffnen.

## Rechtliches, kurz

- Keine Google Fonts, kein CDN, keine Analyse: damit braucht die Seite keinen Cookie-Banner.
- Wer Statistik, Videos oder externe Schriften einbaut, muss `datenschutz.html` ergänzen und ggf. eine Einwilligung einholen.
- Markenhinweise (Apple, Linux, Matrix) stehen im Footer und im Impressum. Keine fremden Logos verwenden.
