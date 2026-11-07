// Fetching from MyInstants for the soundboard import (the site sends no CORS headers, so the page
// cannot fetch it itself). Same narrow rules as src-tauri/src/myinstants.rs: only https on
// myinstants.com, redirects must stay there, size limits, audio must be audio/*.
const HOSTS = ['www.myinstants.com', 'myinstants.com'];
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20000;

const isAllowed = (url) => url.protocol === 'https:' && HOSTS.includes(url.hostname);

const checkedUrl = (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    throw new Error(`invalid url: ${e.message}`);
  }
  if (!isAllowed(url)) throw new Error('only https://myinstants.com links are allowed');
  return url;
};

const getLimited = async (raw, limit, audio, fetchImpl = fetch) => {
  let url = checkedUrl(raw);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let response;
  for (let hop = 0; ; hop += 1) {
    response = await fetchImpl(url, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': 'Diddy/1.0 (soundboard import)' },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    const next = location ? new URL(location, url) : undefined;
    if (!next || hop >= MAX_REDIRECTS || !isAllowed(next)) {
      throw new Error(`MyInstants answered ${response.status}`);
    }
    url = next;
  }
  if (!response.ok) throw new Error(`MyInstants answered ${response.status}`);
  if (audio && !(response.headers.get('content-type') || '').startsWith('audio/')) {
    throw new Error('not an audio file');
  }
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('file is too large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > limit) throw new Error('file is too large');
  return bytes;
};

const fetchText = async (raw, fetchImpl) =>
  new TextDecoder().decode(await getLimited(raw, MAX_HTML_BYTES, false, fetchImpl));

/** Returns an ArrayBuffer, like the Tauri command (the page decodes it as audio). */
const fetchAudio = async (raw, fetchImpl) => {
  const bytes = await getLimited(raw, MAX_AUDIO_BYTES, true, fetchImpl);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

module.exports = { checkedUrl, fetchText, fetchAudio, MAX_AUDIO_BYTES };
