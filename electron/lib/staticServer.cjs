// Serves the built frontend on http://localhost:<port>, like tauri-plugin-localhost does for the
// Tauri build. Same origin as before (service worker, Element Call widget, storage keys), a secure
// context (localhost), and real MIME types (WebAssembly needs application/wasm).
// Only loopback, only GET/HEAD, only files inside the frontend folder, only our own Host header.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
};

const contentType = (file) => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * Maps a request path to a file inside `root`, or undefined. Paths without a file extension that
 * do not exist fall back to index.html (client-side routes); anything escaping `root` is refused.
 */
const resolveFile = (root, requestPath) => {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0].split('#')[0]);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) return undefined;
  const base = path.resolve(root);
  const target = path.resolve(base, `.${path.posix.normalize(`/${decoded}`)}`);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return undefined;
  try {
    const stat = fs.statSync(target);
    if (stat.isFile()) return target;
    if (stat.isDirectory()) {
      const index = path.join(target, 'index.html');
      if (fs.statSync(index).isFile()) return index;
    }
  } catch {
    // not there
  }
  if (path.extname(decoded) === '') return path.join(base, 'index.html');
  return undefined;
};

const allowedHosts = (port) => new Set([`localhost:${port}`, `127.0.0.1:${port}`]);

const handler = (root, port) => {
  const hosts = allowedHosts(port);
  return (req, res) => {
    if (!hosts.has(req.headers.host ?? '')) {
      res.writeHead(421).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const file = resolveFile(root, req.url ?? '/');
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    fs.stat(file, (error, stat) => {
      if (error) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'content-type': contentType(file),
        'content-length': stat.size,
        'x-content-type-options': 'nosniff',
        'cache-control': cacheControl(req.url ?? '/'),
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
    });
  };
};

/**
 * Build output with a content hash in its name (`/assets/index-BsyCF7gU.js`, also Element Call's)
 * never changes under that name: it may stay in the cache for good, so a start reads the ~10 MB of
 * scripts and crypto code from the cache instead of the server again. Before, everything expired
 * after an hour. The page shell, the service worker and the config must follow an update at once.
 */
const HASHED_ASSET = /^\/(?:public\/element-call\/)?assets\/[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;
const cacheControl = (url) => {
  const pathname = String(url).split(/[?#]/)[0];
  if (HASHED_ASSET.test(pathname)) return 'public, max-age=31536000, immutable';
  const name = path.posix.basename(pathname);
  if (name === '' || name === 'index.html' || name === 'sw.js' || name === 'config.json') return 'no-cache';
  return 'public, max-age=3600';
};

/** Starts the server on 127.0.0.1:<port>; resolves with the server, rejects if the port is taken. */
const startStaticServer = (root, port) =>
  new Promise((resolve, reject) => {
    const server = http.createServer(handler(root, port));
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });

module.exports = { cacheControl, contentType, resolveFile, startStaticServer };
