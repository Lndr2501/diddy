// Self-test of the overlap detector: it must report real overlaps and ignore clipped/covered ones.
const { test, expect } = require('@playwright/test');
const { findOverlaps } = require('./helpers.cjs');

const render = (page, html) => page.setContent(`<body style="margin:0">${html}</body>`);

test('detector reports two overlapping buttons', async ({ page }) => {
  await render(
    page,
    '<button style="position:absolute;left:10px;top:10px;width:100px;height:40px">A</button>' +
      '<button style="position:absolute;left:60px;top:20px;width:100px;height:40px">B</button>'
  );
  expect((await findOverlaps(page)).length).toBe(1);
});

test('detector ignores buttons that merely sit side by side', async ({ page }) => {
  await render(
    page,
    '<button style="position:absolute;left:10px;top:10px;width:100px;height:40px">A</button>' +
      '<button style="position:absolute;left:120px;top:10px;width:100px;height:40px">B</button>'
  );
  expect(await findOverlaps(page)).toEqual([]);
});

test('detector ignores a button clipped by a scroll container', async ({ page }) => {
  await render(
    page,
    '<div style="position:absolute;left:0;top:0;width:200px;height:50px;overflow:auto">' +
      '<button style="position:absolute;left:10px;top:80px;width:100px;height:40px">in list</button></div>' +
      '<button style="position:absolute;left:10px;top:90px;width:100px;height:40px">below</button>'
  );
  expect(await findOverlaps(page)).toEqual([]);
});

test('detector ignores a button covered by a modal backdrop', async ({ page }) => {
  await render(
    page,
    '<button style="position:absolute;left:10px;top:10px;width:100px;height:40px">app</button>' +
      '<div style="position:fixed;inset:0;background:#0008"></div>' +
      '<button style="position:fixed;left:40px;top:20px;width:100px;height:40px;z-index:5">modal</button>'
  );
  expect(await findOverlaps(page)).toEqual([]);
});
