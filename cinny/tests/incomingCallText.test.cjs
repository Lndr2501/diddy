// Tests for the wording of the incoming call banner.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/incomingCallText.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod }, { filename });
const plain = (x) => JSON.parse(JSON.stringify(x));

test('a DM call names the kind of call, the room name is the caller', () => {
  assert.deepEqual(plain(mod.incomingCallText({ dm: true, roomName: 'Ana', senderName: 'Ana' })), {
    title: 'Ana',
    subtitle: 'Incoming call',
    video: false,
  });
  assert.equal(
    mod.incomingCallText({ dm: true, roomName: 'Ana', senderName: 'Ana', intent: 'video' })
      .subtitle,
    'Incoming video call'
  );
});

test('a group call names who is calling', () => {
  const text = mod.incomingCallText({ dm: false, roomName: 'Friends', senderName: 'Ben' });
  assert.equal(text.title, 'Friends');
  assert.equal(text.subtitle, 'Ben is calling');
  assert.equal(
    mod.incomingCallText({ dm: false, roomName: 'Friends', senderName: 'Ben', intent: 'video' })
      .subtitle,
    'Ben is calling (video)'
  );
});

test('a room without a name falls back to the caller', () => {
  const text = mod.incomingCallText({ dm: false, roomName: '  ', senderName: 'Ben' });
  assert.equal(text.title, 'Ben');
  assert.equal(text.subtitle, 'Incoming call');
});
