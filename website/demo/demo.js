/* Diddy demo: a clickable mock of the app with made-up people and messages.
   Nothing here talks to a Matrix server. Plugins in plugins/ are the real built-in ones. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- icons (Lucide, ISC)
  const P = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    micOff: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/><line x1="2" x2="22" y1="2" y2="22"/>',
    headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    headphonesOff: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/><line x1="2" x2="22" y1="2" y2="22"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    videoOff: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/><line x1="2" x2="22" y1="2" y2="22"/>',
    share: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 13V7"/><path d="m9 10 3-3 3 3"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    moreH: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    play: '<path d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    skipF: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
    skipB: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    wave: '<path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  };
  const ic = (name, cls = '') =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

  // ---------------------------------------------------------------- helpers
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clockNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let uid = 100;
  const nextId = () => `m${++uid}`;

  // ---------------------------------------------------------------- themes
  // Same values as cinny/src/colors.css.ts; red/green/purple/amber are built like darkPalette().
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
  const mix = (a, b, t) => {
    const x = hex(a);
    const y = hex(b);
    return toHex(x.map((v, i) => v + (y[i] - v) * t));
  };
  const lum = (h) => {
    const [r, g, b] = hex(h).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const palette = (name, bg, accent, text) => ({
    name,
    window: mix(bg, '#000000', 0.35),
    nav: bg,
    surface: mix(bg, '#FFFFFF', 0.07),
    raised: mix(bg, '#FFFFFF', 0.13),
    text,
    accent,
    onAccent: lum(accent) > 0.4 ? '#141414' : '#FFFFFF',
    accentSoft: mix(bg, accent, 0.3),
    onAccentSoft: mix(accent, '#FFFFFF', 0.7),
    tint: '#FFFFFF',
  });
  const THEMES = {
    light: { name: 'Light', window: '#E2E2E6', nav: '#F2F2F2', surface: '#FFFFFF', raised: '#ECECEF', text: '#141414', accent: '#1858D5', onAccent: '#FFFFFF', accentSoft: '#DCE6FA', onAccentSoft: '#0F3A91', tint: '#000000', light: true },
    silver: { name: 'Silver', window: '#C9C9C9', nav: '#DEDEDE', surface: '#EAEAEA', raised: '#D6D6D6', text: '#000000', accent: '#1245A8', onAccent: '#FFFFFF', accentSoft: '#C4D0E9', onAccentSoft: '#0D3076', tint: '#000000', light: true },
    dark: { name: 'Dark', window: '#111111', nav: '#1A1A1A', surface: '#262626', raised: '#333333', text: '#F2F2F2', accent: '#BDB6EC', onAccent: '#2C2843', accentSoft: '#413C65', onAccentSoft: '#E3E1F7', tint: '#FFFFFF' },
    butter: { name: 'Butter', window: '#121110', nav: '#1A1916', surface: '#262621', raised: '#33322C', text: '#FFFBDE', accent: '#FFFBDE', onAccent: '#1A1916', accentSoft: '#403F38', onAccentSoft: '#F2EED3', tint: '#FFFFFF' },
    diddy: { name: 'Diddy', window: '#140916', nav: '#201723', surface: '#1A1820', raised: '#272429', text: '#EFEAF2', accent: '#E5517C', onAccent: '#FFFFFF', accentSoft: '#5A2640', onAccentSoft: '#F6D4E2', tint: '#FFFFFF' },
    red: palette('Red', '#140909', '#FF4D5A', '#F7E9E9'),
    green: palette('Green', '#07120C', '#42E08C', '#E8F6EE'),
    purple: palette('Purple', '#0F0818', '#B26BFF', '#EFE8F9'),
    amber: palette('Amber', '#130C03', '#FFA726', '#FBEFD9'),
    daaark: { name: 'DAAARK', window: '#000000', nav: '#111111', surface: '#000000', raised: '#1A1A1A', text: '#F5F5F5', accent: '#346BF1', onAccent: '#FFFFFF', accentSoft: '#0D1A3A', onAccentSoft: '#C5D5FB', tint: '#FFFFFF' },
  };

  // ---------------------------------------------------------------- people + rooms (made up)
  const ME = 'me';
  const users = {
    me: { name: 'Alex', id: '@alex:diddy.example', av: '#FFB86B', color: '#FFB86B', status: 'Online', bio: 'Just looking around.', pron: 'they/them', badges: [['🧪', 'Demo visitor']], banner: 'linear-gradient(120deg,#ff9a5a,#e5517c 60%,#7a5cff)', effect: 'none', plate: 'none', ring: false },
    mara: { name: 'Mara', id: '@mara:diddy.example', av: '#7FC8F8', color: '#B98CFF', status: 'Online', role: 'Founder', bio: 'Made this space. Movie nights on Fridays. 🎬', pron: 'she/her', badges: [['👑', 'Founder'], ['🎨', 'Theme nerd'], ['🌙', 'Night owl']], banner: 'linear-gradient(120deg,#2b6cff,#9a4dff 50%,#ff4d9a)', effect: 'glow', plate: 'aurora', ring: true },
    jonas: { name: 'Jonas', id: '@jonas:diddy.example', av: '#F59AE7', color: '#5ED6C7', status: 'Online', bio: 'Snacks department.', pron: 'he/him', badges: [['🍿', 'Snack lead']], banner: 'linear-gradient(120deg,#11998e,#38ef7d)', effect: 'none', plate: 'none', ring: false },
    luis: { name: 'Luis', id: '@luis:diddy.example', av: '#6EF2C8', color: '#FF9B6B', status: 'Streaming', bio: 'Shares his screen way too often.', pron: 'he/him', badges: [['📺', 'Streamer'], ['🧪', 'Early tester']], banner: 'linear-gradient(180deg,#0f1440,#5a2a7a 50%,#ff7a59)', effect: 'shadow', plate: 'sunset', ring: false },
    anton: { name: 'Anton', id: '@anton:diddy.example', av: '#FF8BA7', color: '#FF8BA7', status: 'Talking to an agent', bio: 'Builds voice agents. Ask me about them.', pron: 'he/him', badges: [['🤖', 'Agent tinkerer']], banner: 'linear-gradient(120deg,#232526,#414345)', effect: 'outline', plate: 'matrix', ring: false },
    kim: { name: 'Kim', id: '@kim:diddy.example', av: '#C6F68D', color: '#9FD86B', status: 'Offline', off: true, bio: 'Probably asleep.', pron: 'she/her', badges: [], banner: 'linear-gradient(120deg,#30cfd0,#330867)', effect: 'none', plate: 'stars', ring: false },
    jukebox: { name: 'Jukebox', id: '@jukebox:diddy.example', av: '#C9B8FF', color: '#C9B8FF', status: 'Bot', bot: true, bio: 'Plays music in voice rooms. Try the buttons on my cards.', pron: '', badges: [['🤖', 'Bot']], banner: 'linear-gradient(120deg,#ff6fa5,#7a5cff 60%,#2bd9a8)', effect: 'none', plate: 'none', ring: false },
  };

  const T = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const rooms = {
    general: {
      name: 'general', kind: 'text', topic: 'Everything and nothing', members: ['mara', 'jonas', 'luis', 'anton', 'kim', 'jukebox', ME],
      msgs: [
        { id: 'g1', u: 'jonas', t: T(19, 2), text: 'Does voice actually work on macOS now? Cinny just hung when joining for me.' },
        { id: 'g2', u: 'mara', t: T(19, 3), text: 'Yep. And with "Voice processing" off, the mic skips Apple\'s voice processing, so your music doesn\'t get quieter anymore.', react: { '🙌': ['jonas', 'luis'] } },
        { id: 'g3', u: 'jonas', t: T(19, 4), text: 'And themes?' },
        { id: 'g4', u: 'mara', t: T(19, 4), text: 'Ten of them, from Light to DAAARK. Try "Diddy". 🎨', react: { '🎨': ['jonas'] } },
        { id: 'g5', u: 'luis', t: T(19, 6), kind: 'voice', dur: 9, text: 'Voice message' },
        { id: 'g6', u: 'jonas', t: T(19, 7), text: 'Screen sharing with sound works too, right?', reply: 'g5' },
        { id: 'g7', u: 'luis', t: T(19, 7), text: 'With system audio, yes. Diddy\'s own call sounds are left out. Movie night at eight? 🍿' },
        { id: 'g8', u: 'mara', t: T(19, 8), text: 'I\'m already in the Lounge. Jump in. 🎧', react: { '🎬': ['luis', 'anton'], '❤️': ['jonas'] } },
      ],
    },
    ideas: {
      name: 'ideas', kind: 'text', topic: 'Wishes for Diddy', members: ['mara', 'jonas', 'luis', 'anton', ME],
      msgs: [
        { id: 'i1', u: 'anton', t: T(17, 40), text: 'Could the call show when I\'m talking to my voice agent instead of to you?' },
        { id: 'i2', u: 'mara', t: T(17, 44), text: 'It does now: "Talking to an agent" sits big on your tile.', react: { '🤖': ['anton'] } },
        { id: 'i3', u: 'jonas', t: T(17, 51), text: 'Profile cards with badges are my favourite thing. Everyone with Diddy sees them.' },
        { id: 'i4', u: 'luis', t: T(18, 3), text: 'Plugins! Dice, clock, timer, to-do. They run in a sealed sandbox.' },
      ],
    },
    music: {
      name: 'music-and-sound', kind: 'text', topic: 'Jukebox lives here', members: ['mara', 'luis', 'jukebox', ME],
      msgs: [
        { id: 'u1', u: 'luis', t: T(18, 30), text: '/play night drive' },
        { id: 'u2', u: 'jukebox', t: T(18, 30), kind: 'card' },
        { id: 'u3', u: 'mara', t: T(18, 32), text: 'Bots can post real cards with buttons. Press skip. 👀' },
      ],
    },
    lounge: { name: 'Lounge', kind: 'voice', topic: 'Voice room', members: ['mara', 'jonas', 'luis', 'anton', ME], people: ['mara', 'luis', 'jonas', 'anton'] },
    movie: { name: 'Movie night', kind: 'voice', topic: 'Voice room', members: ['mara', 'luis', ME], people: [] },
    dm_mara: {
      name: 'Mara', kind: 'dm', topic: 'Direct message · encrypted', members: ['mara', ME], dm: 'mara',
      msgs: [{ id: 'd1', u: 'mara', t: T(18, 12), text: 'Hey! Welcome to the demo. 👋 Click my name to see my profile card, or write me something.' }],
    },
  };
  const TEXT_ORDER = ['general', 'ideas', 'music'];
  const VOICE_ORDER = ['lounge', 'movie'];

  const TRACKS = [
    { title: 'Night Drive', artist: 'Neon Harbor', len: 214 },
    { title: 'Paper Planets', artist: 'Moss & Mirrors', len: 187 },
    { title: 'Late Bus Home', artist: 'Kiosk Club', len: 243 },
    { title: 'Velvet Static', artist: 'Halcyon Tapes', len: 199 },
  ];

  // ---------------------------------------------------------------- state
  const state = {
    theme: 'diddy',
    room: 'general',
    unread: { ideas: 2 },
    drawerOpen: window.innerWidth > 1180,
    drawerTab: 'members',
    call: null, // { room }
    muted: false,
    deafened: false,
    preDeafMuted: false,
    camera: false,
    sharing: false,
    systemAudio: true,
    noise: true,
    focus: null,
    replyTo: null,
    recording: null,
    typing: null,
    outage: false,
    sounds: { join: true, leave: true, mute: true, deafen: true, message: true, stream: true },
    plugins: { dice: true, clock: true, todo: false, timer: false },
    jukebox: { i: 0, pos: 63, playing: true, vol: 70 },
    voicePlaying: null, // { id, pos }
  };

  // ---------------------------------------------------------------- sounds (the real app sounds)
  const SOUND_FILES = {
    join: 'user_join', leave: 'disconnect', other_join: 'user_join', other_leave: 'user_leave', mute: 'mute', unmute: 'unmute',
    deafen: 'deafen', undeafen: 'undeafen', message: 'message1', stream_start: 'stream_started', stream_end: 'stream_ended', calling: 'call_calling',
  };
  const SOUND_GROUP = { join: 'join', other_join: 'join', leave: 'leave', other_leave: 'leave', mute: 'mute', unmute: 'mute', deafen: 'deafen', undeafen: 'deafen', message: 'message', stream_start: 'stream', stream_end: 'stream', calling: 'join' };
  const audioCache = {};
  function sound(key) {
    const group = SOUND_GROUP[key];
    if (group && !state.sounds[group]) return;
    if (state.deafened && key !== 'undeafen') return;
    try {
      const a = audioCache[key] || (audioCache[key] = new Audio(`sounds/${SOUND_FILES[key]}.mp3`));
      a.volume = 0.45;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {
      /* audio not available */
    }
  }

  // ---------------------------------------------------------------- avatars + names
  function avatar(u, size = 36, opts = {}) {
    const p = users[u];
    const dot = opts.dot ? `<span class="av__dot ${p.off ? 'is-off' : ''} ${p.status === 'Talking to an agent' ? 'is-idle' : ''}"></span>` : '';
    const ring = p.ring && opts.ring !== false ? 'has-ring' : '';
    const inner = p.bot ? ic('bot') : esc(p.name[0]);
    return `<span class="av ${ring}" style="--s:${size}px;background:${p.av}">${inner}${dot}</span>`;
  }
  function nameEl(u, tag = 'span', extra = '') {
    const p = users[u];
    const eff = p.effect && p.effect !== 'none' ? `nm--${p.effect}` : '';
    const color = p.color === 'rainbow' ? '' : `color:${p.color}`;
    const grad = p.color === 'rainbow' ? 'nm--gradient' : '';
    const attrs = tag === 'button' ? `type="button" data-profile="${u}"` : '';
    return `<${tag} class="nm ${eff} ${grad} ${extra}" style="${color}" ${attrs}>${esc(p.name)}</${tag}>`;
  }

  // ---------------------------------------------------------------- theme
  function applyTheme(id) {
    const t = THEMES[id] || THEMES.diddy;
    state.theme = id;
    const r = document.documentElement.style;
    r.setProperty('--window', t.window);
    r.setProperty('--nav', t.nav);
    r.setProperty('--surface', t.surface);
    r.setProperty('--raised', t.raised);
    r.setProperty('--text', t.text);
    r.setProperty('--accent', t.accent);
    r.setProperty('--on-accent', t.onAccent);
    r.setProperty('--accent-soft', t.accentSoft);
    r.setProperty('--on-accent-soft', t.onAccentSoft);
    r.setProperty('--tint', t.tint);
    r.colorScheme = t.light ? 'light' : 'dark';
    document.body.className = `theme-${id}`;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = t.window;
    try {
      localStorage.setItem('diddy-demo-theme', id);
    } catch {
      /* storage blocked */
    }
    pluginTheme();
  }

  // ---------------------------------------------------------------- render: sidebar
  function renderSide() {
    const item = (id) => {
      const r = rooms[id];
      const active = state.room === id;
      const unread = state.unread[id];
      const iconName = r.kind === 'voice' ? 'volume' : 'hash';
      let html = `<button class="navitem ${active ? 'is-active' : ''} ${unread ? 'is-unread' : ''} ${r.kind === 'voice' ? 'voice-room' : ''}" type="button" data-room="${id}">${ic(iconName)}<span class="navitem__name">${esc(r.name)}</span>${unread ? `<span class="pill">${unread}</span>` : ''}</button>`;
      if (r.kind === 'voice') {
        const people = callPeople(id);
        if (people.length) {
          html += `<div class="callers">${people
            .map((u) => {
              const muted = isMuted(u);
              const live = (u === 'luis' && id === 'lounge') || (u === ME && state.sharing);
              return `<button class="caller" type="button" data-profile="${u}">${avatar(u, 22, { ring: false })}<span class="name">${esc(users[u].name)}</span>${live ? '<span class="live">LIVE</span>' : ''}${muted ? `<span class="muted-ico" title="Muted">${ic('micOff')}</span>` : ''}</button>`;
            })
            .join('')}</div>`;
        }
      }
      return html;
    };
    const dmUnread = state.unread.dm_mara;
    $('#roomList').innerHTML = `
      <button class="navitem" type="button" data-act="soon-create">${ic('plus')}<span class="navitem__name">Create Room</span></button>
      <button class="navitem" type="button" data-act="search">${ic('search')}<span class="navitem__name">Message Search</span></button>
      <div class="group-label">${ic('chev', 'sm')}Rooms</div>
      ${TEXT_ORDER.map(item).join('')}
      <div class="group-label">${ic('chev', 'sm')}Voice</div>
      ${VOICE_ORDER.map(item).join('')}
      <div class="group-label">${ic('chev', 'sm')}Direct messages</div>
      <button class="navitem ${state.room === 'dm_mara' ? 'is-active' : ''} ${dmUnread ? 'is-unread' : ''}" type="button" data-room="dm_mara">${avatar('mara', 22, { ring: false })}<span class="navitem__name">Mara</span>${dmUnread ? `<span class="pill">${dmUnread}</span>` : ''}</button>`;
    $$('.group-label .icon').forEach((i) => {
      i.style.width = '14px';
      i.style.height = '14px';
    });

    $('#voiceDock').innerHTML = state.call
      ? `<div class="voicedock"><div class="voicedock__text"><b>Voice connected</b><span>${esc(rooms[state.call.room].name)} · Diddy Crew</span></div>
          <button class="ibtn" type="button" data-act="toggleShare" title="${state.sharing ? 'Stop sharing' : 'Share screen'}">${ic('share')}</button>
          <button class="ibtn" type="button" data-act="leave" title="Disconnect" style="color:var(--critical)">${ic('phone', 'rot')}</button></div>`
      : '';
    const rot = $('#voiceDock .rot');
    if (rot) rot.style.transform = 'rotate(135deg)';

    const me = users[ME];
    $('#userPanel').innerHTML = `
      <button class="userpanel__who" type="button" data-act="accountMenu" title="Account menu">${avatar(ME, 36, { dot: true })}
        <span style="min-width:0">${nameEl(ME, 'span', 'userpanel__name')}<span class="userpanel__status">${state.call ? 'In a call' : 'Online'}</span></span></button>
      <button class="ibtn ${state.muted ? 'is-off' : ''}" type="button" data-act="mute" title="${state.muted ? 'Unmute' : 'Mute'}" style="${state.muted ? 'color:var(--critical)' : ''}">${ic(state.muted ? 'micOff' : 'mic')}</button>
      <button class="ibtn" type="button" data-act="deafen" title="${state.deafened ? 'Undeafen' : 'Deafen (mic and sound)'}" style="${state.deafened ? 'color:var(--critical)' : ''}">${ic(state.deafened ? 'headphonesOff' : 'headphones')}</button>
      <button class="ibtn" type="button" data-act="settings" title="Settings">${ic('settings')}</button>`;
    void me;
  }

  // ---------------------------------------------------------------- call helpers
  function callPeople(roomId) {
    const base = [...(rooms[roomId].people || [])];
    if (state.call && state.call.room === roomId) base.push(ME);
    return base;
  }
  function isMuted(u) {
    if (u === ME) return state.muted;
    return u === 'jonas';
  }

  // ---------------------------------------------------------------- render: main
  function renderMain() {
    const r = rooms[state.room];
    const main = $('#main');
    const iconName = r.kind === 'voice' ? 'volume' : r.kind === 'dm' ? 'lock' : 'hash';
    const head = `
      <div class="room-head">
        <button class="ibtn ibtn--menu" type="button" data-act="openSide" title="Rooms">${ic('menu')}</button>
        ${r.kind === 'dm' ? avatar(r.dm, 34, { ring: false }) : `<span class="room-head__icon">${ic(iconName)}</span>`}
        <div class="room-head__title"><b>${esc(r.name)}</b><span>· ${r.members.length} members · ${esc(r.topic)}</span></div>
        ${r.kind !== 'voice' ? `<button class="ibtn" type="button" data-act="startCall" title="Start a call">${ic('phone')}</button>` : ''}
        <button class="ibtn" type="button" data-act="search" title="Search">${ic('search')}</button>
        <button class="ibtn" type="button" data-act="pins" title="Pinned messages">${ic('pin')}</button>
        <button class="ibtn ${state.drawerOpen ? 'is-on' : ''}" type="button" data-act="drawer" title="Participants and plugins">${ic('users')}</button>
      </div>`;
    if (r.kind === 'voice') {
      main.innerHTML = head + renderCall();
      if (state.call && state.call.room === state.room) layoutGrid();
    } else {
      main.innerHTML = `${head}<div class="timeline" id="timeline">${renderTimeline()}</div><div class="typing" id="typing"></div>${renderComposer()}`;
      const tl = $('#timeline');
      tl.scrollTop = tl.scrollHeight;
      renderTyping();
      const ta = $('#composerInput');
      if (ta && window.innerWidth > 820) ta.focus({ preventScroll: true });
    }
    if (state.outage) main.insertAdjacentHTML('beforeend', outageHtml());
  }

  function renderTimeline() {
    const r = rooms[state.room];
    const intro = `<div class="room-intro">${r.kind === 'dm' ? avatar(r.dm, 56, { ring: false }) : `<span class="room-head__icon" style="width:56px;height:56px;border-radius:16px">${ic('hash')}</span>`}
      <h2>${r.kind === 'dm' ? esc(r.name) : `#${esc(r.name)}`}</h2><p>${r.kind === 'dm' ? 'This conversation is end-to-end encrypted.' : `This is the start of #${esc(r.name)}. ${esc(r.topic)}.`}</p></div>
      <div class="daysep">Today</div>`;
    let prev = null;
    return (
      intro +
      r.msgs
        .map((m) => {
          if (m.kind === 'notice') {
            prev = null;
            return `<div class="notice">${m.html}</div>`;
          }
          const cont = prev && prev.u === m.u && !m.reply && m.kind !== 'card';
          prev = m;
          return msgHtml(m, cont);
        })
        .join('')
    );
  }

  function msgHtml(m, cont) {
    const p = users[m.u];
    const replied = m.reply ? rooms[state.room].msgs.find((x) => x.id === m.reply) : null;
    const replyHtml = replied
      ? `<div class="msg__reply">${ic('reply')}${nameEl(replied.u)}<span>${esc(replied.kind === 'voice' ? '🎤 Voice message' : replied.text || '')}</span></div>`
      : '';
    let body = '';
    if (m.kind === 'voice') body = voiceHtml(m);
    else if (m.kind === 'card') body = jukeboxCard();
    else body = `<div class="msg__text">${formatText(m.text)}</div>`;
    const reacts = m.react && Object.keys(m.react).length
      ? `<div class="reactions">${Object.entries(m.react)
          .map(([e, who]) => `<button class="react ${who.includes(ME) ? 'is-mine' : ''}" type="button" data-react="${m.id}" data-emoji="${e}" title="${esc(who.map((w) => users[w].name).join(', '))}">${e}<b>${who.length}</b></button>`)
          .join('')}</div>`
      : '';
    const mention = /@alex\b/i.test(m.text || '') && m.u !== ME;
    return `<div class="msg ${cont ? 'is-cont' : ''} ${mention ? 'is-hl' : ''}" data-msg="${m.id}">
      <div class="msg__gutter">${cont ? '' : `<button type="button" data-profile="${m.u}" aria-label="${esc(p.name)}">${avatar(m.u, 40)}</button>`}</div>
      <div class="msg__body">${replyHtml}${cont ? '' : `<div class="msg__meta">${nameEl(m.u, 'button')}${p.bot ? '<span class="botbadge">Bot</span>' : ''}<span class="msg__time">${m.t}</span></div>`}${body}${reacts}</div></div>`;
  }

  function formatText(t) {
    return esc(t).replace(/@(alex|mara|jonas|luis|anton|kim)\b/gi, (_, n) => `<span class="mention">@${n[0].toUpperCase()}${n.slice(1).toLowerCase()}</span>`);
  }

  const WAVE_BARS = 34;
  const waveCache = {};
  function waveHeights(id) {
    if (!waveCache[id]) {
      let seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 7);
      waveCache[id] = Array.from({ length: WAVE_BARS }, (_, i) => {
        seed = (seed * 9301 + 49297) % 233280;
        const env = Math.sin((i / WAVE_BARS) * Math.PI) * 0.6 + 0.4;
        return Math.max(4, Math.round((seed / 233280) * 26 * env));
      });
    }
    return waveCache[id];
  }
  function voiceHtml(m) {
    const playing = state.voicePlaying && state.voicePlaying.id === m.id;
    const pos = playing ? state.voicePlaying.pos : 0;
    const done = Math.round((pos / m.dur) * WAVE_BARS);
    return `<div class="voice" data-voice="${m.id}">
      <button class="voice__play" type="button" data-act="voicePlay" data-id="${m.id}" aria-label="${playing ? 'Pause' : 'Play'} voice message">${ic(playing ? 'pause' : 'play')}</button>
      <div class="voice__wave" data-act="voicePlay" data-id="${m.id}">${waveHeights(m.id).map((h, i) => `<i style="height:${h}px" class="${i < done ? 'is-done' : ''}"></i>`).join('')}</div>
      <span class="voice__time">${mmss(playing ? pos : m.dur)}</span></div>`;
  }

  function jukeboxCard() {
    const j = state.jukebox;
    const tr = TRACKS[j.i];
    const pct = Math.min(100, (j.pos / tr.len) * 100);
    const queue = [1, 2].map((k) => TRACKS[(j.i + k) % TRACKS.length]);
    return `<div class="botcard">
      <div class="botcard__top"><div class="botcard__art ${j.playing ? 'is-playing' : ''}">${ic('music')}</div>
        <div style="min-width:0"><div class="botcard__eyebrow">${j.playing ? 'Now playing in Lounge' : 'Paused'}</div>
        <div class="botcard__title">${esc(tr.title)}</div><div class="botcard__sub">${esc(tr.artist)} · requested by Luis</div></div></div>
      <div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="botcard__times"><span>${mmss(j.pos)}</span><span>${mmss(tr.len)}</span></div>
      <div class="botcard__btns">
        <button class="cbtn" type="button" data-act="jbPrev" aria-label="Previous">${ic('skipB')}</button>
        <button class="cbtn cbtn--accent" type="button" data-act="jbPlay">${ic(j.playing ? 'pause' : 'play')}${j.playing ? 'Pause' : 'Play'}</button>
        <button class="cbtn" type="button" data-act="jbNext" aria-label="Skip">${ic('skipF')}Skip</button>
        <button class="cbtn" type="button" data-act="jbVol">${ic('volume')}${j.vol}%</button>
      </div>
      <ol class="botcard__queue"><li><span></span><span style="font-weight:650;color:var(--text-3);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em">Up next</span></li>
        ${queue.map((q, k) => `<li><span>${k + 1}</span><span>${esc(q.title)} · ${esc(q.artist)}</span></li>`).join('')}</ol></div>`;
  }

  function renderComposer() {
    const r = rooms[state.room];
    if (state.recording) {
      return `<div class="composer"><div class="rec"><span class="rec__dot"></span><span class="rec__time" id="recTime">${mmss(state.recording.secs)}</span>
        <div class="rec__wave" id="recWave"></div>
        <button class="ibtn" type="button" data-act="recCancel" title="Discard">${ic('trash')}</button>
        <button class="sendbtn" type="button" data-act="recSend" title="Send voice message">${ic('send')}</button></div></div>`;
    }
    const reply = state.replyTo ? r.msgs.find((m) => m.id === state.replyTo) : null;
    return `<div class="composer">
      ${reply ? `<div class="composer__reply">${ic('reply')}<span>Replying to <b>${esc(users[reply.u].name)}</b>: ${esc(reply.kind === 'voice' ? 'Voice message' : reply.text || 'Card')}</span><button class="ibtn" type="button" data-act="cancelReply" style="width:26px;height:26px">${ic('x')}</button></div>` : ''}
      <textarea id="composerInput" rows="1" placeholder="Send a message to ${r.kind === 'dm' ? esc(r.name) : `#${esc(r.name)}`}…" aria-label="Message"></textarea>
      <div class="composer__row">
        <button class="ibtn" type="button" data-act="attach" title="Upload">${ic('plus')}</button>
        <span class="grow"></span>
        <button class="ibtn" type="button" data-act="record" title="Record a voice message">${ic('mic')}</button>
        <button class="ibtn" type="button" data-act="emoji" title="Emoji">${ic('smile')}</button>
        <button class="sendbtn" type="button" data-act="send" title="Send">${ic('send')}</button>
      </div></div>`;
  }

  function renderTyping() {
    const el = $('#typing');
    if (!el) return;
    el.innerHTML = state.typing && state.typing.room === state.room
      ? `<span class="typing__dots"><i></i><i></i><i></i></span><span><b>${esc(users[state.typing.u].name)}</b> is typing…</span>`
      : '';
  }

  // ---------------------------------------------------------------- render: call
  function renderCall() {
    const id = state.room;
    const inThis = state.call && state.call.room === id;
    if (!inThis) {
      const people = callPeople(id);
      return `<div class="call"><div class="lobby"><div class="lobby__card">
        ${people.length ? `<div class="lobby__faces">${people.map((u) => avatar(u, 56, { ring: false })).join('')}</div>` : `<span class="room-head__icon" style="width:64px;height:64px;border-radius:20px">${ic('volume')}</span>`}
        <h2>${esc(rooms[id].name)}</h2>
        <p>${people.length ? `${people.map((u) => esc(users[u].name)).join(', ')} ${people.length === 1 ? 'is' : 'are'} in the call${id === 'lounge' ? ', Luis is streaming.' : '.'}` : 'Nobody is here yet.'}</p>
        <div class="lobby__toggles">
          <button class="cb ${state.muted ? 'is-off' : ''}" type="button" data-act="mute" title="Microphone">${ic(state.muted ? 'micOff' : 'mic')}</button>
          <button class="cb ${state.camera ? 'is-on' : ''}" type="button" data-act="camera" title="Camera">${ic(state.camera ? 'video' : 'videoOff')}</button>
        </div>
        <button class="dbtn dbtn--accent" type="button" data-act="join" style="height:42px;padding:0 22px">${state.call ? 'Switch to this call' : 'Join call'}</button>
        <span class="kbd-hint">Demo: no microphone or camera is used.</span>
      </div></div></div>`;
    }
    return `<div class="call"><div class="grid ${state.focus ? 'is-focus' : ''}" id="callGrid">${tiles().join('')}</div>
      <div class="callstatus"><b>● Connected</b><span class="sep">·</span><span id="ping">18 ms</span><span class="sep">·</span><span>${ic('lock').replace('class="icon ', 'style="width:13px;height:13px;display:inline;vertical-align:-2px" class="icon ')} Encrypted</span><span class="sep">·</span><span>Noise suppression ${state.noise ? 'on' : 'off'}</span></div>
      ${callBar()}</div>`;
  }

  function tiles() {
    const id = state.call.room;
    const people = callPeople(id);
    const list = [];
    if (id === 'lounge') list.push({ key: 'stream-luis', html: streamTile('luis', 'movie') });
    if (state.sharing) list.push({ key: 'stream-me', html: streamTile(ME, 'desk') });
    people.forEach((u) => list.push({ key: `p-${u}`, html: personTile(u) }));
    return list.map((t) => t.html.replace('class="tile', `data-tile="${t.key}" class="tile${state.focus === t.key ? ' is-focused' : ''}`));
  }
  function personTile(u) {
    const muted = isMuted(u);
    const agent = u === 'anton';
    const cam = u === ME && state.camera;
    return `<button class="tile ${agent ? 'is-agent' : ''}" type="button" data-person="${u}" aria-label="${esc(users[u].name)}">
      ${cam ? '<div class="screen screen--cam"></div>' : avatar(u, 76, { ring: false })}
      ${agent ? `<span class="tile__agent">${ic('mic')}Talking to an agent</span>` : ''}
      <span class="tile__name">${muted ? `<span class="is-muted">${ic('micOff')}</span>` : ic('mic')}${esc(users[u].name)}${u === ME ? ' (you)' : ''}</span></button>`;
  }
  function streamTile(u, kind) {
    const content = kind === 'movie'
      ? '<div class="screen screen--movie"><div class="sun"></div><div class="hills"></div><div class="bird"></div><div class="bird"></div><div class="caption">“Somewhere over the hills…”</div></div>'
      : '<div class="screen screen--desk"><div class="win win--a"><div class="ln"></div><div class="ln" style="width:60%"></div><div class="ln" style="width:75%"></div></div><div class="win win--b"><div class="ln"></div><div class="ln" style="width:50%"></div><div class="ln" style="width:70%"></div></div><div class="cursor"></div></div>';
    const name = u === ME ? 'Your stream' : `${users[u].name}'s stream`;
    const viewers = u === ME ? callPeople(state.call.room).length - 1 : 3;
    const audio = u === ME ? (state.systemAudio ? ' · with sound' : ' · no sound') : ' · with sound';
    return `<button class="tile" type="button" aria-label="${esc(name)}">${content}
      <span class="tile__live"><span class="tile__viewers">👁 ${viewers}</span><span class="live">LIVE</span></span>
      <span class="tile__name">${ic('share')}${esc(name)}${audio}</span></button>`;
  }
  function layoutGrid() {
    const g = $('#callGrid');
    if (!g) return;
    const n = g.children.length;
    if (state.focus) {
      g.style.setProperty('--strip', Math.max(1, n - 1));
      return;
    }
    const w = g.clientWidth;
    const h = g.clientHeight || 400;
    let best = 1;
    let bestSize = 0;
    for (let cols = 1; cols <= n; cols++) {
      const rowsN = Math.ceil(n / cols);
      const tw = w / cols;
      const th = h / rowsN;
      const size = Math.min(tw, th * 1.6);
      if (size > bestSize) {
        bestSize = size;
        best = cols;
      }
    }
    g.style.setProperty('--cols', best);
  }
  function callBar() {
    return `<div class="callbar" id="callBar">
      <span class="cb__split"><button class="cb ${state.muted ? 'is-off' : ''}" type="button" data-act="mute" title="${state.muted ? 'Unmute' : 'Mute'}">${ic(state.muted ? 'micOff' : 'mic')}</button><button class="cb" type="button" data-act="devMenu" title="Microphone and output">${ic('chev', 'chev')}</button></span>
      <button class="cb ${state.deafened ? 'is-off' : ''}" type="button" data-act="deafen" title="${state.deafened ? 'Undeafen' : 'Deafen: mic and sound off'}">${ic(state.deafened ? 'headphonesOff' : 'headphones')}</button>
      <button class="cb ${state.camera ? 'is-on' : ''}" type="button" data-act="camera" title="Camera">${ic(state.camera ? 'video' : 'videoOff')}</button>
      <span class="cb__split"><button class="cb ${state.sharing ? 'is-on' : ''}" type="button" data-act="toggleShare" title="${state.sharing ? 'Stop sharing' : 'Share screen'}">${ic('share')}<span class="cb__label">${state.sharing ? 'Sharing' : 'Share'}</span></button><button class="cb ${state.sharing ? 'is-on' : ''}" type="button" data-act="shareMenu" title="Share options">${ic('chev', 'chev')}</button></span>
      <button class="cb" type="button" data-act="callMore" title="More">${ic('moreH')}</button>
      <button class="cb cb--leave" type="button" data-act="leave" title="Leave call">${ic('phone')}</button></div>`;
  }

  // ---------------------------------------------------------------- render: drawer
  function renderDrawer() {
    const d = $('#drawer');
    d.classList.toggle('is-closed', !state.drawerOpen);
    if (!state.drawerOpen) return;
    const r = rooms[state.room];
    const head = `<div class="drawer__head"><div class="tabs">
      <button class="tab ${state.drawerTab === 'members' ? 'is-active' : ''}" type="button" data-tab="members">Participants ${r.members.length}</button>
      <button class="tab ${state.drawerTab === 'plugins' ? 'is-active' : ''}" type="button" data-tab="plugins">Plugins</button></div>
      <button class="ibtn" type="button" data-act="drawer" title="Close">${ic('x')}</button></div>`;
    if (state.drawerTab === 'plugins') {
      const on = Object.keys(state.plugins).filter((k) => state.plugins[k]);
      d.innerHTML = `${head}<div class="drawer__scroll" id="pluginDock">${
        on.length
          ? on.map((k) => `<div class="plugin-frame"><header>${PLUGINS[k].emoji} ${PLUGINS[k].name}</header>${pluginFrame(k, 'dock')}</div>`).join('')
          : '<div class="empty">No plugins active. Turn some on in Settings → Plugins.</div>'
      }<button class="navitem" type="button" data-act="settings" data-tab="plugins" style="justify-content:center">${ic('grid')}Manage plugins</button></div>`;
      return;
    }
    const groups = [
      ['Founder', r.members.filter((u) => users[u].role === 'Founder')],
      ['Online', r.members.filter((u) => !users[u].role && !users[u].off && !users[u].bot)],
      ['Bots', r.members.filter((u) => users[u].bot)],
      ['Offline', r.members.filter((u) => users[u].off)],
    ].filter(([, l]) => l.length);
    d.innerHTML = `${head}<div class="drawer__scroll">${groups
      .map(([label, list]) => `<div class="group-label">${label} — ${list.length}</div>${list
        .map((u) => {
          const p = users[u];
          const plate = p.plate && p.plate !== 'none' ? `plate plate--${p.plate}` : '';
          const st = u === ME ? (state.call ? 'In a call' : 'Online') : p.status;
          return `<button class="member ${plate} ${p.off ? 'is-off' : ''}" type="button" data-profile="${u}">${avatar(u, 34, { dot: true })}
            <span class="member__text">${nameEl(u)}<small>${esc(st)}</small></span>${p.role === 'Founder' ? '<span class="crown" title="Founder">👑</span>' : ''}</button>`;
        })
        .join('')}`)
      .join('')}</div>`;
  }

  function renderAll() {
    renderSide();
    renderMain();
    renderDrawer();
  }

  // ---------------------------------------------------------------- popovers
  const layer = $('#layer');
  let popCleanup = null;
  function closePop() {
    layer.innerHTML = '';
    if (popCleanup) popCleanup();
    popCleanup = null;
  }
  function openPop(html, x, y, cls = '') {
    closePop();
    layer.innerHTML = `<div class="pop ${cls}" id="pop" role="dialog">${html}</div>`;
    const pop = $('#pop');
    const r = pop.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    return pop;
  }
  function popAt(anchor, html, cls, place = 'below') {
    const a = anchor.getBoundingClientRect();
    const pop = openPop(html, a.left, a.bottom + 6, cls);
    if (place === 'above') {
      const r = pop.getBoundingClientRect();
      pop.style.top = `${Math.max(8, a.top - r.height - 8)}px`;
    } else if (place === 'right') {
      const r = pop.getBoundingClientRect();
      pop.style.left = `${Math.min(a.right + 8, window.innerWidth - r.width - 8)}px`;
      pop.style.top = `${Math.max(8, Math.min(a.top, window.innerHeight - r.height - 8))}px`;
    }
    return pop;
  }

  function profileHtml(u, preview = false) {
    const p = users[u];
    const status = u === ME ? (state.call ? 'In a call' : 'Online') : p.status;
    return `<div class="profile__banner" style="background:${p.banner}"></div>
      <div class="profile__body"><div class="profile__av">${avatar(u, 80, { dot: true })}</div>
      <h3 class="profile__name">${nameEl(u)}${p.pron ? `<span class="profile__pron">${esc(p.pron)}</span>` : ''}</h3>
      <div class="profile__id">${esc(p.id)}</div>
      <div class="profile__status"><span class="av__dot ${p.off ? 'is-off' : ''}" style="position:static;box-shadow:none;width:9px;height:9px;min-width:9px;min-height:9px"></span>${esc(status)}</div>
      ${p.badges.length ? `<div class="profile__sec"><h4>Badges</h4><div class="badges">${p.badges.map(([e, l]) => `<span class="badge">${e} ${esc(l)}</span>`).join('')}</div></div>` : ''}
      <div class="profile__sec"><h4>About</h4><p>${esc(p.bio)}</p></div>
      ${preview || u === ME ? '' : `<div class="profile__actions"><button class="cbtn" type="button" data-act="dmFromProfile" data-u="${u}">${ic('send')}Message</button>${p.bot ? '' : `<button class="cbtn cbtn--accent" type="button" data-act="callFromProfile" data-u="${u}">${ic('phone')}Call</button>`}</div>`}
      ${u === ME && !preview ? `<div class="profile__actions"><button class="cbtn cbtn--accent" type="button" data-act="settings" data-tab="profile">${ic('palette')}Edit profile</button></div>` : ''}
      </div>`;
  }
  function openProfile(u, anchor) {
    const pop = anchor
      ? popAt(anchor, profileHtml(u), 'profile', anchor.closest('.drawer') ? 'left' : 'right')
      : openPop(profileHtml(u), window.innerWidth / 2 - 160, 80, 'profile');
    if (anchor && anchor.closest('.drawer')) {
      const a = anchor.getBoundingClientRect();
      const r = pop.getBoundingClientRect();
      pop.style.left = `${Math.max(8, a.left - r.width - 10)}px`;
      pop.style.top = `${Math.max(8, Math.min(a.top - 40, window.innerHeight - r.height - 8))}px`;
    }
    pop.id = 'profilePop';
    return pop;
  }

  function messageMenu(msgId, x, y) {
    const m = rooms[state.room].msgs.find((k) => k.id === msgId);
    if (!m) return;
    const own = m.u === ME;
    openPop(
      `<div class="quick">${['👍', '❤️', '😂', '🎉', '🔥', '👀'].map((e) => `<button type="button" data-act="quickReact" data-id="${m.id}" data-emoji="${e}">${e}</button>`).join('')}</div>
      <div class="menu__sep"></div>
      <button class="menu__item" type="button" data-act="replyTo" data-id="${m.id}">${ic('reply')}Reply</button>
      ${m.text && m.kind !== 'voice' && m.kind !== 'card' ? `<button class="menu__item" type="button" data-act="copyText" data-id="${m.id}">${ic('copy')}Copy Text<small>Diddy's own menu</small></button>` : ''}
      <button class="menu__item" type="button" data-act="pinMsg" data-id="${m.id}">${ic('pin')}Pin message</button>
      ${own ? `<div class="menu__sep"></div><button class="menu__item is-danger" type="button" data-act="deleteMsg" data-id="${m.id}">${ic('trash')}Delete</button>` : ''}`,
      x,
      y,
      'menu',
    );
  }

  // ---------------------------------------------------------------- toasts + modal
  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('is-out'), 2600);
    setTimeout(() => el.remove(), 2900);
  }
  function modal(html, cls = '') {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = `modal-wrap ${cls}`;
    wrap.id = 'modal';
    wrap.innerHTML = html;
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap && !tour.active) closeModal();
    });
    document.body.appendChild(wrap);
    return wrap;
  }
  function closeModal() {
    const m = $('#modal');
    if (m) m.remove();
  }

  // ---------------------------------------------------------------- chat actions
  function addMessage(roomId, m, { silent } = {}) {
    const room = rooms[roomId];
    room.msgs.push(m);
    if (roomId === state.room) {
      const tl = $('#timeline');
      if (tl) {
        const last = room.msgs[room.msgs.length - 2];
        const cont = last && last.u === m.u && !m.reply && m.kind !== 'notice' && last.kind !== 'notice' && m.kind !== 'card';
        tl.insertAdjacentHTML('beforeend', m.kind === 'notice' ? `<div class="notice">${m.html}</div>` : msgHtml(m, cont));
        tl.scrollTop = tl.scrollHeight;
      }
    } else if (m.u !== ME && m.kind !== 'notice') {
      state.unread[roomId] = (state.unread[roomId] || 0) + 1;
      renderSide();
    }
    if (m.u !== ME && !silent && m.kind !== 'notice') sound('message');
  }

  const REPLIES = [
    [/theme|colou?r|dark|light/i, 'mara', 'Settings → Appearance. Ten themes, they switch instantly. I like Diddy and Amber. 🎨'],
    [/call|voice|talk|lounge/i, 'jonas', 'Come to the Lounge, we\'re all there. Luis is streaming the movie. 🎧'],
    [/stream|share|screen/i, 'luis', 'Join the call and hit Share. You can turn system audio on before you even start.'],
    [/plugin/i, 'luis', 'Open the Plugins tab on the right. Dice and clock are on, roll something. 🎲'],
    [/profile|badge|name/i, 'mara', 'Click any name. Badges, banner, name effects and the moving nameplates are visible to everyone on Diddy.'],
    [/download|install|mac|linux|ios|iphone/i, 'mara', 'macOS, Linux and iPhone/iPad. Button top right. ⬆️'],
    [/hi\b|hey|hello|hallo|moin|servus/i, 'mara', 'Hey Alex! 👋 Welcome. Take the tour up top if you want a quick walk-through.'],
  ];
  const FALLBACK = [
    ['jonas', 'Ha, fair. 😄'],
    ['mara', 'Agreed. Btw: right-click a message, Diddy has its own menu with Copy Text.'],
    ['luis', 'Try sending a voice message with the mic button. 🎤'],
    ['anton', 'Nice. One sec, my agent is talking. 🤖'],
  ];
  function autoReply(roomId, text) {
    const room = rooms[roomId];
    let who;
    let reply;
    const hit = REPLIES.find(([re]) => re.test(text));
    if (hit) [, who, reply] = hit;
    else [who, reply] = pick(FALLBACK);
    if (room.kind === 'dm') who = room.dm;
    if (!room.members.includes(who)) who = room.members.find((u) => u !== ME && !users[u].bot) || 'mara';
    setTimeout(() => {
      state.typing = { room: roomId, u: who };
      renderTyping();
      setTimeout(() => {
        state.typing = null;
        renderTyping();
        addMessage(roomId, { id: nextId(), u: who, t: clockNow(), text: reply });
      }, 1400 + Math.random() * 900);
    }, 500);
  }

  function sendText() {
    const ta = $('#composerInput');
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = '';
    const m = { id: nextId(), u: ME, t: clockNow(), text: text.slice(0, 2000) };
    if (state.replyTo) m.reply = state.replyTo;
    state.replyTo = null;
    const roomId = state.room;
    const prev = $('.composer__reply');
    if (prev) prev.remove();
    addMessage(roomId, m);
    if (/^\/(skip|next)/i.test(text) && roomId === 'music') {
      jukeboxAction('jbNext');
      return;
    }
    autoReply(roomId, text);
  }

  function startRecording() {
    state.recording = { secs: 0, bars: [] };
    renderMain();
    const tick = () => {
      if (!state.recording) return;
      state.recording.secs += 0.1;
      state.recording.bars.push(Math.max(3, Math.round(Math.random() * 22 * (0.4 + Math.abs(Math.sin(state.recording.secs * 2))))));
      if (state.recording.bars.length > 80) state.recording.bars.shift();
      const w = $('#recWave');
      const t = $('#recTime');
      if (w) w.innerHTML = state.recording.bars.map((h) => `<i style="height:${h}px"></i>`).join('');
      if (t) t.textContent = mmss(state.recording.secs);
      if (state.recording.secs >= 30) {
        stopRecording(true);
        return;
      }
      state.recording.timer = setTimeout(tick, 100);
    };
    tick();
  }
  function stopRecording(send) {
    if (!state.recording) return;
    clearTimeout(state.recording.timer);
    const dur = Math.max(1, Math.round(state.recording.secs));
    state.recording = null;
    renderMain();
    if (send) {
      addMessage(state.room, { id: nextId(), u: ME, t: clockNow(), kind: 'voice', dur, text: 'Voice message' });
      const roomId = state.room;
      setTimeout(() => {
        const last = rooms[roomId].msgs[rooms[roomId].msgs.length - 1];
        if (last) {
          last.react = { '🔊': [rooms[roomId].kind === 'dm' ? rooms[roomId].dm : 'luis'] };
          if (roomId === state.room) renderMain();
        }
      }, 1800);
    }
  }

  let voiceTimer = null;
  function toggleVoice(id) {
    const m = rooms[state.room].msgs.find((k) => k.id === id);
    if (!m) return;
    if (state.voicePlaying && state.voicePlaying.id === id) {
      clearInterval(voiceTimer);
      state.voicePlaying = null;
      updateVoice(m);
      return;
    }
    if (state.voicePlaying) {
      const old = rooms[state.room].msgs.find((k) => k.id === state.voicePlaying.id);
      clearInterval(voiceTimer);
      state.voicePlaying = null;
      if (old) updateVoice(old);
    }
    state.voicePlaying = { id, pos: 0 };
    updateVoice(m);
    voiceTimer = setInterval(() => {
      if (!state.voicePlaying) return;
      state.voicePlaying.pos += 0.1;
      if (state.voicePlaying.pos >= m.dur) {
        clearInterval(voiceTimer);
        state.voicePlaying = null;
      }
      updateVoice(m);
    }, 100);
    if (!state.voiceHinted) {
      state.voiceHinted = true;
      toast('Demo: playback is silent');
    }
  }
  function updateVoice(m) {
    const el = $(`[data-voice="${m.id}"]`);
    if (el) el.outerHTML = voiceHtml(m);
  }

  function jukeboxAction(act) {
    const j = state.jukebox;
    if (act === 'jbPlay') j.playing = !j.playing;
    if (act === 'jbNext') {
      j.i = (j.i + 1) % TRACKS.length;
      j.pos = 0;
      j.playing = true;
    }
    if (act === 'jbPrev') {
      if (j.pos > 5) j.pos = 0;
      else j.i = (j.i + TRACKS.length - 1) % TRACKS.length;
      j.pos = 0;
    }
    if (act === 'jbVol') j.vol = j.vol >= 100 ? 30 : j.vol + 10;
    updateJukebox();
    if (act === 'jbNext') addMessage('music', { id: nextId(), kind: 'notice', u: 'jukebox', html: `${ic('music').replace('class="icon ', 'style="width:14px;height:14px;display:inline;vertical-align:-2px" class="icon ')} <b>Alex</b> skipped to <b>${esc(TRACKS[j.i].title)}</b>` });
  }
  function updateJukebox() {
    $$('.botcard').forEach((el) => {
      el.outerHTML = jukeboxCard();
    });
  }
  setInterval(() => {
    const j = state.jukebox;
    if (!j.playing) return;
    j.pos += 1;
    if (j.pos >= TRACKS[j.i].len) {
      j.i = (j.i + 1) % TRACKS.length;
      j.pos = 0;
    }
    if (state.room === 'music') {
      const bar = $('.botcard .bar i');
      const time = $('.botcard__times span');
      if (bar) bar.style.width = `${(j.pos / TRACKS[j.i].len) * 100}%`;
      if (time) time.textContent = mmss(j.pos);
      if (j.pos === 0) updateJukebox();
    }
  }, 1000);

  // ---------------------------------------------------------------- call actions
  function joinCall(roomId) {
    if (state.call && state.call.room === roomId) return;
    if (state.call) {
      if (!confirmInline('Leave your current call?')) return;
      leaveCall(true);
    }
    state.call = { room: roomId };
    state.focus = null;
    sound('join');
    selectRoom(roomId);
    if (roomId === 'movie') {
      setTimeout(() => {
        if (state.call && state.call.room === 'movie' && !rooms.movie.people.includes('mara')) {
          rooms.movie.people.push('mara');
          sound('other_join');
          refreshCall();
          toast('Mara joined Movie night');
        }
      }, 3500);
    }
  }
  function confirmInline(q) {
    return window.confirm(q);
  }
  function leaveCall(quiet) {
    if (!state.call) return;
    const was = state.call.room;
    if (state.sharing) state.sharing = false;
    state.call = null;
    state.focus = null;
    if (!quiet) sound('leave');
    if (was === 'movie') rooms.movie.people = [];
    renderAll();
  }
  function refreshCall() {
    renderSide();
    if (rooms[state.room].kind === 'voice') {
      const grid = $('#callGrid');
      if (grid && state.call && state.call.room === state.room) {
        grid.className = `grid ${state.focus ? 'is-focus' : ''}`;
        grid.innerHTML = tiles().join('');
        const bar = $('#callBar');
        if (bar) bar.outerHTML = callBar();
        layoutGrid();
      } else renderMain();
    }
    if (state.drawerOpen && state.drawerTab === 'members') renderDrawer();
  }
  function toggleMute() {
    if (state.deafened) {
      // Undeafen restores both, as in the app
      toggleDeafen();
      return;
    }
    state.muted = !state.muted;
    sound(state.muted ? 'mute' : 'unmute');
    refreshCall();
    if (rooms[state.room].kind === 'voice' && !state.call) renderMain();
  }
  function toggleDeafen() {
    if (!state.deafened) {
      state.preDeafMuted = state.muted;
      state.muted = true;
      sound('deafen');
      state.deafened = true;
    } else {
      state.deafened = false;
      state.muted = state.preDeafMuted;
      sound('undeafen');
    }
    refreshCall();
  }
  function toggleShare() {
    if (!state.call) {
      toast('Join a call first, then share');
      return;
    }
    state.sharing = !state.sharing;
    sound(state.sharing ? 'stream_start' : 'stream_end');
    if (!state.sharing && state.focus === 'stream-me') state.focus = null;
    refreshCall();
    if (state.sharing) toast(state.systemAudio ? 'Sharing your screen with system audio' : 'Sharing your screen without sound');
  }

  // speaking indicator + ping
  setInterval(() => {
    if (!state.call || state.room !== state.call.room) return;
    $$('#callGrid .tile[data-person]').forEach((t) => {
      const u = t.dataset.person;
      const talk = !isMuted(u) && u !== 'anton' && !(u === ME) && Math.random() < 0.35;
      t.classList.toggle('is-speaking', talk);
    });
    const p = $('#ping');
    if (p) p.textContent = `${14 + Math.round(Math.random() * 12)} ms`;
  }, 900);

  // ---------------------------------------------------------------- settings
  const PLUGINS = {
    dice: { name: 'Dice', emoji: '🎲', desc: 'Roll dice, from d4 to d100' },
    clock: { name: 'Clock', emoji: '🕑', desc: 'Time, date and a second zone' },
    todo: { name: 'To-do', emoji: '✅', desc: 'A small list that remembers itself' },
    timer: { name: 'Timer', emoji: '⏱️', desc: 'Countdown and stopwatch' },
  };
  const pluginStore = {};
  function pluginFrame(k, where) {
    return `<iframe title="${PLUGINS[k].name} plugin" sandbox="allow-scripts" src="plugins/${k}.html" data-plugin="${k}" data-where="${where}" loading="lazy"></iframe>`;
  }
  function pluginTheme() {
    $$('iframe[data-plugin]').forEach((f) => sendInit(f));
  }
  function sendInit(frame) {
    try {
      frame.contentWindow.postMessage({ type: 'diddy:init', apiVersion: 1, theme: THEMES[state.theme].light ? 'light' : 'dark', layout: 'compact', customCss: '' }, '*');
    } catch {
      /* not loaded yet */
    }
  }
  window.addEventListener('message', (e) => {
    const frame = $$('iframe[data-plugin]').find((f) => f.contentWindow === e.source);
    if (!frame) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    const k = frame.dataset.plugin;
    const store = pluginStore[k] || (pluginStore[k] = {});
    if (d.type === 'diddy:ready') sendInit(frame);
    else if (d.type === 'diddy:resize' && Number.isFinite(d.height)) frame.style.height = `${Math.min(420, Math.max(60, d.height))}px`;
    else if (d.type === 'diddy:storage:get' && typeof d.key === 'string') e.source.postMessage({ type: 'diddy:storage:value', id: d.id, key: d.key, value: store[d.key] ?? null }, '*');
    else if (d.type === 'diddy:storage:set' && typeof d.key === 'string' && typeof d.value === 'string') store[d.key] = d.value;
  });

  const SETTINGS_NAV = [
    ['General', [['sounds', 'settings', 'Sounds'], ['appearance', 'sun', 'Appearance'], ['call', 'phone', 'Calls']]],
    ['Account', [['profile', 'user', 'Profile'], ['connections', 'server', 'Connections']]],
    ['Extras', [['plugins', 'grid', 'Plugins'], ['about', 'info', 'About']]],
  ];
  let settingsTab = 'appearance';
  function openSettings(tab) {
    if (tab) settingsTab = tab;
    closePop();
    modal(`<div class="settings" role="dialog" aria-label="Settings"><nav class="settings__nav">
      <div class="settings__search">${ic('search')}Search<kbd>/</kbd></div>
      ${SETTINGS_NAV.map(([g, items]) => `<div class="group-label">${g}</div>${items.map(([id, icon, label]) => `<button class="navitem ${settingsTab === id ? 'is-active' : ''}" type="button" data-stab="${id}">${ic(icon)}<span class="navitem__name">${label}</span></button>`).join('')}`).join('')}
      </nav><div class="settings__main" id="settingsMain"></div></div>`, 'is-settings');
    renderSettings();
  }
  function renderSettings() {
    const el = $('#settingsMain');
    if (!el) return;
    $$('.settings__nav .navitem').forEach((b) => b.classList.toggle('is-active', b.dataset.stab === settingsTab));
    const close = `<button class="ibtn settings__close" type="button" data-act="closeSettings" title="Close">${ic('x')}</button>`;
    const sw = (on, act, extra = '') => `<button class="switch ${on ? 'is-on' : ''}" type="button" role="switch" aria-checked="${on}" data-act="${act}" ${extra}></button>`;
    let html = '';
    if (settingsTab === 'appearance') {
      html = `<h1>Appearance</h1><p class="lead">Ten built-in themes, from light to pitch black. Click one, the whole app changes.</p>
        <div class="sbox"><h3>Theme</h3><p>Same colours as the app.</p><div class="themes" id="themeGrid">${Object.entries(THEMES)
          .map(([id, t]) => `<button class="theme ${state.theme === id ? 'is-active' : ''}" type="button" data-theme="${id}">
            <div class="theme__mini" style="background:${t.surface}"><div class="n" style="background:${t.nav}"><i style="background:${t.accent}"></i><i style="background:${t.text}"></i><i style="background:${t.text}"></i></div>
            <div class="s"><i style="background:${t.text}"></i><i style="background:${t.text}"></i><span style="background:${t.accent}"></span></div></div>
            <div class="theme__name">${t.name}${state.theme === id ? ic('check') : ''}</div></button>`)
          .join('')}</div></div>`;
    } else if (settingsTab === 'sounds') {
      const rows = [
        ['join', 'Join and leave', 'When you or others join a call'],
        ['mute', 'Mute and unmute', 'Short click on your mic'],
        ['deafen', 'Deafen', 'Headphones button'],
        ['message', 'Messages', 'New message in another room'],
        ['stream', 'Screen sharing', 'Stream started or ended'],
      ];
      html = `<h1>Sounds</h1><p class="lead">Every app sound can be turned off on its own or replaced with your own file. These are the real Diddy sounds.</p>
        <div class="sbox">${rows
          .map(([k, t, s]) => `<div class="srow"><div class="srow__text"><b>${t}</b><small>${s}</small></div>
            <button class="cbtn" type="button" data-act="preview" data-sound="${k === 'stream' ? 'stream_start' : k === 'mute' ? 'unmute' : k}">${ic('play')}Play</button>${sw(state.sounds[k], 'soundToggle', `data-k="${k}"`)}</div>`)
          .join('')}</div>`;
    } else if (settingsTab === 'call') {
      html = `<h1>Calls</h1><p class="lead">How Diddy handles your microphone and screen sharing.</p>
        <div class="sbox"><div class="srow"><div class="srow__text"><b>Noise suppression</b><small>RNNoise, on your device. Filters fans and typing.</small></div>${sw(state.noise, 'noiseToggle')}</div>
        <div class="srow"><div class="srow__text"><b>Voice processing</b><small>Off: the mic is captured directly via Core Audio, so macOS doesn't lower your music.</small></div>${sw(false, 'nop')}</div>
        <div class="srow"><div class="srow__text"><b>Share system audio</b><small>macOS 14.2+ and Linux. Diddy's own call sounds are left out.</small></div>${sw(state.systemAudio, 'sysAudio')}</div></div>`;
    } else if (settingsTab === 'profile') {
      const me = users[ME];
      const colors = ['#FFB86B', '#FF6FA5', '#B98CFF', '#7AA8FF', '#5ED6C7', '#9FD86B', 'rainbow'];
      html = `<h1>Profile</h1><p class="lead">How you appear to others. Everyone using Diddy sees name styles, badges and nameplates.</p>
        <div class="prof-grid"><div>
          <div class="sbox"><h3>Display name</h3><p>Shown in chats and calls.</p><input class="input" id="nameInput" maxlength="24" value="${esc(me.name)}" aria-label="Display name" /></div>
          <div class="sbox"><h3>Name colour</h3><p>The rainbow one moves.</p><div class="swatches">${colors.map((c) => `<button class="swatch ${c === 'rainbow' ? 'swatch--rainbow' : ''} ${me.color === c ? 'is-active' : ''}" type="button" data-color="${c}" style="${c === 'rainbow' ? '' : `background:${c}`}" aria-label="${c}"></button>`).join('')}</div></div>
          <div class="sbox"><h3>Name effect</h3><p>Font effect of your display name.</p><div class="seg">${['none', 'glow', 'shadow', 'outline'].map((e) => `<button type="button" class="${me.effect === e ? 'is-active' : ''}" data-effect="${e}">${e[0].toUpperCase() + e.slice(1)}</button>`).join('')}</div></div>
          <div class="sbox"><h3>Nameplate</h3><p>Moves behind your row in member lists.</p><div class="plates">${['none', 'aurora', 'sunset', 'matrix', 'stars'].map((p) => `<button type="button" class="platebtn ${p !== 'none' ? `plate plate--${p}` : ''} ${me.plate === p ? 'is-active' : ''}" data-plate="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div></div>
          <div class="sbox"><div class="srow"><div class="srow__text"><b>Animated avatar ring</b><small>A frame around your profile picture.</small></div>${sw(me.ring, 'ringToggle')}</div></div>
        </div><div><div class="sbox" style="padding:0;overflow:hidden"><div class="pop profile" id="profPreview">${profileHtml(ME, true)}</div></div>
          <div class="sbox"><h3>Nameplate preview</h3><p>In member lists and the user panel.</p><div class="member ${me.plate !== 'none' ? `plate plate--${me.plate}` : ''}" id="platePreview" style="background:var(--nav)">${avatar(ME, 34, { dot: true })}<span class="member__text">${nameEl(ME)}<small>Online</small></span></div></div></div></div>`;
    } else if (settingsTab === 'plugins') {
      html = `<h1>Plugins</h1><p class="lead">A plugin is just a web page. Diddy shows it in a locked sandbox and talks to it through a few small messages. These are the real built-in plugins, running right here.</p>
        <div class="sbox" id="pluginList">${Object.entries(PLUGINS)
          .map(([k, p]) => `<div class="srow plugin-row" style="flex-wrap:wrap"><span class="plugin-row__icon">${p.emoji}</span><div class="srow__text"><b>${p.name}</b><small>${p.desc}</small></div>${sw(state.plugins[k], 'pluginToggle', `data-k="${k}"`)}
            ${state.plugins[k] ? `<div style="flex-basis:100%">${pluginFrame(k, 'settings')}</div>` : ''}</div>`)
          .join('')}</div><p class="kbd-hint">Active plugins appear in the "Plugins" tab next to the participant list.</p>`;
    } else if (settingsTab === 'connections') {
      html = `<h1>Connections</h1><p class="lead">If a homeserver goes down, Diddy tells you which one and lets you retry or connect to another server in its own window, with separate login and storage. Your account and keys stay where they are.</p>
        <div class="sbox"><h3>Saved logins</h3><p>Reopen a saved login in its own window.</p>
          <div class="server"><span class="server__dot ${state.outage ? 'is-down' : ''}"></span><div class="srow__text"><b>diddy.example</b><small>@alex:diddy.example · this window</small></div></div>
          <div class="server"><span class="server__dot"></span><div class="srow__text"><b>matrix.org</b><small>@alex-backup:matrix.org</small></div><button class="cbtn" type="button" data-act="soon-window">Open</button></div></div>
        <div class="sbox"><h3>Try it</h3><p>See what happens when your homeserver stops answering.</p><button class="cbtn cbtn--accent" type="button" data-act="simulateOutage">${ic('server')}Simulate an outage</button></div>`;
    } else if (settingsTab === 'about') {
      html = `<h1>About</h1><p class="lead">Diddy is a Matrix client for macOS, Linux and iPhone/iPad, based on Cinny, with voice chat that actually works. Open source under AGPL-3.0.</p>
        <div class="sbox"><div class="srow"><div class="srow__text"><b>This demo</b><small>Made-up people and messages. No server, no account, no microphone, no tracking.</small></div></div>
        <div class="srow"><div class="srow__text"><b>The real thing</b><small>Releases for macOS (DMG), Linux (AppImage, DEB, RPM, NixOS) and iOS (IPA).</small></div><a class="cbtn cbtn--accent" href="https://github.com/Lndr2501/diddy/releases/latest" rel="noopener">${ic('download')}Download</a></div>
        <div class="srow"><div class="srow__text"><b>Source code</b><small>github.com/Lndr2501/diddy</small></div><a class="cbtn" href="https://github.com/Lndr2501/diddy" rel="noopener">Open</a></div></div>`;
    }
    el.innerHTML = close + html;
  }
  function refreshProfileUI() {
    renderSide();
    if (rooms[state.room].kind !== 'voice') {
      const tl = $('#timeline');
      const top = tl ? tl.scrollTop : 0;
      renderMain();
      const tl2 = $('#timeline');
      if (tl2) tl2.scrollTop = top;
    } else refreshCall();
    renderDrawer();
    const prev = $('#profPreview');
    if (prev) prev.innerHTML = profileHtml(ME, true);
    const pp = $('#platePreview');
    if (pp) {
      const me = users[ME];
      pp.className = `member ${me.plate !== 'none' ? `plate plate--${me.plate}` : ''}`;
      pp.innerHTML = `${avatar(ME, 34, { dot: true })}<span class="member__text">${nameEl(ME)}<small>Online</small></span>`;
    }
  }

  // ---------------------------------------------------------------- outage
  function outageHtml() {
    return `<div class="outage" id="outage"><div class="outage__card"><span class="outage__icon">${ic('server')}</span>
      <h2>Can't reach your homeserver</h2><p><code>diddy.example</code> isn't answering since ${clockNow()}. Your messages are safe, nothing is lost.</p>
      <div class="outage__btns"><button class="dbtn dbtn--accent" type="button" data-act="retry" id="retryBtn">${ic('refresh')}Try again</button>
      <button class="dbtn dbtn--ghost" type="button" data-act="otherServer">Connect another server</button></div></div></div>`;
  }

  // ---------------------------------------------------------------- navigation
  function selectRoom(id) {
    if (!rooms[id]) return;
    if (state.recording) stopRecording(false);
    state.room = id;
    state.replyTo = null;
    delete state.unread[id];
    state.focus = state.call && state.call.room === id ? state.focus : null;
    closeSide();
    renderAll();
  }
  function openSide() {
    $('#side').classList.add('is-open');
    $('#scrim').hidden = false;
  }
  function closeSide() {
    $('#side').classList.remove('is-open');
    if (!(window.innerWidth <= 1180 && state.drawerOpen)) $('#scrim').hidden = true;
  }
  function setDrawer(open) {
    state.drawerOpen = open;
    $('#scrim').hidden = !(open && window.innerWidth <= 1180);
    renderDrawer();
    const btn = $('[data-act="drawer"].ibtn:not(.drawer .ibtn)');
    if (btn) btn.classList.toggle('is-on', open);
    if (state.call && state.room === state.call.room) setTimeout(layoutGrid, 0);
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-room],[data-profile],[data-tab],[data-stab],[data-theme],[data-react],[data-tile],[data-color],[data-effect],[data-plate]');
    const inPop = e.target.closest('#pop');
    if (!inPop && !e.target.closest('[data-profile]') && !e.target.closest('[data-act="devMenu"],[data-act="shareMenu"],[data-act="callMore"],[data-act="emoji"],[data-act="accountMenu"],[data-act="spaceMenu"]')) closePop();
    if (!t) return;
    const act = t.dataset.act;

    if (t.dataset.room) return selectRoom(t.dataset.room);
    if (t.dataset.profile && !act) {
      e.stopPropagation();
      openProfile(t.dataset.profile, t);
      return;
    }
    if (t.dataset.tab && !act) {
      state.drawerTab = t.dataset.tab;
      return renderDrawer();
    }
    if (t.dataset.stab) {
      settingsTab = t.dataset.stab;
      return renderSettings();
    }
    if (t.dataset.theme) {
      applyTheme(t.dataset.theme);
      return renderSettings();
    }
    if (t.dataset.react) {
      const m = rooms[state.room].msgs.find((k) => k.id === t.dataset.react);
      toggleReaction(m, t.dataset.emoji);
      return;
    }
    if (t.dataset.tile) {
      state.focus = state.focus === t.dataset.tile ? null : t.dataset.tile;
      return refreshCall();
    }
    if (t.dataset.color) {
      users[ME].color = t.dataset.color;
      $$('.swatch').forEach((s) => s.classList.toggle('is-active', s === t));
      return refreshProfileUI();
    }
    if (t.dataset.effect) {
      users[ME].effect = t.dataset.effect;
      $$('[data-effect]').forEach((s) => s.classList.toggle('is-active', s === t));
      return refreshProfileUI();
    }
    if (t.dataset.plate) {
      users[ME].plate = t.dataset.plate;
      $$('[data-plate]').forEach((s) => s.classList.toggle('is-active', s === t));
      return refreshProfileUI();
    }

    switch (act) {
      case 'home':
        return selectRoom('general');
      case 'explore':
        return toast('Explore: public rooms and spaces on your server');
      case 'search':
        return toast('Search works in the app. In the demo it just looks nice. 🙂');
      case 'pins':
        return toast('No pinned messages yet. Right-click a message → Pin.');
      case 'soon':
      case 'soon-create':
        return toast('Creating rooms and spaces works in the app');
      case 'soon-window':
        return toast('In the app this opens a separate window with its own login');
      case 'spaceMenu':
        return popAt(t, `<div class="menu__label">Diddy Crew</div>
          <button class="menu__item" type="button" data-act="joinAll">${ic('check')}Join All Rooms</button>
          <button class="menu__item" type="button" data-act="autoJoin">${ic('sparkles')}Auto-Join Rooms</button>
          <button class="menu__item" type="button" data-act="soon">${ic('settings')}Space settings</button>`, 'menu');
      case 'joinAll':
        closePop();
        return toast('Joined all 5 rooms of Diddy Crew with one click');
      case 'autoJoin':
        closePop();
        return toast('New rooms in this space will be joined automatically');
      case 'accountMenu':
        return popAt(t, `<div class="menu__label">${esc(users[ME].id)}</div>
          <button class="menu__item" type="button" data-profile="${ME}">${ic('user')}View profile</button>
          <button class="menu__item" type="button" data-act="settings" data-tab="profile">${ic('palette')}Edit profile</button>
          <button class="menu__item" type="button" data-act="settings" data-tab="connections">${ic('server')}Connections</button>
          <button class="menu__item" type="button" data-act="settings">${ic('settings')}Settings</button>
          <div class="menu__sep"></div><button class="menu__item" type="button" data-act="tour">${ic('sparkles')}Introduction</button>`, 'menu', 'above');
      case 'settings':
        return openSettings(t.dataset.tab || 'appearance');
      case 'closeSettings':
        return closeModal();
      case 'drawer':
        return setDrawer(!state.drawerOpen);
      case 'openSide':
        return openSide();
      case 'send':
        return sendText();
      case 'record':
        return startRecording();
      case 'recCancel':
        return stopRecording(false);
      case 'recSend':
        return stopRecording(true);
      case 'emoji':
        return popAt(t, `<div class="quick" style="flex-wrap:wrap;width:232px">${['😀', '😂', '😍', '🥳', '😎', '🤔', '👍', '🙌', '🔥', '🎉', '🍿', '🎧', '🎨', '🎬', '❤️', '👀', '🤖', '✨'].map((em) => `<button type="button" data-act="insertEmoji" data-emoji="${em}">${em}</button>`).join('')}</div>`, 'menu', 'above');
      case 'insertEmoji': {
        const ta = $('#composerInput');
        if (ta) {
          ta.value += t.dataset.emoji;
          ta.focus();
        }
        return closePop();
      }
      case 'attach':
        return toast('Uploads work in the app');
      case 'cancelReply':
        state.replyTo = null;
        return $('.composer__reply') && $('.composer__reply').remove();
      case 'voicePlay':
        return toggleVoice(t.dataset.id);
      case 'jbPlay':
      case 'jbNext':
      case 'jbPrev':
      case 'jbVol':
        return jukeboxAction(act);
      case 'quickReact': {
        const m = rooms[state.room].msgs.find((k) => k.id === t.dataset.id);
        closePop();
        return toggleReaction(m, t.dataset.emoji, true);
      }
      case 'replyTo':
        closePop();
        state.replyTo = t.dataset.id;
        renderMain();
        return;
      case 'copyText': {
        const m = rooms[state.room].msgs.find((k) => k.id === t.dataset.id);
        closePop();
        if (m && navigator.clipboard) navigator.clipboard.writeText(m.text).catch(() => {});
        return toast('Copied to clipboard');
      }
      case 'pinMsg':
        closePop();
        return toast('Pinned. Everyone in the room sees it under the pin icon.');
      case 'deleteMsg': {
        const r = rooms[state.room];
        r.msgs = r.msgs.filter((k) => k.id !== t.dataset.id);
        closePop();
        return renderMain();
      }
      case 'startCall':
        return joinCall('lounge');
      case 'join':
        return joinCall(state.room);
      case 'leave':
        return leaveCall();
      case 'mute':
        return toggleMute();
      case 'deafen':
        return toggleDeafen();
      case 'camera':
        state.camera = !state.camera;
        if (state.call) refreshCall();
        else renderMain();
        return;
      case 'toggleShare':
        return toggleShare();
      case 'devMenu':
        return popAt(t, `<div class="menu__label">Microphone</div>
          <button class="menu__item" type="button">${ic('check')}MacBook Pro Microphone</button>
          <button class="menu__item" type="button"><span class="icon"></span>AirPods Pro</button>
          <div class="menu__sep"></div><div class="menu__label">Output</div>
          <button class="menu__item" type="button">${ic('check')}MacBook Pro Speakers</button>
          <button class="menu__item" type="button"><span class="icon"></span>AirPods Pro</button>
          <div class="menu__sep"></div><button class="menu__item" type="button" data-act="noiseToggle">${ic('wave')}Noise suppression<small>${state.noise ? 'On' : 'Off'}</small></button>`, 'menu', 'above');
      case 'shareMenu':
        return popAt(t, `<div class="menu__label">Screen sharing</div>
          <button class="menu__item" type="button" data-act="sysAudio">${ic('volume')}System audio<small>${state.systemAudio ? 'On' : 'Off'}</small></button>
          ${state.sharing ? `<button class="menu__item is-danger" type="button" data-act="toggleShare">${ic('x')}Stop sharing</button>` : `<button class="menu__item" type="button" data-act="toggleShare">${ic('share')}Share entire screen</button>`}`, 'menu', 'above');
      case 'sysAudio':
        state.systemAudio = !state.systemAudio;
        closePop();
        if ($('#settingsMain')) renderSettings();
        refreshCall();
        return toast(`System audio ${state.systemAudio ? 'on' : 'off'}${state.sharing ? '' : ' (applies when you start sharing)'}`);
      case 'noiseToggle':
        state.noise = !state.noise;
        closePop();
        if ($('#settingsMain')) renderSettings();
        if (state.call && state.room === state.call.room) renderMain();
        return toast(`Noise suppression ${state.noise ? 'on' : 'off'}`);
      case 'callMore':
        return popAt(t, `<div class="menu__label">View</div>
          <button class="menu__item" type="button" data-act="viewGrid">${ic('grid')}Grid${state.focus ? '' : '<small>Active</small>'}</button>
          <button class="menu__item" type="button" data-act="viewFocus">${ic('maximize')}Focus on stream${state.focus ? '<small>Active</small>' : ''}</button>
          <div class="menu__sep"></div><button class="menu__item" type="button" data-act="settings" data-tab="call">${ic('settings')}Call settings</button>`, 'menu', 'above');
      case 'viewGrid':
        closePop();
        state.focus = null;
        return refreshCall();
      case 'viewFocus':
        closePop();
        state.focus = state.call && state.call.room === 'lounge' ? 'stream-luis' : state.sharing ? 'stream-me' : null;
        return refreshCall();
      case 'dmFromProfile': {
        closePop();
        const u = t.dataset.u;
        if (u === 'mara') return selectRoom('dm_mara');
        return toast(`In the app this opens a DM with ${users[u].name}`);
      }
      case 'callFromProfile':
        closePop();
        sound('calling');
        return toast(`Calling ${users[t.dataset.u].name}… (demo)`);
      case 'preview':
        return sound(t.dataset.sound);
      case 'soundToggle':
        state.sounds[t.dataset.k] = !state.sounds[t.dataset.k];
        return renderSettings();
      case 'pluginToggle':
        state.plugins[t.dataset.k] = !state.plugins[t.dataset.k];
        renderSettings();
        return state.drawerTab === 'plugins' && renderDrawer();
      case 'ringToggle':
        users[ME].ring = !users[ME].ring;
        renderSettings();
        return refreshProfileUI();
      case 'nop':
        return toast('macOS only, shown here for completeness');
      case 'simulateOutage':
        closeModal();
        state.outage = true;
        return renderMain();
      case 'retry': {
        t.innerHTML = '<span class="spinner"></span>Connecting…';
        t.disabled = true;
        setTimeout(() => {
          state.outage = false;
          renderMain();
          toast('Back online');
        }, 1600);
        return;
      }
      case 'otherServer':
        return modal(`<div class="modal"><h2>Connect another server</h2><p>Diddy opens a new window with its own login and its own storage. This window, your account here and your keys stay untouched. Accounts are not moved between servers.</p>
          <input class="input" style="width:100%;margin-bottom:14px" placeholder="matrix.org" aria-label="Server" />
          <div class="modal__btns"><button class="dbtn dbtn--ghost" type="button" data-act="closeModal">Cancel</button><button class="dbtn dbtn--accent" type="button" data-act="fakeConnect">Continue</button></div></div>`);
      case 'fakeConnect':
        closeModal();
        state.outage = false;
        renderMain();
        return toast('In the app a second window opens here');
      case 'closeModal':
        return closeModal();
      case 'tour':
        closePop();
        return tour.start();
      default:
    }
  });

  function toggleReaction(m, emoji, fromMenu) {
    if (!m) return;
    m.react = m.react || {};
    const list = m.react[emoji] || [];
    if (list.includes(ME)) {
      if (fromMenu) return;
      m.react[emoji] = list.filter((u) => u !== ME);
      if (!m.react[emoji].length) delete m.react[emoji];
    } else m.react[emoji] = [...list, ME];
    const el = $(`[data-msg="${m.id}"]`);
    if (el) {
      const cont = el.classList.contains('is-cont');
      el.outerHTML = msgHtml(m, cont);
    }
  }

  document.addEventListener('contextmenu', (e) => {
    const msg = e.target.closest('.msg');
    if (!msg) return;
    e.preventDefault();
    messageMenu(msg.dataset.msg, e.clientX, e.clientY);
  });
  // long press on touch = context menu
  let pressTimer = null;
  document.addEventListener('touchstart', (e) => {
    const msg = e.target.closest('.msg');
    if (!msg || e.target.closest('button')) return;
    const touch = e.touches[0];
    pressTimer = setTimeout(() => messageMenu(msg.dataset.msg, touch.clientX, touch.clientY), 500);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => document.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'composerInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendText();
      return;
    }
    if (e.key === 'Escape') {
      if (tour.active) return tour.stop();
      if ($('#pop')) return closePop();
      if ($('#modal')) return closeModal();
      if (state.focus) {
        state.focus = null;
        return refreshCall();
      }
      closeSide();
      if (state.drawerOpen && window.innerWidth <= 1180) setDrawer(false);
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'composerInput') {
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(140, ta.scrollHeight)}px`;
    }
    if (e.target.id === 'nameInput') {
      users[ME].name = e.target.value.trim().slice(0, 24) || 'Alex';
      refreshProfileUI();
    }
  });
  $('#scrim').addEventListener('click', () => {
    closeSide();
    if (window.innerWidth <= 1180 && state.drawerOpen) setDrawer(false);
    $('#scrim').hidden = true;
  });
  $('#tourBtn').addEventListener('click', () => tour.start());
  window.addEventListener('resize', () => {
    layoutGrid();
    if (tour.active) tour.place();
  });

  // background life: someone writes in #ideas after a while
  setTimeout(() => addMessage('ideas', { id: nextId(), u: 'kim', t: clockNow(), text: 'Back! Did I miss the movie? 😅' }, { silent: false }), 45000);
  setTimeout(() => {
    if (state.room !== 'dm_mara') addMessage('dm_mara', { id: nextId(), u: 'mara', t: clockNow(), text: 'Psst: try the Diddy theme with the Aurora nameplate. 😉' });
  }, 25000);

  // ---------------------------------------------------------------- tour
  const isNarrow = () => window.innerWidth <= 820;
  const tour = {
    active: false,
    i: 0,
    steps: [
      {
        title: 'Welcome to Diddy',
        text: 'A Matrix chat app for macOS, Linux and iPhone/iPad, built on Cinny, with voice chat that actually works. Everything here is made up and runs only in your browser.',
        target: null,
        run: () => selectRoom('general'),
      },
      {
        title: 'Rooms and voice rooms',
        text: 'Voice rooms show who\'s inside before you join, with a red mic for anyone muted and LIVE for streams.',
        target: () => (isNarrow() ? null : $('.voice-room[data-room="lounge"]')?.parentElement ? $('#roomList') : null),
        run: () => {
          selectRoom('general');
          if (isNarrow()) openSide();
        },
      },
      {
        title: 'Calls, drawn by Diddy',
        text: 'Every person and every screen share is its own tile. Click a tile to bring it big, Escape goes back to the grid. Anton\'s tile shows he\'s talking to his voice agent.',
        target: () => $('#callGrid'),
        run: () => {
          closeSide();
          if (!state.call || state.call.room !== 'lounge') joinCall('lounge');
          else selectRoom('lounge');
        },
      },
      {
        title: 'The call bar',
        text: 'Mic and output with device picker in one button. Headphones mute mic and sound together, a second click brings both back. Share has system audio on/off, even before you start.',
        target: () => $('#callBar'),
        run: () => selectRoom('lounge'),
      },
      {
        title: 'Chat',
        text: 'Voice messages (try the mic in the composer), reactions, replies and a right-click menu of its own with Copy Text. Write something, someone will answer.',
        target: () => $('#timeline'),
        run: () => selectRoom('general'),
      },
      {
        title: 'Bot cards',
        text: 'Bots can post real cards with buttons. This one controls the music in the call. Press Skip.',
        target: () => $('.botcard'),
        run: () => selectRoom('music'),
      },
      {
        title: 'Profiles',
        text: 'Banner, badges, name effects, animated avatar rings and nameplates. Everyone using Diddy sees them.',
        target: () => $('#profilePop'),
        run: () => {
          selectRoom('general');
          setTimeout(() => {
            const a = $('.msg [data-profile="mara"]');
            openProfile('mara', a || undefined);
            tour.place();
          }, 30);
        },
      },
      {
        title: 'Ten themes',
        text: 'Pick one, the whole app follows. Same colours as the real app.',
        target: () => $('#themeGrid'),
        run: () => {
          closePop();
          openSettings('appearance');
        },
      },
      {
        title: 'Plugins',
        text: 'Plugins are small web pages in a locked sandbox. These are the real built-in ones, running live. Roll the dice.',
        target: () => $('#pluginList'),
        run: () => openSettings('plugins'),
      },
      {
        title: 'Like it?',
        text: 'Download Diddy for macOS, Linux or iPhone/iPad. Free and open source. Or keep clicking around here.',
        target: () => $('#demoBar .cta'),
        run: () => closeModal(),
      },
    ],
    start() {
      this.active = true;
      this.i = 0;
      this.show();
    },
    stop() {
      this.active = false;
      $('#tourSpot')?.remove();
      $('#tourTip')?.remove();
      $('#tourBlock')?.remove();
      try {
        localStorage.setItem('diddy-demo-toured', '1');
      } catch {
        /* storage blocked */
      }
    },
    show() {
      const s = this.steps[this.i];
      if (s.run) s.run();
      if (!$('#tourBlock')) {
        const b = document.createElement('div');
        b.id = 'tourBlock';
        b.className = 'tour-block';
        document.body.appendChild(b);
        const spot = document.createElement('div');
        spot.id = 'tourSpot';
        spot.className = 'spot';
        document.body.appendChild(spot);
        const tip = document.createElement('div');
        tip.id = 'tourTip';
        tip.className = 'tourtip';
        tip.setAttribute('role', 'dialog');
        document.body.appendChild(tip);
        tip.addEventListener('click', (e) => {
          const a = e.target.closest('[data-tour]');
          if (!a) return;
          if (a.dataset.tour === 'next') {
            if (this.i < this.steps.length - 1) {
              this.i += 1;
              this.show();
            } else this.stop();
          } else if (a.dataset.tour === 'back' && this.i > 0) {
            this.i -= 1;
            this.show();
          } else if (a.dataset.tour === 'skip') this.stop();
        });
      }
      const last = this.i === this.steps.length - 1;
      $('#tourTip').innerHTML = `<div class="tourtip__step">${this.i + 1} of ${this.steps.length}</div><h3>${s.title}</h3><p>${s.text}</p>
        <div class="tourtip__btns"><div class="tourtip__dots">${this.steps.map((_, k) => `<i class="${k === this.i ? 'is-on' : ''}"></i>`).join('')}</div><span class="grow"></span>
        ${this.i === 0 ? '<button class="dbtn dbtn--ghost" type="button" data-tour="skip">Explore myself</button>' : '<button class="dbtn dbtn--ghost" type="button" data-tour="back">Back</button>'}
        <button class="dbtn dbtn--accent" type="button" data-tour="next">${last ? 'Done' : this.i === 0 ? 'Start tour' : 'Next'}</button></div>`;
      setTimeout(() => this.place(), 60);
      setTimeout(() => this.place(), 260);
    },
    place() {
      if (!this.active) return;
      const s = this.steps[this.i];
      const spot = $('#tourSpot');
      const tip = $('#tourTip');
      if (!spot || !tip) return;
      const el = s.target ? s.target() : null;
      const r = el ? el.getBoundingClientRect() : null;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      if (!r || r.width === 0) {
        spot.style.cssText = `left:${W / 2}px;top:${H / 2}px;width:0;height:0`;
        tip.style.left = `${(W - tw) / 2}px`;
        tip.style.top = `${Math.max(12, (H - th) / 2)}px`;
        return;
      }
      const pad = 6;
      const top = Math.max(4, r.top - pad);
      const left = Math.max(4, r.left - pad);
      const bottom = Math.min(H - 4, r.bottom + pad);
      const right = Math.min(W - 4, r.right + pad);
      spot.style.cssText = `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px`;
      let tx;
      let ty;
      if (right + 16 + tw < W) {
        tx = right + 16;
        ty = top;
      } else if (left - 16 - tw > 0) {
        tx = left - 16 - tw;
        ty = top;
      } else if (bottom + 16 + th < H) {
        tx = left + (right - left - tw) / 2;
        ty = bottom + 16;
      } else if (top - 16 - th > 0) {
        tx = left + (right - left - tw) / 2;
        ty = top - 16 - th;
      } else {
        tx = (W - tw) / 2;
        ty = H - th - 16;
      }
      tip.style.left = `${Math.max(12, Math.min(tx, W - tw - 12))}px`;
      tip.style.top = `${Math.max(12, Math.min(ty, H - th - 12))}px`;
    },
  };

  // ---------------------------------------------------------------- boot
  $$('[data-icon]').forEach((el) => {
    el.outerHTML = ic(el.dataset.icon);
  });
  let saved = null;
  try {
    saved = localStorage.getItem('diddy-demo-theme');
  } catch {
    /* storage blocked */
  }
  applyTheme(THEMES[saved] ? saved : 'diddy');
  renderAll();
  let toured = false;
  try {
    toured = localStorage.getItem('diddy-demo-toured') === '1';
  } catch {
    /* storage blocked */
  }
  const params = new URLSearchParams(location.search);
  if (params.has('tour') || !toured) setTimeout(() => tour.start(), 400);
})();
