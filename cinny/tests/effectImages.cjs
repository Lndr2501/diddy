// Tiny synthetic APNG / GIF / WebP files for the profile effect tests (#86): only the chunks
// the picture sniffing reads, no real pixels.
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
};
const makePng = ({ frames = 0, plays = 0, delayMs = 100 } = {}) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(450, 0);
  ihdr.writeUInt32BE(880, 4);
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
  ];
  if (frames) {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(frames, 0);
    actl.writeUInt32BE(plays, 4);
    parts.push(chunk('acTL', actl));
    for (let i = 0; i < frames; i += 1) {
      const fctl = Buffer.alloc(26);
      fctl.writeUInt16BE(delayMs, 20);
      fctl.writeUInt16BE(1000, 22);
      parts.push(chunk('fcTL', fctl), chunk(i === 0 ? 'IDAT' : 'fdAT', Buffer.alloc(8)));
    }
  } else parts.push(chunk('IDAT', Buffer.alloc(8)));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
};
const makeGif = ({ frames = 2, loop = true, delayCs = 10 } = {}) => {
  const parts = [Buffer.from('GIF89a'), Buffer.from([1, 0, 1, 0, 0, 0, 0])];
  if (loop) {
    parts.push(Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0'));
    parts.push(Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00]));
  }
  for (let i = 0; i < frames; i += 1) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, delayCs, 0x00, 0x00, 0x00]));
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
};
const webpChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length);
  return Buffer.concat([
    Buffer.from(type),
    len,
    data,
    data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);
};
const makeWebp = ({ frames = 3, loops = 0, durationMs = 40 } = {}) => {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x02 | 0x10;
  const anim = Buffer.alloc(6);
  anim.writeUInt16LE(loops, 4);
  const body = [Buffer.from('WEBP'), webpChunk('VP8X', vp8x), webpChunk('ANIM', anim)];
  for (let i = 0; i < frames; i += 1) {
    const anmf = Buffer.alloc(17);
    anmf.writeUIntLE(durationMs, 12, 3);
    body.push(webpChunk('ANMF', anmf));
  }
  const data = Buffer.concat(body);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from('RIFF'), size, data]);
};
module.exports = { makePng, makeGif, makeWebp };
