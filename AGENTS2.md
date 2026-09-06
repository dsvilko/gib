# AGENTS2.md — gibanje/gib (deep map for local agents)

Companion to `AGENTS.md`. That file tells you *what* the project is; this one
tells you *where to look* inside `index.html` (~4515 lines, single file,
inline `<style>` + `<script>`). Read this before grepping blind.

## Mental model in one paragraph

A "zadatak" (task) is 3 consecutive time phases (`faze`) of motion, each a
straight-line segment on the chosen graph type (s/t, v/t, a/t, or the
"s/t-krivo" curved variant). The generator picks raw phase endpoints, derives
full kinematics (s0, v0, a, s1) per phase, validates the result isn't
degenerate/boring, turns it into question text + correct answer, and finally
drives three renderers off the same `trenutniZadatak` object: the Chart.js
graph, the "signature road" simulation (car/speedometer/paper-tape scene),
and (for level 6) four candidate mini-graphs to choose between.

## Core data structures

### `trenutniZadatak` (global, set in `generirajZadatak()`, line ~1800)
The single source of truth for "the current question". Shape:
```js
{
  vrstaGrafa,        // 's/t' | 'v/t' | 'a/t' | 's/t-krivo'
  faze,              // array of 3 Faza objects (see below) - THE graph data
  gradivo,           // 'jednoliko' | 'sva' | 'krivo'  (from gradivoSelect)
  tezina,            // 0-6 difficulty (from tezinaSelect), see AGENTS.md list
  pitaniTip,         // for tezina 6: which graph type the question shows ('s/t'|'v/t'|'a/t')
  kandidati,         // for tezina 6: array of {faze, ispravan, razinaOdbacivanja} - the 4 candidate graphs
  tocanOdgovor,      // correct answer; shape depends on tezina (number, {vrsta,smjer}, or 1-4 index)
  interakcija,       // 'faza' | 'direktno' | '' — main-chart click behavior (see below)
  simulacijaProps,   // {minS, maxS, maxBrzina, maxAkceleracija} - set after graph built, drives scene scaling
  papirTrakaConfig,  // output of izracunajPapirTrakaConfig() - paper-tape tick layout
}
```
This is the object to inspect/mutate when debugging "wrong answer accepted",
"graph looks off", or "simulation speed/scale wrong".

### `Faza` (phase) — element of `faze[]`
```js
{
  t0, t1,            // start/end time of this phase (seconds)
  y0, y1,             // start/end Y VALUE AS PLOTTED for vrstaGrafa
                      //   s/t          -> position (m)
                      //   v/t, s/t-krivo -> velocity (m/s)   (yes, even for s/t-krivo!)
                      //   a/t          -> acceleration (m/s²), constant per phase
  kinematika: {       // added later by izracunajKinematikuZaFaze() — the "physics ground truth"
    s0, v0, a, s1      // position/velocity/accel at t0, and resulting position at t1
                        // s1 uses s0 + v0*t + 0.5*a*t² (handles the curved s/t-krivo case)
  }
}
```
`y0/y1` are the *display* numbers used to build the raw graph shape;
`kinematika` is derived afterward and is what all physics-correct answers,
the simulation, and validity checks actually use. When `vrstaGrafa === 's/t'`,
`kinematika.a` is always 0 and `kinematika.v0` is just the segment's slope —
`y` and physical position coincide. For `'v/t'`/`'s/t-krivo'`, `y` is velocity
and `kinematika` reconstructs position by integrating. For `'a/t'`, `y` is
acceleration and `kinematika` reconstructs velocity by integrating (velocity
carries over from the previous phase, chosen so it never goes below a small
random non-negative floor — see `izracunajKinematikuZaFaze`).

**If a task says "the numbers on the graph are wrong" or "displacement/area
answer is wrong", look at `kinematika`, not `y0/y1`.**

