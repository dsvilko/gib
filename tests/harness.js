'use strict';

// Headless harness: loads index.html, extracts the inline <script>, and runs it
// inside a node:vm sandbox with browser stubs + a seeded RNG. No changes are
// ever made to index.html itself.
//
// Usage:
//   const { createHarness } = require('./harness');
//   const h = createHarness({ seed: 42 });
//   h.gib.postaviPostavke('sva', 5, false);
//   h.reseed(1234);                 // make the NEXT generation deterministic
//   h.gib.api.generirajZadatak();
//   console.log(h.gib.zadatak);
//
// Env overrides:
//   GIB_INDEX=/path/to/index.html   (used by mutation testing)

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFAULT_INDEX = path.resolve(__dirname, '..', 'index.html');

// Same PRNG as index.html's mulberry32 (kept in sync; duplicated here so the
// page file stays untouched).
function mulberry32(seed) {
    let s = seed | 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function extractAppScript(html) {
    const blocks = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (/\bsrc\s*=/.test(m[1])) continue; // external CDN tags
        blocks.push(m[2]);
    }
    if (blocks.length === 0) throw new Error('No inline <script> found in HTML');
    return blocks.join('\n;\n');
}

let createdCount = 0;

function make2dContext() {
    const target = {
        canvas: null,
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        getImageData: () => ({ data: [] }),
    };
    return new Proxy(target, {
        get(t, p) {
            if (p in t) return t[p];
            t[p] = () => {}; // any other method/property read -> memoized noop
            return t[p];
        },
        set(t, p, v) { t[p] = v; return true; },
    });
}

function makeElement(id) {
    return {
        id,
        style: {},
        dataset: {},
        _attrs: {},
        value: '',
        innerHTML: '',
        textContent: '',
        src: '',
        disabled: false,
        checked: false,
        classList: {
            add() {}, remove() {}, toggle() {}, contains: () => false,
        },
        addEventListener() {}, removeEventListener() {},
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
        removeAttribute(k) { delete this._attrs[k]; },
        appendChild() {}, removeChild() {}, remove() {},
        querySelector(sel) { return makeElement(`${id}~q(${sel})`); },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 480 }; },
        getContext() { return make2dContext(); },
    };
}

class ChartStub {
    constructor(elOrCtx, config) {
        this.canvas = elOrCtx && elOrCtx.canvas ? elOrCtx.canvas : elOrCtx;
        this.ctx = make2dContext();
        this.config = config || {};
        this.data = this.config.data || {};
        this.options = this.config.options || {};
        const scale = () => ({
            min: 0, max: 10,
            getPixelForValue: () => 0,
            getValueForPixel: () => 0,
        });
        this.scales = { x: scale(), y: scale() };
    }
    destroy() {} update() {} resize() {} render() {}
}
ChartStub.register = () => {};
ChartStub.defaults = { font: {}, color: '#000', plugins: { legend: {} } };
ChartStub.overrides = {};

function makeLocalStorage() {
    const map = new Map();
    return {
        getItem: k => (map.has(String(k)) ? map.get(String(k)) : null),
        setItem: (k, v) => map.set(String(k), String(v)),
        removeItem: k => map.delete(String(k)),
        clear: () => map.clear(),
    };
}

/**
 * @param {{seed?: number, quiet?: boolean, indexPath?: string, globals?: object, onConsole?: (level: string, args: any[]) => void}} opts
 */
function createHarness({ seed = 1, quiet = true, indexPath = process.env.GIB_INDEX || DEFAULT_INDEX, globals = {}, onConsole } = {}) {
    const html = fs.readFileSync(indexPath, 'utf8');
    const source = extractAppScript(html);

    let rng = mulberry32(seed);
    // Prototype-chained Math: all existing Math.* methods keep working, only
    // random() is swapped for the seeded generator.
    const seededMath = Object.create(Math);
    Object.defineProperty(seededMath, 'random', { value: () => rng(), writable: true });

    const elements = new Map();
    const getElementById = id => {
        if (!elements.has(id)) elements.set(id, makeElement(id));
        return elements.get(id);
    };

    // Defaults mirroring the shipped HTML selects.
    getElementById('gradivoSelect').value = 'sva';
    getElementById('tezinaSelect').value = '3';
    getElementById('chkLakse').dataset.active = 'false';

    const sandbox = {};

    const consoleStub = {
        log: (...a) => { if (onConsole) onConsole('log', a); },
        info: (...a) => { if (onConsole) onConsole('info', a); },
        debug: (...a) => { if (onConsole) onConsole('debug', a); },
        warn: (...a) => { if (onConsole) onConsole('warn', a); },
        error: (...a) => { console.error('[page]', ...a); if (onConsole) onConsole('error', a); },
    };

    // Browsers expose elements as window.<id> globals (e.g. `pitanjeGraf1`).
    // Replicate that: register every id="..." found in the HTML.
    for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
        const id = m[1];
        if (!(id in sandbox)) sandbox[id] = getElementById(id);
    }

    Object.assign(sandbox, {
        Math: seededMath,
        console: quiet ? consoleStub : console,
        document: {
            getElementById,
            querySelector: sel => getElementById(`qs:${sel}`),
            querySelectorAll: () => [],
            createElement: tag => getElementById(`created:${tag}:${createdCount++}`),
            documentElement: getElementById(':html'),
            body: getElementById(':body'),
            addEventListener() {},
        },
        window: {
            location: { search: '', href: 'file:///index.html' },
            matchMedia: () => ({ matches: false, addEventListener() {} }),
            innerWidth: 1280,
            innerHeight: 800,
            devicePixelRatio: 1,
            addEventListener() {},
            requestAnimationFrame: () => 0,
        },
        location: { search: '' },
        navigator: { userAgent: 'gib-headless' },
        localStorage: makeLocalStorage(),
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        URLSearchParams,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame() {},
        setTimeout: () => 0,
        clearTimeout() {},
        setInterval: () => 0,
        clearInterval() {},
        Image: class { constructor() { this.style = {}; } },
        confetti() {},
        alert() {},
        performance: { now: () => 0 },
        Chart: ChartStub,
    });
    Object.assign(sandbox, globals);
    vm.createContext(sandbox);

    // Appended to the same evaluated source so it closes over the script's
    // let/const-bound globals (which don't land on the context object).
    const SHIM = `
;globalThis.__gib = {
    get zadatak() { return typeof trenutniZadatak !== 'undefined' ? trenutniZadatak : null; },
    get prethodni() { return prethodniZadatak; },
    postaviPostavke(gradivo, tezina, lakse) {
        if (gradivo != null) gradivoSelect.value = String(gradivo);
        if (tezina != null) tezinaSelect.value = String(tezina);
        chkLakse.dataset.active = lakse ? 'true' : 'false';
    },
    api: {
        generirajZadatak,
        generirajSiroveFaze,
        izracunajKinematikuZaFaze,
        provjeriValjanostKinematike,
        provjeriZanimljivost,
        usporediPotpise,
        izracunajPotpiseZaGraf,
        oblikujPitanjeIZadatak,
        getYAtT,
        izracunajTockeZaGraf,
        mulberry32,
    },
};`;

    vm.runInContext(source + SHIM, sandbox, { filename: 'index.html:<inline>' });

    return {
        sandbox,
        gib: sandbox.__gib,
        getElementById,
        /** Swap the RNG for the next generations. */
        reseed(nextSeed) { rng = mulberry32(nextSeed); },
        ChartStub,
    };
}

module.exports = { createHarness, extractAppScript, mulberry32 };
