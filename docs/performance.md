# Performance-Plan

Stand 2026-11-14. Zusammengefasst aus vier Code-Analysen (iOS, Desktop-Oberfläche, Calls/Medien,
Start/Sync/Netzwerk). Nichts davon ist gemessen: Vor und nach jeder Änderung messen (Mac: Safari Web
Inspector bzw. Instruments mit Signposts; Zeitmarken in `app.log`). Jeder Punkt gilt für alle
Plattformen, auf denen das Problem besteht (siehe Spalte).

Abkürzungen: D = Desktop (macOS + Linux, `cinny/`), M = nur macOS (Tauri), L = nur Linux (Electron), I = iOS.

## 1. Schnelle Gewinne (großer Nutzen, kleiner Eingriff)

| # | Wo | Was | Plattform |
|---|---|---|---|
| 1 | `src-tauri/src/lib.rs` (localhost-Plugin), `electron/lib/staticServer.cjs` | Gehashte Assets (`/assets/*`, Element-Call-Assets) mit `Cache-Control: public, max-age=31536000, immutable` ausliefern. Heute `no-cache` bzw. 1 h, also werden bei jedem Start ~10 MB (JS + Crypto-WASM) neu gelesen. | D |
| 2 | `components/message/RenderBody.tsx` | `sanitizeCustomHtml` + HTML-Parser laufen bei jedem Render jeder Nachricht. `React.memo` + `useMemo` auf den Body. | D |
| 3 | `components/user-avatar/UserAvatar.tsx` | Jedes Avatar abonniert das ganze `speakingUsersAtom`; im Call zeichnet jeder Sprecherwechsel alle Avatare neu. Pro Nutzer `selectAtom`. | D |
| 4 | `plugins/diddy/profiles.ts`, `optionsRoom.ts` | Jede Profiländerung rendert alle Nachrichtenköpfe neu, jeder davon filtert alle Räume und parst `localStorage`. Light-Room-IDs und Options-Räume im Speicher cachen, Profil-Map pro Version. | D |
| 5 | `src-tauri/src/diag.rs` | `diag_log` ist synchron und läuft auf dem UI-Thread, beim Start hunderte Aufrufe. Async + Writer-Thread, weniger Zeilen im Profil-Backfill. Electron analog. | D |
| 6 | `components/SpecVersionsLoader.tsx` | Die ganze Oberfläche wartet auf `/versions` (offline bis 8 s). Letzte Antwort cachen, sofort rendern. | D |
| 7 | `App/AppModel.swift`, `MatrixAccount.start()` | Startbildschirm wartet auf `refreshProfile()` (2 Netzabfragen) und auf alle Konten. Früher freigeben, Profil im Hintergrund. | I |
| 8 | `DiddyProfiles.swift` (`diddyCheckedRooms`) | Bis zu 300 Marker-Abfragen nacheinander pro Kaltstart. Ergebnis speichern, 4–6 parallel, JSON abseits des Main Threads. | I |
| 9 | `MainView.swift`, `MatrixAccount.loadAllChannels` | Läuft mehrfach gleichzeitig (Start, Spaces, jede Rückkehr). Nur ein Lauf, TTL bei `resume`, Server parallel, einmal veröffentlichen. | I |
| 10 | `ChatView.swift`, `RoomPrefs.refreshNotifyLevels` | Jeder Chatwechsel fragt die Benachrichtigungsstufe aller Räume ab. Nur den offenen Raum. | I |
| 11 | `MatrixAccount.remember/resolveProfiles` | Jedes Mitglied wird einzeln in `@Published profiles` geschrieben. Erst sammeln, einmal zuweisen. | I |
| 12 | `ImageContent.tsx`, `ThumbnailContent.tsx`; iOS `MediaLoader.swift`, `TimelineController` | Verschlüsselte Bilder: immer das Original statt `thumbnail_file`, Desktop lädt bei jedem Mount neu und gibt Blob-URLs nie frei, iOS dekodiert in voller Größe auf dem Main Thread und der Cache hat keine Kostengrenze. Thumbnails nutzen, LRU-Cache (D), ImageIO-Verkleinerung + `totalCostLimit` (I). | D, I |
| 13 | `vite.config.ts` | 22 MB Source-Maps landen in der App. `sourcemap: 'hidden'`, Maps als CI-Artefakt. | D |

## 2. Calls

| # | Wo | Was | Plattform |
|---|---|---|---|
| 14 | `plugins/call/joinTiming.ts` | Host des Medienservers mitloggen (ohne Token). Element Call kann zu mehreren SFUs verbinden; grenzt #161 ein. | D |
| 15 | `CallWidgetDriver.ts`, `useCallEmbed.ts`; iOS `CallManager.swift` | Beitritt vorwärmen: OpenID-Token cachen, `prepareToEncrypt(room)`, DNS/TLS zum SFU anstoßen. | D, I |
| 16 | `CallManager.swift` (Beitritt) | Schritte laufen streng nacheinander. Token parallel zur SFU-Wahl, Mikrofonrecht vorab, nach `connect` Membership/Schlüssel/Mikro gleichzeitig. | I |
| 17 | `features/call/CallStage.tsx` | MutationObserver mit `style` im Filter feuert bei jeder Kachelanimation. `style` raus. | D |
| 18 | `useCallLatency.ts`, `streamStats.ts` | `getStats()` alle 1,5–3 s pro Verbindung. Ein gemeinsamer 5-s-Takt, Diagnose-Wächter seltener. | D |
| 19 | `CallEmbed.ts` (`feedEvent`) | Ereignisse aller Räume werden verarbeitet, inkl. Kopie der Timeline. Früh abbrechen bei fremdem Raum. | D |
| 20 | `codecPreference.ts` | H.264 wird auch unter Linux erzwungen (dort oft Software-Encoder). Nur unter macOS/WebKit. | L |
| 21 | `localSpeaking.ts` | Sprech-Erkennung alle 60 ms, auch stumm. 100 ms und aussetzen, wenn stumm. | D |
| 22 | `CallManager.didUpdateSpeakingParticipants` | Jede Sprecheränderung baut alle Mitglieder neu. Sprecher getrennt veröffentlichen, `CallMember` `Equatable`. | I |
| 23 | `CallEmbed.ts` (`feedToDevice`) | Call-Schlüssel vor der Widget-Freigabe gehen still verloren. Puffern und nachreichen. | D |

