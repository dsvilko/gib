#!/usr/bin/env python3
"""
Recolor SVG files by replacing colors that are "visually similar" to a
target color with a replacement color.

Define your color pairs in COLOR_PAIRS below. Each pair has:
  - "from":      the target color (hex string, e.g. "#0000FE")
  - "to":        the replacement color (hex string, e.g. "#2F5EAF")
  - "threshold": how fuzzy the match should be (see note below)

Matching is done in CIE76 Delta-E color space, which approximates how
different two colors *look* to the human eye far better than comparing
raw RGB numbers. Rough guide for "threshold":
    0 - 2   : essentially identical, imperceptible difference
    2 - 10  : very close, same "shade" (good default for icon sets)
    10 - 25 : noticeably different but still clearly related colors
    25+     : starting to catch colors most people wouldn't call "the same"

The "to" color is NOT fuzzy - matched pixels are replaced with that exact
color (alpha channel, if present on the matched color, is preserved).
"""
import re
from pathlib import Path

SRC_DIR = Path("svg")
DST_DIR = Path("svg/DM")

# ---------------------------------------------------------------------------
# Define your color pairs here. Add as many as you like.
# ---------------------------------------------------------------------------
COLOR_PAIRS = [
    {"from": "#0000FE", "to": "#2F5EAF", "threshold": 12},
    {"from": "#000000", "to": "#FFFFFF", "threshold": 12},
    {"from": "#FF00FF", "to": "#FF33FF", "threshold": 12},
]

# ---------------------------------------------------------------------------
# Color parsing helpers
# ---------------------------------------------------------------------------

# A small set of CSS named colors commonly seen in SVGs. Extend if needed.
NAMED_COLORS = {
    "black": "#000000", "white": "#ffffff", "red": "#ff0000",
    "green": "#008000", "blue": "#0000ff", "yellow": "#ffff00",
    "cyan": "#00ffff", "magenta": "#ff00ff", "gray": "#808080",
    "grey": "#808080", "silver": "#c0c0c0", "maroon": "#800000",
    "olive": "#808000", "lime": "#00ff00", "aqua": "#00ffff",
    "teal": "#008080", "navy": "#000080", "fuchsia": "#ff00ff",
    "purple": "#800080", "orange": "#ffa500", "pink": "#ffc0cb",
    "brown": "#a52a2a", "gold": "#ffd700", "indigo": "#4b0082",
    "violet": "#ee82ee", "transparent": None,
}

# Matches hex colors, rgb()/rgba() functions, and known named colors.
_named_alt = "|".join(re.escape(n) for n in NAMED_COLORS)
COLOR_TOKEN_PATTERN = re.compile(
    r'#[0-9a-fA-F]{3,8}\b'
    r'|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)'
    r'|\b(?:' + _named_alt + r')\b',
    re.IGNORECASE,
)


def _expand_short_hex(h: str) -> str:
    """#rgb / #rgba -> #rrggbb / #rrggbbaa"""
    return ''.join(c * 2 for c in h)


def parse_color(token: str):
    """Parse a color token into (r, g, b, a) with a in [0,1], or None."""
    t = token.strip()

    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4):
            h = _expand_short_hex(h)
        if len(h) not in (6, 8):
            return None
        r = int(h[0:2], 16)
        g = int(h[2:4], 16)
        b = int(h[4:6], 16)
        a = int(h[6:8], 16) / 255.0 if len(h) == 8 else 1.0
        return (r, g, b, a)

    m = re.match(r'rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)', t, re.IGNORECASE)
    if m:
        r, g, b = (float(m.group(i)) for i in (1, 2, 3))
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (r, g, b, a)

    named = NAMED_COLORS.get(t.lower())
    if named:
        return parse_color(named)

    return None


def rgb_to_hex(r: float, g: float, b: float) -> str:
    return '#{:02x}{:02x}{:02x}'.format(round(r), round(g), round(b))


# ---------------------------------------------------------------------------
# Perceptual color distance (CIE76 Delta-E via CIELAB)
# ---------------------------------------------------------------------------

def _srgb_to_linear(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_to_lab(r: float, g: float, b: float):
    rl, gl, bl = _srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b)

    # sRGB (D65) -> XYZ
    x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805
    y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722
    z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505

    # Normalize by D65 reference white
    xn, yn, zn = x / 0.95047, y / 1.00000, z / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    fx, fy, fz = f(xn), f(yn), f(zn)
    L = (116 * fy) - 16
    a = 500 * (fx - fy)
    bb = 200 * (fy - fz)
    return (L, a, bb)


def delta_e76(lab1, lab2) -> float:
    return sum((c1 - c2) ** 2 for c1, c2 in zip(lab1, lab2)) ** 0.5


# ---------------------------------------------------------------------------
# Conversion logic
# ---------------------------------------------------------------------------

def _prepare_pairs(pairs):
    """Pre-parse each pair's 'from'/'to' colors and LAB value once."""
    prepared = []
    for pair in pairs:
        from_rgb = parse_color(pair["from"])
        if from_rgb is None:
            raise ValueError(f"Could not parse 'from' color: {pair['from']}")
        to_rgb = parse_color(pair["to"])
        if to_rgb is None:
            raise ValueError(f"Could not parse 'to' color: {pair['to']}")
        prepared.append({
            "from_lab": rgb_to_lab(*from_rgb[:3]),
            "to_rgb": to_rgb,
            "threshold": pair["threshold"],
        })
    return prepared


def _format_replacement(original_token: str, to_rgb, alpha: float) -> str:
    """Render the replacement color, preserving alpha and using a sensible
    syntax based on the token that was matched (hex vs rgb/rgba)."""
    r, g, b, _ = to_rgb
    is_rgb_func = original_token.strip().lower().startswith('rgb')

    if is_rgb_func:
        if alpha < 1.0:
            return f'rgba({round(r)}, {round(g)}, {round(b)}, {round(alpha, 3)})'
        return f'rgb({round(r)}, {round(g)}, {round(b)})'

    hex_color = rgb_to_hex(r, g, b)
    if alpha < 1.0:
        hex_color += format(round(alpha * 255), '02x')
    return hex_color


def convert_svg_content(content: str, pairs) -> str:
    """Replace all colors in content that fuzzily match any pair's
    'from' color with that pair's exact 'to' color."""
    prepared = _prepare_pairs(pairs)

    def replace(match: re.Match) -> str:
        token = match.group(0)
        parsed = parse_color(token)
        if parsed is None:
            return token
        r, g, b, a = parsed
        token_lab = rgb_to_lab(r, g, b)

        best = None
        for p in prepared:
            dist = delta_e76(token_lab, p["from_lab"])
            if dist <= p["threshold"]:
                if best is None or dist < best[0]:
                    best = (dist, p)

        if best is None:
            return token

        return _format_replacement(token, best[1]["to_rgb"], a)

    return COLOR_TOKEN_PATTERN.sub(replace, content)


def main():
    DST_DIR.mkdir(parents=True, exist_ok=True)

    svg_files = list(SRC_DIR.glob("*.svg"))
    print(f"Found {len(svg_files)} SVG files")

    for src_file in svg_files:
        dst_file = DST_DIR / src_file.name

        content = src_file.read_text(encoding='utf-8')
        converted = convert_svg_content(content, COLOR_PAIRS)

        dst_file.write_text(converted, encoding='utf-8')
        print(f"Converted: {src_file.name} -> {dst_file}")

    print(f"\nDone! Converted files saved to {DST_DIR}")


if __name__ == "__main__":
    main()
