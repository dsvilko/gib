'use strict';

/**
 * Hang-seed discovery for a specific gradivo/tezina combo.
 * Spawns a short-lived worker per seed with a per-seed timeout.
 *
 * Usage:
 *   node tests/hangdetect.test.js --gradivo sva --tezina 5 --start-seed 1 --max-seeds 1000 --timeout 500 --max-hangs 10
 *
 * Env vars can also be used: GRADIVO, TEZINA, START_SEED, MAX_SEEDS, TIMEOUT_MS, MAX_HANGS
 */

const { Worker } = require('node:worker_threads');
const path = require('node:path');

function parseArgs(argv) {
    const opts = {
        gradivo: process.env.GRADIVO || 'sva',
        tezina: Number(process.env.TEZINA || 5),
        startSeed: Number(process.env.START_SEED || 1),
        maxSeeds: Number(process.env.MAX_SEEDS || 1000),
        timeoutMs: Number(process.env.TIMEOUT_MS || 500),
        maxHangs: Number(process.env.MAX_HANGS || 10),
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--gradivo') opts.gradivo = argv[++i];
        else if (a === '--tezina') opts.tezina = Number(argv[++i]);
        else if (a === '--start-seed') opts.startSeed = Number(argv[++i]);
        else if (a === '--max-seeds') opts.maxSeeds = Number(argv[++i]);
        else if (a === '--timeout') opts.timeoutMs = Number(argv[++i]);
        else if (a === '--max-hangs') opts.maxHangs = Number(argv[++i]);
        else if (a === '--help' || a === '-h') {
            console.log(`
Usage: node tests/hangdetect.test.js [options]
Options:
  --gradivo <name>       gradivo (jednoliko|sva|krivo)  default: sva
  --tezina <num>         tezina 0..6                     default: 5
  --start-seed <num>     first seed to test              default: 1
  --max-seeds <num>      how many seeds to try           default: 1000
  --timeout <ms>         per-seed timeout (ms)           default: 500
  --max-hangs <num>      stop after this many hangs      default: 10
  --help                 show this help
`);
            process.exit(0);
        }
    }
    return opts;
}

const opts = parseArgs(process.argv.slice(2));
const workerPath = path.join(__dirname, 'hangdetect.worker.js');

const hangingSeeds = [];
let tested = 0;

function testSeed(seed) {
    return new Promise(resolve => {
        const worker = new Worker(workerPath, {
            workerData: { gradivo: opts.gradivo, tezina: opts.tezina, seed },
        });
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            worker.terminate();
            resolve({ seed, hung: true });
        }, opts.timeoutMs);

        worker.on('message', msg => {
            if (settled) return;
            if (msg.type === 'result') {
                settled = true;
                clearTimeout(timer);
                resolve({ seed, hung: false, success: msg.success, error: msg.error });
            }
        });
        worker.on('error', err => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ seed, hung: false, success: false, error: err.message });
        });
        worker.on('exit', code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (code !== 0) {
                resolve({ seed, hung: true, error: `worker exited with code ${code}` });
            }
        });
    });
}

async function run() {
    console.log(`Searching hanging seeds for ${opts.gradivo}/t${opts.tezina}`);
    console.log(`Seeds ${opts.startSeed} .. ${opts.startSeed + opts.maxSeeds - 1}, timeout ${opts.timeoutMs}ms, max hangs ${opts.maxHangs}\n`);

    for (let i = 0; i < opts.maxSeeds && hangingSeeds.length < opts.maxHangs; i++) {
        const seed = opts.startSeed + i;
        tested++;
        const res = await testSeed(seed);
        if (res.hung) {
            hangingSeeds.push({ seed, error: res.error });
            console.log(`  HANG  seed=${seed}  (${hangingSeeds.length}/${opts.maxHangs})`);
        } else if (!res.success) {
            console.log(`  ERROR seed=${seed}  ${res.error}`);
        } else {
            // success, optional dot
            if (tested % 100 === 0) console.log(`  tested ${tested} seeds...`);
        }
    }

    console.log(`\nTested ${tested} seeds, found ${hangingSeeds.length} hanging seeds.`);
    if (hangingSeeds.length) {
        console.log('\nHanging seeds:');
        for (const h of hangingSeeds) {
            console.log(`  seed=${h.seed}  ${h.error ? '(' + h.error + ')' : ''}`);
        }
    }
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});