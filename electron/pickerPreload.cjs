const { ipcRenderer } = require('electron');
// texts in the UI language (lib/screenPicker.cjs pickerQuery); the page keeps its own otherwise
const applyTexts = () => {
  const query = new URLSearchParams(window.location.search);
  const set = (selector, name, attribute) => {
    const value = query.get(name);
    const element = document.querySelector(selector);
    if (!value || !element) return;
    if (attribute) element.setAttribute(attribute, value);
    else element.textContent = value;
  };
  if (query.get('lang')) document.documentElement.lang = query.get('lang');
  set('title', 'title');
  set('h1', 'heading');
  set('p', 'hint');
  set('#sources', 'sources', 'aria-label');
  set('#cancel', 'cancel');
};
window.addEventListener('DOMContentLoaded', async () => {
  applyTexts();
  const list = document.getElementById('sources');
  document.getElementById('cancel').onclick = () => ipcRenderer.send('diddy:screen-select', null);
  try {
    const sources = await ipcRenderer.invoke('diddy:screen-sources');
    for (const source of sources) {
      const button = document.createElement('button');
      const image = document.createElement('img');
      image.src = source.thumbnail;
      image.alt = '';
      const label = document.createElement('span');
      label.textContent = source.name;
      button.append(image, label);
      button.onclick = () => ipcRenderer.send('diddy:screen-select', source.id);
      list.append(button);
    }
    list.querySelector('button')?.focus();
  } catch { window.close(); }
});
