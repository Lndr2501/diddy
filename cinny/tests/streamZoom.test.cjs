// Zoom into a stream on the call stage: wheel / pinch towards the pointer, drag to pan.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/streamZoom.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const z = {};
vm.runInNewContext(output, { exports: z }, { filename });

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('zooming keeps the point under the pointer in place', () => {
  const zoom = z.zoomAt(z.ZOOM_NONE, 2, 0.25, 0.75);
  near(zoom.scale, 2);
  // picture point under the pointer before and after
  near((0.25 - zoom.x) / zoom.scale, 0.25);
  near((0.75 - zoom.y) / zoom.scale, 0.75);
  const again = z.zoomAt(zoom, 1.5, 0.6, 0.4);
  near((0.6 - again.x) / again.scale, (0.6 - zoom.x) / zoom.scale);
  near((0.4 - again.y) / again.scale, (0.4 - zoom.y) / zoom.scale);
});

test('zoom stays between 1x and the maximum and snaps back to none', () => {
  assert.deepEqual({ ...z.zoomAt(z.ZOOM_NONE, 0.5, 0.5, 0.5) }, { ...z.ZOOM_NONE });
  near(z.zoomAt(z.ZOOM_NONE, 1000, 0.5, 0.5).scale, z.ZOOM_MAX);
  const almost = z.zoomAt(z.zoomAt(z.ZOOM_NONE, 2), 0.502);
  assert.equal(almost.scale, 1);
  assert.equal(z.isZoomed(almost), false);
  assert.equal(z.zoomTransform(almost), undefined);
});

test('the picture always covers the tile', () => {
  const zoom = z.zoomAt(z.ZOOM_NONE, 2, 0, 0);
  near(zoom.x, 0);
  near(zoom.y, 0);
  const far = z.panZoom(zoom, -5, 5);
  near(far.x, -1); // 1 - scale
  near(far.y, 0);
  // zooming out from a corner pulls the picture back into the tile
  const out = z.zoomAt(far, 0.75, 0.5, 0.5);
  assert.ok(out.x >= 1 - out.scale && out.x <= 0);
  assert.ok(out.y >= 1 - out.scale && out.y <= 0);
});

test('bad input changes nothing or resets', () => {
  const zoom = z.zoomAt(z.ZOOM_NONE, 2);
  assert.equal(z.zoomAt(zoom, NaN), zoom);
  assert.equal(z.zoomAt(zoom, 0), zoom);
  assert.equal(z.zoomAt(zoom, -1), zoom);
  assert.deepEqual({ ...z.clampZoom({ scale: NaN, x: 0, y: 0 }) }, { ...z.ZOOM_NONE });
});

test('wheel: down zooms out, up zooms in, pinch is finer per pixel', () => {
  assert.ok(z.wheelZoomFactor(-100) > 1);
  assert.ok(z.wheelZoomFactor(100) < 1);
  assert.equal(z.wheelZoomFactor(0), 1);
  assert.equal(z.wheelZoomFactor(NaN), 1);
  // a line-mode notch is as strong as ~16 px per line
  near(z.wheelZoomFactor(3, 1), z.wheelZoomFactor(48));
  // a huge delta is capped
  near(z.wheelZoomFactor(-100000), z.wheelZoomFactor(-200));
  assert.ok(z.wheelZoomFactor(-10, 0, true) > z.wheelZoomFactor(-10));
});

test('transform and percent', () => {
  assert.equal(z.zoomTransform(z.ZOOM_NONE), undefined);
  assert.equal(
    z.zoomTransform({ scale: 2, x: -0.5, y: -0.25 }),
    'translate(-50.000%, -25.000%) scale(2.0000)'
  );
  assert.equal(z.zoomPercent({ scale: 1.5625, x: 0, y: 0 }), 156);
});
