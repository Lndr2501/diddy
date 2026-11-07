# Plugins

Mit Plugins kann jeder eigene kleine Erweiterungen in seinen Diddy-Client einbauen, zum Beispiel
ein Wetter-Widget, einen Kalender, eine Statusseite oder einen Börsenticker. Ein Plugin ist
einfach **eine Web-Seite** (eine URL). Diddy zeigt sie in einem streng abgeschotteten Rahmen an
und spricht mit ihr nur über ein paar kleine, festgelegte Nachrichten.

- Verwalten: **Einstellungen → Plugins** (hinzufügen, ein/aus, entfernen, mit Live-Vorschau)
- Anzeigen: Tab **Plugins** in der Seitenleiste (erscheint, sobald mindestens ein Plugin aktiv ist)
- Gespeichert wird die Liste nur lokal auf diesem Gerät (localStorage), höchstens 12 Plugins.

## Schnellstart

1. Lege eine HTML-Datei an (oder nimm das [Wetter-Beispiel](plugins/weather.html)).
2. Stelle sie unter einer Adresse bereit:
   - zum Ausprobieren lokal: `python3 -m http.server 8000` im Ordner der Datei, Adresse dann
     `http://localhost:8000/weather.html`
   - dauerhaft über **https** auf einem beliebigen statischen Hoster (GitHub Pages, Netlify,
     Cloudflare Pages, eigener Webserver …). `raw.githubusercontent.com` funktioniert nicht,
     weil es HTML als Text ausliefert.
3. In Diddy: **Einstellungen → Plugins → Add Plugin**, Name und Adresse eintragen, **Add Plugin**.
   Die Vorschau erscheint sofort darunter.
4. In der Seitenleiste erscheint der Tab **Plugins** mit allen aktiven Plugins.

Erlaubte Adressen: `https://…`, sowie `http://` nur für `localhost`, `127.0.0.1` und `[::1]`
(lokale Entwicklung). Ohne Schema wird `https://` angenommen. Abgelehnt werden u. a. Adressen mit
Benutzername/Passwort, `*.localhost`-Namen (intern von der Desktop-App belegt), Diddys eigene
Adresse sowie doppelte Adressen oder Namen.

Hinweis: Wird Diddy im Browser über https geöffnet, kann es je nach Browser `http://localhost`
als gemischten Inhalt blockieren. In der Desktop-App funktioniert es.

## Der Vertrag (apiVersion 1)

Alle Nachrichten sind einfache Objekte mit einem Feld `type`. Der Austausch läuft über
`window.postMessage`.

| Richtung       | Nachricht                                                                              | Bedeutung                                                                    |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Plugin → Diddy | `{ type: 'diddy:ready', apiVersion?: 1, manifest?: { name?, description?, height? } }` | Plugin ist geladen. Optional mit Manifest.                                   |
| Diddy → Plugin | `{ type: 'diddy:init', apiVersion: 1, theme: 'dark' \| 'light', locale: 'de-DE', layout: 'full' \| 'compact', customCss?: string }` | Antwort auf `diddy:ready`. Wird erneut gesendet, wenn sich das Theme ändert. `layout: 'compact'` heißt: kleine Karte in der Seitenleiste, bitte nur das Wichtigste in einer schlanken Zeile zeigen. |
| Plugin → Diddy | `{ type: 'diddy:resize', height: 320 }`                                                | Gewünschte Höhe in Pixeln. Diddy begrenzt auf **80–600 px**.                 |

Ablauf:

1. Diddy lädt die Seite im iframe (Starthöhe 240 px).
2. Das Plugin sendet `diddy:ready` an `window.parent`.
3. Diddy antwortet mit `diddy:init`. Das Plugin passt Farben (`theme`) und Sprache/Zahlenformat
   (`locale`, BCP-47) an.
4. Immer wenn sich der Inhalt ändert, sendet das Plugin `diddy:resize`.
5. Wechselt der Nutzer das Theme, kommt ein neues `diddy:init`. Plugins sollten es also
   mehrfach verarbeiten können.

Das optionale **Manifest** in `diddy:ready`:

| Feld          | Typ    | Wirkung                                                                                      |
| ------------- | ------ | -------------------------------------------------------------------------------------------- |
| `name`        | string | Wird geprüft und gekürzt (max. 40 Zeichen); der vom Nutzer vergebene Name bleibt maßgeblich. |
| `description` | string | Kurzer Text unter der Karte (max. 140 Zeichen).                                              |
| `height`      | number | Starthöhe in px (ebenfalls 80–600).                                                          |

