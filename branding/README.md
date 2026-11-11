# Diddy-Logo

Das Zeichen ist ein fettes kleines „d“, dessen Innenraum eine Sprechblase ist. Es ist eine reine
Vektorgrafik und in allen Farbtönen exakt dieselbe Form.

<p>
  <img src="logo/diddy-pink-rounded.svg" width="96" alt="Pink">
  <img src="logo/diddy-blue-rounded.svg" width="96" alt="Blue">
  <img src="logo/diddy-purple-rounded.svg" width="96" alt="Purple">
  <img src="logo/diddy-black-rounded.svg" width="96" alt="Black">
  <img src="logo/diddy-magenta-rounded.svg" width="96" alt="Magenta">
</p>

## Dateien

Farbtöne: `pink` (Standard), `blue`, `purple`, `black`, `magenta`. Das sind dieselben Namen wie in der
App-Icon-Auswahl.

| Datei | Zweck |
|---|---|
| `logo/diddy-<farbe>-square.svg` | Volle Fläche ohne Rundung. Für iOS, das selbst maskiert. |
| `logo/diddy-<farbe>-rounded.svg` | Abgerundete Kachel. Für Linux, Web und Logos in der App. |
| `logo/diddy-<farbe>-mac.svg` | macOS-Form mit Rand und Schatten. Für das Dock. |
| `logo/diddy-mark.svg` | Nur das Zeichen, einfarbig (`currentColor`). |

## Neu erzeugen

```
python3 branding/build.py
```

Form und Farben stehen oben in `build.py`. Die SVG-Dateien nie von Hand ändern, sie werden überschrieben.
Mit `rsvg-convert` (librsvg) entstehen zusätzlich PNG-Bilder mit 1024 px in `logo/png/`. Dieser Ordner
liegt nicht im Repo.

## Einbauen

```
python3 branding/build.py && python3 branding/export.py
```

`export.py` rendert aus den SVG-Dateien alle Bilder der Apps: `src-tauri/app-icons` und `src-tauri/icons`
(Dock, Fenster, `icon.icns`, `icon.ico`), `cinny/public` (App-Icon-Auswahl, Favicon, Apple- und Android-Symbole)
und die iOS-Asset-Kataloge (App-Icons, Vorschauen, `DiddyLogo`). Die Bilder liegen im Repo, damit Builds
weder `rsvg-convert` noch Python brauchen.

## Stand

Das Logo ist überall eingebaut (1.5.2). Auf iOS gilt der Farbton-Wechsel weiter über die alternativen
App-Icons.
