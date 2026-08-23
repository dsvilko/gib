#!/usr/bin/env python3
"""
Regenerates VOZILA and POZADINE arrays in index.html based on files in vozila/ and folders in pozadine/.
"""
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VOZILA_DIR = os.path.join(BASE_DIR, 'vozila')
POZADINE_DIR = os.path.join(BASE_DIR, 'pozadine')
INDEX_HTML = os.path.join(BASE_DIR, 'index.html')


def get_vozila():
    """Get vehicle names from .png files in vozila/"""
    if not os.path.isdir(VOZILA_DIR):
        return []
    files = [f for f in os.listdir(VOZILA_DIR) if f.endswith('.png')]
    names = [os.path.splitext(f)[0] for f in files]
    return sorted(names)


def get_pozadine():
    """Get background names from subdirectories in pozadine/"""
    if not os.path.isdir(POZADINE_DIR):
        return []
    dirs = [d for d in os.listdir(POZADINE_DIR)
            if os.path.isdir(os.path.join(POZADINE_DIR, d)) and d != 'l.pl']
    return sorted(dirs)


def format_array(items):
    """Format array as JS array string with single quotes"""
    return "['" + "', '".join(items) + "']"


def update_index_html(vozila, pozadine):
    """Update VOZILA and POZADINE lines in index.html"""
    with open(INDEX_HTML, 'r', encoding='utf-8') as f:
        content = f.read()

    vozila_str = format_array(vozila)
    pozadine_str = format_array(pozadine)

    # Replace VOZILA line
    content = re.sub(
        r"var VOZILA = shuffle\(\[.*?\]\);",
        f"var VOZILA = shuffle({vozila_str});",
        content
    )

    # Replace POZADINE line
    content = re.sub(
        r"var POZADINE = shuffle\(\[.*?\]\);",
        f"var POZADINE = shuffle({pozadine_str});",
        content
    )

    with open(INDEX_HTML, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Updated VOZILA: {vozila_str}")
    print(f"Updated POZADINE: {pozadine_str}")


def main():
    vozila = get_vozila()
    pozadine = get_pozadine()

    if not vozila:
        print("Warning: No vehicles found in vozila/")
    if not pozadine:
        print("Warning: No backgrounds found in pozadine/")

    update_index_html(vozila, pozadine)
    print("Done!")


if __name__ == '__main__':
    main()