// Runs native/global-shortcut.c (diddy-global-shortcut) for one portal shortcut and turns its stdout
// into callbacks. The helper owns the D-Bus connection (portal sessions and their signals belong to one
// connection), so it must stay alive as long as the shortcut should exist; stop() ends it.
const { spawn } = require('node:child_process');
const { parseHelperLine, knownReason } = require('./globalHotkey.cjs');

const MAX_PENDING = 4096;

/**
 * Resolves `{ ok: true, trigger, stop }` once the desktop accepted the shortcut, or `{ ok: false, reason }`.
 * After that `onKey(true|false)` follows press / release and `onEnd(reason)` fires if the helper ends on
 * its own (session closed by the desktop, crash); stop() ends it silently.
 */
const startPortalShortcut = ({
  command, id, trigger, description, onKey, onEnd, log = () => {}, spawnProcess = spawn, timeoutMs = 130000,
}) =>
  new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(command, [id, trigger, description], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      log(`agent voice: portal helper did not start: ${error.message}`);
      resolve({ ok: false, reason: 'no-helper' });
      return;
    }
    let bound = false;
    let finished = false;
    let reason;
    let pending = '';

    const kill = () => {
      try { child.stdin?.end(); } catch { /* already closed */ }
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
    };
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (!bound) resolve({ ok: false, reason: knownReason(value) });
      else onEnd?.(knownReason(value));
    };
    const timer = setTimeout(() => {
      reason = 'timeout';
      kill();
      finish('timeout');
    }, timeoutMs);
    timer.unref?.();

    const handle = (line) => {
      const event = parseHelperLine(line);
      if (!event || finished) return;
      if (event.type === 'bound' && !bound) {
        bound = true;
        clearTimeout(timer);
        resolve({
          ok: true,
          trigger: event.trigger,
          stop: () => {
            if (finished) return;
            finished = true;
            kill();
          },
        });
      } else if (event.type === 'down' || event.type === 'up') {
        if (bound) onKey?.(event.type === 'down');
      } else if (event.type === 'error') {
        reason = event.code;
        kill();
        finish(event.code);
      }
    };

    child.stdout?.on('data', (data) => {
      pending += data.toString();
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        handle(line);
      }
      if (pending.length > MAX_PENDING) pending = '';
    });
    let errors = '';
    child.stderr?.on('data', (data) => {
      errors = (errors + data.toString()).slice(-400);
    });
    child.on('error', (error) => {
      log(`agent voice: portal helper failed: ${error.message}`);
      finish(error.code === 'ENOENT' ? 'no-helper' : 'exited');
    });
    child.on('exit', (code, signal) => {
      if (errors.trim()) log(`agent voice: portal helper: ${errors.trim().replace(/\s+/g, ' ')}`);
      finish(reason ?? (code === 0 && !signal ? 'closed' : 'exited'));
    });
  });

module.exports = { startPortalShortcut };
