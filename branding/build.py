"""Builds the Diddy logo: one vector drawing, its colour tones and occasion editions, three icon shapes.

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
# Occasion editions also name a decoration on the "d" (DECORATIONS, e.g. a hat on the stem) and the
# small shapes scattered over the tile (SCATTERS).
PINK = ("#FF6FC0", "#E60A78")
TONES = {
    "pink": {"tile": ("#FF80CA", "#E60A78"), "letter": ("#FFFFFF", "#FFE4F2"), "bubble": None},
    "blue": {"tile": ("#4D8DFF", "#1239B5"), "letter": ("#FFFFFF", "#DFEAFF"), "bubble": None},
    "purple": {"tile": ("#B566FF", "#6418C9"), "letter": ("#FFFFFF", "#EEE0FF"), "bubble": None},
    "black": {"tile": ("#2F2F35", "#0C0C0E"), "letter": ("#FFFFFF", "#E4E4EA"), "bubble": PINK},
    "magenta": {"tile": ("#A8155F", "#4F0A30"), "letter": ("#FFF3F9", "#FFD3EA"), "bubble": None},
    # Occasion editions, in calendar order.
    "valentine": {"tile": ("#FF5C7C", "#A4133C"), "letter": ("#FFFFFF", "#FFE3EA"), "bubble": None,
                  "deco": "heart", "scatter": "hearts"},
    "easter": {"tile": ("#8FDB6E", "#2F8F45"), "letter": ("#FFFFFF", "#F0FBE8"), "bubble": None,
               "deco": "bunny-ears", "scatter": "eggs"},
    "halloween": {"tile": ("#FF9A2E", "#C2410C"), "letter": ("#FFFFFF", "#FFEBD6"), "bubble": None,
                  "deco": "witch-hat", "scatter": "bats"},
    "christmas": {"tile": ("#A3223D", "#4A0716"), "letter": ("#FFFFFF", "#FBE6EA"), "bubble": None,
                  "deco": "santa-hat", "scatter": "snow"},
    "newyear": {"tile": ("#2B3A78", "#080C22"), "letter": ("#FFF6DA", "#F2C24E"), "bubble": None,
                "deco": "party-hat", "scatter": "confetti"},
}

# Hats and ears sit on the round part of the "d" like on a head, left of the stem, where the tile
# has room. The "d" itself stays exactly as in every other tone (same size and place).

# Where the scattered shapes sit on occasion tiles: (x, y, size) in tile units of 1024, all clear
# of the mark and of a decoration on the stem.
SCATTER_AT = [
    (130, 140, 9), (700, 86, 7), (840, 150, 12), (940, 300, 7), (870, 440, 9),
    (950, 600, 11), (860, 760, 7), (930, 900, 12), (740, 930, 7), (560, 930, 9),
    (370, 915, 6), (210, 940, 11), (110, 800, 8), (170, 620, 12), (90, 470, 7),
]

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


SHADOW = (
    '<filter id="decoshadow" x="-20%" y="-20%" width="140%" height="150%">'
    '<feGaussianBlur in="SourceAlpha" stdDeviation="9"/><feOffset dy="10"/>'
    '<feComponentTransfer><feFuncA type="linear" slope=".35"/></feComponentTransfer>'
    '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
)
# Unit shapes (about 2 units wide, centred on 0 0), scaled where they are used.
HEART = (
    "M0 .95C-.3 .72 -1 .25 -1 -.28C-1 -.7 -.7 -.98 -.38 -.98C-.18 -.98 -.05 -.86 0 -.7"
    "C.05 -.86 .18 -.98 .38 -.98C.7 -.98 1 -.7 1 -.28C1 .25 .3 .72 0 .95Z"
)
SPARKLE = "M0 -1Q.12 -.12 1 0Q.12 .12 0 1Q-.12 .12 -1 0Q-.12 -.12 0 -1Z"
BAT = (
    "M0 -.1C.12 -.4 .5 -.5 1 -.55C.82 -.35 .78 -.1 .84 .16C.64 .02 .48 .06 .36 .26"
    "C.26 .08 .12 .08 0 .32C-.12 .08 -.26 .08 -.36 .26C-.48 .06 -.64 .02 -.84 .16"
    "C-.78 -.1 -.82 -.35 -1 -.55C-.5 -.5 -.12 -.4 0 -.1Z"
)


def on_head(body, angle, scale=1.0, lean=0, lift=0):
    """Places a decoration drawn upright around 0 0 on the round part of the "d".

    `angle` is where on the round part it sits (degrees clockwise from 3 o'clock, -90 is the top),
    it stands at right angles to the surface there, plus `lean` degrees. `lift` moves it out from
    the surface.
    """
    x, y = point(BOWL + lift, angle)
    return (
        f'<g transform="translate({n(x)} {n(y)}) rotate({n(angle + 90 + lean)}) scale({n(scale)})"'
        f' filter="url(#decoshadow)">{body}</g>'
    )


def santa_hat():
    """Red cone falling to the left over the round part, fur band and bobble."""
    cone = (
        "M100 -20C104 -112 72 -206 -8 -224C-96 -242 -178 -182 -224 -64"
        "C-196 -64 -148 -72 -100 -30Z"
    )
    defs = (
        gradient("hatcone", ("#FF5A64", "#C8102E"), -60, -230, 40, 0)
        + gradient("hatfur", ("#FFFFFF", "#E8E1E4"), 0, -40, 0, 40)
    )
    body = (
        f'<path d="{cone}" fill="url(#hatcone)"/>'
        '<rect x="-122" y="-42" width="244" height="84" rx="42" fill="url(#hatfur)"/>'
        '<circle cx="-222" cy="-58" r="50" fill="url(#hatfur)"/>'
    )
    return defs, on_head(body, -108, 1.0, lift=8)


def heart():
    """A heart in the speech bubble: the "d" sends love."""
    defs = gradient("heart", ("#FFFFFF", "#FFD6E0"), 0, BOWL_Y - 60, 0, BOWL_Y + 60)
    body = f'<path transform="translate(0 {n(BOWL_Y + 4)}) scale(62)" d="{HEART}" fill="url(#heart)"/>'
    return defs, body


def bunny_ears():
    """Two bunny ears growing out of the stem, in the colour of the letter, pink inside."""
    outer = "M-48 30C-62 -80 -56 -232 0 -264C56 -232 62 -80 48 30Z"
    inner = "M-23 -10C-31 -90 -27 -198 0 -228C27 -198 31 -90 23 -10Z"
    defs = gradient("earin", ("#FFC2D4", "#FF8FB1"), 0, -228, 0, -10)

    ear = f'<path d="{outer}" fill="url(#letter)"/><path d="{inner}" fill="url(#earin)"/>'
    return defs, on_head(ear, -124, 0.9, lean=-4) + on_head(ear, -92, 0.9, lean=2)


def witch_hat():
    """Dark pointed hat with a bent tip, a purple band and a gold buckle, on a wide brim."""
    cone = (
        "M92 -6C70 -80 40 -170 0 -230C-20 -262 -60 -282 -112 -280"
        "C-70 -262 -48 -236 -40 -200C-55 -130 -75 -60 -92 -6Z"
    )
    defs = (
        gradient("witch", ("#4A2A66", "#160A22"), -60, -280, 40, 0)
        + gradient("witchband", ("#B57BFF", "#7B3FD6"), 0, -64, 0, -18)
        + f'<clipPath id="witchcone"><path d="{cone}"/></clipPath>'
    )
    body = (
        '<ellipse cx="0" cy="0" rx="176" ry="34" fill="url(#witch)"/>'
        f'<path d="{cone}" fill="url(#witch)"/>'
        '<rect x="-120" y="-64" width="240" height="46" fill="url(#witchband)" clip-path="url(#witchcone)"/>'
        '<rect x="-22" y="-62" width="44" height="42" rx="7" fill="none" stroke="#FFD66B" stroke-width="9"/>'
    )
    return defs, on_head(body, -110, 0.82, lean=-2, lift=6)


def party_hat():
    """Striped party cone with a golden bobble, for New Year's Eve."""
    cone = "M-98 8L-8 -272Q0 -284 8 -272L98 8Q0 28 -98 8Z"
    stripes = "".join(
        f'<rect x="-140" y="{n(y)}" width="280" height="30" transform="rotate(-18 0 {n(y + 13)})"/>'
        for y in (-226, -150, -74)
    )
    defs = (
        gradient("party", ("#FF6FAE", "#D61F69"), 0, -280, 0, 10)
        + gradient("gold", ("#FFF1B8", "#F2B93B"), 0, -322, 0, -246)
        + f'<clipPath id="partycone"><path d="{cone}"/></clipPath>'
    )
    body = (
        f'<path d="{cone}" fill="url(#party)"/>'
        f'<g fill="#FFE08A" clip-path="url(#partycone)">{stripes}</g>'
        '<circle cx="0" cy="-284" r="38" fill="url(#gold)"/>'
    )
    return defs, on_head(body, -114, 0.9, lean=-4, lift=4)


DECORATIONS = {
    "santa-hat": santa_hat,
    "heart": heart,
    "bunny-ears": bunny_ears,
    "witch-hat": witch_hat,
    "party-hat": party_hat,
}

EGG_COLORS = ["#FFE08A", "#FFB3CE", "#A9D8FF", "#D6BDFF", "#FFFFFF"]
CONFETTI_COLORS = ["#FFD66B", "#FF6FAE", "#6FE3FF", "#FFFFFF"]


def scatter(kind, x, y, size, i):
    """One small shape on an occasion tile, at x y (tile units), `size` about its radius."""
    if kind == "snow":
        return f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(size)}" fill="#FFFFFF" fill-opacity=".5"/>'
    if kind == "hearts":
        return (
            f'<path transform="translate({n(x)} {n(y)}) rotate({(i * 23) % 50 - 25}) scale({n(size * 1.5)})"'
            f' d="{HEART}" fill="#FFFFFF" fill-opacity=".45"/>'
        )
    if kind == "eggs":
        return (
            f'<ellipse transform="rotate({(i * 29) % 60 - 30} {n(x)} {n(y)})" cx="{n(x)}" cy="{n(y)}"'
            f' rx="{n(size * 1.15)}" ry="{n(size * 1.5)}" fill="{EGG_COLORS[i % len(EGG_COLORS)]}"'
            ' fill-opacity=".85"/>'
        )
    if kind == "bats":
        return (
            f'<path transform="translate({n(x)} {n(y)}) rotate({(i * 17) % 40 - 20}) scale({n(size * 3.4)})"'
            f' d="{BAT}" fill="#2A0F1F" fill-opacity=".6"/>'
        )
    if kind == "confetti":
        w, h = size * 1.1, size * 2.4
        return (
            f'<rect transform="rotate({(i * 47) % 180} {n(x)} {n(y)})" x="{n(x - w / 2)}" y="{n(y - h / 2)}"'
            f' width="{n(w)}" height="{n(h)}" rx="{n(w / 3)}" fill="{CONFETTI_COLORS[i % len(CONFETTI_COLORS)]}"'
            ' fill-opacity=".85"/>'
        )
    if kind == "stars":
        return (
            f'<path transform="translate({n(x)} {n(y)}) scale({n(size * 1.8)})" d="{SPARKLE}"'
            ' fill="#FFE9B8" fill-opacity=".7"/>'
        )
    raise ValueError(f"unknown scatter: {kind}")


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
    if colors.get("deco"):
        deco_defs, deco = DECORATIONS[colors["deco"]]()
        defs.append(deco_defs + SHADOW)
        mark += deco

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
    if colors.get("scatter"):
        # The shapes scale with the tile (the mac shape has a margin).
        k = size / SIZE
        tile += "".join(
            scatter(colors["scatter"], x + sx * k, y + sy * k, r * k, i) for i, (sx, sy, r) in enumerate(SCATTER_AT)
        )
    placed = f'<g transform="translate(512 512) scale({n(scale)})">{mark}</g>'
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
