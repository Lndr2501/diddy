// Call roster (issue #23): who is in the voice call, visible from the Diddy window.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const folds = require('folds');

const filename = path.join(__dirname, '../src/app/features/call/CallMemberCard.tsx');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2016,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

const members = {
  '@anna.beispiel:org': { name: 'Anna Beispiel', avatar: undefined },
  '@pic:matrix.org': { name: undefined, avatar: 'mxc://matrix.org/abc' },
  '@single:x.de': { name: 'diddy', avatar: undefined },
};
const css = new Proxy({}, { get: (_, name) => String(name) });
const exported = {};
const imports = {
  react: React,
  folds,
  '../../hooks/useMatrixClient': { useMatrixClient: () => ({}) },
  '../../hooks/useMediaAuthentication': { useMediaAuthentication: () => false },
  '../../hooks/useRoom': { useRoom: () => ({ roomId: '!r:x.de' }) },
  '../../state/hooks/userRoomProfile': { useOpenUserRoomProfile: () => () => {} },
  '../../components/sequence-card': {
    SequenceCard: ({ children }) => React.createElement('button', null, children),
  },
  '../../components/user-avatar': {
    UserAvatar: ({ src, alt, renderFallback }) =>
      src
        ? React.createElement('img', { src, alt })
        : React.createElement('span', { 'data-initials': '1' }, renderFallback()),
  },
  '../../utils/room': {
    getMemberDisplayName: (room, userId) => members[userId]?.name,
    getMemberAvatarMxc: (room, userId) => members[userId]?.avatar,
  },
  '../../utils/matrix': {
    getMxIdLocalPart: (userId) => userId.slice(1).split(':')[0],
    mxcUrlToHttp: (mx, mxc) => `https://cdn.example/${mxc.split('/').pop()}`,
  },
  '../../utils/dom': { getMouseEventCords: () => ({ x: 0, y: 0 }) },
  './styles.css': css,
};
vm.runInNewContext(
  output,
  {
    exports: exported,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected UI dependency: ${name}`);
      return imports[name];
    },
  },
  { filename }
);

test('initials use at most two words and never come out empty', () => {
  assert.equal(exported.initialsFromName('Anna Beispiel'), 'AB');
  assert.equal(exported.initialsFromName('max moritz mustermann'), 'MM');
  assert.equal(exported.initialsFromName('diddy'), 'D');
  assert.equal(exported.initialsFromName('   '), '?');
});

test('an empty call shows no roster at all', () => {
  assert.equal(renderToStaticMarkup(React.createElement(exported.CallRoster, { members: [] })), '');
});

test('the roster names everyone and falls back to initials or the avatar image', () => {
  const html = renderToStaticMarkup(
    React.createElement(exported.CallRoster, {
      members: [
        { memberId: 'm1', userId: '@anna.beispiel:org', callIntent: 'audio' },
        { memberId: 'm2', userId: '@pic:matrix.org', callIntent: 'audio' },
        { memberId: 'm3', userId: '@single:x.de', callIntent: 'audio' },
        { memberId: 'm4', userId: undefined },
      ],
    })
  );
  assert.ok(html.includes('Im Gespräch'));
  assert.ok(html.includes('Anna Beispiel'));
  assert.ok(html.includes('AB'), 'display name without avatar still gets initials');
  assert.ok(html.includes('src="https://cdn.example/abc"'), 'profile picture is shown');
  assert.ok(html.includes('pic'), 'nameless members fall back to their local part');
  assert.ok(html.includes('D'), 'single-word names produce one capital');
  assert.ok(!html.includes('undefined'), 'members without a user id are skipped cleanly');
});