## 3. Größere Umbauten (großer Nutzen, mehr Aufwand)

| # | Wo | Was | Plattform |
|---|---|---|---|
| 24 | `features/room/RoomTimeline.tsx`, `message/Message.tsx` | Jedes Event rendert alle ~80 sichtbaren Nachrichten neu. `React.memo(Message)` mit stabilen Props. | D |
| 25 | `TimelineController.rebuild()`, `TimelineNavModel` | Jeder Diff baut alle Zeilen neu, zweimal über die FFI. Inkrementell nach `ListDiff`, nur bei Änderung veröffentlichen. Schnelle Teilgewinne: `RichSource.choose` mit Cache, Bot-Karten bei Edits cachen, Mention-Markdown cachen. | I |
| 26 | `ChatView.swift` | Jeder Tastendruck und jede Lesebestätigung zeichnet alle Zeilen neu. Eingabefeld als eigene View, `MessageRowView` `Equatable`, `rendered()`/`mentionsMe` vorberechnen, `saveDraft` entprellen. | I |
| 27 | `MatrixAccount` (Raumliste), ~90 Views mit `@ObservedObject account` | Jede Änderung fragt alle Räume neu ab und zeichnet alles neu. Nur geänderte Räume; Konto in Raum- und Profil-Store teilen bzw. `@Observable`. | I |
| 28 | `pages/Router.tsx`, `plugins/emoji.ts`, `builtinPlugins.ts` | Ein 4,3-MB-Start-Chunk; Emoji-Daten (880 KB) werden beim Start ausgewertet. `React.lazy` für Routen/Modals, Emoji-Daten und Plugins nachladen. Ziel < 2 MB. | D |
| 29 | `client/initMatrix.ts` | IndexedDB-Store ohne Worker, Init nacheinander. `workerFactory` wie Element Web, WASM früh laden, parallel starten. | D |
| 30 | `optionsRoom.ts`, `onboarding.ts`, `autoJoin.ts`; iOS `loadAllChannels` | Mehrere `/hierarchy`-Scans pro Space bei jedem Start und alle 10 min. Lokal prüfen, gemeinsamer Cache mit TTL, auf `m.space.child` reagieren. | D, I |
| 31 | `profiles.ts` (Backfill) | Options-Räume werden bei jedem Start neu geladen und entschlüsselt (2×150 Events). Ergebnis in IndexedDB, nur Delta. Vertrauensregeln (#207) beachten. | D |
| 32 | `src-tauri/src/lib.rs`, `electron/main.cjs` | Hintergrund-Drosselung immer aus. Electron dynamisch nur im Call; Tauri: Timer bei `document.hidden` ohne Call anhalten. | D |
| 33 | `components/diddy/Nameplate*` | `background-position`-Animation erzwingt Repaints, Videos laufen auch außerhalb des Bildes. `transform`-Animation, IntersectionObserver. | D |
| 34 | `sharedAudio.ts` | Mikrofon läuft durch einen Context mit `latencyHint: 'playback'` und Gerätetakt; bei 44,1 kHz fällt RNNoise still aus. Eigener 48-kHz-Context `interactive` fürs Mikro. Erst auf dem Mac prüfen (CoreAudio). | D |
| 35 | `callStage.ts` | Empfangene Videoqualität richtet sich nach unsichtbaren Element-Call-Kacheln. Erst messen (`receive watch`), dann angleichen oder pausieren. | D |

## 4. Kleinkram

- Link-Vorschauen erst laden, wenn sichtbar (`UrlPreviewCard.tsx`); Rust/Electron-Fetch nach `</head>` bzw. 256 KB abbrechen, HTTP-Client wiederverwenden.
- `backdrop-filter` im Scrollinhalt (`DayPill` u. a.) durch feste Farbe ersetzen, vorher messen.
- Agent Voice: Tastenzustand nicht alle 60 ms per IPC pollen, sondern aus Rust melden.
- Electron-Fensterzustand und Tauri-`keep_window_on_screen` entprellen.
- `[profile.release]` mit `lto = "thin"`, `codegen-units = 1`, `strip = true` (längerer Mac-Build).
- iOS: animierte Avatare nur bei großen Bildern prüfen, höchstens 2 gleichzeitig.
- iOS: Server-Badges einmal pro Raumänderung vorberechnen.
- Twemoji-Font (1,9 MB) wird nie benutzt, kann raus.

## Offene Entscheidung

- **Update-Check vor dem Start (macOS):** Das Hauptfenster wartet bis zu 3 s auf GitHub und baut dafür ein
  verstecktes WebView (`updater.rs`). Parallel prüfen würde den Start beschleunigen, widerspricht aber der
  bewussten Entscheidung aus #120 („erst Update, dann Start“).
