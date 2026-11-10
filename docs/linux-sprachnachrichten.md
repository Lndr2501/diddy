# Linux-Sprachnachrichten (#137)

Stand: 10.11.2026. Automatisierte Prüfung des Chromium-Aufnahmepfads; die Abnahme
auf einem echten X11- und Wayland-Desktop steht weiter aus. Verbindungsprofile und
App-Icon aus #137 gehören nicht zu dieser Prüfung.

## Automatische Prüfungen

- `cd cinny && npm test`: Der Aufnahme-Hook wird mit verzögerter Mikrofonfreigabe
  geprüft. Abbruch und Unmount stoppen auch ein nachträglich geliefertes Mikrofon;
  doppelte Starts fordern nur einmal Zugriff an. Abbruch und Recorder-Fehler lösen
  wartende Stop-Aufrufe auf und entfernen alte Ereignishandler.
- `cd cinny && npm run test:e2e -- voice-recorder`: Nach dem Web-Build prüft Playwright
  den echten Aufnahme-Hook mit einem synthetischen Sinuston als Mikrofon und echtem
  Chromium-MediaRecorder. Geprüft werden WebM-Ausgabe, Dauer, Wellenform,
  Freigabe des Mikrofon-Tracks, Dekodierung, laufende Wiedergabe und Springen.
  Die macOS-Audiobrücke ist im Test durch „nicht verfügbar“ ersetzt. Es werden keine
  privaten Aufnahmen oder Matrix-Konten verwendet.

Chromium kann bei WebM zunächst `Infinity` als Containerdauer melden. Diddy verwendet
bis zu einer endlichen Dauer die Matrix-Metadaten. Allein dieser Wert belegt keinen
Fehler beim Springen; der Browsertest prüft das tatsächliche Wiedergabeverhalten.

## Noch auf echten Linux-Geräten prüfen

Je einmal unter X11 und Wayland, mit Angabe von Distribution, Desktop, Diddy-Version
und Paketformat (AppImage/DEB/RPM/Nix):

1. Mikrofon erlauben, mindestens fünf Sekunden sprechen, senden; dieselbe Nachricht
   in Diddy und Element abspielen. In Mitte und Ende der Wellenform springen.
2. Dasselbe in einem verschlüsselten Raum prüfen und auf einem zweiten Gerät hören.
3. Aufnahme verwerfen, kürzer als eine halbe Sekunde aufnehmen und während einer
   Aufnahme den Raum wechseln: nichts senden, Mikrofonanzeige des Systems endet.
4. Während einer noch offenen Mikrofonfreigabe den Raum wechseln; danach erlauben:
   keine nachträgliche Aufnahme, keine dauerhaft aktive Mikrofonanzeige.
5. Zugriff verweigern und danach erneut erlauben; Aufnahme muss wieder möglich sein.
6. Mikrofon während einer Aufnahme abziehen bzw. das Gerät deaktivieren: Die
   Aufnahme endet mit einem Hinweis, dass sie nicht gespeichert wurde. Auch das
   15-Minuten-Limit zeigt einen solchen Hinweis (kein automatisches Senden).
7. Zwei Aufnahmen nacheinander senden und nach einem App-Neustart erneut abspielen.

Erst diese Ergebnisse rechtfertigen ein ✅ in der Plattformtabelle. Der synthetische
Browsertest belegt weder reale Geräte-/Berechtigungsdialoge noch Electron-Paketierung,
Matrix-Upload, Verschlüsselung oder Interoperabilität mit Element.