Regeln, auf die sich Plugins verlassen können (und müssen):

- Diddy nimmt nur Nachrichten an, deren `event.source` genau das Fenster dieses Plugins ist.
- Nachrichten werden streng geprüft: unbekannte `type`-Werte, falsche Datentypen oder
  **zusätzliche Felder auf oberster Ebene** führen dazu, dass die Nachricht ignoriert wird. Im
  Manifest werden unbekannte oder falsch typisierte Felder nur ignoriert.
- Texte aus dem Manifest werden von Steuerzeichen bereinigt und nur als Text angezeigt, nie als
  HTML.
- Antwortet eine Seite nicht innerhalb von 10 Sekunden mit `diddy:ready`, wird sie trotzdem als
  normale Seite angezeigt (mit Hinweis). Auch ganz normale Web-Seiten lassen sich also einbinden,
  sofern sie das Einbetten erlauben (kein `X-Frame-Options: DENY` bzw. `frame-ancestors`).
- Ein Plugin sollte `apiVersion` in `diddy:init` prüfen. Spätere Versionen erweitern den Vertrag;
  Version 1 bleibt gültig.
- Die Karte hat einen Neu-laden-Knopf; danach beginnt der Ablauf von vorn.

**Zum `targetOrigin`:** Weil das Plugin in einer Sandbox ohne eigenen Ursprung läuft (Origin
`null`), kann Diddy keinen konkreten Ziel-Origin angeben und sendet mit `'*'`. Ebenso kennt das
Plugin Diddys Origin nicht (Desktop-App, Web-Version, Entwicklung). Das ist unkritisch, weil in
keiner Richtung etwas Vertrauliches übertragen wird. Ein Plugin muss eingehende Nachrichten
trotzdem selbst prüfen: `event.source === window.parent` und die Form von `event.data`.

### Speicher und Links

Die Sandbox sperrt `localStorage`. Plugins bitten deshalb Diddy, kleine Werte für sie zu merken.
Jedes Plugin sieht nur seine eigenen Daten, sie bleiben auf diesem Gerät.

| Richtung       | Nachricht                                                        | Bedeutung                                                         |
| -------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Plugin → Diddy | `{ type: 'diddy:storage:get', id: 'a1', key: 'city' }`           | Wert lesen. `id` ist eine frei gewählte Kennung für die Antwort.  |
| Diddy → Plugin | `{ type: 'diddy:storage:value', id: 'a1', key: 'city', value }`  | Antwort; `value` ist ein String oder `null`.                      |
| Plugin → Diddy | `{ type: 'diddy:storage:set', key: 'city', value: 'Berlin' }`    | Wert speichern (keine Antwort).                                   |
| Plugin → Diddy | `{ type: 'diddy:open', url: 'https://…' }`                       | Link im Browser öffnen (nur `https://`, keine Zugangsdaten).      |

Grenzen: Schlüssel `[a-z0-9_.-]`, 1–40 Zeichen (nicht `__proto__`, `constructor`, `prototype`);
Werte bis 20 000 Zeichen; höchstens 50 Schlüssel pro Plugin. Antwortet Diddy nicht (alte Version),
muss das Plugin mit Standardwerten weiterarbeiten. Werte aus dem Speicher sind Fremddaten wie jede
andere Eingabe: nie als HTML einsetzen.

Hilfsfunktion zum Kopieren:

```js
let counter = 0;
const waiting = new Map();
window.addEventListener("message", (e) => {
  if (e.source !== window.parent || e.data?.type !== "diddy:storage:value") return;
  waiting.get(e.data.id)?.(e.data.value);
  waiting.delete(e.data.id);
});
const storageGet = (key) =>
  new Promise((resolve) => {
    const id = `s${++counter}`;
    waiting.set(id, resolve);
    window.parent.postMessage({ type: "diddy:storage:get", id, key }, "*");
    setTimeout(() => {
      if (waiting.delete(id)) resolve(null);
    }, 2000);
  });
const storageSet = (key, value) =>
  window.parent.postMessage({ type: "diddy:storage:set", key, value }, "*");
```

### Mitgelieferte Plugins

