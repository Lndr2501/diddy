#!/usr/bin/env python3
"""Reject APKs with missing supported ABIs or native ELF segments unfit for 16-KB pages."""
import struct
import sys
import zipfile


def check(path):
    abis = set()
    count = 0
    with zipfile.ZipFile(path) as apk:
        for item in apk.infolist():
            parts = item.filename.split('/')
            if len(parts) != 3 or parts[0] != 'lib' or not parts[2].endswith('.so'):
                continue
            abis.add(parts[1])
            data = apk.read(item)
            assert data[:6] == b'\x7fELF\x02\x01', f'{item.filename}: expected 64-bit little-endian ELF'
            offset = struct.unpack_from('<Q', data, 32)[0]
            size, count_ph = struct.unpack_from('<HH', data, 54)
            for i in range(count_ph):
                entry = offset + i * size
                if struct.unpack_from('<I', data, entry)[0] != 1:  # PT_LOAD
                    continue
                alignment = struct.unpack_from('<Q', data, entry + 48)[0]
                assert alignment >= 16384, f'{item.filename}: LOAD alignment {alignment}, expected >=16384'
            count += 1
    assert abis == {'arm64-v8a', 'x86_64'}, f'unexpected or missing ABIs: {abis}'
    assert count > 0, 'APK contains no native libraries'
    print(f'{count} native libraries, both ABIs: ELF LOAD alignment >=16 KB')


if __name__ == '__main__':
    check(sys.argv[1])
