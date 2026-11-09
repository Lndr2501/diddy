// #125: message content is also drawn outside of a room view (inbox notifications, search
// results), where no RoomProvider exists. A useRoom() anywhere below RenderMessageContent throws
// "Room not provided!" and takes the whole app down. This walks the import graph of the message
// content and fails on any useRoom() call (useOptionalRoom() is fine).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SRC = path.join(__dirname, '../src');
const ENTRY = path.join(SRC, 'app/components/RenderMessageContent.tsx');

const resolveImport = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
};

/** Relative imports of a file that bring in values (type-only imports render nothing). */
const importsOf = (file) => {
  const source = fs.readFileSync(file, 'utf8');
  const specs = [];
  const re = /import\s+(type\s+)?[^'"]*?from\s+'(\.[^']+)'/g;
  let match = re.exec(source);
  while (match) {
    if (!match[1]) specs.push(match[2]);
    match = re.exec(source);
  }
  return specs;
};

const walk = (entry) => {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (!seen.has(file)) {
      seen.add(file);
      importsOf(file).forEach((spec) => {
        const next = resolveImport(file, spec);
        if (next && /\.tsx?$/.test(next) && !next.endsWith('.css.ts')) stack.push(next);
      });
    }
  }
  return seen;
};

test('message content never needs a surrounding room view', () => {
  const files = walk(ENTRY);
  assert.ok(files.size > 5, 'import graph was found');
  const offenders = [...files]
    .filter((file) => !file.endsWith(path.join('hooks', 'useRoom.ts')))
    .filter((file) => /\buseRoom\(\)/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file));
  assert.deepEqual(offenders, []);
});

test('the bot card reads the room optionally', () => {
  const card = fs.readFileSync(path.join(SRC, 'app/components/message/BotCard.tsx'), 'utf8');
  assert.match(card, /useOptionalRoom\(\)/);
});
