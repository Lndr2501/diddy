const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', async () => {
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
