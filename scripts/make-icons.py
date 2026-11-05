#!/usr/bin/env python3
"""Home-screen icon set.

V52 is the icon the user picked out of the group thread: deep-teal ground
(#17322F, the forest-dusk family) with the cream signal mark plus the amber
baseline. The art is byte-identical to the V50 set — it is re-stamped with a
new version number because iOS caches `apple-touch-icon` per URL, so the only
way to make an installed shortcut re-fetch the artwork is to move it to a new
filename.

A pig-head variant (V51) was also built and shipped for a few minutes; the user
asked to go back to this one, so V51 is retired.

Run: python3 scripts/make-icons.py
"""
from PIL import Image
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"

# approved source art (V50) -> version-stamped output (V52)
SOURCES = {
    "icon-512-v50.png": "icon-512-v52.png",
    "icon-512-maskable-v50.png": "icon-512-maskable-v52.png",
    "icon-192-v50.png": "icon-192-v52.png",
    "apple-touch-icon-v50.png": "apple-touch-icon-v52.png",
}

# unversioned paths kept in sync so shortcuts added before the stamp still
# resolve to the current artwork
LEGACY = {
    "icon-512-v52.png": "icon-512.png",
    "icon-192-v52.png": "icon-192.png",
    "apple-touch-icon-v52.png": "apple-touch-icon.png",
}


def main() -> None:
    for src, dst in SOURCES.items():
        shutil.copyfile(OUT / src, OUT / dst)
        print("wrote", dst, Image.open(OUT / dst).size)
    for src, dst in LEGACY.items():
        shutil.copyfile(OUT / src, OUT / dst)
        print("wrote", dst, "(legacy path)")


if __name__ == "__main__":
    main()
