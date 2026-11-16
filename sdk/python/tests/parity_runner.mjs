// Runs Diddy's own TypeScript parsers on inputs from stdin (needs Node >= 22.6 for strip-types).
// Usage: node --experimental-strip-types parity_runner.mjs <cinny/src/app/plugins dir>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = process.argv[2];
const load = (f) => import(pathToFileURL(path.join(dir, f)).href);
const { parseBotCard, isCardActionMessage } = await load('botCard.ts');
const { parseBotCommands } = await load('botCommands.ts');
const { parseBotProfile } = await load('botProfile.ts');
const fns = { card: parseBotCard, action: isCardActionMessage, commands: parseBotCommands, profile: parseBotProfile };
const cases = JSON.parse(readFileSync(0, 'utf8'));
const out = cases.map(([fn, input]) => {
  const r = fns[fn](input);
  return r === undefined ? null : r;
});
process.stdout.write(JSON.stringify(out));