### Difficulty (`tezina`) → answer shape
| tezina | meaning | `tocanOdgovor` shape |
|---|---|---|
| 0 | recognize vrsta/smjer of one phase | `{vrsta, smjer}` strings |
| 1 | direct graph reading | number |
| 2 | change between phases | number |
| 3 | max slope; **gradivo 'krivo' → s/t-krivo instead**: "Kada se tijelo zaustavilo?" or "Kada je brzina bila najveća?" — both numeric seconds with `interakcija='direktno'` x-axis click aid; faze validated by `provjeriValjanostKinematike` (`nuleBrzine` helper): exactly one isolated v=0 instant on an integer second + unique \|v\| max | number (second) |
| 4 | slope/nagib value | number |
| 5 | area under curve (displacement) | number |
| 6 | pick matching graph, 4 candidates | number 1-4, index into `kandidati` |

### Chart click interactions (`zadatak.interakcija`)
Set per-task inside `oblikujPitanjeIZadatak` (search `interakcija =`); consumed
by `procesirajKlikNaGrafove()` (the chartContainer click handler) and by
`provjeriOdgovor()`. Values:
- `'faza'` — click on the main graph picks the phase under the cursor and
  **auto-submits** it (writes 1/2/3 into `inputOdgovor`, or sets
  `selectVisestruki`). Used for tezina 3 and one tezina-5 variant. Also makes
  `provjeriOdgovor()` fill `tocnaFaza`/`odabranaFaza` (drives the phase
  highlight in `nacrtajOznakeFaza`).
- `'direktno'` — tezina 1 only: axis-reading aid, **no auto-submit**. A click
  inside a band along an axis writes that rounded value into `inputOdgovor`
  (also used at tezina 3 + `s/t-krivo`, x-axis band only, for "Kada se tijelo
  zaustavilo?" — see gate inside `procesirajKlikNaGrafove`) and stores
  `{tip:'direktno', xVal, yVal}` in global `vizualnaPomocState`,
  which `vizualniAsistentPlugin` draws: x-axis band (canvas-y within
  −10…+25 px of y=0; asymmetric because tick numbers sit below the axis) →
  red (`--crvena`) dashed vertical line + value disk below the axis;
  y-axis band (canvas-x within −25…+10 px of x=0) → blue (`--primary`) dashed
  horizontal line + disk left of the axis. One marker per axis, both may
  coexist; re-clicking a marker's exact rounded value dismisses it (and clears
  `inputOdgovor` only if it held exactly that value). Markers are cleared at
  the top of `provjeriOdgovor()` (on correct answers the task's `pomocData`
  `'ocitavanje'` overlay replaces them) and reset to null per task by
  `generirajZadatak()`.
- `''` / undefined — clicks only toggle the "other graphs" reveal.

### Level/progress state (persisted per-level, not per-task)
```js
levelStars   // {"<gradivo>-<tezina>-<lakse>": 0-5}
levelMastered// {"<gradivo>-<tezina>-<lakse>": bool}
currentLevelKey // the key for the currently selected combo
```
Key format: `` `${gradivo}-${tezina}-${lakse}` `` where `lakse` is
`chkLakse.dataset.active` ('true'/'false'). Rendered by
`updateStarDisplay()` / the level-selector label updater (search
"starOverlay", "baseLabel"). Settings (`gradivoSelect`, `tezinaSelect`,
`chkLakse`) persist via `spremiPostavke()`/`ucitajPostavke()` into
`localStorage` keys `gibanjeGradivo`, `gibanjeTezina`, `gibanjeLakse`. Dark
mode is a separate `localStorage['darkMode']` flag (`DM` global, 0/1).