Unter Einstellungen > Plugins > „Built-in Plugins“ gibt es fertige Plugins zum Hinzufügen mit einem
Klick (ohne Konto, ohne Schlüssel): Uhr, Wetter, Fokus-Timer, Notizen, To-do, Währungsrechner,
Würfel und Kalender. Sie laufen in derselben Sandbox wie jedes andere Plugin, werden aber aus der
App selbst geladen (`srcdoc`, Adresse `diddy:builtin/<name>`). Ihre Quelltexte liegen in
`cinny/src/app/plugins/builtin/` und sind gute Vorlagen für eigene Plugins.

### Aussehen anpassen (Seitenleiste und eigenes CSS)

- **Karte in der Seitenleiste:** In Einstellungen > Plugins schaltest du „Sidebar“ an. Höhe und
  Zoom der kleinen Karte stellst du pro Plugin ein. Das gilt für **jedes** Plugin, ohne dass es
  mitmachen muss: Diddy kürzt und skaliert den Rahmen selbst.
- **Eigenes CSS:** Das Textfeld „Custom CSS“ (max. 4000 Zeichen) wird als `customCss` in
  `diddy:init` mitgeschickt. Diddy kann wegen der Sandbox nicht selbst in die Seite schreiben, das
  Plugin wendet es an, z. B. so: `style.textContent = data.customCss` in einem `<style>`-Element.
- **`layout: 'compact'`** sagt dem Plugin, dass es als kleine Karte läuft. Es sollte dann nur das
  Wichtigste in einer schlanken Zeile zeigen.

## Sicherheitsmodell

Ein Plugin ist fremder Code. Deshalb ist es so eingesperrt, dass es dem Konto nichts tun kann:

- **iframe mit `sandbox="allow-scripts"`, sonst nichts.** Insbesondere **kein**
  `allow-same-origin`: Die Seite bekommt einen undurchsichtigen Origin (`null`). Sie kann damit
  weder auf Diddys Fenster, DOM, localStorage, IndexedDB oder Cookies zugreifen noch auf ihren
  eigenen localStorage/Cookies. Matrix-Zugangsdaten und Schlüssel bleiben unerreichbar.
- **Kein** `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`: Das Plugin
  kann Diddy nicht wegnavigieren, keine Fenster öffnen, keine Formulare absenden und keine
  `alert()`/`confirm()`-Dialoge zeigen.
- **Berechtigungen gesperrt** über das `allow`-Attribut: Kamera, Mikrofon, Standort,
  Bildschirmaufnahme, Zwischenablage, Zahlungen, USB, Vollbild.
- `referrerpolicy="no-referrer"`: Der Plugin-Server erfährt nicht, von wo es geladen wurde.
- Diddy prüft **jede** eingehende Nachricht auf Herkunft (`event.source`) und Form und sendet
  einem Plugin in dieser Version **keinerlei Matrix-Daten** (keine Räume, Nachrichten,
  Nutzer-IDs, Tokens) — nur API-Version, Theme und Sprache.
- Nur `https://` (bzw. `http://localhost` zum Entwickeln) wird akzeptiert; Diddys eigene Adresse
  und interne `*.localhost`-Namen der Desktop-App sind gesperrt. Gespeicherte Einträge werden
  beim Laden erneut geprüft.

Was die Sandbox **nicht** verhindert und wofür der Nutzer selbst verantwortlich ist:

- Ein Plugin kann beliebige Netzwerkanfragen an Server stellen, die CORS erlauben, und beliebige
  Inhalte in seiner Karte anzeigen — auch irreführende (z. B. ein nachgebautes Login-Formular).
  Diddy fragt innerhalb von Plugins niemals nach Passwörtern. Nur Plugins aus vertrauenswürdiger
  Quelle hinzufügen.
- Der Betreiber der Plugin-Adresse kann den Inhalt jederzeit ändern.
- Ein Plugin kann innerhalb seines eigenen Rahmens zu einer anderen Seite navigieren; auch die
  läuft dann in derselben Sandbox.

Folgen für Plugin-Autoren:

- **Kein localStorage/IndexedDB/Cookies** (wirft `SecurityError`). Einstellungen am besten über
  Parameter in der Adresse übergeben, z. B. `…/weather.html?city=Hamburg`.
- **Keine `<form>`-Übermittlung** — Eingaben mit `button`-Klick bzw. Enter-Taste selbst
  verarbeiten.
- `fetch` funktioniert für APIs mit `Access-Control-Allow-Origin: *` (Anfragen kommen mit
  `Origin: null`), ohne Cookies.
- Links mit `target="_blank"` öffnen sich nicht.

