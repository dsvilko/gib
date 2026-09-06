'use strict';

// Worker: runs invariant checks for ONE gradivo x tezina combo.
// Posts {type:'heartbeat', i} after each task and {type:'done', result} at end,
// so the main thread can detect hangs (e.g. the unbounded retry loop in
// generirajZadatak) and terminate the worker.

const { parentPort, workerData } = require('node:worker_threads');
const { createHarness } = require('./harness');

const { gradivo, tezina, N, baseSeed } = workerData;
const STRIDE = Number(process.env.STRIDE || 7919);

function approx(a, b, eps = 1e-9) {
    return Math.abs(a - b) <= eps;
}
function finite(...vals) {
    return vals.every(v => Number.isFinite(v));
}

const failures = [];
let ctx = '';
let totalChecks = 0;

function ok(cond, msg) {
    totalChecks++;
    if (!cond) failures.push(`${ctx}: ${msg}`);
}

function checkBasicShape(z, h) {
    ok(z && typeof z === 'object', 'no trenutniZadatak produced');
    if (!z) return false;
    ok(['s/t', 'v/t', 'a/t', 's/t-krivo'].includes(z.vrstaGrafa), `bad vrstaGrafa ${z.vrstaGrafa}`);
    ok(['jednoliko', 'sva', 'krivo'].includes(z.gradivo), `bad gradivo ${z.gradivo}`);
    ok(z.tezina >= 0 && z.tezina <= 6, `bad tezina ${z.tezina}`);
    const tekst = h.getElementById('tekstPitanja').innerHTML;
    ok(typeof tekst === 'string' && tekst.length > 10, 'empty/short question text');

    const faze = z.faze;
    ok(Array.isArray(faze) && faze.length === 3, `expected 3 faze, got ${faze && faze.length}`);
    if (!Array.isArray(faze) || faze.length !== 3) return false;

    ok(faze[0].t0 === 0, `first phase must start at t=0 (got ${faze[0].t0})`);
    for (let i = 0; i < 3; i++) {
        const f = faze[i];
        ok(Number.isFinite(f.t0) && Number.isFinite(f.t1) && f.t1 > f.t0, `phase ${i} bad time span`);
        ok(finite(f.y0, f.y1), `phase ${i} non-finite y values`);
        if (i > 0) ok(f.t0 === faze[i - 1].t1, `phase ${i} not contiguous with previous`);
    }
    return true;
}

function checkKinematika(z) {
    const faze = z.faze;
    for (let i = 0; i < 3; i++) {
        const f = faze[i];
        const k = f.kinematika;
        ok(k && typeof k === 'object', `phase ${i} missing kinematika`);
        if (!k) continue;
        ok(finite(k.s0, k.v0, k.a, k.s1), `phase ${i} non-finite kinematika`);

        const dt = f.t1 - f.t0;
        const expectedS1 = k.s0 + k.v0 * dt + 0.5 * k.a * dt * dt;
        ok(approx(k.s1, expectedS1, 1e-6 * Math.max(1, Math.abs(expectedS1))),
            `phase ${i} s1 violates motion formula (${k.s1} vs ${expectedS1})`);

        if (i > 0) {
            const p = faze[i - 1];
            const pdt = p.t1 - p.t0;
            ok(approx(k.s0, p.kinematika.s1),
                `phase ${i} s0 (${k.s0}) != previous s1 (${p.kinematika.s1})`);
            if (z.vrstaGrafa === 'a/t') {
                const prevV1 = p.kinematika.v0 + p.kinematika.a * pdt;
                ok(approx(k.v0, prevV1),
                    `a/t phase ${i} v0 (${k.v0}) != previous end velocity (${prevV1})`);
            }
        }

        if (z.vrstaGrafa === 'v/t' || z.vrstaGrafa === 's/t-krivo') {
            // displayed y IS velocity; horizontal segments may jump between phases
            ok(approx(k.v0, f.y0), `phase ${i} v0 (${k.v0}) != displayed y0 (${f.y0})`);
            ok(approx(k.a, (f.y1 - f.y0) / dt), `phase ${i} a != segment slope of y`);
            ok(approx(k.v0 + k.a * dt, f.y1), `phase ${i} end velocity != displayed y1`);
        }
        if (z.vrstaGrafa === 's/t') {
            ok(Math.abs(k.a) < 1e-9, `s/t phase ${i} must have a=0 (got ${k.a})`);
            const slope = (f.y1 - f.y0) / dt;
            ok(approx(k.v0, slope), `s/t phase ${i} v0 != segment slope`);
            ok(approx(k.s0, f.y0) && approx(k.s1, f.y1), `s/t phase ${i} s must match displayed y`);
        }
        if (z.vrstaGrafa === 'v/t' && z.gradivo === 'jednoliko') {
            ok(Math.abs(k.a) < 1e-9, `jednoliko v/t phase ${i} must have a=0 (got ${k.a})`);
            ok(approx(f.y0, f.y1), `jednoliko v/t phase ${i} must be horizontal`);
        }
        if (z.vrstaGrafa === 'a/t') {
            ok(approx(k.a, f.y0), `a/t phase ${i} acceleration must equal displayed y0`);
        }
    }
}

