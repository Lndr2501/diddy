import type { Settings as SettingsComponent } from './Settings';
import { lazyNamed } from '../../components/LazyPage';

export { SettingsPages } from './settingsPages';

/** Settings are loaded when first opened (they are a large part of the app). */
export const Settings = lazyNamed<Parameters<typeof SettingsComponent>[0]>(
  () => import('./Settings'),
  'Settings'
);
