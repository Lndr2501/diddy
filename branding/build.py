"""Builds the Diddy logo: one vector drawing, five colour tones, three icon shapes.

The mark is a bold lowercase "d" whose counter is a speech bubble. The drawing lives in this file,
so every tone has exactly the same shape. Output goes to `branding/logo/` (SVG masters) and
`branding/logo/png/` (1024 px renders, not committed).

Usage (from the repository root): python3 branding/build.py
PNG renders need `rsvg-convert` (librsvg). Without it only the SVG files are written.
"""
import math
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "logo")
SIZE = 1024

# Per tone: tile gradient, gradient of the "d" (both top to bottom) and the fill of the speech
# bubble. Without a bubble fill the bubble is a hole and shows the tile.
PINK = ("#FF6FC0", "#E60A78")
TONES = {
    "pink": {"tile": ("#FF80CA", "#E60A78"), "letter": ("#FFFFFF", "#FFE4F2"), "bubble": None},
    "blue": {"tile": ("#4D8DFF", "#1239B5"), "letter": ("#FFFFFF", "#DFEAFF"), "bubble": None},
    "purple": {"tile": ("#B566FF", "#6418C9"), "letter": ("#FFFFFF", "#EEE0FF"), "bubble": None},
    "black": {"tile": ("#2F2F35", "#0C0C0E"), "letter": ("#FFFFFF", "#E4E4EA"), "bubble": PINK},
    "magenta": {"tile": ("#A8155F", "#4F0A30"), "letter": ("#FFF3F9", "#FFD3EA"), "bubble": None},
    # Christmas edition: wine red tile, the "d" wears a Santa hat (see hat_svg) and the mark shrinks
    # a little so the hat fits on the tile.
    "christmas": {"tile": ("#A3223D", "#4A0716"), "letter": ("#FFFFFF", "#FBE6EA"), "bubble": None,
                  "hat": True},
}

# Santa hat, drawn in its own frame: origin at the middle of the fur band, which sits on the top of
# the stem of the "d". The tip falls to the left over the round part.
HAT_AT = (180, -322)  # centre of the fur band in letter coordinates (stem centre, just below its top)
HAT_TILT = -12  # degrees, negative leans the hat to the left
HAT_SIZE = 1.0
HAT_CONE = ("#FF5A64", "#C8102E")  # top to bottom
HAT_FUR = ("#FFFFFF", "#E8E1E4")
# Snow on the Christmas tile: (x, y, radius) in tile units of 1024, kept away from the mark.
SNOW = [
    (176, 236, 13), (292, 150, 8), (128, 420, 9), (214, 330, 6), (402, 214, 7),
    (848, 318, 11), (770, 176, 7), (896, 470, 7), (820, 640, 9), (902, 812, 12),
    (744, 868, 7), (150, 708, 8), (236, 858, 11), (106, 596, 6), (612, 912, 6),
]
SNOW_OPACITY = 0.5
HAT_SCALE = 0.86  # the hatted mark is this much smaller than the plain one
HAT_SHIFT = 112  # and moves this far down (letter units), so mark and hat sit in the middle

# The "d", drawn around the centre of the icon (0,0).
BOWL = 245  # outer radius of the round part
STROKE = 130  # width of the stem and of the ring
ASCENDER = 150  # how far the stem rises above the round part
CORNER = 50  # rounding of the stem ends
FILLET = 20  # rounding where the stem meets the round part
BOWL_Y = ASCENDER / 2 - 10  # centre of the round part; the letter sits a little above the middle
TAIL = 54  # length of the bubble tail
TAIL_ANGLES = (106, 136, 157)  # start, tip and end of the tail, degrees clockwise from 3 o'clock
TAIL_ROUND = 9  # rounding of the tail tip


def n(value):
    """Short number for SVG output."""
    return f"{value:.2f}".rstrip("0").rstrip(".")


def point(radius, degrees):
    """A point around the centre of the round part."""
    a = math.radians(degrees)
    return radius * math.cos(a), BOWL_Y + radius * math.sin(a)


def towards(a, b, distance):
    """The point `distance` away from a on the way to b."""
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    return a[0] + (b[0] - a[0]) * distance / length, a[1] + (b[1] - a[1]) * distance / length


def xy(p):
    return f"{n(p[0])} {n(p[1])}"


