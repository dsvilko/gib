'use strict';

/**
 * Frequency analysis of `trenutniZadatak.tip` across all gradivo × tezina combos.
 * Uses worker threads with heartbeat watchdog to avoid hangs.
 *
 * Run:
 *   node tests/frequency.test.js            # default N=200 per combo
 *   N=500 node tests/frequency.test.js      # more iterations per combo
 *   GRADIVA="sva" TEZINE="5" node tests/frequency.test.js
 */

const { Worker } = require('node:worker_threads');
const path = require('node:path');

const GRADIVA = (process.env.GRADIVA || 'jednoliko,sva,krivo').split(',');
const TEZINE = (process.env.TEZINE || '0,1,2,3,4,5,6').split(',').map(Number);
const N = Number(process.env.N || 200);
const BASE_SEED = Number(process.env.SEED || 123456789);
const HEARTBEAT_TIMEOUT_MS = Number(process.env.HANG_TIMEOUT || 10000);

const workerPath = path.join(__dirname, 'frequency.worker.js');

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
                    counts: {},
                    error: `${gradivo}/t${tezina}: HANG detected (no progress for ${HEARTBEAT_TIMEOUT_MS}ms)`,
                });
            }, HEARTBEAT_TIMEOUT_MS);
        };
        armWatchdog();

        worker.on('message', msg => {
            if (msg.type === 'heartbeat') {
                armWatchdog();
            } else if (msg.type === 'done') {
                clearTimeout(watchdog);
                resolve(msg.result);
            }
        });
        worker.on('error', err => {
            clearTimeout(watchdog);
            resolve({
                combo: `${gradivo}/t${tezina}`,
                nGen: 0,
                counts: {},
                error: `${gradivo}/t${tezina}: worker error: ${err.message}`,
            });
        });
    });
}

function printTable(combo, counts, nGen) {
    console.log(`\n${combo} (generated=${nGen})`);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
        console.log('  (no tasks generated)');
        return;
    }
    for (const [tip, cnt] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        const pct = ((cnt / total) * 100).toFixed(1);
        console.log(`  ${tip.padEnd(20)} ${String(cnt).padStart(5)}  ${pct.padStart(5)}%`);
    }
}

(async () => {
    console.log(`Frequency analysis: ${GRADIVA.length * TEZINE.length} combos × ${N} seeds (base ${BASE_SEED})`);
    for (const g of GRADIVA) {
        for (const t of TEZINE) {
            const res = await runCombo(g, t);
            if (res.error) {
                console.error(`  ${res.combo}: ${res.error}`);
            } else {
                printTable(res.combo, res.counts, res.nGen);
            }
        }
    }
    console.log('\nDone.');
})();