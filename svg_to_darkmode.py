#!/usr/bin/env python3
"""
Convert SVG files to dark mode by replacing black/near-black colors with white.
"""
import re
import shutil
from pathlib import Path

SRC_DIR = Path("svg")
DST_DIR = Path("svg/DM")

# Color patterns to match and replace
# Matches: #000000, #000, #000000ff, black, rgb(0,0,0), rgba(0,0,0,1), etc.
HEX_BLACK_PATTERN = re.compile(r'#(?:0{3}|0{6})(?:[0-9a-fA-F]{2})?\b')
NAMED_BLACK_PATTERN = re.compile(r'\bblack\b', re.IGNORECASE)
RGB_BLACK_PATTERN = re.compile(
    r'rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*(?:1|0?\.\d+))?\s*\)',
    re.IGNORECASE
)

# Near-black threshold (RGB values <= 30)
NEAR_BLACK_HEX_PATTERN = re.compile(r'#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})(?:[0-9a-fA-F]{2})?\b')

def is_near_black(hex_color: str) -> bool:
    """Check if a hex color is near-black (all RGB components <= 30)."""
    if len(hex_color) not in (3, 4, 6, 8):
        return False
    # Expand short hex (#rgb -> #rrggbb)
    if len(hex_color) in (3, 4):
        hex_color = ''.join(c*2 for c in hex_color[:3])
    if len(hex_color) >= 6:
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return r <= 30 and g <= 30 and b <= 30
    return False

def replace_near_black_hex(match: re.Match) -> str:
    """Replace near-black hex colors with white."""
    full_match = match.group(0)
    hex_part = full_match[1:]  # Remove #
    if is_near_black(hex_part):
        # Preserve alpha if present
        if len(hex_part) == 8:
            return '#ffffff' + hex_part[6:8]
        elif len(hex_part) == 4:
            return '#fff' + hex_part[3]
        return '#ffffff'
    return full_match

def convert_svg_content(content: str) -> str:
    """Convert black/near-black colors to white in SVG content."""
    # Replace exact black hex colors
    content = HEX_BLACK_PATTERN.sub('#ffffff', content)
    
    # Replace named black
    content = NAMED_BLACK_PATTERN.sub('white', content)
    
    # Replace rgb(0,0,0) and rgba(0,0,0,...)
    content = RGB_BLACK_PATTERN.sub('white', content)
    
    # Replace near-black hex colors
    content = NEAR_BLACK_HEX_PATTERN.sub(replace_near_black_hex, content)
    
    return content

def main():
    DST_DIR.mkdir(parents=True, exist_ok=True)
    
    svg_files = list(SRC_DIR.glob("*.svg"))
    print(f"Found {len(svg_files)} SVG files")
    
    for src_file in svg_files:
        dst_file = DST_DIR / src_file.name
        
        # Read and convert
        content = src_file.read_text(encoding='utf-8')
        converted = convert_svg_content(content)
        
        # Write to destination
        dst_file.write_text(converted, encoding='utf-8')
        print(f"Converted: {src_file.name} -> {dst_file}")
    
    print(f"\nDone! Converted files saved to {DST_DIR}")

if __name__ == "__main__":
    main()