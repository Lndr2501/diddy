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

// Bundled at build time, each page in its own small file that is loaded when the plugin opens
// (they were ~100 KB of the start bundle). A page that does not exist yet is simply not offered.
const PAGES = import.meta.glob('./builtin/*.html', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const loaderFor = (slug: string): (() => Promise<string>) | undefined =>
  PAGES[`./builtin/${slug}.html`];

const loaded = new Map<string, string>();

export const getBuiltinPlugins = (): BuiltinPlugin[] => CATALOG.filter((p) => loaderFor(p.slug));

/** The page of a built-in plugin, or undefined when there is no such plugin. */
export const loadBuiltinHtml = async (slug: string): Promise<string | undefined> => {
  const known = loaded.get(slug);
  if (known !== undefined) return known;
  const load = loaderFor(slug);
  if (!load) return undefined;
  const html = await load();
  loaded.set(slug, html);
  return html;
};

/** Already loaded page of a built-in plugin (undefined while not loaded yet). */
export const builtinHtmlIfLoaded = (slug: string): string | undefined => loaded.get(slug);

/** Whether a built-in plugin with this slug exists. */
export const hasBuiltinPlugin = (slug: string): boolean => !!loaderFor(slug);


