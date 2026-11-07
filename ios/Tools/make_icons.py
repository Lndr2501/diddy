"""Builds full-bleed 1024 px iOS app icons from the macOS icons in src-tauri/app-icons.

The macOS icons are a rounded square with a transparent margin. iOS masks the icon itself, so the
rounded edge is removed: pixels near the edge are replaced by a smooth fit of the background
gradient and the inner square is scaled to 1024 px.

Usage (from the repository root): python3 ios/Tools/make_icons.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src-tauri", "app-icons")
ASSETS = os.path.join(ROOT, "ios", "Diddy", "Resources", "Assets.xcassets")
COLORS = ["pink", "blue", "purple", "black", "magenta"]


def full_bleed(path):
    src = Image.open(path).convert("RGBA")
    size = src.size[0]
    a = np.array(src).astype(float)
    opaque = Image.fromarray(((a[:, :, 3] > 250) * 255).astype("uint8"))
    box = opaque.getbbox()
    k = max(3, (size * 29 // 512) | 1)
    mask = opaque.filter(ImageFilter.MinFilter(k))
    inner = np.array(mask.filter(ImageFilter.MinFilter(max(3, (size * 41 // 512) | 1)))) > 0
    band = (np.array(mask) > 0) & ~inner
    ys, xs = np.nonzero(band)
    basis = lambda x, y: np.stack([np.ones_like(x), x, y, x * y, x**2, y**2], -1).astype(float)
    coef = [np.linalg.lstsq(basis(xs, ys), a[ys, xs, i], rcond=None)[0] for i in range(3)]
    Y, X = np.mgrid[0:size, 0:size]
    bg = np.stack([basis(X, Y) @ c for c in coef], -1).clip(0, 255)
    soft = np.array(mask.filter(ImageFilter.GaussianBlur(size / 128))).astype(float)[..., None] / 255
    out = a[:, :, :3] * soft + bg * (1 - soft)
    pad = (box[2] - box[0]) // 400  # skip the anti-aliased rim
    crop = (box[0] + pad, box[1] + pad, box[2] - pad, box[3] - pad)
    return Image.fromarray(out.astype("uint8")).crop(crop).resize((1024, 1024), Image.LANCZOS)


def write_set(name, image):
    folder = os.path.join(ASSETS, f"{name}.appiconset")
    os.makedirs(folder, exist_ok=True)
    image.save(os.path.join(folder, "icon.png"), optimize=True)
    contents = {
        "images": [{"filename": "icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
        "info": {"author": "xcode", "version": 1},
    }
    with open(os.path.join(folder, "Contents.json"), "w") as f:
        json.dump(contents, f, indent=2)
        f.write("\n")


def main():
    os.makedirs(ASSETS, exist_ok=True)
    with open(os.path.join(ASSETS, "Contents.json"), "w") as f:
        json.dump({"info": {"author": "xcode", "version": 1}}, f, indent=2)
        f.write("\n")
    for color in COLORS:
        image = full_bleed(os.path.join(SRC, f"{color}-mac.png"))
        # The primary icon is pink; the others are alternate icons (see DiddyApp/AppIcon.swift).
        write_set("AppIcon" if color == "pink" else f"AppIcon-{color.capitalize()}", image)
        # Small previews for the icon picker in Settings.
        preview = os.path.join(ASSETS, f"IconPreview-{color.capitalize()}.imageset")
        os.makedirs(preview, exist_ok=True)
        image.resize((180, 180), Image.LANCZOS).save(os.path.join(preview, "preview.png"), optimize=True)
        with open(os.path.join(preview, "Contents.json"), "w") as f:
            json.dump({"images": [{"filename": "preview.png", "idiom": "universal"}],
                       "info": {"author": "xcode", "version": 1}}, f, indent=2)
            f.write("\n")


if __name__ == "__main__":
    main()
