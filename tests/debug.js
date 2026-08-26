'use strict';

// Reproduce/dump specific generated tasks deterministically.
//
// Usage:
//   node tests/debug.js                                  # 10 tasks, current defaults (sva/t3)
//   node tests/debug.js --gradivo krivo --tezina 3 --seed 42
//   node tests/debug.js --n 1000 --find "z.tocanOdgovor === 0"
//   node tests/debug.js --seed 7 --dump                  # full JSON of each task
//   node tests/debug.js --lakse                          # "samo" mode off (lakse=true)
//
// The seed printed for a failing task reproduces it exactly:
//   node tests/debug.js --seed <that-seed> --dump

const { createHarness } = require('./harness');

function parseArgs(argv) {
    const opts = { gradivo: null, tezina: null, lakse: false, seed: 1, n: 10, dump: false, find: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--gradivo') opts.gradivo = argv[++i];
        else if (a === '--tezina') opts.tezina = Number(argv[++i]);
        else if (a === '--lakse') opts.lakse = true;
        else if (a === '--seed') opts.seed = Number(argv[++i]);
        else if (a === '--n') opts.n = Number(argv[++i]);
        else if (a === '--dump') opts.dump = true;
        else if (a === '--find') opts.find = argv[++i];
        else if (a === '--help' || a === '-h') {
            console.log('see header comment in tests/debug.js');
            process.exit(0);
        } else {
            console.error(`Unknown arg: ${a}`);
            process.exit(2);
        }
    }
    return opts;
}

const opts = parseArgs(process.argv.slice(2));
const predicate = opts.find
    ? new Function('z', `return (${opts.find});`)
    : null;

const h = createHarness({ seed: opts.seed });
h.gib.postaviPostavke(opts.gradivo ?? 'sva', opts.tezina ?? 3, opts.lakse);

let matches = 0;
for (let i = 0; i < opts.n; i++) {
    const seed = opts.seed + i;
    h.reseed(seed);
    // Print before generating: if this task wedges the generator's retry loop
    // (see AGENTS.md "Known bugs"), the last printed line names the seed.
    if (!predicate) console.log(`seed=${seed} ...`);
    h.gib.api.generirajZadatak();
    const z = h.gib.zadatak;

    if (predicate && !predicate(z)) continue;
    matches++;

    const answer = JSON.stringify(z.tocanOdgovor);
    if (!opts.dump) {
        console.log(`seed=${seed}  ${z.vrstaGrafa}/${z.gradivo}/t${z.tezina}  odgovorTip=${z.odgovorTip || 'broj'}  tocan=${answer}`);
    } else {
        console.log(`--- seed=${seed} ---`);
        console.log(JSON.stringify(z, (k, v) => (v === undefined ? null : v), 2));
    }
}

if (predicate) {
    console.log(`\n${matches}/${opts.n} tasks matched: ${opts.find}`);
}

