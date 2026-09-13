#!/usr/bin/env python3
"""
Generate x-mode SVG variants: position label 's' -> 'x' inside SVG text nodes.

Reads  svg/*.svg    -> writes svg/x/*.svg
Reads  svg/DM/*.svg -> writes svg/x/DM/*.svg

Only exact text-node patterns are replaced (attributes/paths can never match):
  >s</tspan>               -> >x</tspan>      (y-axis label)
  >Δs</tspan>              -> >Δx</tspan>     (delta label, cheat sheet)
  >s–t</tspan>             -> >x–t</tspan>    (graph title, cheat sheet)
  >s<ws>v<ws>a</tspan>     -> >x<ws>v<ws>a</tspan>  (axis legend in u-desno/u-lijevo)

Files without matches are copied unchanged so svg/x/ is a complete mirror
(svgPath() must resolve every hint name in both modes).

Re-run after editing any svg/*.svg (regenerate svg/DM via svg_to_darkmode.py first).
"""
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC_DIR = BASE / "svg"
DST_DIR = BASE / "svg" / "x"
SRC_DM = BASE / "svg" / "DM"
DST_DM = BASE / "svg" / "x" / "DM"

PATTERNS = [
    (re.compile(r">s</tspan>"), ">x</tspan>"),
    (re.compile(r">Δs</tspan>"), ">Δx</tspan>"),
    (re.compile(r">s–t</tspan>"), ">x–t</tspan>"),
    (re.compile(r">s(\s+)v(\s+)a</tspan>"), r">x\1v\2a</tspan>"),
]


def convert(content: str) -> tuple:
    total = 0
    for rx, repl in PATTERNS:
        content, n = rx.subn(repl, content)
        total += n
    return content, total


def main() -> None:
    for d in (DST_DIR, DST_DM):
        d.mkdir(parents=True, exist_ok=True)
    grand = 0
    for src, dst in ((SRC_DIR, DST_DIR), (SRC_DM, DST_DM)):
        files = sorted(src.glob("*.svg"))
        if not files:
            print(f"WARNING: no SVGs in {src}", file=sys.stderr)
        for f in files:
            content = f.read_text(encoding="utf-8")
            converted, n = convert(content)
            (dst / f.name).write_text(converted, encoding="utf-8")
            grand += n
            tag = "x-changed" if n else "copied   "
            print(f"{tag} ({n:2d}): {src.name}/{f.name} -> {dst.relative_to(BASE)}/{f.name}")
    print(f"\nDone: {grand} replacements. svgPath() picks svg/x/ when S='x'.")


if __name__ == "__main__":
    main()
