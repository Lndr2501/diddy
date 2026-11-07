// The app log, same file and format as the Tauri build (src-tauri/src/diag.rs): one line per event
// with a Unix timestamp, newlines removed, length limited, rotated at 2 MB to app.log.old.
const fs = require('node:fs');
const path = require('node:path');
const { logDir } = require('./paths.cjs');

const MAX_LINE = 600;
const MAX_LOG_BYTES = 2 * 1024 * 1024;

const formatLine = (line, now = Date.now()) => {
  const text = Array.from(String(line).replace(/[\r\n]/g, '')).slice(0, MAX_LINE).join('');
  return `${(now / 1000).toFixed(3)} ${text}\n`;
};

const logFile = (env = process.env) => path.join(logDir(env), 'app.log');

const writeLine = (line, env = process.env) => {
  try {
    const dir = logDir(env);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'app.log');
    try {
      if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, path.join(dir, 'app.log.old'));
    } catch {
      // no log yet
    }
    fs.appendFileSync(file, formatLine(line));
  } catch {
    // logging must never break the app
  }
};

module.exports = { formatLine, logFile, writeLine, MAX_LINE };