def letter_path():
    """Outline of the "d" without its counter."""
    right, left = BOWL, BOWL - STROKE
    top, bottom = BOWL_Y - BOWL - ASCENDER, BOWL_Y + BOWL
    # The fillet is a small circle that touches the stem and the round part from outside.
    fillet_x = left - FILLET
    fillet_y = BOWL_Y - math.sqrt((BOWL + FILLET) ** 2 - fillet_x**2)
    on_bowl = towards((0, BOWL_Y), (fillet_x, fillet_y), BOWL)
    c, f = CORNER, FILLET
    return (
        f"M0 {n(bottom)}A{BOWL} {BOWL} 0 1 1 {xy(on_bowl)}A{f} {f} 0 0 0 {n(left)} {n(fillet_y)}"
        f"V{n(top + c)}a{c} {c} 0 0 1 {c} -{c}H{n(right - c)}a{c} {c} 0 0 1 {c} {c}"
        f"V{n(bottom - c)}a{c} {c} 0 0 1 -{c} {c}Z"
    )


def bubble_path():
    """The speech bubble inside the "d": a circle with a short tail to the lower left."""
    radius = BOWL - STROKE
    start, tip, end = (
        point(radius, TAIL_ANGLES[2]),
        point(radius + TAIL, TAIL_ANGLES[1]),
        point(radius, TAIL_ANGLES[0]),
    )
    return (
        f"M{xy(start)}L{xy(towards(tip, start, TAIL_ROUND))}Q{xy(tip)} {xy(towards(tip, end, TAIL_ROUND))}"
        f"L{xy(end)}A{radius} {radius} 0 1 0 {xy(start)}Z"
    )


