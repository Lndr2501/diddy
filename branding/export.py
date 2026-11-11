"""Renders the logo SVGs from `branding/logo/` into every PNG/ICO/ICNS the apps use.

Usage (from the repository root): python3 branding/export.py
Run `python3 branding/build.py` first if the drawing changed. Needs `rsvg-convert` (librsvg) and Pillow.
"""
import io
import os
import struct
import subprocess

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOGO = os.path.join(HERE, "logo")
TONES = ["pink", "blue", "purple", "black", "magenta"]


def render(tone, shape, size):
    """PNG render of one SVG at the given size, as a Pillow image (RGBA)."""
    svg = os.path.join(LOGO, f"diddy-{tone}-{shape}.svg")
    data = subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), svg], check=True, capture_output=True
    ).stdout
    return Image.open(io.BytesIO(data)).convert("RGBA")


def save(image, *parts, opaque=False):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if opaque:
        image = image.convert("RGB")
    image.save(path, optimize=True)


def write_icns(path):
    """macOS icon file with PNG chunks (the format modern macOS and Tauri use)."""
    chunks = []
    for kind, size in (("icp4", 16), ("icp5", 32), ("icp6", 64), ("ic07", 128), ("ic08", 256),
                       ("ic09", 512), ("ic10", 1024), ("ic11", 32), ("ic12", 64), ("ic13", 256),
                       ("ic14", 512)):
        buf = io.BytesIO()
        render("pink", "mac", size).save(buf, "PNG", optimize=True)
        chunks.append(kind.encode() + struct.pack(">I", len(buf.getvalue()) + 8) + buf.getvalue())
    body = b"".join(chunks)
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main():
    for tone in TONES:
        save(render(tone, "rounded", 128), "cinny", "public", "res", "app-icons", f"{tone}.png")
        save(render(tone, "rounded", 256), "src-tauri", "app-icons", f"{tone}.png")
        save(render(tone, "mac", 512), "src-tauri", "app-icons", f"{tone}-mac.png")
        # iOS masks the icon itself: full bleed, no transparency.
        name = "AppIcon" if tone == "pink" else f"AppIcon-{tone.capitalize()}"
        assets = ("ios", "Diddy", "Resources", "Assets.xcassets")
        save(render(tone, "square", 1024), *assets, f"{name}.appiconset", "icon.png", opaque=True)
        save(render(tone, "square", 180), *assets, f"IconPreview-{tone.capitalize()}.imageset",
             "preview.png", opaque=True)

    # The default (pink) icon everywhere else.
    save(render("pink", "rounded", 192), "ios", "Diddy", "Resources", "Assets.xcassets",
         "DiddyLogo.imageset", "logo.png")
    save(render("pink", "rounded", 512), "src-tauri", "icons", "icon.png")
    for size, name in ((32, "32x32"), (128, "128x128"), (256, "128x128@2x")):
        save(render("pink", "rounded", size), "src-tauri", "icons", f"{name}.png")
    for size in (30, 44, 71, 89, 107, 142, 150, 284, 310):
        save(render("pink", "rounded", size), "src-tauri", "icons", f"Square{size}x{size}Logo.png")
    save(render("pink", "rounded", 50), "src-tauri", "icons", "StoreLogo.png")
    write_icns(os.path.join(ROOT, "src-tauri", "icons", "icon.icns"))
    sizes = [16, 24, 32, 48, 64, 128, 256]
    ico = [render("pink", "rounded", s) for s in sizes]
    ico_path = os.path.join(ROOT, "src-tauri", "icons", "icon.ico")
    ico[-1].save(ico_path, sizes=[(s, s) for s in sizes], append_images=ico[:-1])
    fav = [render("pink", "rounded", s) for s in (16, 24, 32, 48, 64)]
    fav[-1].save(os.path.join(ROOT, "cinny", "public", "favicon.ico"),
                 sizes=[(s, s) for s in (16, 24, 32, 48, 64)], append_images=fav[:-1])

    for size in (36, 48, 72, 96, 144, 192, 256, 384, 512):
        save(render("pink", "rounded", size), "cinny", "public", "res", "android",
             f"android-chrome-{size}x{size}.png")
    for size in (57, 60, 72, 76, 114, 120, 144, 152, 167, 180):
        save(render("pink", "square", size), "cinny", "public", "res", "apple",
             f"apple-touch-icon-{size}x{size}.png", opaque=True)


if __name__ == "__main__":
    main()
