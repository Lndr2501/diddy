/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.join(__dirname, '../../.github/scripts/check-android-apk.py');
test('Android APK verification rejects missing ABIs and misaligned ELF segments', { skip: !fs.existsSync(checker) }, () => {
  const result = spawnSync('python3', ['-c', `
import pathlib, runpy, struct, tempfile, zipfile, sys
check = runpy.run_path(sys.argv[1])['check']
def elf(align):
    data = bytearray(120)
    data[:6] = b'\\x7fELF\\x02\\x01'
    struct.pack_into('<Q', data, 32, 64)
    struct.pack_into('<HH', data, 54, 56, 1)
    struct.pack_into('<I', data, 64, 1)
    struct.pack_into('<Q', data, 112, align)
    return data
with tempfile.TemporaryDirectory() as folder:
    for name, abis, alignment, valid in [
        ('good', ['arm64-v8a', 'x86_64'], 16384, True),
        ('unaligned', ['arm64-v8a', 'x86_64'], 4096, False),
        ('missing', ['arm64-v8a'], 16384, False),
        ('empty', [], 16384, False),
    ]:
        apk = pathlib.Path(folder) / (name + '.apk')
        with zipfile.ZipFile(apk, 'w') as archive:
            for abi in abis:
                archive.writestr('lib/' + abi + '/fixture.so', elf(alignment))
        try:
            check(apk)
        except AssertionError:
            assert not valid, name
        else:
            assert valid, name
`, checker], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
