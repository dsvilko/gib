'use strict';

// Headless invariant suite for the task generator core logic.
// Run:  node tests/core.test.js        (env: N=iterations/combo, SEED=base seed)
//
// Each gradivo x tezina combo runs in a worker thread with a heartbeat
// watchdog: if generation wedges (the retry loop in generirajZadatak has an
// unbounded outer pass - see AGENTS.md "Known bugs"), the worker is terminated
// and reported as a hang failure instead of blocking the suite forever.

const { Worker } = require('node:worker_threads');
const path = require('node:path');

const GRADIVA = ['jednoliko', 'sva', 'krivo'];
const TEZINE = [0, 1, 2, 3, 4, 5, 6];
const N = Number(process.env.N || 40);
const BASE_SEED = Number(process.env.SEED || 20260826);
const HEARTBEAT_TIMEOUT_MS = Number(process.env.HANG_TIMEOUT || 10000);

const workerPath = path.join(__dirname, 'combo.worker.js');
/** @type {{combo:string, nGen:number, failures:string[], totalChecks:number, hung?:boolean}[]} */
const results = [];
let totalChecks = 0;

function runCombo(gradivo, tezina) {
    return new Promise(resolve => {
        const worker = new Worker(workerPath, {
            workerData: { gradivo, tezina, N, baseSeed: BASE_SEED },
        });
        let watchdog = null;
        const armWatchdog = () => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => {
                worker.terminate();
                resolve({
                    combo: `${gradivo}/t${tezina}`,
                    nGen: 0,
                    failures: [`${gradivo}/t${tezina}: HANG detected (no progress for ${HEARTBEAT_TIMEOUT_MS}ms) — likely the unbounded generirajZadatak retry loop`],
                    totalChecks: 1,
                    hung: true,
                });
            }, HEARTBEAT_TIMEOUT_MS);
        };
        armWatchdog();

        worker.on('message', msg => {
            if (msg.type === 'heartbeat') armWatchdog();
            else if (msg.type === 'done') {
                clearTimeout(watchdog);
                resolve({ ...msg.result, hung: false });
            }
        });
        worker.on('error', err => {
            clearTimeout(watchdog);
            resolve({
                combo: `${gradivo}/t${tezina}`,
                nGen: 0,
                failures: [`${gradivo}/t${tezina}: worker error: ${err.message}`],
                totalChecks: 1,
                hung: false,
            });
        });
    });
}

function runDeterminism() {
    // Determinism runs small fixed workloads in-process; these combos are not
    // known to hang. Guarded by the same worker mechanism would be overkill.
    const { createHarness } = require('./harness');
    const failures = [];
    let checks = 0;
    for (const [g, t] of [['sva', 5], ['krivo', 3], ['jednoliko', 6]]) {
        const serialize = () => {
            const h = createHarness({ seed: 777 });
            h.gib.postaviPostavke(g, t, false);
            h.reseed(31337);
            h.gib.api.generirajZadatak();
            return JSON.stringify(h.gib.zadatak);
        };
        checks++;
        if (serialize() !== serialize()) {
            failures.push(`determinism: same seed gave different tasks (${g}/t${t})`);
        }
    }
    return { failures, checks };
}

(async () => {
    console.log(`Running ${GRADIVA.length * TEZINE.length} combos x ${N} seeds (base ${BASE_SEED})...\n`);
    for (const g of GRADIVA) {
        for (const t of TEZINE) {
            const r = await runCombo(g, t); // sequential keeps output tidy & CPU sane
            results.push(r);
            totalChecks += r.totalChecks;
            const status = r.hung ? 'HANG' : (r.failures.length === 0 ? 'ok' : `FAIL(${r.failures.length})`);
            console.log(`  ${r.combo.padEnd(18)} gen=${String(r.nGen).padEnd(4)} ${status}`);
        }
    }

    console.log('\ndeterminism...');
    const det = runDeterminism();
    totalChecks += det.checks;
    console.log(det.failures.length === 0 ? '  ok' : `  FAIL(${det.failures.length})`);
    results.push({
        combo: 'determinism', nGen: det.checks,
        failures: det.failures, totalChecks: det.checks, hung: false,
    });

    const allFailures = results.flatMap(r => r.failures);
    console.log(`\n${totalChecks} checks, ${allFailures.length} failures`);
    if (allFailures.length) {
        console.log('\nFirst 30 failures:');
        for (const f of allFailures.slice(0, 30)) console.log('  ✗ ' + f);
        process.exitCode = 1;
    } else {
        console.log('ALL OK');
    }
})();
