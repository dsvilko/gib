# AGENTS.md — gibanje/gib

Static educational web app (HTML + inline JS) for practicing motion graphs (s/t, v/t, a/t). No build tools, no package manager, no tests.

## Run / Preview
- Open `index.html` directly in browser, or serve locally:
  ```bash
  python3 -m http.server 8000
  # then http://localhost:8000
  ```
- Uses external Chart.js from CDN (cdn.jsdelivr.net)

## Key Files
- `index.html` — main app (all HTML/CSS/JS in one file, ~1600 lines)
- `road5.html` — standalone demo of the animated road scene
- `analyze.py` — script to extract JS functions/variables from index.html
- `svg/` — SVG assets for UI icons
- `pozadine/` — background/foreground images for road scenes
- `vozila/` — vehicle PNGs

## Architecture Notes
- Single HTML file with embedded `<style>` and `<script>`
- JS uses global variables and functions (no modules)
- Chart.js used for graph rendering (canvas)
- CSS custom properties for theming (`:root` variables)
- Simulation state managed in global vars (`trenutniZadatak`, `isSimulacijaAktivna`, etc.)

## Difficulty Levels (tezinaSelect)
0. Recognize motion type (vrsta/smjer)
1. Direct reading from graph
2. Changes between phases
3. Maximum slope
4. Slope/nagib value
5. Area under curve (displacement)
6. Multiple choice: which graph matches (shows 4 candidates)

## Motion Types (gradivoSelect)
- `jednoliko` — uniform motion only (a=0)
- `sva` — all types (uniform, accelerated, decelerated)
- `krivo` — curved s/t graphs (generated from v/t with acceleration)

## Common Tasks
- Modify graph generation logic: see `generirajZadatak()`, `generirajSiroveFaze()`, `izracunajKinematikuZaFaze()`
- Adjust validation: `provjeriValjanostKinematike()`, `provjeriZanimljivost()`
- Change UI: edit control panel (`.control-panel`), chart containers, or simulation scene (`.gib-scena`)
- Add backgrounds/vehicles: drop files in `pozadine/<name>/bg.jpg` + `fg.png`, `vozila/<name>.png`

## Gotchas
- All JS is in `index.html` — search there first
- No lint/typecheck/test commands exist
- Image paths in HTML use GitHub Pages URLs (`https://dsvilko.github.io/gib/...`); local files in `pozadine/`/`vozila/` are for reference
- `analyze.py` helps navigate the large inline script