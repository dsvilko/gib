'use strict';

/**
 * Hang-seed discovery with harness reuse (detects duplicate-check infinite loop).
 * Also detects "GENERATION FAILED" log entries when outer loop exhausts 5 attempts.
 * Spawns a worker that tests seeds sequentially; main process watches each seed with a timeout.
 * If a seed hangs (no heartbeat within timeout), the worker is killed and a new worker continues from the next seed.
 *
 * Usage:
 *   node tests/hangdetect2.test.js --gradivo jednoliko --tezina 4 --start-seed 42 --stride 1 --max-seeds 400 --timeout 5000 --max-hangs 10
 */

const { Worker } = require('node:worker_threads');
const path = require('node:path');

function parseArgs(argv) {
    const opts = {
        gradivo: process.env.GRADIVO || 'jednoliko',
        tezina: Number(process.env.TEZINA || 4),
        startSeed: Number(process.env.START_SEED || 42),
        stride: Number(process.env.STRIDE || 1),
        maxSeeds: Number(process.env.MAX_SEEDS || 400),
        timeoutMs: Number(process.env.TIMEOUT_MS || 5000),
        maxHangs: Number(process.env.MAX_HANGS || 10),
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--gradivo') opts.gradivo = argv[++i];
        else if (a === '--tezina') opts.tezina = Number(argv[++i]);
        else if (a === '--start-seed') opts.startSeed = Number(argv[++i]);
        else if (a === '--stride') opts.stride = Number(argv[++i]);
        else if (a === '--max-seeds') opts.maxSeeds = Number(argv[++i]);
        else if (a === '--timeout') opts.timeoutMs = Number(argv[++i]);
        else if (a === '--max-hangs') opts.maxHangs = Number(argv[++i]);
        else if (a === '--help' || a === '-h') {
            console.log(`
Usage: node tests/hangdetect2.test.js [options]
Options:
  --gradivo <name>       gradivo (jednoliko|sva|krivo)  default: jednoliko
  --tezina <num>         tezina 0..6                     default: 4
  --start-seed <num>     first seed to test              default: 42
  --stride <num>         seed stride                     default: 1
  --max-seeds <num>      how many seeds to try           default: 400
  --timeout <ms>         per-seed timeout (ms)           default: 5000
  --max-hangs <num>      stop after this many hangs      default: 10
  --help                 show this help
`);
            process.exit(0);
        }
    }
    return opts;
}

const opts = parseArgs(process.argv.slice(2));
const workerPath = path.join(__dirname, 'hangdetect2.worker.js');

const hangingSeeds = [];
const failedSeeds = [];
let nextSeed = opts.startSeed;
let tested = 0;

function runWorkerBatch(startSeed, remainingSeeds) {
    return new Promise(resolve => {
        const batchSize = Math.min(remainingSeeds, 100); // limit batch size to avoid huge workers
        const worker = new Worker(workerPath, {
            workerData: {
                gradivo: opts.gradivo,
                tezina: opts.tezina,
                startSeed,
                stride: opts.stride,
                maxSeeds: batchSize,
            },
        });

        let currentSeed = null;
        let watchdog = null;
        let batchHangs = [];
        let batchFailed = [];
        let batchDone = false;

        const armWatchdog = () => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => {
                if (currentSeed !== null) {
                    console.log(`  TIMEOUT seed=${currentSeed} (after ${opts.timeoutMs}ms) -> HANG`);
                    batchHangs.push(currentSeed);
                    hangingSeeds.push(currentSeed);
                }
                worker.terminate();
                resolve({ hangs: batchHangs, failed: batchFailed, nextSeed: currentSeed !== null ? currentSeed + opts.stride : startSeed + batchSize * opts.stride });
            }, opts.timeoutMs);
        };

        worker.on('message', msg => {
            if (msg.type === 'seed-start') {
                currentSeed = msg.seed;
                armWatchdog();
            } else if (msg.type === 'heartbeat' || msg.type === 'seed-done') {
                // generation completed for currentSeed
                clearTimeout(watchdog);
                if (msg.type === 'seed-done') {
                    // ready for next seed
                    currentSeed = null;
                }
            } else if (msg.type === 'generation-failed') {
                console.log(`  GENERATION FAILED seed=${msg.seed}`);
                batchFailed.push(msg.seed);
                failedSeeds.push(msg.seed);
                // generation failed but worker continues, so don't clear watchdog yet
                // wait for seed-done
            } else if (msg.type === 'done') {
                batchDone = true;
                clearTimeout(watchdog);
                resolve({ hangs: batchHangs, failed: batchFailed, nextSeed: startSeed + batchSize * opts.stride });
            } else if (msg.type === 'error') {
                clearTimeout(watchdog);
                console.error(`Worker error: ${msg.error}`);
                resolve({ hangs: batchHangs, failed: batchFailed, nextSeed: startSeed + batchSize * opts.stride });
            }
        });

        worker.on('error', err => {
            clearTimeout(watchdog);
            console.error(`Worker error: ${err.message}`);
            resolve({ hangs: batchHangs, failed: batchFailed, nextSeed: startSeed + batchSize * opts.stride });
        });

        worker.on('exit', code => {
            if (!batchDone && code !== 0) {
                // worker killed by us (timeout) or crashed
                if (currentSeed !== null && !batchHangs.includes(currentSeed)) {
                    console.log(`  WORKER EXIT seed=${currentSeed} (code ${code}) -> HANG`);
                    batchHangs.push(currentSeed);
                    hangingSeeds.push(currentSeed);
                }
            }
            // resolve will be called by timeout or done message
        });
    });
}

async function run() {
    console.log(`Searching hanging/failed seeds for ${opts.gradivo}/t${opts.tezina}`);
    console.log(`Seeds from ${opts.startSeed}, stride ${opts.stride}, max ${opts.maxSeeds} seeds, timeout ${opts.timeoutMs}ms, max hangs ${opts.maxHangs}\n`);

    let remaining = opts.maxSeeds;
    while (remaining > 0 && hangingSeeds.length < opts.maxHangs) {
        const batchResult = await runWorkerBatch(nextSeed, remaining);
        const batchSize = Math.min(remaining, 100);
        tested += batchSize;
        remaining -= batchSize;
        nextSeed = batchResult.nextSeed;

        if (tested % 100 === 0) {
            console.log(`  tested ${tested} seeds...`);
        }
    }

    console.log(`\nTested ${tested} seeds, found ${hangingSeeds.length} hanging seeds, ${failedSeeds.length} generation-failed seeds.`);
    if (hangingSeeds.length) {
        console.log('\nHanging seeds (timeout):');
        for (const seed of hangingSeeds) {
            console.log(`  seed=${seed}`);
        }
    }
    if (failedSeeds.length) {
        console.log('\nGeneration-failed seeds (GENERATION FAILED log):');
        for (const seed of failedSeeds) {
            console.log(`  seed=${seed}`);
        }
    }
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});