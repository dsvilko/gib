'use strict';

// Worker: tests a sequence of seeds for a given gradivo/tezina, reusing harness.
// Sends 'seed-start' before each seed, 'heartbeat' after each successful generation,
// and 'seed-done' after each seed (success or error).
// If generation fails with "GENERATION FAILED" log, sends 'generation-failed'.
// If generation hangs (no heartbeat within timeout), main process watchdog will kill us.

const { parentPort, workerData } = require('node:worker_threads');
const { createHarness } = require('./harness');

const { gradivo, tezina, startSeed, stride, maxSeeds } = workerData;

try {
    let generationFailed = false;

    const h = createHarness({
        seed: startSeed,
        onConsole: (level, args) => {
            const msg = args.join(' ');
            if (level === 'error' && msg.includes('GENERATION FAILED')) {
                generationFailed = true;
            }
        },
    });
    h.gib.postaviPostavke(gradivo, tezina, false);

    for (let i = 0; i < maxSeeds; i++) {
        const seed = startSeed + i * stride;
        generationFailed = false;
        h.reseed(seed);
        parentPort.postMessage({ type: 'seed-start', seed });
        try {
            h.gib.api.generirajZadatak();
            parentPort.postMessage({ type: 'heartbeat', seed });
            if (generationFailed) {
                parentPort.postMessage({ type: 'generation-failed', seed });
            } else {
                parentPort.postMessage({ type: 'seed-done', seed, success: true });
            }
        } catch (err) {
            parentPort.postMessage({ type: 'seed-done', seed, success: false, error: err.message });
        }
    }
    parentPort.postMessage({ type: 'done' });
} catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message });
}