Die Content Security Policy der Desktop-App (`src-tauri/tauri.conf.json`) erlaubt iframes von
`http:`/`https:` bereits über `default-src`; dafür war keine Änderung nötig.

## Minimales Gerüst

```html
<!DOCTYPE html>
<html>
  <body>
    <main id="app">Hallo aus meinem Plugin!</main>
    <script>
      const host = window.parent;
      const send = (message) =>
        host !== window && host.postMessage(message, "*");

      window.addEventListener("message", (event) => {
        if (event.source !== host) return;
        const data = event.data;
        if (!data || data.type !== "diddy:init" || data.apiVersion !== 1)
          return;
        document.documentElement.dataset.theme = data.theme; // 'dark' | 'light'
      });

      const app = document.getElementById("app");
      new ResizeObserver(() =>
        send({
          type: "diddy:resize",
          height: Math.ceil(app.getBoundingClientRect().height),
        })
      ).observe(app);

      send({ type: "diddy:ready", apiVersion: 1 });
    </script>
  </body>
</html>
```

Für `diddy:resize` die Höhe des **Inhalts** messen, nicht `document.documentElement.scrollHeight`:
Das Dokument ist immer mindestens so hoch wie der Rahmen, die Höhe könnte dann nur wachsen.

## Vollständiges Beispiel: Wetter

Die Datei liegt auch als [`docs/plugins/weather.html`](plugins/weather.html) im Repository. Sie
nutzt die kostenlose, schlüsselfreie [Open-Meteo-API](https://open-meteo.com) (Ortssuche +
Vorhersage), übernimmt Theme und Sprache aus `diddy:init`, meldet ihre Höhe per `diddy:resize`
und schreibt Daten aus dem Netz nur per `textContent` in die Seite. Der Ort kommt aus
`?city=…` (Standard: Berlin) und lässt sich in der Karte ändern.

