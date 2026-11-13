// Reads a web page's head for a link card under a chat message (#197). Same narrow rules as
// src-tauri/src/link_preview.rs: only http(s) to public hosts (also after redirects), only HTML,
// at most 1 MB, 10 seconds. The page parses the answer (cinny/src/app/plugins/linkEmbeds.ts).
const net = require('node:net');

const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; Diddy/1.0; +https://github.com/Lndr2501/diddy) facebookexternalhit/1.1';

const LOCAL_SUFFIXES = ['.local', '.lan', '.home', '.internal', '.intranet', '.corp', '.home.arpa'];

/** Same rules as isPublicHost in linkEmbeds.ts. */
const isPublicHost = (hostname) => {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (net.isIPv6(host)) {
    if (host === '::' || host === '::1' || host.startsWith('::ffff:')) return false;
    return !/^(fc|fd|fe8|fe9|fea|feb)/.test(host);
  }
  if (!host.includes('.')) return false;
  return !LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

const isAllowed = (url) => (url.protocol === 'https:' || url.protocol === 'http:') && isPublicHost(url.hostname);

const readLimited = async (response) => {
  if (!response.body) return new Uint8Array(await response.arrayBuffer()).slice(0, MAX_BYTES);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= MAX_BYTES) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(size, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return bytes;
};

/** HTML of the page behind a chat link (only its start). */
const fetchPage = async (raw, fetchImpl = fetch) => {
  let url;
  try {
    url = new URL(String(raw));
  } catch (e) {
    throw new Error(`invalid url: ${e.message}`);
  }
  if (!isAllowed(url)) throw new Error('only links to public web pages are read');
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let response;
  for (let hop = 0; ; hop += 1) {
    response = await fetchImpl(url, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    const next = location ? new URL(location, url) : undefined;
    if (!next || hop >= MAX_REDIRECTS || !isAllowed(next)) throw new Error(`page answered ${response.status}`);
    url = next;
  }
  if (!response.ok) throw new Error(`page answered ${response.status}`);
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('html')) {
    throw new Error('not a web page');
  }
  return new TextDecoder().decode(await readLimited(response));
};

module.exports = { isPublicHost, fetchPage, MAX_BYTES };
