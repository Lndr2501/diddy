#!/usr/bin/env python3
"""Embed AppImage update information into a built AppImage.

electron-builder cannot write it, so this fills the runtime's `.upd_info` ELF section in place
(the same thing `appimagetool -u` does). Only bytes inside that reserved section change: the
squashfs payload behind the runtime stays where it is, so the AppImage keeps working.

Usage: appimage-update-info.py <file.AppImage> <update information>
   or: appimage-update-info.py --print <file.AppImage>

See https://github.com/AppImage/AppImageSpec/blob/master/draft.md#update-information
"""
import struct
import sys


def find_section(data, name):
    """Return (offset, size) of the named section in a 64-bit little-endian ELF file."""
    if data[:4] != b"\x7fELF" or data[4] != 2 or data[5] != 1:
        raise SystemExit("not a 64-bit little-endian ELF file")
    e_shoff, = struct.unpack_from("<Q", data, 0x28)
    e_shentsize, e_shnum, e_shstrndx = struct.unpack_from("<HHH", data, 0x3A)

    def header(i):
        # sh_name, sh_type, sh_flags, sh_addr, sh_offset, sh_size
        return struct.unpack_from("<IIQQQQ", data, e_shoff + i * e_shentsize)

    strtab_offset = header(e_shstrndx)[4]
    for i in range(e_shnum):
        sh_name, _, _, _, offset, size = header(i)
        end = data.index(b"\0", strtab_offset + sh_name)
        if data[strtab_offset + sh_name:end].decode() == name:
            return offset, size
    raise SystemExit(f"no {name} section: is this an AppImage type 2?")


def main(argv):
    if len(argv) == 3 and argv[1] == "--print":
        with open(argv[2], "rb") as f:
            data = f.read(4 * 1024 * 1024)  # the runtime with its section headers sits at the start
        offset, size = find_section(data, ".upd_info")
        print(data[offset:offset + size].split(b"\0", 1)[0].decode())
        return
    if len(argv) != 3:
        raise SystemExit(__doc__)
    path, info = argv[1], argv[2].encode()
    with open(path, "r+b") as f:
        data = f.read(4 * 1024 * 1024)
        offset, size = find_section(data, ".upd_info")
        if len(info) >= size:
            raise SystemExit(f"update information is {len(info)} bytes, the section holds {size - 1}")
        f.seek(offset)
        f.write(info.ljust(size, b"\0"))
    print(f"{path}: wrote update information '{info.decode()}' at offset {offset:#x}")


if __name__ == "__main__":
    main(sys.argv)
