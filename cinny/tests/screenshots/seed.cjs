// Seeds a fictional team ("Northwind Studio") on a throwaway Synapse so the README images show
// example data only. Nothing here comes from a real account.
//
// - Five accounts (ava = the viewer, noah, mia, leo, zoe) with generated avatars and presence.
// - One space with four rooms plus four direct chats, English messages with replies, reactions
//   and an image, spread over yesterday and today.
// - Messages carry real timestamps through an application service (see README in this folder),
//   so the timeline does not show a wall of identical times.
//
// Idempotent: accounts are registered once (passwords appended to the accounts file). Rooms are
// created only when ava has none; RESEED=1 makes everyone leave first.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { HS, accounts } = require('../ui-mac/helpers.cjs');

const accountsFile =
  process.env.DIDDY_TEST_ACCOUNTS || path.join(os.homedir(), 'diddy-testserver', 'accounts.txt');
const AS_TOKEN = process.env.DIDDY_TEST_AS_TOKEN || 'shots_as_token_0123456789';
const SERVER = 'localhost';

const PEOPLE = {
  ava: { name: 'Ava Laurent', hues: [262, 320] },
  noah: { name: 'Noah Becker', hues: [205, 170] },
  mia: { name: 'Mia Chen', hues: [340, 20] },
  leo: { name: 'Leo Marino', hues: [30, 55] },
  zoe: { name: 'Zoe Alvarez', hues: [150, 195] },
};
// filled by seed(): the registered user ids (shota, shotnoah, ...)
const ids = {};
const idOf = (key) => ids[key];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, { token, body, query, raw } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await fetch(`${HS}${url}${qs}`, {
      method,
      headers: {
        ...(raw ? { 'Content-Type': raw.type } : { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: raw ? raw.data : body && JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = (await res.json().catch(() => ({}))).retry_after_ms || 1000;
      await sleep(wait + 200);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`), {
        status: res.status,
        json,
      });
    }
    return json;
  }
  throw new Error(`${method} ${url}: rate limited`);
}
const c = (method, url, token, body, query) =>
  api(method, `/_matrix/client/v3${url}`, { token, body, query });

/** Renders HTML to a PNG buffer with the installed Chrome (or Playwright's Chromium). */
async function renderPng(html, width, height) {
  const browser = await chromium.launch({
    executablePath: process.env.DIDDY_SHOTS_CHROME || undefined,
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`<body style="margin:0;overflow:hidden">${html}</body>`);
    return await page.screenshot({ type: 'png' });
  } finally {
    await browser.close();
  }
}

const avatarHtml = ([h1, h2], seed) => {
  const rot = (seed * 47) % 360;
  return `<div style="width:256px;height:256px;position:relative;overflow:hidden;
    background:linear-gradient(${rot}deg,hsl(${h1} 85% 62%),hsl(${h2} 90% 52%))">
    <div style="position:absolute;width:150px;height:150px;border-radius:50%;left:${20 + (seed % 3) * 30}px;top:-30px;background:hsl(${h1} 95% 85% / .55)"></div>
    <div style="position:absolute;width:210px;height:210px;border-radius:50%;right:-50px;bottom:-60px;background:hsl(${h2} 80% 30% / .45)"></div>
    <div style="position:absolute;width:70px;height:70px;border-radius:50%;left:92px;top:78px;background:#fff9"></div>
    <div style="position:absolute;width:150px;height:110px;border-radius:75px 75px 0 0;left:53px;top:170px;background:#fff9"></div>
  </div>`;
};

const spaceHtml = `<div style="width:256px;height:256px;position:relative;overflow:hidden;
  background:linear-gradient(135deg,#ff7a59,#ffb347)">
  <div style="position:absolute;width:300px;height:300px;border-radius:50%;left:-90px;bottom:-170px;background:#7a2cf0aa"></div>
  <div style="position:absolute;width:150px;height:150px;border-radius:50%;right:30px;top:40px;background:#fff7"></div>
  <div style="position:absolute;left:46px;top:62px;font:800 120px/1 system-ui,sans-serif;color:#fff">N</div></div>`;

const illustrationHtml = `<div style="width:960px;height:400px;position:relative;overflow:hidden;
  background:linear-gradient(180deg,#ffd6a5 0%,#ffadad 55%,#cdb4db 100%)">
  <div style="position:absolute;width:210px;height:210px;border-radius:50%;left:640px;top:70px;background:#fff6b8;box-shadow:0 0 120px 60px #fff3"></div>
  <svg width="960" height="400" viewBox="0 0 960 560" preserveAspectRatio="none" style="position:absolute;inset:0">
    <path d="M0 400 L180 250 L330 380 L520 200 L720 390 L960 270 L960 560 L0 560Z" fill="#a06cd5"/>
    <path d="M0 460 L150 340 L300 450 L500 320 L700 450 L960 350 L960 560 L0 560Z" fill="#6247aa"/>
    <path d="M0 520 L220 430 L420 500 L640 420 L960 510 L960 560 L0 560Z" fill="#2b2d6e"/>
  </svg></div>`;

async function ensureAccount(key) {
  const user = key === 'ava' ? 'shota' : `shot${key}`;
  if (!accounts[user]) {
    const password = require('crypto').randomBytes(15).toString('base64url');
    await c('POST', '/register', null, {
      username: user,
      password,
      auth: { type: 'm.login.dummy' },
      inhibit_login: true,
    });
    fs.mkdirSync(path.dirname(accountsFile), { recursive: true });
    fs.appendFileSync(accountsFile, `${user} ${password}\n`);
    accounts[user] = password;
  }
  const login = await c('POST', '/login', null, {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user },
    password: accounts[user],
  });
  return { key, user, userId: login.user_id, token: login.access_token };
}

async function uploadPng(token, buf, name) {
  const res = await api('POST', '/_matrix/media/v3/upload', {
    token,
    query: { filename: name },
    raw: { type: 'image/png', data: buf },
  });
  return res.content_uri;
}

async function seed() {
  const users = {};
  let seedIndex = 0;
  for (const key of Object.keys(PEOPLE)) {
    const u = await ensureAccount(key);
    users[key] = u;
    ids[key] = u.userId;
    await c('PUT', `/profile/${encodeURIComponent(u.userId)}/displayname`, u.token, {
      displayname: PEOPLE[key].name,
    });
    seedIndex += 1;
    const png = await renderPng(avatarHtml(PEOPLE[key].hues, seedIndex), 256, 256);
    const uri = await uploadPng(u.token, png, `${key}.png`);
    await c('PUT', `/profile/${encodeURIComponent(u.userId)}/avatar_url`, u.token, {
      avatar_url: uri,
    });
  }
  // The profile API accepts the appservice token for the account's own profile as well, but the
  // accounts above are set up with their own tokens, so nothing else is needed here.

  const ava = users.ava;
  const joined = (await c('GET', '/joined_rooms', ava.token)).joined_rooms;
  if (process.env.RESEED) {
    for (const id of joined) {
      for (const u of Object.values(users)) {
        await c('POST', `/rooms/${encodeURIComponent(id)}/leave`, u.token, {}).catch(() => null);
        await c('POST', `/rooms/${encodeURIComponent(id)}/forget`, u.token, {}).catch(() => null);
      }
    }
    joined.length = 0;
  }
  if (joined.length === 0) await buildWorld(users);
  await setPresence(users);
  return users;
}

const enc = encodeURIComponent;
let txn = Date.now();

/** Sends an event as `who` at `minutesAgo` (needs the application service for the timestamp). */
async function send(roomId, who, content, minutesAgo, type = 'm.room.message') {
  txn += 1;
  const res = await api('PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/send/${type}/${txn}`, {
    token: AS_TOKEN,
    body: content,
    query: { user_id: idOf(who), ts: String(Date.now() - Math.round(minutesAgo * 60000)) },
  });
  return res.event_id;
}

/** Sends as the user themselves, now. Only live sends raise unread counts for the viewer. */
async function sendLive(roomId, users, who, content) {
  txn += 1;
  return c('PUT', `/rooms/${enc(roomId)}/send/m.room.message/${txn}`, users[who].token, content);
}

async function buildWorld(users) {
  const ava = users.ava;
  const others = ['noah', 'mia', 'leo', 'zoe'];

  const makeRoom = async (opts, members = others) => {
    const { room_id: roomId } = await c('POST', '/createRoom', ava.token, {
      preset: 'private_chat',
      invite: members.map(idOf),
      ...opts,
    });
    for (const m of members) await c('POST', `/join/${enc(roomId)}`, users[m].token, {});
    return roomId;
  };

  // Space with four rooms
  const spaceAvatar = await uploadPng(ava.token, await renderPng(spaceHtml, 256, 256), 'space.png');
  const space = await makeRoom({
    name: 'Northwind Studio',
    topic: 'Design, code and coffee.',
    creation_content: { type: 'm.space' },
    initial_state: [
      { type: 'm.room.avatar', state_key: '', content: { url: spaceAvatar } },
    ],
  });
  const room = async (name, topic) => {
    const id = await makeRoom({ name, topic });
    await c('PUT', `/rooms/${enc(space)}/state/m.space.child/${enc(id)}`, ava.token, {
      via: [SERVER],
    });
    return id;
  };
  const general = await room('general', 'Everything that does not fit elsewhere');
  const design = await room('design', 'Illustrations, icons and layouts');
  const music = await room('music-lounge', 'Focus playlists and good vibes');
  const dev = await room('dev', 'Builds, reviews and releases');

  // Direct chats
  const direct = {};
  for (const key of others) {
    const { room_id: id } = await c('POST', '/createRoom', ava.token, {
      is_direct: true,
      preset: 'trusted_private_chat',
      invite: [idOf(key)],
    });
    await c('POST', `/join/${enc(id)}`, users[key].token, {});
    direct[key] = id;
  }
  await c('PUT', `/user/${enc(ava.userId)}/account_data/m.direct`, ava.token,
    Object.fromEntries(others.map((k) => [idOf(k), [direct[k]]])));

  const D = 26 * 60; // yesterday, in minutes
  const react = (roomId, who, eventId, key, minutesAgo) =>
    send(roomId, who, { 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key } },
      minutesAgo, 'm.reaction');
  const text = (body) => ({ msgtype: 'm.text', body });

  // general
  const beta = await send(general, 'noah', text('Heads up: the 2.4 beta is on TestFlight now 🚀'), D);
  await send(general, 'mia', text('Installing it now, thanks Noah!'), D - 4);
  await send(general, 'leo', text('Dark mode finally looks right on the map screen 👀'), D - 9);
  const wrap = await send(general, 'ava', text("Great work everyone. Let's collect feedback until Friday."), D - 15);
  await react(general, 'mia', beta, '🎉', D - 5);
  await react(general, 'ava', beta, '🎉', D - 6);
  await react(general, 'zoe', beta, '🚀', D - 7);
  await react(general, 'noah', wrap, '👍', D - 14);

  await send(general, 'zoe', text('Morning! Here are the new onboarding illustrations 🎨'), 96);
  const img = await renderPng(illustrationHtml, 960, 400);
  const uri = await uploadPng(users.zoe.token, img, 'onboarding-sunset.png');
  await send(general, 'zoe', {
    msgtype: 'm.image', body: 'onboarding-sunset.png', url: uri,
    info: { mimetype: 'image/png', w: 960, h: 400, size: img.length },
  }, 95);
  const praise = await send(general, 'ava', text('These are gorgeous, Zoe. The warm palette fits the brand perfectly.'), 90);
  await react(general, 'zoe', praise, '❤️', 89);
  await react(general, 'noah', praise, '❤️', 88);
  const ask = await send(general, 'noah', text('Agreed! Can we still squeeze them into 2.4?'), 84);
  await send(general, 'zoe', {
    ...text('Assets are export-ready, engineering just needs to swap them in.'),
    'm.relates_to': { 'm.in_reply_to': { event_id: ask } },
  }, 80);
  await send(general, 'leo', text('I can do that this afternoon. Mia, could you review the PR?'), 62);
  const ok = await send(general, 'mia', text('On it. Standup in ten, same voice room as always 🎧'), 58);
  await react(general, 'leo', ok, '👍', 57);
  await react(general, 'ava', ok, '👍', 56);
  await send(general, 'ava', text('Perfect. See you there ☕'), 40);

  // design (two unread)
  await send(design, 'zoe', text('Uploaded the icon set v3 to the shared board.'), 300);
  await send(design, 'leo', text('Love the rounded corners.'), 290);
  await send(design, 'ava', text('Looks great, thanks Zoe!'), 280);
  await sendLive(design, users, 'zoe', text('Anyone up for a quick review of the empty states before lunch?'));
  await sendLive(design, users, 'noah', text('Sure, give me ten minutes.'));

  // music-lounge (read)
  await send(music, 'mia', text('Friday playlist is up 🎶'), 200);
  await send(music, 'ava', text('Adding some synthwave!'), 190);

  // dev (one mention)
  await send(dev, 'leo', text('Build 2.4.0-beta.2 is green on CI ✅'), 50);
  await sendLive(dev, users, 'leo', text('Build 2.4.0-beta.3 is green on CI ✅'));
  await sendLive(dev, users, 'noah', {
    msgtype: 'm.text',
    body: 'Ava Laurent, can you approve the release notes when you have a minute?',
    format: 'org.matrix.custom.html',
    formatted_body: `<a href="https://matrix.to/#/${ava.userId}">Ava Laurent</a>, can you approve the release notes when you have a minute?`,
    'm.mentions': { user_ids: [ava.userId] },
  });

  // direct chats
  await sendLive(direct.noah, users, 'noah', text('Do you have time for a quick call later?'));
  await send(direct.mia, 'mia', text('Thanks for the review notes!'), 150);
  await send(direct.mia, 'ava', text('Anytime 🙂'), 145);
  await send(direct.leo, 'ava', text('Did the map fix make it into beta.3?'), 400);
  await send(direct.leo, 'leo', text('Yes, it shipped with the last build.'), 380);
  await send(direct.zoe, 'zoe', text('Sent you the brand colors, have a look when you can.'), 600);
  await send(direct.zoe, 'ava', text('Got them, thank you!'), 590);
}

/** noah online, mia idle, leo do-not-disturb, zoe offline (offline needs one online period first). */
async function setPresence(users) {
  const put = (key, presence, status_msg) =>
    c('PUT', `/presence/${enc(users[key].userId)}/status`, users[key].token,
      status_msg ? { presence, status_msg } : { presence });
  await put('noah', 'online');
  await put('mia', 'unavailable');
  await put('leo', 'online', 'Do not disturb');
  await put('zoe', 'online');
  await sleep(500);
  await put('zoe', 'offline');
}

module.exports = { seed, setPresence, PEOPLE };
