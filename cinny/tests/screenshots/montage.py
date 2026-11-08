#!/usr/bin/env python3
"""Builds docs/screenshots/themes.png (5x2 montage) from the chat-<theme>.png images and shrinks
the single images to 1280 px wide (chat-diddy.png stays full size as the README hero).
Usage: python3 cinny/tests/screenshots/montage.py [docs/screenshots]   (needs Pillow)"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

THEMES = ["light", "silver", "dark", "daaark", "butter", "diddy", "red", "green", "purple", "amber"]
COLS = 5
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs", "screenshots")


def find_font(size):
    candidates = glob.glob("/nix/store/*dejavu*/share/fonts/truetype/DejaVuSans-Bold.ttf")
    candidates += glob.glob("/nix/store/*noto-fonts-*/share/fonts/noto/NotoSans-Bold.ttf")
    candidates += [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for f in candidates:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


font = find_font(30)
first = Image.open(os.path.join(OUT, f"chat-{THEMES[0]}.png"))
tw = 560
th = round(tw * first.height / first.width)
pad, lab = 20, 56
rows = (len(THEMES) + COLS - 1) // COLS
bg = Image.new("RGB", (COLS * tw + (COLS + 1) * pad, rows * (th + lab) + (rows + 1) * pad), (246, 246, 248))
draw = ImageDraw.Draw(bg)
for i, theme in enumerate(THEMES):
    path = os.path.join(OUT, f"chat-{theme}.png")
    img = Image.open(path).convert("RGB")
    tile = img.resize((tw, th), Image.LANCZOS)
    x, y = pad + (i % COLS) * (tw + pad), pad + (i // COLS) * (th + lab + pad)
    # rounded corners
    mask = Image.new("L", tile.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, tw - 1, th - 1), radius=18, fill=255)
    bg.paste(tile, (x, y), mask)
    draw.text((x + 6, y + th + 12), theme.capitalize(), fill=(30, 30, 35), font=font)
    if theme != "diddy" and img.width > 1280:
        img.resize((1280, round(1280 * img.height / img.width)), Image.LANCZOS).save(path, optimize=True)
bg.save(os.path.join(OUT, "themes.png"), optimize=True)
print("ok")