function checkAnswerShape(z) {
    const t = z.tezina;
    if (t === 0) {
        const a = z.tocanOdgovor;
        ok(a && typeof a === 'object', `tezina 0 answer must be {vrsta,smjer}, got ${JSON.stringify(a)}`);
        if (a) {
            ok(typeof a.vrsta === 'string' && a.vrsta.length > 0, 'tezina 0 missing vrsta');
            ok(typeof a.smjer === 'string' && a.smjer.length > 0, 'tezina 0 missing smjer');
        }
    } else if (t === 6) {
        ok(Number.isInteger(z.tocanOdgovor) && z.tocanOdgovor >= 1 && z.tocanOdgovor <= 4,
            `tezina 6 answer must be 1..4, got ${z.tocanOdgovor}`);
    } else if (t === 5 && z.odgovorTip === 'visestruki-izbor') {
        ok(Number.isInteger(z.tocanOdgovor) && z.tocanOdgovor >= 0 && z.tocanOdgovor <= 2,
            `tezina 5 multiple-choice answer must be 0..2, got ${z.tocanOdgovor}`);
    } else {
        ok(typeof z.tocanOdgovor === 'number' && Number.isFinite(z.tocanOdgovor),
            `tezina ${t} answer must be a finite number, got ${JSON.stringify(z.tocanOdgovor)}`);
    }
}

function checkTezina6Candidates(z) {
    const k = z.kandidati;
    ok(Array.isArray(k) && k.length === 4, `tezina 6 needs 4 candidates, got ${k && k.length}`);
    if (!Array.isArray(k) || k.length !== 4) return;
    const correctIdx = k.map((c, i) => (c.ispravan ? i : -1)).filter(i => i >= 0);
    ok(correctIdx.length === 1, `exactly one candidate must be correct, found ${correctIdx.length}`);
    ok(correctIdx[0] === z.tocanOdgovor - 1,
        `tocanOdgovor (${z.tocanOdgovor}) does not point at correct candidate (${correctIdx[0] + 1})`);
    for (let i = 0; i < 4; i++) {
        const cf = k[i].faze;
        ok(Array.isArray(cf) && cf.length === 3, `candidate ${i + 1} malformed faze`);
        ok(cf && cf.every(f => f.kinematika), `candidate ${i + 1} missing kinematika`);
    }
}

try {
    const h = createHarness({ seed: baseSeed });
    h.gib.postaviPostavke(gradivo, tezina, false);

    let nGen = 0;
    let firstHangSeed = null;
    for (let i = 0; i < N; i++) {
        const seed = baseSeed + i * STRIDE;
        h.reseed(seed);
        try {
            h.gib.api.generirajZadatak();
        } catch (err) {
            failures.push(`${gradivo}/t${tezina} seed=${seed}: generirajZadatak threw: ${err.message}`);
            continue;
        }
        nGen++;
        const z = h.gib.zadatak;
        ctx = `${gradivo}/t${tezina} seed=${seed}`;
        if (checkBasicShape(z, h)) {
            checkKinematika(z);
            checkAnswerShape(z);
            if (z.kandidati) checkTezina6Candidates(z);
        }
        parentPort.postMessage({ type: 'heartbeat', i });
    }
    parentPort.postMessage({
        type: 'done',
        result: { combo: `${gradivo}/t${tezina}`, nGen, failures: failures.slice(), totalChecks },
    });
} catch (err) {
    parentPort.postMessage({
        type: 'done',
        result: { combo: `${gradivo}/t${tezina}`, nGen: -1, failures: [`${gradivo}/t${tezina}: worker crashed: ${err.message}`], totalChecks },
    });
}