### Simulation-scene state (separate from the question data)
```js
isSimulacijaAktivna, isSimulacijaPauzirana, trenutnoVrijemeSimulacije,
animacijaFrameId, pauzaStartVrijeme, ukupnoPauzaVrijeme
```
Drive the requestAnimationFrame loop in `pokreniAnimaciju()` (line ~4138) and
its inner `loop(vrijeme)`. Position/speed at time `t` is computed by
`izracunajStanjeGibanja(t)` (line ~4184), which walks `trenutniZadatak.faze`
and evaluates `kinematika` at `t`, then `azurirajAuto(t)` and
`azurirajBrzinomjer(...)` push that into the DOM/SVG.

## Function map (by pipeline stage)

### 1. Task generation (search here for "wrong numbers", "impossible graph", "always same answer")
- `generirajZadatak()` L1549 — top-level orchestrator; retry loop (up to ~10x)
  that calls the functions below until a valid+interesting task is produced;
  builds `trenutniZadatak`.
- `generirajSiroveFaze(trajanja, vrstaGrafa, gradivo, tezina)` L1878 — picks
  random `y0/y1` per phase according to graph type + gradivo rules (e.g.
  "jednoliko" v/t forces one +, one −, one zero-velocity phase 70% of the
  time). Returns `{faze, isDobar}`.
- `izracunajKinematikuZaFaze(faze, vrstaGrafa)` L2005 — fills in
  `faze[i].kinematika` (mutates in place). **This is the physics engine.**
- `provjeriValjanostKinematike(faze, vrstaGrafa, tezina, provjeriCitljivost)`
  L2048 — rejects degenerate tasks (e.g. >1 resting phase, velocity crossing
  zero mid-phase when that would break tezina 0/5, s/t-krivo segments too
  short to visibly curve).
- `provjeriZanimljivost(faze, vrstaGrafa, gradivo, tezina)` L1962 — rejects
  "boring" tasks (e.g. all slopes equal → nothing to compare for tezina 3).
- `odaberiCiljaneRazine()` L2154 + `OBRASCI_TEZINE_KANDIDATA` L2152 — for
  tezina 6, decide how "close" the 3 wrong-answer candidate graphs should be.
- `izracunajPotpiseZaGraf(faze, tipGrafa)` L2088 / `usporediPotpise(...)`
  L2131 — compute a comparable "signature" for a phase sequence (used to rank
  how similar a candidate graph is to the real one, tezina 6 distractors).
- `getYAtT(faze, t)` L1863 — simple linear interpolation lookup by *display*
  y (not kinematika); used for early graph bounds, not simulation.

### 2. Question text + answer (search here for "wrong wording", "typo in Croatian text", "wrong unit")
- `oblikujPitanjeIZadatak(zadatak)` L2165 — **huge** (~550 lines), one big
  if/else keyed on `tezina` (0-6) and `vrstaGrafa`. Builds `tekst` (question
  HTML), sets `zadatak.tocanOdgovor`, and picks explanation/hint HTML. If
  asked to change question phrasing or fix a Croatian-language string for a
  specific difficulty level, jump straight to the `tezina === N` branch here.
- `formatirajVrstuGrafa(vrsta)` L1871 — italicizes "s/t" style labels for HTML.
- `provjeriOdgovor()` L2745 — reads user input (`inputOdgovor`, or
  `selectVrsta`/`selectSmjer` for tezina 0, or clicked candidate for tezina
  6), compares to `trenutniZadatak.tocanOdgovor`, shows feedback/explanation,
  triggers `prikaziOstaleGrafove()` and starts the simulation
  (`pokreniAnimaciju()`).
- `odbaceni(broj)` L2723 — small helper, formats a rejected/incorrect option.

### 3. Chart.js rendering (search here for "graph doesn't look right", "axis wrong", "colors")
- `izracunajTockeZaGraf(faze, vrsta, brojTocaka)` L3703 — samples the phase
  list into `{x,y}` points for Chart.js (handles s/t-krivo's curve via
  `kinematika`).
- `prikaziGraf(zadatak)` L3606 — builds/updates the main `chartInstance`.
- `nacrtajMiniGraf(canvasId, zadatak, vrsta)` L3743 / `nacrtajPitanjeGraf(broj, zadatak, vrsta)`
  L3814 — smaller graphs (the "other graphs" row and tezina-6 candidates).