```html
<!DOCTYPE html>
<!--
  Diddy example plugin: weather from Open-Meteo (https://open-meteo.com, no API key needed).
  One self-contained file. Host it anywhere over https (or run it locally, e.g.
  `python3 -m http.server 8000` in this folder -> http://localhost:8000/weather.html) and add the
  address under Settings > Plugins. Choose the place with ?city=Hamburg in the address.
  Plugin API: docs/plugins.md (apiVersion 1).
-->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Weather</title>
    <style>
      :root {
        --fg: #1d1d1f;
        --muted: rgba(0, 0, 0, 0.55);
        --card: rgba(0, 0, 0, 0.05);
        --line: rgba(0, 0, 0, 0.1);
        --accent: #007aff;
        --error: #d70015;
        color-scheme: light;
      }
      :root[data-theme="dark"] {
        --fg: #f5f5f7;
        --muted: rgba(255, 255, 255, 0.6);
        --card: rgba(255, 255, 255, 0.08);
        --line: rgba(255, 255, 255, 0.14);
        --accent: #0a84ff;
        --error: #ff6961;
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      html,
      body {
        margin: 0;
        background: transparent;
        color: var(--fg);
        font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      main {
        padding: 14px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .now {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .place {
        font-size: 16px;
        font-weight: 600;
      }
      .muted {
        color: var(--muted);
        font-size: 12px;
      }
      .temp {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 34px;
        font-weight: 300;
        white-space: nowrap;
      }
      .days {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .days li {
        background: var(--card);
        border-radius: 10px;
        padding: 8px;
        text-align: center;
      }
      .days .icon {
        font-size: 20px;
      }
      .search {
        display: flex;
        gap: 8px;
      }
      input,
      button {
        font: inherit;
        color: inherit;
        border-radius: 8px;
        border: 1px solid var(--line);
        padding: 6px 10px;
        background: var(--card);
      }
      input {
        flex: 1;
        min-width: 0;
      }
      button {
        background: var(--accent);
        border-color: transparent;
        color: #fff;
        cursor: pointer;
      }
      .error {
        color: var(--error);
        margin: 0;
      }
      [hidden] {
        display: none !important;
      }
      /* Small card in the Diddy sidebar (diddy:init says layout: "compact"): one slim row. */
      :root[data-layout="compact"] main {
        padding: 6px 8px;
        gap: 0;
      }
      :root[data-layout="compact"] .place {
        font-size: 13px;
      }
      :root[data-layout="compact"] .temp {
        font-size: 20px;
        gap: 4px;
      }
      :root[data-layout="compact"] #details {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      :root[data-layout="compact"] .days,
      :root[data-layout="compact"] .search,
      :root[data-layout="compact"] .credit {
        display: none;
      }
    </style>
  </head>
  <body>
    <main id="app">
      <section class="now">
        <div>
          <div class="place" id="place">Loading…</div>
          <div class="muted" id="details"></div>
        </div>
        <div class="temp">
          <span id="icon" aria-hidden="true"></span><span id="temp"></span>
        </div>
      </section>
      <ol class="days" id="days" aria-label="Forecast"></ol>
      <!-- no <form>: the Diddy sandbox does not allow form submission -->
      <div class="search">
        <input
          id="city"
          type="text"
          placeholder="City"
          aria-label="City"
          autocomplete="off"
        />
        <button id="go" type="button">Show</button>
      </div>
      <p class="error" id="error" role="alert" hidden></p>
      <div class="muted credit">Weather data by Open-Meteo.com</div>
    </main>

    <script>
      (() => {
        "use strict";

        const API_VERSION = 1;
        const host = window.parent; // Diddy, when we run inside it
        const embedded = host !== window;
        const $ = (id) => document.getElementById(id);

        // ---- talking to Diddy -------------------------------------------------------------
        // The frame has an opaque origin, so we cannot name Diddy's origin: '*' is used and
        // nothing private is ever sent. Incoming messages are only trusted from window.parent.
        const send = (message) => {
          if (embedded) host.postMessage(message, "*");
        };

        let locale = navigator.language || "en";

        const applyTheme = (theme) => {
          document.documentElement.dataset.theme =
            theme === "light" ? "light" : "dark";
        };
        applyTheme(
          window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
        );

        window.addEventListener("message", (event) => {
          if (event.source !== host) return;
          const data = event.data;
          if (!data || typeof data !== "object" || data.type !== "diddy:init")
            return;
          if (data.apiVersion !== API_VERSION) return; // a future Diddy may speak a newer version
          applyTheme(data.theme);
          // the user's own CSS for this plugin (Settings > Plugins > Custom CSS), applied as given
          let custom = document.getElementById("diddy-custom-css");
          if (!custom) {
            custom = document.createElement("style");
            custom.id = "diddy-custom-css";
            document.head.appendChild(custom);
          }
          custom.textContent =
            typeof data.customCss === "string" ? data.customCss : "";
          // "compact" = small sidebar card, "full" = the big card in Settings or the Plugins sheet
          document.documentElement.dataset.layout =
            data.layout === "compact" ? "compact" : "full";
          if (typeof data.locale === "string" && data.locale !== locale) {
            locale = data.locale;
            render();
          }
        });

        // Tell Diddy how tall we are whenever the content changes (it clamps to 80-600 px).
        // Measure the content, not the document: the document is always at least as tall as
        // the frame, so it could only ever grow.
        const app = $("app");
        let lastHeight = 0;
        const reportHeight = () => {
          const height = Math.ceil(app.getBoundingClientRect().height);
          if (height !== lastHeight) {
            lastHeight = height;
            send({ type: "diddy:resize", height });
          }
        };
        new ResizeObserver(reportHeight).observe(app);

        // ---- weather ----------------------------------------------------------------------
        // WMO weather interpretation codes, as used by Open-Meteo
        const CODES = {
          0: ["Clear sky", "☀️"],
          1: ["Mainly clear", "🌤️"],
          2: ["Partly cloudy", "⛅"],
          3: ["Overcast", "☁️"],
          45: ["Fog", "🌫️"],
          48: ["Rime fog", "🌫️"],
          51: ["Light drizzle", "🌦️"],
          53: ["Drizzle", "🌦️"],
          55: ["Heavy drizzle", "🌧️"],
          56: ["Freezing drizzle", "🌧️"],
          57: ["Freezing drizzle", "🌧️"],
          61: ["Light rain", "🌦️"],
          63: ["Rain", "🌧️"],
          65: ["Heavy rain", "🌧️"],
          66: ["Freezing rain", "🌧️"],
          67: ["Freezing rain", "🌧️"],
          71: ["Light snow", "🌨️"],
          73: ["Snow", "🌨️"],
          75: ["Heavy snow", "❄️"],
          77: ["Snow grains", "🌨️"],
          80: ["Rain showers", "🌦️"],
          81: ["Rain showers", "🌧️"],
          82: ["Violent showers", "⛈️"],
          85: ["Snow showers", "🌨️"],
          86: ["Snow showers", "❄️"],
          95: ["Thunderstorm", "⛈️"],
          96: ["Thunderstorm, hail", "⛈️"],
          99: ["Thunderstorm, hail", "⛈️"],
        };
        const describe = (code) => CODES[code] || ["Unknown", "🌡️"];

        let state; // { place, weather }

        const format = (fn, fallback) => {
          try {
            return fn(locale);
          } catch {
            return fn("en") ?? fallback;
          }
        };
        const temp = (value) =>
          `${format((l) =>
            new Intl.NumberFormat(l, { maximumFractionDigits: 0 }).format(value)
          )}°`;
        const weekday = (isoDate) => {
          const [y, m, d] = isoDate.split("-").map(Number);
          const date = new Date(y, m - 1, d);
          return format((l) =>
            new Intl.DateTimeFormat(l, { weekday: "short" }).format(date)
          );
        };

        // Only textContent is used: data from the network never becomes HTML.
        function render() {
          if (!state) return;
          const { place, weather } = state;
          const current = weather.current;
          const [text, icon] = describe(current.weather_code);
          $("place").textContent = [place.name, place.country]
            .filter(Boolean)
            .join(", ");
          $("details").textContent =
            `${text} · feels like ${temp(current.apparent_temperature)} · ` +
            `wind ${Math.round(current.wind_speed_10m)} km/h`;
          $("icon").textContent = icon;
          $("temp").textContent = temp(current.temperature_2m);

          const days = $("days");
          days.replaceChildren(
            ...weather.daily.time.map((day, i) => {
              const li = document.createElement("li");
              const name = document.createElement("div");
              name.className = "muted";
              name.textContent = i === 0 ? "Today" : weekday(day);
              const sym = document.createElement("div");
              sym.className = "icon";
              const [dayText, dayIcon] = describe(
                weather.daily.weather_code[i]
              );
              sym.textContent = dayIcon;
              sym.title = dayText;
              const range = document.createElement("div");
              range.textContent = `${temp(
                weather.daily.temperature_2m_max[i]
              )} / ${temp(weather.daily.temperature_2m_min[i])}`;
              li.append(name, sym, range);
              return li;
            })
          );
        }

        const showError = (message) => {
          $("error").textContent = message;
          $("error").hidden = !message;
        };

        const getJson = async (url) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        };

        async function load(city) {
          showError("");
          $("go").disabled = true;
          try {
            const geo = await getJson(
              `https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=en&name=${encodeURIComponent(
                city
              )}`
            );
            const place = geo.results && geo.results[0];
            if (!place) {
              showError(`No place called “${city}” found.`);
              return;
            }
            const weather = await getJson(
              "https://api.open-meteo.com/v1/forecast" +
                `?latitude=${place.latitude}&longitude=${place.longitude}` +
                "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
                "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
                "&timezone=auto&forecast_days=4"
            );
            state = { place, weather };
            $("city").value = place.name;
            render();
          } catch (error) {
            showError(
              "Could not load the weather. Check your connection and try again."
            );
            if ($("place").textContent === "Loading…")
              $("place").textContent = "Weather";
          } finally {
            $("go").disabled = false;
          }
        }

        const search = () => {
          const city = $("city").value.trim();
          if (city) load(city);
        };
        $("go").addEventListener("click", search);
        $("city").addEventListener("keydown", (event) => {
          if (event.key === "Enter") search();
        });

        // ---- start ------------------------------------------------------------------------
        const params = new URLSearchParams(location.search);
        load((params.get("city") || "Berlin").slice(0, 80));

        send({
          type: "diddy:ready",
          apiVersion: API_VERSION,
          manifest: {
            name: "Weather",
            description: "Forecast by Open-Meteo",
            height: 280,
          },
        });
        reportHeight();
      })();
    </script>
  </body>
</html>
```

## Fehlersuche

- **„This page does not talk to Diddy“**: Die Seite hat kein `diddy:ready` geschickt. Prüfen, ob
  das Skript läuft (Entwicklerwerkzeuge des iframes) und ob an `window.parent` gesendet wird.
- **Leere Karte**: Der Server verbietet das Einbetten (`X-Frame-Options` oder
  `Content-Security-Policy: frame-ancestors`) oder liefert die Datei nicht als `text/html` aus.
- **`fetch` schlägt fehl**: Die API muss CORS für `Origin: null` bzw. `*` erlauben.
- **Höhe springt nicht mit**: `diddy:resize` muss genau `{ type, height }` enthalten, keine
  weiteren Felder; `height` muss eine Zahl sein.
