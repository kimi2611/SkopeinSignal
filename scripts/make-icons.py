#!/usr/bin/env python3
"""Generate the V51 home-screen icon set: a flat pig mark.

Why not reuse the painted mascot art: the pig heads inside public/module-pigs/*
are only ~160px wide on a 1500px canvas, so cropping one and blowing it up to
512px turns to mush at the 60px the home screen actually shows. The icon is
therefore a simplified flat mark of the same pig — same animal, same warm pink,
redrawn as one silhouette so it survives the size reduction (reference: the
Freddie and Duolingo-owl school of mascot icons).

Run: python3 scripts/make-icons.py
"""
from PIL import Image, ImageDraw
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"

TEAL = (23, 50, 47, 255)      # forest-dusk ground, same family as the theme
PINK = (232, 168, 160, 255)   # mascot skin
PINK_D = (208, 138, 132, 255) # snout
SS = 4                        # supersample factor


def draw_mark(size: int, pad: float, rounded: bool) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.225), fill=TEAL)
    else:
        d.rectangle([0, 0, s - 1, s - 1], fill=TEAL)

    cx = s / 2
    inner = s * (1 - 2 * pad)
    u = inner / 100.0            # 1 unit = 1% of the usable box
    cy = s / 2 + u * 2

    head_r = u * 36
    # ears first so the head overlaps their base
    ear_w, ear_h = u * 20, u * 17
    for sign in (-1, 1):
        ex = cx + sign * head_r * 0.62
        ey = cy - head_r * 0.72
        d.polygon(
            [
                (ex - ear_w / 2 * sign, ey + ear_h * 0.55),
                (ex + ear_w / 2 * 1.05 * sign, ey + ear_h * 0.30),
                (ex + ear_w * 0.10 * sign, ey - ear_h * 0.75),
            ],
            fill=PINK,
        )

    d.ellipse([cx - head_r, cy - head_r, cx + head_r, cy + head_r], fill=PINK)

    # eyes
    eye_r = u * 3.6
    for sign in (-1, 1):
        ex = cx + sign * u * 13.5
        ey = cy - u * 7
        d.ellipse([ex - eye_r, ey - eye_r, ex + eye_r, ey + eye_r], fill=TEAL)

    # snout
    sw, sh = u * 30, u * 20
    sy = cy + u * 11
    d.rounded_rectangle([cx - sw / 2, sy - sh / 2, cx + sw / 2, sy + sh / 2], radius=min(sw, sh) / 2.2, fill=PINK_D)
    nx = u * 6.2
    nr = u * 2.6
    for sign in (-1, 1):
        d.ellipse([cx + sign * nx - nr, sy - nr, cx + sign * nx + nr, sy + nr], fill=TEAL)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    spec = [
        ("icon-512-v51.png", 512, 0.13, True),
        ("icon-512-maskable-v51.png", 512, 0.22, False),
        ("icon-192-v51.png", 192, 0.13, True),
        ("apple-touch-icon-v51.png", 180, 0.09, False),
    ]
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, pad, rounded in spec:
        draw_mark(size, pad, rounded).save(OUT / name, optimize=True)
        print("wrote", name, size)


if __name__ == "__main__":
    main()
