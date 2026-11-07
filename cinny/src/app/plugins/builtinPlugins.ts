/**
 * Plugins that ship with Diddy. Each is one self-contained HTML page (plugins/builtin/<slug>.html)
 * that runs in the same sandboxed iframe as every other plugin, only loaded from memory (`srcdoc`)
 * instead of an address. They need no account, no key and no setup.
 */

export type BuiltinPlugin = { slug: string; name: string; description: string };

const CATALOG: BuiltinPlugin[] = [
  { slug: 'clock', name: 'Clock', description: 'Time and date, with a second time zone.' },
  { slug: 'weather', name: 'Weather', description: 'Current weather and a 4-day forecast.' },
  { slug: 'timer', name: 'Focus timer', description: 'Pomodoro and a free countdown.' },
  { slug: 'notes', name: 'Notes', description: 'A quick notepad that saves itself.' },
  { slug: 'todo', name: 'To-do', description: 'A short task list.' },
  { slug: 'currency', name: 'Currency', description: 'Convert between common currencies.' },
  { slug: 'dice', name: 'Dice', description: 'Dice and coin for game nights.' },
  { slug: 'calendar', name: 'Calendar', description: 'A month at a glance.' },
];

// bundled at build time; a page that does not exist yet is simply not offered
const PAGES = import.meta.glob('./builtin/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const pageFor = (slug: string): string | undefined => PAGES[`./builtin/${slug}.html`];

export const getBuiltinPlugins = (): BuiltinPlugin[] => CATALOG.filter((p) => pageFor(p.slug));

export const getBuiltinHtml = (slug: string): string | undefined => pageFor(slug);
