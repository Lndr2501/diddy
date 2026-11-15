// Own one bounded native capture per window. Session ids prevent a late stop from ending a new share.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
/** One helper block: 480 stereo float frames, 10 ms at 48 kHz. */
const BLOCK_BYTES = 480 * 2 * 4;
/**
 * Blocks per IPC message: 20 ms. One message per block meant ~100 messages plus ~100 acks a second
 * through the main process. The page's player buffers 40 ms before it starts, so this is inaudible.
 */
const BLOCKS_PER_MESSAGE = 2;
const MESSAGE_BYTES = BLOCK_BYTES * BLOCKS_PER_MESSAGE;
/** Unacknowledged messages per capture (80 ms of audio); more is dropped instead of queued. */
const MAX_IN_FLIGHT = 4;

function createSystemAudio({ helper, send, spawnProcess = spawn, rootPid = process.pid, timeoutMs = 10000, log = () => {} }) {
  let current;
  const stop = (id, reason = 'Audio capture canceled') => {
    const session = current;
    if (!session || session.id !== id) return;
    current = undefined;
    clearTimeout(session.timer);
    session.reject?.(new Error(reason));
    session.child.kill('SIGTERM');
    const kill = setTimeout(() => session.child.kill('SIGKILL'), 1500);
    kill.unref?.();
    session.child.once('exit', () => clearTimeout(kill));
  };
  const start = () => {
    if (current) stop(current.id);
    const id = randomUUID();
    const child = spawnProcess(helper, [String(rootPid)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const session = { id, child, pending: Buffer.alloc(0), inFlight: 0, ready: false };
    current = session;
    const ready = new Promise((resolve, reject) => {
      session.reject = reject;
      session.timer = setTimeout(() => fail('Audio server did not become ready'), timeoutMs);
      session.resolve = () => { clearTimeout(session.timer); session.reject = undefined; resolve(id); };
    });
    function fail(message) {
      if (current !== session) return;
      send({ id, error: message });
      stop(id, message);
    }
    let status = '';
    child.stderr.on('data', (data) => {
      status += data.toString();
      let newline;
      while ((newline = status.indexOf('\n')) >= 0) {
        const line = status.slice(0, newline).replace(/\r$/, '');
        status = status.slice(newline + 1);
        // Every helper line goes to the app log so the next failure explains itself.
        if (line) log(`system audio: helper: ${line}`);
        if (line === 'READY' && !session.ready && current === session) {
          session.ready = true;
          session.resolve();
        } else if (line.startsWith('ERROR ')) fail(line.slice(6));
        // INFO and WARN lines (for example one application's monitor failing) never end the capture.
      }
      // Only an unterminated partial line is bounded; many complete lines in one chunk are fine.
      if (status.length > 4096) { fail('Invalid audio helper response'); return; }
    });
    child.stdout.on('data', (data) => {
      if (current !== session || !session.ready) return;
      const bytes = Buffer.concat([session.pending, data]);
      let offset = 0;
      while (offset + MESSAGE_BYTES <= bytes.length) {
        if (session.inFlight < MAX_IN_FLIGHT) {
          session.inFlight++;
          // A copy: a view into the pipe's pooled buffer would serialize the whole pool.
          send({ id, pcm: Uint8Array.from(bytes.subarray(offset, offset + MESSAGE_BYTES)) });
        }
        offset += MESSAGE_BYTES;
      }
      session.pending = Buffer.from(bytes.subarray(offset));
    });
    child.once('error', () => fail('Linux audio helper could not start'));
    child.once('exit', (code, signal) => {
      log(`system audio: helper exited code=${code} signal=${signal}`);
      fail('Linux audio capture stopped');
    });
    return ready;
  };
  return {
    start, stop,
    ack: (id) => { if (current?.id === id) current.inFlight = Math.max(0, current.inFlight - 1); },
    close: () => { if (current) stop(current.id); },
  };
}
module.exports = { createSystemAudio, BLOCK_BYTES, MESSAGE_BYTES, MAX_IN_FLIGHT };