- `prikaziOstaleGrafove()` L3882 / `sakrijOstaleGrafove()` L3902 — the
  "show other two graph types" reveal after answering.
- `prikaziKandidateGrafova(zadatak)` L3910 — renders the 4 candidate graphs
  for tezina 6.
- `nacrtajOznakeFaza(chart)` L3506 — Chart.js plugin drawing phase-boundary
  labels/markers on the canvas.
- `nacrtajDijeloveTeksta(...)` L2927 — low-level canvas text helper (mixed
  italic physics symbols + upright units), used by chart plugins.
- Three registered Chart.js plugins (search these literal comments):
  `--- CHART.JS PLUGIN: ŠKOLSKE OSI ---` (L2950, "school-style" axes),
  `--- CHART.JS PLUGIN: MINIMALNE OSI ---` (L3079, minimal axes for mini
  graphs), `--- CHART.JS PLUGIN: VIZUALNA POJAŠNJENJA ---` (L3163, visual
  hint overlays), and the red simulation-progress line plugin at L3540.
- `skalirajSveGrafove()` L4433 — responsive resize/scale pass across all
  visible chart canvases.
- `klikMiniGraf(broj)` L4443 / `procesirajKlikNaGrafove()` L4407 — click
  handling for mini-graphs (tezina 6 selection, or "peek" interaction).

### 4. Road/car simulation scene (search here for "car moves wrong", "speedometer", "acceleration arrow")
- `izracunajStanjeGibanja(t)` L4184 — evaluate `trenutniZadatak.faze[*].kinematika`
  at time `t`; returns position/velocity (and implicitly acceleration from
  the active phase). **The single function to check if the car's motion
  doesn't match the graph.**
- `azurirajAuto(t)` L4207 — moves the car sprite along the road based on the
  above; also calls `azurirajStrelicuAkceleracije(...)` (inner fn, L4226) to
  scale/rotate the acceleration arrow.
- `azurirajBrzinomjer(brzina, maxBrzina)` L4255 — rotates the speedometer needle.
- `pokreniAnimaciju()` L4138 (with inner `loop(vrijeme)` L4153) /
  `zaustaviSimulaciju()` L4121 / `toggleSimulacijaPauza()` L1351 — the
  requestAnimationFrame loop and pause/resume/stop controls.
- `dodajTockicu(postotak, brzina, row)` L4272 / `ocistiTockice()` L4288 /
  `azurirajTockice(t)` L4377 / `tockiceDodane` (Set) — the "trail of dots"
  showing speed history along the road (ticker marks placed once per 0.1s of
  simulated time on first pass).
- `dodajFazneLinije()` L4294 — draws phase-boundary tick lines on the road.
- `izracunajPapirTrakaConfig()` L4308 — computes tick spacing for the
  "paper tape" (papirTraka) visual, stored as `trenutniZadatak.papirTrakaConfig`.
- `generirajNoviKrajolik()` L4052 / `nasumice`, `odaberi`, `slucajan` (L4083-
  4091, small random helpers) / `mulberry32(seed)` L4023 (seeded RNG, used
  for stable-looking random backgrounds) / `shuffle(array)` L4033 — picks and
  randomizes the background/foreground/vehicle images (see `pozadine/`,
  `vozila/` folders in AGENTS.md).
- "STARI KRAJOLIK" (old landscape) block near L4078 — legacy/alternate scene
  code kept for reference; check which path is actually wired up (search
  `gibPozadina`/`gibPrednji` usage) before assuming the new one is live.

### 5. UI chrome / misc
- `toggleDarkMode()` L1376, `updateSimulationColors()` L1363, `cssVar(name)`
  L1278, `svgPath(name)` L1359 — dark-mode + CSS-variable/SVG-asset plumbing.
  Theme colors are CSS custom properties on `:root` (`--primary`,
  `--success`, `--danger`, `--cp-*` for the control panel, `--feedback-*`,
  etc.) — edit those instead of hardcoding colors in JS/CSS.
