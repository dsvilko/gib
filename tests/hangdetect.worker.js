'use strict';

// Worker: tests a SINGLE seed for a given gradivo/tezina.
// Exits with {type:'result', success: true/false, seed, error?}.

const { parentPort, workerData } = require('node:worker_threads');
const { createHarness } = require('./harness');

const { gradivo, tezina, seed } = workerData;

try {
    const h = createHarness({ seed });
    h.gib.postaviPostavke(gradivo, tezina, false);
    h.reseed(seed);
    h.gib.api.generirajZadatak();
    parentPort.postMessage({ type: 'result', success: true, seed });
} catch (err) {
    parentPort.postMessage({ type: 'result', success: false, seed, error: err.message });
}