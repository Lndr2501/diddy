// Seeds two display accounts (Mara, Jonas) with a small German chat so README images look real.
// Idempotent: accounts are registered once (passwords appended to the accounts file), rooms and
// messages are created only when Mara has no "Allgemein" room yet.
const fs = require('fs');
const { HS, accounts } = require('../ui-mac/helpers.cjs');
const os = require('os');
const path = require('path');

const accountsFile =
  process.env.DIDDY_TEST_ACCOUNTS || path.join(os.homedir(), 'diddy-testserver', 'accounts.txt');

const call = async (method, url, token, body) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await fetch(`${HS}/_matrix/client/v3${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = (await res.json().catch(() => ({}))).retry_after_ms || 1000;
      await new Promise((r) => setTimeout(r, wait + 200));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`), { status: res.status, json });
    return json;
  }
  throw new Error(`${method} ${url}: rate limited`);
};

const ensureAccount = async (user, displayname) => {
  if (!accounts[user]) {
    const password = require('crypto').randomBytes(15).toString('base64url');
    await call('POST', '/register', null, {
      username: user,
      password,
      auth: { type: 'm.login.dummy' },
      inhibit_login: true,
    });
    fs.appendFileSync(accountsFile, `${user} ${password}\n`);
    accounts[user] = password;
  }
  const login = await call('POST', '/login', null, {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user },
    password: accounts[user],
  });
  await call('PUT', `/profile/${encodeURIComponent(login.user_id)}/displayname`, login.access_token, { displayname });
  return login;
};

const MESSAGES = {
  Allgemein: [
    ['mara', 'Willkommen bei Diddy! 👋'],
    ['jonas', 'Sieht richtig gut aus. Läuft der Sprachchat auch ohne Ruckeln?'],
    ['mara', 'Ja, das Mikrofon läuft ohne Apples Sprachverarbeitung, die Musik wird nicht mehr leiser.'],
    ['jonas', 'Und Themes gibt es auch?'],
    ['mara', 'Neun Stück, von Light bis Amber. Probier mal "Diddy". 🎨'],
    ['jonas', 'Mach ich! Bildschirm teilen mit Ton geht auch, oder?'],
    ['mara', 'Klar, mit System-Ton. Heute Abend Filmabend? 🍿'],
    ['jonas', 'Bin dabei. Ich bringe die Snacks mit.'],
    ['mara', 'Perfekt, ich mache den Raum um acht auf. 🎬'],
    ['jonas', 'Und das Profil mit Badges sehen dann alle? 😄'],
    ['mara', 'Ja, Namen, Farben und Effekte sehen alle Diddy-Nutzer.'],
  ],
  Ideen: [
    ['jonas', 'Wir sollten ein Plugin für die Einkaufsliste bauen.'],
    ['mara', 'Gibt es schon: Plugins → Galerie → To-do. ✅'],
  ],
  'Musik & Sound': [
    ['mara', 'Neues Soundboard-Pack ist drin, 24 Sounds.'],
    ['jonas', 'Dann bitte den Airhorn-Sound nicht im Call. 😅'],
  ],
};

async function seed() {
  const mara = await ensureAccount('shota', 'Mara');
  const jonas = await ensureAccount('shotb', 'Jonas');
  const who = { mara, jonas };
  const joined = (await call('GET', '/joined_rooms', mara.access_token)).joined_rooms;
  if (process.env.RESEED) {
    for (const id of joined) {
      for (const u of [mara, jonas]) {
        await call('POST', `/rooms/${encodeURIComponent(id)}/leave`, u.access_token, {}).catch(() => null);
        await call('POST', `/rooms/${encodeURIComponent(id)}/forget`, u.access_token, {}).catch(() => null);
      }
    }
    joined.length = 0;
  }
  let have = false;
  for (const id of joined) {
    const name = await call('GET', `/rooms/${encodeURIComponent(id)}/state/m.room.name`, mara.access_token).catch(() => null);
    if (name && name.name === 'Allgemein') have = true;
  }
  if (!have) {
    let txn = Date.now();
    for (const [name, msgs] of Object.entries(MESSAGES)) {
      const { room_id: roomId } = await call('POST', '/createRoom', mara.access_token, {
        name,
        preset: 'private_chat',
        invite: [jonas.user_id],
      });
      await call('POST', `/join/${encodeURIComponent(roomId)}`, jonas.access_token, {});
      for (const [who_, text] of msgs) {
        txn += 1;
        await call('PUT', `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txn}`, who[who_].access_token, { msgtype: 'm.text', body: text });
        await new Promise((r) => setTimeout(r, 120));
      }
    }
  }
  return { mara, jonas };
}

module.exports = { seed };
