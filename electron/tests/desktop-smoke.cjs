// Real packaged Electron + X11 capture + AudioWorklet + loopback WebRTC, without accounts/hardware.
// Run inside an isolated Linux environment: xvfb-run -a node electron/tests/desktop-smoke.cjs /path/to/diddy
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('../../cinny/node_modules/playwright');
const ts = require('../../cinny/node_modules/typescript');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-desktop-'));
  const env = { ...process.env, XDG_RUNTIME_DIR: path.join(dir, 'runtime'), XDG_CONFIG_HOME: path.join(dir, 'config'), XDG_DATA_HOME: path.join(dir, 'data'), XDG_STATE_HOME: path.join(dir, 'state'), PULSE_SERVER: `unix:${dir}/pulse`, PULSE_SINK: 'diddy_smoke', XDG_SESSION_TYPE: 'x11', WAYLAND_DISPLAY: '' };
  fs.mkdirSync(env.XDG_RUNTIME_DIR, {mode: 0o700});
  // Chromium's ALSA fallback also needs a real output clock in this hardware-free fixture.
  env.ALSA_CONFIG_PATH = path.join(dir, 'asound.conf');
  fs.writeFileSync(env.ALSA_CONFIG_PATH, `pcm.!default { type pulse server "unix:${dir}/pulse" }\nctl.!default { type pulse server "unix:${dir}/pulse" }\n`);
  const processes = [];
  let browser;
  const run = (file, args, extra = {}) => {
    const child = spawn(file, args, { env, detached: true, stdio: ['pipe', 'pipe', 'pipe'], ...extra });
    processes.push(child); return child;
  };
  try {
    run('openbox', ['--sm-disable']);
    const server = run('pulseaudio', ['-n', '--daemonize=no', '--exit-idle-time=-1', '--disable-shm=yes', `--load=module-native-protocol-unix socket=${dir}/pulse auth-anonymous=1`, '--load=module-null-sink sink_name=diddy_smoke']);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sound server startup timed out')), 10000);
      const ready = () => { if (fs.existsSync(`${dir}/pulse`)) { clearTimeout(timer); resolve(); } else setTimeout(ready, 50); };
      server.once('error', reject); ready();
    });
    const app = run(path.resolve(process.argv[2]), ['--remote-debugging-port=0', ...(process.getuid() === 0 || process.env.DIDDY_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])]);
    const endpoint = await new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error('Electron startup: ' + log.slice(-2000))), 20000);
      app.stderr.on('data', (data) => { log += data; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      app.once('error', reject);
    });
    app.stderr.on('data', (data) => { if (/preload|Unhandled|TypeError|ALSA|audio|pulse/i.test(String(data))) console.error(String(data).slice(0,2000)); });
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    context.setDefaultTimeout(15000);
    const page = context.pages()[0] ?? await context.waitForEvent('page');
    await page.waitForURL('http://localhost:44548/**');
    await page.waitForLoadState('domcontentloaded');
    page.on('console', (message) => { if (message.text().startsWith('getDisplayMedia')) console.log(message.text()); });
    await page.waitForFunction(() => !!window.__DIDDY_SYS_AUDIO__ && !!document.getElementById('root')?.childElementCount);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../cinny/src/app/plugins/call/screenShareAudio.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    await page.addScriptTag({ content: `(() => { const exports = {}; const require = (id) => id === 'react' ? {} : id === '../diagnostics' ? {diag:(line)=>console.log(line)} : {trackPeerConnections:()=>{},startStatsLogging:()=>()=>{}}; ${compiled}\nwindow.testShare = exports; exports.installScreenShareAudio(window); })();` });
    // Desktop capture must wait for a deliberate source choice, then attach native system audio.
    await page.evaluate(() => {
      const button = document.createElement('button'); button.id = 'test-start-share'; button.textContent = 'Test screen share';
      button.onclick = () => { window.capturePromise = navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then((stream) => { window.captured = stream; }).catch(error => { window.captureError = String(error); }); };
      document.body.append(button);
    });
    const picking = context.waitForEvent('page', { predicate: (p) => p !== page });
    await page.locator('#test-start-share').click();
    let picker;
    try { picker = await picking; } catch (error) { console.error('capture:', await page.evaluate(() => window.captureError)); console.error(fs.readFileSync(path.join(dir,'state/diddy/app.log'),'utf8')); throw error; }
    picker.on('console', (message) => { if (message.type() === 'error') console.error('picker:', message.text()); });
    await picker.waitForLoadState('domcontentloaded');
    // Choosing a source closes the picker window. Playwright's click can still be busy with the page
    // when it goes away and then reports "Target page ... has been closed" although the click
    // worked; that is the expected outcome here, any other error is not.
    await picker.locator('#sources button').first().click().catch((error) => {
      if (!picker.isClosed() && !/has been closed/.test(String(error))) throw error;
    });
    await page.evaluate(() => window.capturePromise);

    assert.deepEqual(await page.evaluate(() => window.captured.getTracks().map((t) => t.kind).sort()), ['audio', 'video']);
    // Exercise Chromium's actual receiving media stack using the new screenshare audio track.
    await page.evaluate(async () => {
      const a = new RTCPeerConnection(), b = new RTCPeerConnection();
      window.testPeers = [a, b];
      a.onicecandidate = ({candidate}) => { if (candidate) b.addIceCandidate(candidate); };
      b.onicecandidate = ({candidate}) => { if (candidate) a.addIceCandidate(candidate); };
      const audio = new AudioContext({sampleRate:48000}); window.testAudio = audio;
      const osc = audio.createOscillator(); osc.frequency.value = 880; osc.connect(audio.destination); osc.start(); await audio.resume();
      b.ontrack = ({streams:[stream]}) => {
        const player = document.createElement('audio'); player.autoplay = true; player.srcObject = stream; document.body.append(player); player.play(); window.testPlayer = player;
        const analyser = audio.createAnalyser(); analyser.fftSize = 8192;
        audio.createMediaStreamSource(stream).connect(analyser); analyser.connect(audio.destination); window.testAnalyser = analyser;
      };
      a.addTrack(window.captured.getAudioTracks()[0], window.captured);
      await a.setLocalDescription(await a.createOffer()); await b.setRemoteDescription(a.localDescription);
      await b.setLocalDescription(await b.createAnswer()); await a.setRemoteDescription(b.localDescription);
    });
    const player = run('pacat', ['--playback', '--raw', '--format=float32le', '--rate=48000', '--channels=2', '--latency-msec=20']);
    const samples = Buffer.alloc(4800 * 2 * 4);
    for (let i = 0; i < 4800; i++) for (let channel = 0; channel < 2; channel++) samples.writeFloatLE(0.15 * Math.sin(2*Math.PI*440*i/48000), (i*2+channel)*4);
    player.stdin.on('error', () => {});
    const feed = setInterval(() => { if (!player.stdin.destroyed) player.stdin.write(samples); }, 100);
    try {
      try { await page.waitForFunction(() => {
        if (!window.testAnalyser) return false;
        const bins = new Float32Array(window.testAnalyser.frequencyBinCount); window.testAnalyser.getFloatFrequencyData(bins);
        const peak = (hz) => Math.max(...bins.slice(Math.round(hz/48000*8192)-2, Math.round(hz/48000*8192)+3));
        return peak(440) > -35 && peak(880) < -55;
      }, null, { timeout: 15000 }); } catch (error) {
        console.error('Sound server inputs:', execFileSync('pactl', ['list', 'sink-inputs'], {env}).toString());
        console.error('Media diagnostics:', await page.evaluate(async () => {
          const analyser = window.testAnalyser;
          const bins = analyser ? new Float32Array(analyser.frequencyBinCount) : null;
          if (bins) analyser.getFloatFrequencyData(bins);
          const peak = (hz) => bins ? Math.max(...bins.slice(Math.round(hz/48000*8192)-2, Math.round(hz/48000*8192)+3)) : null;
          return { audioState: window.testAudio.state, snapshot: window.testShare.screenShareAudio.getSnapshot(), peaks: [peak(440),peak(880)], peers: window.testPeers.map(p => p.connectionState), stats: Array.from((await window.testPeers[1].getStats()).values()).filter(x => x.type === 'inbound-rtp') };
        })); throw error;
      }
      await page.evaluate(() => window.captured.getVideoTracks()[0].stop());
      assert.equal(await page.evaluate(() => window.testShare.screenShareAudio.getSnapshot().active), false);
      await page.evaluate(() => { window.testPeers.forEach((p) => p.close()); window.testAudio.close(); });
      console.log('PASS packaged Electron: login renders, X11 picker, native IPC, AudioWorklet, received WebRTC audio, own Electron audio excluded, stop cleanup');
    } finally { clearInterval(feed); }
  } finally {
    await browser?.close();
    for (const child of processes.reverse()) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    }
    await Promise.all(processes.map((child) => new Promise((resolve) => {
      if (child.exitCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    })));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
