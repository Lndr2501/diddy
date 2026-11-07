export type IntroStep = {
  title: string;
  lead: string;
  points: { label: string; text: string }[];
};

/** What a newcomer from Discord needs to know about Matrix; kept short and factual. */
export const INTRO_STEPS: IntroStep[] = [
  {
    title: 'Willkommen bei Matrix',
    lead: 'Diddy ist ein Chat-Programm für Matrix. Matrix ist ein offenes Netzwerk, das nicht einer Firma gehört – ähnlich wie E-Mail.',
    points: [
      {
        label: 'Server',
        text: 'Dein Konto liegt auf einem Server (z. B. matrix.tllx.eu). Der Server gehört nicht Diddy.',
      },
      {
        label: 'Dein Name',
        text: 'Du heißt @name:server. Der Teil nach dem Doppelpunkt ist dein Server.',
      },
      {
        label: 'Offen',
        text: 'Du kannst auch mit Leuten auf anderen Matrix-Servern schreiben (Föderation).',
      },
    ],
  },
  {
    title: 'Discord auf Matrix übersetzt',
    lead: 'Vieles kennst du schon, es heißt nur anders.',
    points: [
      {
        label: 'Discord-Server → Space',
        text: 'Ein „Space“ bündelt Räume, wie ein Discord-Server.',
      },
      {
        label: 'Kanal → Raum',
        text: 'Text- und Sprachkanäle sind „Räume“. Es gibt Räume mit Anruf (Call-Räume) für Sprache, Kamera und Bildschirm.',
      },
      { label: 'DM → Direktnachricht', text: 'Eins-zu-eins-Chats funktionieren wie auf Discord.' },
      {
        label: 'Rollen → Berechtigungen',
        text: 'Statt Rollen gibt es Rechte-Stufen (z. B. Admin, Moderator) pro Raum.',
      },
    ],
  },
  {
    title: 'Verschlüsselung und Schlüssel',
    lead: 'Private Räume sind Ende-zu-Ende verschlüsselt. Das ist sicherer, hat aber eine Eigenheit.',
    points: [
      {
        label: 'Nur Teilnehmer lesen mit',
        text: 'Auch der Server-Admin kann verschlüsselte Nachrichten nicht lesen.',
      },
      {
        label: 'Geräte verifizieren',
        text: 'Bestätige dein Gerät (Einstellungen → Geräte), damit alte Nachrichten lesbar bleiben.',
      },
      {
        label: 'Wiederherstellungsschlüssel',
        text: 'Speichere ihn gut. Ohne ihn und ohne ein anderes angemeldetes Gerät sind verschlüsselte Nachrichten verloren.',
      },
    ],
  },
  {
    title: 'Was Diddy kann',
    lead: 'Diddy ergänzt Matrix um Dinge, die du von Discord kennst.',
    points: [
      { label: 'Anrufe', text: 'Sprach-, Video- und Bildschirm-Anrufe mit Ton in Call-Räumen.' },
      {
        label: 'Profil',
        text: 'Eigene Profilkarte mit Banner, Badges, Schriftart und Status – sichtbar für andere Diddy-Nutzer.',
      },
      { label: 'Sprachnachrichten', text: 'Aufnehmen und senden direkt im Eingabefeld.' },
    ],
  },
  {
    title: 'Was anders ist',
    lead: 'Ehrlich gesagt: Einiges gibt es auf Matrix nicht oder anders.',
    points: [
      {
        label: 'Kein Nitro, keine Server-Boosts',
        text: 'Es gibt keine bezahlten Extras des Netzwerks.',
      },
      {
        label: 'Profil nur bei Diddy',
        text: 'Banner, Badges und Profilkarte sehen nur Nutzer, die auch Diddy mit demselben Datenraum nutzen. Andere Clients zeigen Name und Bild.',
      },
      {
        label: 'Server entscheidet mit',
        text: 'Dein Server legt fest, wer Räume erstellen darf, wie groß Dateien sein dürfen und ob Anrufe möglich sind.',
      },
      {
        label: 'Kein globaler Status',
        text: 'Online-Status und Aktivitäten sind begrenzt und hängen vom Server ab.',
      },
    ],
  },
];
