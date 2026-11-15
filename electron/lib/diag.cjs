// The app log, same file and format as the Tauri build (src-tauri/src/diag.rs): one line per event
// with a Unix timestamp, newlines removed, length limited, rotated at 2 MB to app.log.old.
//
// Lines wait in memory and are appended in batches with asynchronous file calls. Before, every line
// cost mkdir, stat and an append on the main process's thread, which also answers every IPC call
// and window event, while the page sends hundreds of lines at start (Tauri moved `diag_log` off its
// main thread for the same reason). `flushSync` writes what is left when the process exits.
const fs = require('node:fs');
const path = require('node:path');
const { logDir } = require('./paths.cjs');

const MAX_LINE = 600;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
/** Lines kept while the disk is slow or stuck; further lines are counted and dropped. */
const MAX_QUEUED = 5000;

const formatLine = (line, now = Date.now()) => {
  const text = Array.from(String(line).replace(/[\r\n]/g, '')).slice(0, MAX_LINE).join('');
  return `${(now / 1000).toFixed(3)} ${text}\n`;
};

const logFile = (env = process.env) => path.join(logDir(env), 'app.log');

/** [log folder, formatted line] in the order they were written */
let queued = [];
let dropped = 0;
let scheduled = false;
let writing = Promise.resolve();

/** Takes everything queued, joined per log folder (one append per folder). */
const takeBatches = () => {
  const batches = new Map();
  for (const [dir, text] of queued) batches.set(dir, (batches.get(dir) ?? '') + text);
  if (dropped && queued.length) {
    const dir = queued[queued.length - 1][0];
    batches.set(dir, batches.get(dir) + formatLine(`log: ${dropped} lines dropped (disk too slow)`));
  }
  queued = [];
  dropped = 0;
  return batches;
};

const appendAsync = async (dir, text) => {
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'app.log');
  try {
    if ((await fs.promises.stat(file)).size > MAX_LOG_BYTES) await fs.promises.rename(file, path.join(dir, 'app.log.old'));
  } catch {
    // no log yet
  }
  await fs.promises.appendFile(file, text);
};

const appendSync = (dir, text) => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'app.log');
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, path.join(dir, 'app.log.old'));
  } catch {
    // no log yet
  }
  fs.appendFileSync(file, text);
};

/**
 * Writes the queued lines after the previous batch is done; lines arriving meanwhile join the next
 * batch, so a burst becomes a few appends instead of one per line. Resolves once on disk.
 */
const flush = () => {
  writing = writing.then(async () => {
    scheduled = false;
    for (const [dir, text] of takeBatches()) {
      try {
        await appendAsync(dir, text);
      } catch {
        // logging must never break the app
      }
    }
  });
  return writing;
};

/**
 * Writes the queued lines at once (process exit). A batch already being written asynchronously
 * may land after these lines; the timestamps still tell the order.
 */
const flushSync = () => {
  scheduled = false;
  for (const [dir, text] of takeBatches()) {
    try {
      appendSync(dir, text);
    } catch {
      // logging must never break the app
    }
  }
};

const writeLine = (line, env = process.env) => {
  try {
    if (queued.length >= MAX_QUEUED) {
      dropped += 1;
      return;
    }
    queued.push([logDir(env), formatLine(line)]);
    if (!scheduled) {
      scheduled = true;
      setImmediate(flush);
    }
  } catch {
    // logging must never break the app
  }
};

process.on('exit', flushSync);

module.exports = { formatLine, logFile, writeLine, flush, flushSync, MAX_LINE, MAX_QUEUED };
