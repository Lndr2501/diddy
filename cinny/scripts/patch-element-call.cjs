// Narrow, checked patch of the pinned Element Call build; fail closed on upstream changes.
const fs = require('node:fs');
const path = require('node:path');
const marker = '/* diddy-voice-boost */';
function patch(source) {
  if (source.includes(marker)) return source;
  const slider = /onValueChange:(\w+)\.adjustPlaybackVolume,onValueCommit:\1\.commitPlaybackVolume,min:0,max:1,step:\.01/g;
  const sink = 'setVolume(e){var t;for(let n of this.attachedElements)';
  const attach = 'this.elementVolume&&this.setVolume(this.elementVolume),e}detach(e)';
  if ([...source.matchAll(slider)].length !== 1 || source.split(sink).length !== 2 || source.split(attach).length !== 2) {
    throw new Error('Element Call voice volume hooks changed; review boost patch');
  }
  return source.replace(attach, 'this.elementVolume!==void 0&&this.setVolume(this.elementVolume),e}detach(e)')
    .replace(slider, (s) => s.replace('max:1,', 'max:2,'))
    .replace(sink, `${marker}setVolume(e){if(window.__diddyTrackVolume?.(this,e))return;e=Math.min(1,e);var t;for(let n of this.attachedElements)`);
}
module.exports = { patch };
if (require.main === module) {
  const source = path.join(__dirname, '../node_modules/@element-hq/element-call-embedded/dist');
  const output = path.join(__dirname, '../.element-call');
  fs.rmSync(output, { recursive: true, force: true });
  fs.cpSync(source, output, { recursive: true });
  const dir = path.join(output, 'assets');
  for (const file of fs.readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f))) {
    const target = path.join(dir, file);
    const before = fs.readFileSync(target, 'utf8');
    const after = patch(before);
    if (after !== before) fs.writeFileSync(target, after);
  }
}
