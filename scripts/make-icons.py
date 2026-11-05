#!/usr/bin/env python3
"""Generate the V50 app icon set.

The pre-V49 icons were cream-on-white, which read as a blank tile on a home
screen. V50 gives the mark the forest-dusk ground from the current art theme so
it stays legible at 60px: a cream "signal" glyph (filled dot + two broadcast
arcs) resting on an amber shelf line.

Run with: python3 scripts/make-icons.py
"""
from PIL import Image, ImageDraw
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"
GROUND = (23, 50, 47, 255)      # forest-dusk deep teal
CREAM = (246, 239, 226, 255)    # paper
AMBER = (232, 176, 75, 255)     # lantern
SS = 4                          # supersample factor


def draw_mark(size: int, pad: float, rounded: bool) -> Image.Image:
    """pad: fraction of the canvas kept clear on each side (maskable needs more)."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=GROUND)
    else:
        d.rectangle([0, 0, s, s], fill=GROUND)

    inner = s * (1 - 2 * pad)
    ox = oy = s * pad
    cx = ox + inner * 0.42
    cy = oy + inner * 0.46
    unit = inner

    # broadcast arcs (drawn first so the dot sits on top)
    for radius, width in ((0.31, 0.085), (0.46, 0.085)):
        r = unit * radius
        w = int(unit * width)
        d.arc([cx - r, cy - r, cx + r, cy + r], start=-47, end=47, fill=CREAM, width=w)

    # the dot: a played episode / a lit window
    r = unit * 0.15
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CREAM)

    # shelf line: the atelier's lectern
    lw = int(unit * 0.055)
    x0 = ox + inner * 0.22
    x1 = ox + inner * 0.88
    y = oy + inner * 0.76
    d.rounded_rectangle([x0, y - lw / 2, x1, y + lw / 2], radius=lw // 2, fill=AMBER)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    spec = [
        ("icon-512-v50.png", 512, 0.14, True),
        ("icon-512-maskable-v50.png", 512, 0.24, False),
        ("icon-192-v50.png", 192, 0.14, True),
        ("apple-touch-icon-v50.png", 180, 0.10, False),
    ]
    for name, size, pad, rounded in spec:
        draw_mark(size, pad, rounded).save(OUT / name, optimize=True)
        print("wrote", name, size)


if __name__ == "__main__":
    main()