- `updateHelpOverlayImages()` L1394, `updateExplanationBoxImages()` L1404,
  `openHelpOverlay()`/`closeHelpOverlay()` L3982/3989 — the "?" help modal;
  images referenced as `svg/<name>.svg` get swapped for dark-mode variants.
- `updateStarDisplay()` L1412, the level-selector label updater (search
  `baseLabel`) around L1432, `triggerLevelUpConfetti()` L1450 — level-select
  star ratings and the confetti burst on mastering a level.
- `updateShalabahterImage()` L1491 — the "cheat sheet" overlay image.
- `spremiPostavke()` L4486 / `ucitajPostavke()` L4492 — persist/restore
  gradivo+tezina+lakse selection to `localStorage`.

## Quick "where do I fix X" index
- Wrong/impossible physics numbers on a graph → `izracunajKinematikuZaFaze`,
  `generirajSiroveFaze`.
- Task generator loops forever / rejects everything → `provjeriValjanostKinematike`,
  `provjeriZanimljivost`, the retry loop in `generirajZadatak`.
- Wrong Croatian question text or wrong correct-answer for a specific
  difficulty → the matching `tezina === N` branch inside `oblikujPitanjeIZadatak`.
- Answer checking accepts/rejects incorrectly → `provjeriOdgovor`.
- Chart click interactions (phase pick / axis-reading aid) behave wrong →
  `procesirajKlikNaGrafove` + the `vizualniAsistentPlugin` `'direktno'` block;
  see the "Chart click interactions" section above.
- Graph rendering/axes/colors wrong → `prikaziGraf` + the three Chart.js
  plugin blocks (search "CHART.JS PLUGIN").
- Level 6 candidate graphs too similar/too different → `odaberiCiljaneRazine`,
  `OBRASCI_TEZINE_KANDIDATA`, `izracunajPotpiseZaGraf`, `usporediPotpise`.
- Car/speedometer/acceleration-arrow doesn't match the graph →
  `izracunajStanjeGibanja`, `azurirajAuto`, `azurirajBrzinomjer`.
- Dots/trail or paper-tape ticks wrong → `azurirajTockice`, `dodajTockicu`,
  `izracunajPapirTrakaConfig`.
- Stars/mastery/level-select UI wrong → `levelStars`/`levelMastered`,
  `updateStarDisplay`, `currentLevelKey` construction (`` `${gradivo}-${tezina}-${lakse}` ``).
- Dark mode / theming → CSS `:root` variables + `toggleDarkMode`,
  `updateSimulationColors`.
- Background/vehicle art selection → `generirajNoviKrajolik`, `mulberry32`,
  `shuffle`, and the `pozadine/`/`vozila/` folders (see AGENTS.md).

## Notes for agents
- Croatian variable/function names are the norm throughout; don't rename them
  when patching — mixed-language diffs make future greps harder.
- There IS a headless test suite now (see AGENTS.md "Testing / Headless Core
  Logic"): `node tests/core.test.js` after any generator/validation/question
  change. The retry loop can still silently mask a broken constraint by just
  picking a different random task each time — the suite checks invariants, not
  intent, so review diffs of `oblikujPitanjeIZadatak` wording carefully.
- Line numbers in this file drift after edits; re-run `analyze.py` for current
  function locations if they look stale.
- Question text is NOT stored on `trenutniZadatak.tekst` — it goes straight to
  the DOM (`tekstPitanja.innerHTML`, end of `oblikujPitanjeIZadatak`).
- For tezina 6, `zadatak.tip` is never assigned (stays undefined) — relevant
  to the duplicate-task check in `generirajZadatak` and its infinite-loop bug
  (see AGENTS.md "Known Bugs").
