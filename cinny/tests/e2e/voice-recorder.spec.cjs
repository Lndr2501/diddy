const path = require('node:path');
const { build } = require('esbuild');
const { test, expect } = require('@playwright/test');

// A synthetic microphone exercises Diddy's real hook and Chromium's actual encoder/decoder.
// No Matrix account, physical microphone or user media is accessed.
test('Linux Chromium records, plays and seeks a voice message', async ({ page }) => {
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { useVoiceRecorder } from './src/app/hooks/useVoiceRecorder';
        function Harness() {
          window.recorder = useVoiceRecorder();
          return React.createElement('span', null, window.recorder.state);
        }
        createRoot(document.getElementById('root')).render(React.createElement(Harness));
      `,
      resolveDir: path.join(__dirname, '../..'),
    },
    // This is the Chromium path; the macOS-only native audio bridge is unavailable.
    plugins: [
      {
        name: 'no-native-macos-microphone',
        setup(builder) {
          builder.onResolve({ filter: /\/call\/nativeMic$/ }, () => ({
            path: 'nativeMic',
            namespace: 'test',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: `
          export const nativeMicAvailable = () => false;
          export const preferredNativeMic = () => undefined;
          export const openNativeMic = () => { throw new Error('macOS bridge unavailable'); };
        `,
          }));
        },
      },
    ],
    bundle: true,
    write: false,
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  await page.route('**/voice-recorder-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<div id="root"></div>',
    })
  );
  await page.goto('/voice-recorder-test');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.locator('#root')).toHaveText('idle');
  const result = await page.evaluate(async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    const oscillator = ctx.createOscillator();
    const destination = ctx.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    let audio;
    let url;
    try {
      await window.recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 2200));
      const recording = await window.recorder.stop();
      if (!recording) throw new Error('No recording');
      url = URL.createObjectURL(recording.file);
      audio = new Audio(url);
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = resolve;
        audio.onerror = () => reject(new Error('Recorded audio could not be decoded'));
      });
      await audio.play();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Playback did not advance')), 5000);
        audio.ontimeupdate = () => {
          if (audio.currentTime <= 0) return;
          clearTimeout(timeout);
          audio.ontimeupdate = null;
          resolve();
        };
      });
      const played = audio.currentTime;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Voice message seek did not finish')),
          5000
        );
        audio.onseeked = () => {
          clearTimeout(timeout);
          audio.onseeked = null;
          resolve();
        };
        audio.currentTime = 1;
      });
      return {
        type: recording.file.type,
        size: recording.file.size,
        duration: recording.durationMs,
        waveform: recording.waveform,
        trackState: destination.stream.getAudioTracks()[0].readyState,
        played,
        seeked: audio.currentTime,
      };
    } finally {
      audio?.pause();
      if (url) URL.revokeObjectURL(url);
      window.recorder.cancel();
      oscillator.stop();
      destination.stream.getTracks().forEach((track) => track.stop());
      await ctx.close();
    }
  });
  expect(result.type).toBe('audio/webm');
  expect(result.size).toBeGreaterThan(1000);
  expect(result.duration).toBeGreaterThanOrEqual(2000);
  expect(result.waveform).toHaveLength(64);
  expect(Math.max(...result.waveform)).toBe(1024);
  expect(result.trackState).toBe('ended');
  expect(result.played).toBeGreaterThan(0);
  expect(result.seeked).toBeGreaterThanOrEqual(0.9);
  expect(result.seeked).toBeLessThan(1.5);
  await expect(page.locator('#root')).toHaveText('idle');
});
