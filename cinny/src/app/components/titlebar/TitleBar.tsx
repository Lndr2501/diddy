import React, { useEffect, useState } from 'react';
import { Icon, IconButton, Icons } from 'folds';
import { useNavigate } from 'react-router-dom';
import * as css from './TitleBar.css';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';

/** Follows document.title, which TitleUpdater keeps at "room – space – Diddy". */
const useDocumentTitle = (enabled: boolean): string => {
  const [title, setTitle] = useState(document.title);
  useEffect(() => {
    if (!enabled) return undefined;
    setTitle(document.title);
    const el = document.querySelector('title');
    if (!el) return undefined;
    const observer = new MutationObserver(() => setTitle(document.title));
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled]);
  return title;
};

/**
 * The custom title row is only needed in the Tauri desktop app on macOS, where the window uses an
 * overlay title bar and the traffic lights are drawn on top of the web content.
 */
export const useHasCustomTitleBar = (): boolean =>
  typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in window &&
  /mac/i.test(window.navigator.platform);

export function TitleBar() {
  const navigate = useNavigate();
  const [showTitle] = useSetting(settingsAtom, 'showDynamicPageTitle');
  const title = useDocumentTitle(showTitle);

  return (
    <div className={css.TitleBar} data-tauri-drag-region>
      <IconButton
        variant="Background"
        fill="None"
        size="300"
        radii="300"
        aria-label="Back"
        onClick={() => navigate(-1)}
      >
        <Icon size="200" src={Icons.ArrowLeft} />
      </IconButton>
      <IconButton
        variant="Background"
        fill="None"
        size="300"
        radii="300"
        aria-label="Forward"
        onClick={() => navigate(1)}
      >
        <Icon size="200" src={Icons.ArrowRight} />
      </IconButton>
      <div className={css.TitleBarSpacer} data-tauri-drag-region>
        {showTitle && title}
      </div>
    </div>
  );
}
