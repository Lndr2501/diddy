// What the settings sidebar search finds (#182).
//
// The search used to match only page names and a few keywords, so looking for an actual setting
// ("noise suppression", "nameplates", "time format") found nothing. Every page now lists the
// titles of its settings; tests/settingsSearch.test.cjs fails when a setting title in
// features/settings is missing here, so new settings stay findable.

export type SettingsSearchEntry = {
  /** page name shown in the sidebar */
  name: string;
  /** extra words that should find the page */
  keywords: string;
  /** titles of the settings on the page, shown under the page while searching */
  titles: string[];
};

export const SETTINGS_SEARCH_INDEX: Record<string, SettingsSearchEntry> = {
  chat: {
    name: 'Chat',
    keywords: 'language editor messages media links privacy time date layout timeline preview',
    titles: [
      'Chat',
      'Messages',
      'Message Layout',
      'Message Spacing',
      'Legacy Username Color',
      'Timeline',
      'Hide Membership Change',
      'Hide Profile Change',
      'Show Hidden Events',
      'Media & Previews',
      'Disable Media Auto Load',
      'Url Preview',
      'Url Preview in Encrypted Room',
      'Editor',
      'ENTER for Newline',
      'Markdown Formatting',
      'Hide Typing & Read Receipts',
      'Date & Time',
      '24-Hour Time Format',
      'Date Format',
    ],
  },

  calls: {
    name: 'Calls & Audio',
    keywords: 'call voice audio sound microphone agent dictation watch together video camera webcam',
    titles: [
      'Calls & Audio',
      'Calls',
      'Noise suppression',
      'Voice processing',
      'Camera',
      'Volumes of people',
      'Sounds',
      'New message',
      'Mention',
      'Invitation',
      'Incoming call',
      'Outgoing call',
      'Microphone changed',
      'Connection lost',
      'Talking to an agent',
      'Mute in the call meanwhile',
      'Show the others in the call',
      'Hotkey',
      'Hotkey works like',
      'Also in the background',
      'Detect dictation hotkey',
      'Watch together',
      'Skip segments with SponsorBlock',
    ],
  },
  appearance: {
    name: 'Appearance',
    keywords: 'theme dark light colour color font app icon wallpaper animation animated gif',
    titles: [
      'Theme',
      'Match System Appearance',
      'Light Appearance',
      'Dark Appearance',
      'Custom Theme',
      'Accent',
      'Background',
      'Text',
      'Gradient Background',
      'Gradient Start',
      'Gradient End',
      'Angle',
      'Image, GIF or Video',
      'Video Sound',
      'Volume',
      'Panel Opacity',
      'Reset Colors',
      'Display',
      'Page Zoom',
      'Monochrome Mode',
      'Dynamic Page Title',
      'Direct Messages in Spaces',
      'Emoji',
      'Apple Color Emoji',
      'App Icon',
      'Animated profile pictures',
      'Pictures move in',
      'Only while speaking',
      'Nameplates',
      'Profile effects',
      'Profile frames',
    ],
  },
  notifications: {
    name: 'Notifications',
    keywords: 'sound mention keyword push alert',
    titles: [
      'Notifications',
      'System',
      'Desktop Notifications',
      'Notification Sound',
      'Email Notification',
      'All Messages',
      '1-to-1 Chats',
      '1-to-1 Chats (Encrypted)',
      'Rooms',
      'Rooms (Encrypted)',
      'Mentions',
      'Mention User ID',
      'Contains Display Name',
      'Contains Username',
      'Mention @room',
      'Contains @room',
      'Keywords',
      'Add Keyword',
      'Block Messages',
    ],
  },
  profile: {
    name: 'Profile',
    keywords: 'avatar name banner badge card status',
    titles: [
      'Preview',
      'What others see',
      'Look',
      'Display name',
      'Profile picture',
      'Your old Diddy picture',
      'Name style',
      'Name color',
      'Nameplate',
      'Profile effect',
      'Profile frame',
      'Banner',
      'Drag to choose the visible part',
      'Header & accent',
      'Big profile',
      'Layout variants',
      'Modules',
      'Status',
      'About you',
      'Bio',
      'Activity',
      'Interests',
      'Links',
      'Badges',
      'Equipped badges',
      'Badge library',
      'Create custom badge',
      'Data room',
      'Set up the data room',
      'Diagnostics',
    ],
  },
  account: {
    name: 'Account',
    keywords: 'matrix id email password contact ignored users',
    titles: [
      'Account',
      'Accounts',
      'Add an account or server',
      'Profile',
      'Display Name',
      'Profile Picture',
      'Matrix ID',
      'Contact Information',
      'Email Address',
      'Blocked Users',
      'Block User',
    ],
  },
  devices: {
    name: 'Devices',
    keywords: 'sessions verification encryption backup keys security recovery',
    titles: [
      'Devices',
      'Security',
      'Device Verification',
      'Device Dashboard',
      'This Device',
      'Other Devices',
      'Unverified',
      'Local Backup',
      'Export Messages Data',
      'Import Messages Data',
    ],
  },
  emojisStickers: {
    name: 'Emojis & Stickers',
    keywords: 'emoji sticker pack image',
    titles: ['Emojis & Stickers', 'Default Pack', 'Favorite Packs', 'Select Pack'],
  },
  plugins: {
    name: 'Plugins',
    keywords: 'plugin widget extension add-on addon weather web page',
    titles: ['Plugins', 'Add Plugin', 'Built-in Plugins', 'Without Hosting'],
  },
  developerTools: {
    name: 'Developer Tools',
    keywords: 'debug account data developer',
    titles: ['Developer Tools', 'Enable Developer Tools', 'Access Token', 'Account Data', 'Global', 'Options'],
  },
  about: {
    name: 'About',
    keywords: 'version cache reload credits source',
    titles: [
      'About',
      'Diddy',
      'Welcome guide',
      'Updates',
      'Check for updates',
      'Update repository',
      'Diagnostics',
      'Log file',
      'Options',
      'Clear Cache & Reload',
      'Credits',
    ],
  },
};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}@#]+/gu, ' ')
    .trim();

const words = (text: string): string[] => normalize(text).split(' ').filter(Boolean);

/** Every word of the query has to start a word of the text ("noise sup" finds "Noise suppression"). */
export const textMatches = (text: string, query: string): boolean => {
  const wanted = words(query);
  if (wanted.length === 0) return true;
  const have = words(text);
  return wanted.every((w) => have.some((h) => h.startsWith(w)));
};

/** Whether a page shows up for the query: its name, keywords or any of its setting titles. */
export const entryMatches = (entry: SettingsSearchEntry, query: string): boolean => {
  if (words(query).length === 0) return true;
  if (textMatches(`${entry.name} ${entry.keywords}`, query)) return true;
  return entry.titles.some((title) => textMatches(title, query));
};

/** The settings on a page that match the query, for the hint under the page row. */
export const matchingTitles = (entry: SettingsSearchEntry, query: string, limit = 3): string[] => {
  if (words(query).length === 0) return [];
  return entry.titles
    .filter((title) => title !== entry.name && textMatches(title, query))
    .slice(0, limit);
};
