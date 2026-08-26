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
- `index.html` — main app (all HTML/CSS/JS in one file, ~5200 lines)
- `road5.html` — standalone demo of the animated road scene
- `analyze.py` — script to extract JS functions/variables from index.html
- `tests/` — headless Node harness for the core logic (no dependencies):
  - `tests/core.test.js` — invariant suite, run with `node tests/core.test.js`
  - `tests/debug.js` — deterministic task reproduction CLI
  - `tests/harness.js` — vm-sandbox loader (stubs browser APIs, seeds Math.random)
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

## Testing / Headless Core Logic
Run after ANY change to generator/validation/question logic (`generirajZadatak`,
`generirajSiroveFaze`, `izracunajKinematikuZaFaze`, `provjeriValjanostKinematike`,
`provjeriZanimljivost`, `oblikujPitanjeIZadatak`, candidate signatures):

```bash
node tests/core.test.js                 # invariant suite, all gradivo x tezina combos
N=200 node tests/core.test.js           # more iterations per combo
node tests/debug.js --gradivo krivo --tezina 6 --seed 42 --dump   # reproduce one task
node tests/debug.js --n 1000 --find "z.tocanOdgovor === 0"        # hunt for cases
```

- Failures print `combo seed=N` — replay with `tests/debug.js --seed N`.
- Same seed ⇒ identical task (harness replaces Math.random with mulberry32).
- `index.html` is loaded UNCHANGED; `GIB_INDEX=/path/to/other.html` runs the
  suite against a different file (mutation testing).
- Each combo runs in a worker thread with a hang watchdog: if generation wedges,
  it is reported as `HANG` (see Known Bugs) instead of blocking the suite.
- For visual/chart/simulation/UI issues use the browser instead (chrome-devtools
  MCP: serve the folder, then evaluate `generirajZadatak()`, read console, screenshot).

## Gotchas
- All JS is in `index.html` — search there first
- No lint/typecheck commands exist; tests are plain Node (`node tests/core.test.js`)

## Known Bugs (do not "fix" casually — ask first)
- `vanjskiPokusaj` in `generirajZadatak()` is declared but never incremented:
  if the duplicate-task check keeps rejecting, generation loops forever
  (browser tab freeze). Reproduce headlessly:
  `SEED=42 STRIDE=1 N=400 node tests/core.test.js` → jednoliko/t4, jednoliko/t5,
  krivo/t6 hang. Minimal fix would be incrementing it in the outer loop body.

## More technical details
- see AGENTS2.md
