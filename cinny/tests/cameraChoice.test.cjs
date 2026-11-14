const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/cameraChoice.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
// Objects made in the test's own realm compare cleanly with deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));
const filterCameras = (...args) => plain(mod.filterCameras(...args));
const withCameraDevice = (...args) => plain(mod.withCameraDevice(...args) ?? null);
const toCameras = (...args) => plain(mod.toCameras(...args));

const devices = [
  { kind: 'audioinput', deviceId: 'mic' },
  { kind: 'videoinput', deviceId: 'facetime', label: 'FaceTime HD Camera' },
  { kind: 'videoinput', deviceId: 'usb', label: '' },
  { kind: 'audiooutput', deviceId: 'speaker' },
];

test('the call only sees the camera picked in Diddy (#201)', () => {
  assert.deepEqual(
    filterCameras(devices, 'usb').map((d) => d.deviceId),
    ['mic', 'usb', 'speaker']
  );
});

test('no preference or an unplugged camera keeps every camera', () => {
  assert.equal(filterCameras(devices, '').length, 4);
  assert.equal(filterCameras(devices, 'gone').length, 4);
});

test('camera constraints get the preferred device unless one is named', () => {
  assert.deepEqual(withCameraDevice(true, 'usb'), { deviceId: { ideal: 'usb' } });
  assert.deepEqual(withCameraDevice({ width: { ideal: 640 } }, 'usb'), {
    width: { ideal: 640 },
    deviceId: { ideal: 'usb' },
  });
  assert.deepEqual(withCameraDevice({ deviceId: { exact: 'facetime' } }, 'usb'), {
    deviceId: { exact: 'facetime' },
  });
  assert.equal(withCameraDevice(false, 'usb'), false);
  assert.equal(withCameraDevice(true, ''), true);
});

test('cameras for the picker get a name even when the system hides it', () => {
  assert.deepEqual(toCameras(devices), [
    { deviceId: 'facetime', label: 'FaceTime HD Camera' },
    { deviceId: 'usb', label: 'Camera 2' },
  ]);
});
