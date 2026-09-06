'use strict';

// Worker: generates N tasks for ONE gradivo x tezina combo and counts tip frequencies.
// Posts {type:'heartbeat', i} after each task and {type:'done', result} at end.

const { parentPort, workerData } = require('node:worker_threads');
const { createHarness } = require('./harness');

const { gradivo, tezina, N, baseSeed } = workerData;
const STRIDE = Number(process.env.STRIDE || 7919);

const counts = {};

try {
    const h = createHarness({ seed: baseSeed });
    h.gib.postaviPostavke(gradivo, tezina, false);

    let nGen = 0;
    for (let i = 0; i < N; i++) {
        const seed = baseSeed + i * STRIDE;
        h.reseed(seed);
        try {
            h.gib.api.generirajZadatak();
        } catch (err) {
            // count as error tip
            const tip = 'error:' + err.message;
            counts[tip] = (counts[tip] || 0) + 1;
            continue;
        }
        nGen++;
        const z = h.gib.zadatak;
        const tip = z.tip || 'undefined';
        counts[tip] = (counts[tip] || 0) + 1;

        parentPort.postMessage({ type: 'heartbeat', i });
    }
    parentPort.postMessage({
        type: 'done',
        result: { combo: `${gradivo}/t${tezina}`, nGen, counts },
    });
} catch (err) {
    parentPort.postMessage({
        type: 'done',
        result: { combo: `${gradivo}/t${tezina}`, nGen: -1, counts: {}, error: `${gradivo}/t${tezina}: worker crashed: ${err.message}` },
    });
}