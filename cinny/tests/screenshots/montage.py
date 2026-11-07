#!/usr/bin/env python3
"""Builds docs/screenshots/themes.png (3x3 montage) from the chat-<theme>.png images and shrinks
the single images to 1280x800 (chat-diddy.png stays full size as the README hero).
Usage: python3 cinny/tests/screenshots/montage.py [docs/screenshots]   (needs Pillow)"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

THEMES = ["light", "silver", "dark", "butter", "diddy", "red", "green", "purple", "amber"]
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs", "screenshots")

font = None
for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"):
    if os.path.exists(f):
        font = ImageFont.truetype(f, 26)
        break

tw, th, pad, lab = 640, 400, 16, 44
bg = Image.new("RGB", (3 * tw + 4 * pad, 3 * (th + lab) + 4 * pad), (245, 245, 247))
draw = ImageDraw.Draw(bg)
for i, theme in enumerate(THEMES):
    path = os.path.join(OUT, f"chat-{theme}.png")
    img = Image.open(path).convert("RGB")
    tile = img.resize((tw, th), Image.LANCZOS)
    x, y = pad + (i % 3) * (tw + pad), pad + (i // 3) * (th + lab + pad)
    bg.paste(tile, (x, y))
    draw.text((x + 4, y + th + 8), theme.capitalize(), fill=(30, 30, 35), font=font)
    if theme != "diddy" and img.width > 1280:
        img.resize((1280, 800), Image.LANCZOS).save(path, optimize=True)
bg.save(os.path.join(OUT, "themes.png"), optimize=True)
print("ok")