def hat_svg():
    """Santa hat for the Christmas tone: red cone falling to the left, fur band and bobble.

    Returns (defs, body). The body is placed in letter coordinates, like the "d".
    """
    cone = (
        "M100 -20C104 -112 72 -206 -8 -224C-96 -242 -178 -182 -224 -64"
        "C-196 -64 -148 -72 -100 -30Z"
    )
    defs = (
        gradient("hatcone", HAT_CONE, -60, -230, 40, 0)
        + gradient("hatfur", HAT_FUR, 0, -40, 0, 40)
        + '<filter id="hatshadow" x="-20%" y="-20%" width="140%" height="150%">'
        '<feGaussianBlur in="SourceAlpha" stdDeviation="9"/><feOffset dy="10"/>'
        '<feComponentTransfer><feFuncA type="linear" slope=".35"/></feComponentTransfer>'
        '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    )
    body = (
        f'<g transform="translate({n(HAT_AT[0])} {n(HAT_AT[1])}) rotate({n(HAT_TILT)}) scale({n(HAT_SIZE)})"'
        ' filter="url(#hatshadow)">'
        f'<path d="{cone}" fill="url(#hatcone)"/>'
        '<rect x="-122" y="-42" width="244" height="84" rx="42" fill="url(#hatfur)"/>'
        '<circle cx="-222" cy="-58" r="50" fill="url(#hatfur)"/>'
        "</g>"
    )
    return defs, body


def squircle(x, y, size, radius, smoothing=0.6):
    """Rounded square with continuous corners (the shape of an iOS or macOS app icon)."""
    budget = size / 2
    smoothing = min(smoothing, budget / radius - 1)
    p = min((1 + smoothing) * radius, budget)
    arc = 90 * (1 - smoothing)
    arc_len = math.sin(math.radians(arc / 2)) * radius * math.sqrt(2)
    alpha = (90 - arc) / 2
    p3_p4 = radius * math.tan(math.radians(alpha / 2))
    beta = 45 * smoothing
    c = p3_p4 * math.cos(math.radians(beta))
    d = c * math.tan(math.radians(beta))
    b = (p - arc_len - c - d) / 3
    a = 2 * b
    r, s = n(radius), n(arc_len)
    abc, ab, bc = a + b + c, a + b, b + c
    return (
        f"M{n(x + size - p)} {n(y)}"
        f"c{n(a)} 0 {n(ab)} 0 {n(abc)} {n(d)}a{r} {r} 0 0 1 {s} {s}c{n(d)} {n(c)} {n(d)} {n(bc)} {n(d)} {n(abc)}"
        f"V{n(y + size - p)}"
        f"c0 {n(a)} 0 {n(ab)} {n(-d)} {n(abc)}a{r} {r} 0 0 1 -{s} {s}c{n(-c)} {n(d)} {n(-bc)} {n(d)} {n(-abc)} {n(d)}"
        f"H{n(x + p)}"
        f"c{n(-a)} 0 {n(-ab)} 0 {n(-abc)} {n(-d)}a{r} {r} 0 0 1 -{s} -{s}c{n(-d)} {n(-c)} {n(-d)} {n(-bc)} {n(-d)} {n(-abc)}"
        f"V{n(y + p)}"
        f"c0 {n(-a)} 0 {n(-ab)} {n(d)} {n(-abc)}a{r} {r} 0 0 1 {s} -{s}c{n(c)} {n(-d)} {n(bc)} {n(-d)} {n(abc)} {n(-d)}"
        "Z"
    )


def gradient(name, stops, x1, y1, x2, y2):
    return (
        f'<linearGradient id="{name}" gradientUnits="userSpaceOnUse" x1="{n(x1)}" y1="{n(y1)}" '
        f'x2="{n(x2)}" y2="{n(y2)}"><stop stop-color="{stops[0]}"/>'
        f'<stop offset="1" stop-color="{stops[1]}"/></linearGradient>'
    )


def svg(body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" width="{SIZE}" height="{SIZE}">'
        f"<title>Diddy</title>{defs}{body}</svg>\n"
    )


def icon_svg(tone, shape):
    """shape: 'square' (full bleed, iOS), 'rounded' (Linux, in-app) or 'mac' (margin and shadow)."""
    colors = TONES[tone]
    top, bottom = BOWL_Y - BOWL - ASCENDER, BOWL_Y + BOWL
    defs = [gradient("letter", colors["letter"], 0, top, 0, bottom)]
    if colors["bubble"]:
        # A filled bubble is painted over the solid letter, so no tile colour shines through its edge.
        radius = BOWL - STROKE
        defs.append(gradient("bubble", colors["bubble"], 0, BOWL_Y - radius, 0, BOWL_Y + radius))
        mark = f'<path d="{letter_path()}" fill="url(#letter)"/><path d="{bubble_path()}" fill="url(#bubble)"/>'
    else:
        mark = f'<path fill-rule="evenodd" d="{letter_path()}{bubble_path()}" fill="url(#letter)"/>'
    scale_by, shift = 1.0, 0
    if colors.get("hat"):
        hat_defs, hat = hat_svg()
        defs.append(hat_defs)
        mark += hat
        scale_by, shift = HAT_SCALE, HAT_SHIFT

    if shape == "mac":
        box, scale = (100, 100, 824), 0.8
        tile = f'<path d="{squircle(*box, 185.4)}" fill="url(#tile)" filter="url(#shadow)"/>'
        defs.append(
            '<filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">'
            '<feGaussianBlur in="SourceAlpha" stdDeviation="12"/><feOffset dy="10"/>'
            '<feComponentTransfer><feFuncA type="linear" slope=".28"/></feComponentTransfer>'
            '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
        )
    elif shape == "rounded":
        box, scale = (0, 0, SIZE), 1.0
        tile = f'<path d="{squircle(*box, 230)}" fill="url(#tile)"/>'
    else:
        box, scale = (0, 0, SIZE), 1.0
        tile = f'<rect width="{SIZE}" height="{SIZE}" fill="url(#tile)"/>'
    x, y, size = box
    defs.insert(0, gradient("tile", colors["tile"], x + size * 0.28, y, x + size * 0.72, y + size))
    if colors.get("hat"):
        # The snow scales with the tile (the mac shape has a margin).
        k = size / SIZE
        dots = "".join(
            f'<circle cx="{n(x + sx * k)}" cy="{n(y + sy * k)}" r="{n(r * k)}"/>' for sx, sy, r in SNOW
        )
        tile += f'<g fill="#FFFFFF" fill-opacity="{n(SNOW_OPACITY)}">{dots}</g>'
    scale *= scale_by
    placed = f'<g transform="translate(512 {n(512 + shift * scale)}) scale({n(scale)})">{mark}</g>'
    return svg(tile + placed, f'<defs>{"".join(defs)}</defs>')


def mark_svg():
    """The bare "d" in one colour (`currentColor`), for places without the coloured tile."""
    return svg(
        '<g transform="translate(512 512) scale(1.3)" fill="currentColor">'
        f'<path fill-rule="evenodd" d="{letter_path()}{bubble_path()}"/></g>'
    )


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


def main():
    files = []
    for tone in TONES:
        for shape in ("square", "rounded", "mac"):
            path = os.path.join(OUT, f"diddy-{tone}-{shape}.svg")
            write(path, icon_svg(tone, shape))
            files.append(path)
    mark = os.path.join(OUT, "diddy-mark.svg")
    write(mark, mark_svg())
    files.append(mark)
    print(f"wrote {len(files)} SVG files to {os.path.relpath(OUT)}")

    if not shutil.which("rsvg-convert"):
        print("rsvg-convert not found, skipping PNG renders")
        return
    for path in files:
        png = os.path.join(OUT, "png", os.path.basename(path)[:-4] + ".png")
        os.makedirs(os.path.dirname(png), exist_ok=True)
        subprocess.run(["rsvg-convert", "-w", str(SIZE), "-h", str(SIZE), path, "-o", png], check=True)
    print(f"rendered {len(files)} PNG files to {os.path.relpath(os.path.join(OUT, 'png'))}")


if __name__ == "__main__":
    main()
