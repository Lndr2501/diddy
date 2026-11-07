/**
 * Right-click inside the embedded call (Element Call): Diddy's message menu does not exist there,
 * and the web view's own menu is switched off (Reload, Inspect ...). This adds a tiny menu with
 * "Copy" for the selected text, or for the text under the pointer, so chat messages in the call
 * can still be copied.
 */
const MENU_ATTR = 'data-diddy-frame-menu';
const MAX_COPY = 4000;

const textToCopy = (doc: Document, target: EventTarget | null): string => {
  const selected = doc.defaultView?.getSelection?.()?.toString().trim();
  if (selected) return selected.slice(0, MAX_COPY);
  const el = target as HTMLElement | null;
  // the closest element that holds some text of its own, not the whole page
  let node: HTMLElement | null = el;
  while (node && node !== doc.body) {
    const text = node.innerText?.trim();
    if (text && text.length <= MAX_COPY && node.childElementCount <= 6) return text;
    node = node.parentElement;
  }
  return '';
};

const copy = async (doc: Document, text: string): Promise<void> => {
  try {
    await doc.defaultView?.navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall back to the old way below
  }
  const area = doc.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  area.select();
  doc.execCommand('copy');
  area.remove();
};

export const installCallFrameMenu = (doc: Document | null | undefined): void => {
  if (!doc || !doc.body) return;
  const marked = doc as Document & { __diddyFrameMenu?: boolean };
  if (marked.__diddyFrameMenu) return;
  marked.__diddyFrameMenu = true;

  const close = () => doc.querySelectorAll(`[${MENU_ATTR}]`).forEach((n) => n.remove());

  doc.addEventListener('contextmenu', (evt) => {
    // the guard already prevented the event unless the native menu is wanted (inputs, Option)
    if (!evt.defaultPrevented) return;
    close();
    const text = textToCopy(doc, evt.target);
    if (!text) return;

    const menu = doc.createElement('div');
    menu.setAttribute(MENU_ATTR, '');
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed',
      zIndex: '2147483647',
      minWidth: '140px',
      padding: '4px',
      borderRadius: '10px',
      background: 'rgba(30, 30, 34, 0.96)',
      color: '#fff',
      font: '13px -apple-system, system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,.45)',
      border: '1px solid rgba(255,255,255,.1)',
      backdropFilter: 'blur(14px)',
    });
    const item = doc.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.textContent = 'Copy';
    Object.assign(item.style, {
      all: 'unset',
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 10px',
      borderRadius: '6px',
      cursor: 'default',
    });
    item.onmouseenter = () => {
      item.style.background = 'rgba(255,255,255,.14)';
    };
    item.onmouseleave = () => {
      item.style.background = 'transparent';
    };
    item.onclick = () => {
      copy(doc, text).finally(close);
    };
    menu.appendChild(item);
    doc.body.appendChild(menu);

    const view = doc.defaultView;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const maxX = (view?.innerWidth ?? evt.clientX + width) - width - 4;
    const maxY = (view?.innerHeight ?? evt.clientY + height) - height - 4;
    menu.style.left = `${Math.max(4, Math.min(evt.clientX, maxX))}px`;
    menu.style.top = `${Math.max(4, Math.min(evt.clientY, maxY))}px`;
  });

  doc.addEventListener('mousedown', (evt) => {
    const t = evt.target as HTMLElement | null;
    if (!t?.closest?.(`[${MENU_ATTR}]`)) close();
  });
  doc.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') close();
  });
  doc.addEventListener('scroll', close, true);
  doc.defaultView?.addEventListener('blur', close);
};
