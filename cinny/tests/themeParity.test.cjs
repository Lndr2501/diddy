/* eslint-disable @typescript-eslint/no-var-requires */
// Every desktop theme and app icon must exist on the other platforms too (iOS, Android, website
// demo). Files outside cinny/ are missing in the Nix build, those checks skip then.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const has = (rel) => fs.existsSync(path.join(root, rel));

const themeIds = () => {
  const ids = [...read('cinny/src/app/hooks/useTheme.ts').matchAll(/id: '([a-z]+-theme)'/g)].map(
    (m) => m[1]
  );
  return ids.filter((id) => id !== 'custom-theme');
};
const iconIds = () => {
  const list = read('cinny/src/app/plugins/appIcon.ts').match(
    /APP_ICON_IDS: AppIconId\[\] = \[([^\]]+)\]/
  )[1];
  return [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
};

test('desktop lists the occasion themes and icons', () => {
  const themes = themeIds();
  const icons = iconIds();
  ['valentine', 'easter', 'halloween', 'christmas', 'newyear'].forEach((occasion) => {
    assert.ok(themes.includes(`${occasion}-theme`), occasion);
    assert.ok(icons.includes(occasion), occasion);
    assert.ok(
      read('cinny/src/index.css').includes(`body.${occasion}-theme {`),
      `${occasion} background`
    );
  });
});

const ios = 'ios/Diddy/UI/DiddyTheme.swift';
const android = 'android/app/src/main/java/app/diddy/ui/theme/DiddyTheme.kt';
const demo = 'website/demo/demo.js';

test('every desktop theme exists on iOS', { skip: !has(ios) }, () => {
  const swift = read(ios);
  themeIds().forEach((id) => assert.ok(swift.includes(`id: "${id}"`), id));
});

test('every desktop theme exists on Android', { skip: !has(android) }, () => {
  const kotlin = read(android);
  themeIds().forEach((id) => assert.ok(kotlin.includes(`"${id}"`), id));
});

test('every desktop theme exists in the website demo', { skip: !has(demo) }, () => {
  const js = read(demo);
  themeIds().forEach((id) => assert.ok(js.includes(`    ${id.replace(/-theme$/, '')}: `), id));
});

const iconManager = 'ios/Diddy/App/AppIconManager.swift';
test('every app icon exists on iOS', { skip: !has(iconManager) }, () => {
  const cases = read(iconManager)
    .match(/case (pink[^\n]+)/)[1]
    .split(', ');
  assert.deepEqual(cases, iconIds());
  const alternates = read('ios/project.yml');
  iconIds()
    .filter((id) => id !== 'pink')
    .forEach((id) => {
      const name = `AppIcon-${id[0].toUpperCase()}${id.slice(1)}`;
      assert.ok(alternates.includes(name), name);
      const icon = `ios/Diddy/Resources/Assets.xcassets/${name}.appiconset`;
      assert.ok(has(`${icon}/icon.png`) && has(`${icon}/Contents.json`), icon);
    });
});
