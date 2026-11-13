# Diddy-Website

Statische Seite ohne Build-Schritt: HTML, CSS, ein kleines Skript. Keine Cookies, keine externen Anfragen.

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite (Englisch, wie README und App) |
| `rechtliches.html` | Kontakt und Datenschutz auf einer Seite (Deutsch) |
| `assets/site.css` | Design-Tokens aus dem Theme „Diddy“ (`cinny/src/colors.css.ts`), 12/8/4-Spalten-Raster |
| `assets/site.js` | Version, Download-Links, OS-Erkennung, Theme-Vorschau, Tabs, Kopieren |
| `assets/img/` | WebP aus `docs/screenshots/`, Logo aus `branding/logo/diddy-pink-rounded.svg` |
| `assets/fonts/` | Inter (latin, latin-ext) aus `@fontsource/inter`, Lizenz `OFL.txt` |
| `demo/` | Interaktive Demo (eigene Sitzung, nicht Teil dieser Dateien) |

## Vor dem Veröffentlichen

1. In `rechtliches.html` die drei gelben Platzhalter (`class="placeholder"`) ausfüllen: Name, E-Mail, Hoster.
2. In `index.html` `og:image` auf eine absolute Adresse setzen (`https://<domain>/assets/img/og.png`).

Prüfen, ob noch Platzhalter da sind:

```sh
grep -n 'class="placeholder"' website/rechtliches.html
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
- Wer Statistik, Videos oder externe Schriften einbaut, muss `rechtliches.html` ergänzen und ggf. eine Einwilligung einholen.
- Kein volles Impressum: private, nicht kommerzielle Projektseite (Schweiz, Art. 3 Abs. 1 lit. s UWG greift nicht).
  Ein kurzer Datenschutzhinweis bleibt nötig, weil der Hoster technisch IP-Adressen verarbeitet; dazu gehören Name und E-Mail.
  Kommen Spenden, Verkauf, Werbung oder eine Firma dazu, ein volles Impressum mit Postadresse ergänzen.
- Markenhinweise (Apple, Linux, Matrix) stehen im Footer und in `rechtliches.html`. Keine fremden Logos verwenden.
