'use strict';
const { createHarness } = require('./harness');

const h = createHarness({ seed: 1 });
const ctx = h.gib.api;
const generirajSiroveFaze = ctx.generirajSiroveFaze;
const izracunajKinematikuZaFaze = ctx.izracunajKinematikuZaFaze;
const provjeriZanimljivost = ctx.provjeriZanimljivost;
const provjeriValjanostKinematike = ctx.provjeriValjanostKinematike;
const oblikujPitanjeIZadatak = ctx.oblikujPitanjeIZadatak;
const getYAtT = ctx.getYAtT;

// Test tezina 1 without citljivost check
console.log("=== Testing forced s/t-krivo for krivo t1 (no citljivost) ===");
for (let i = 0; i < 10; i++) {
  h.reseed(300 + i);
  const trajanja = [2, 3, 4, 2, 3, 5, 1].sort(() => Math.random() - 0.5);
  const rez = generirajSiroveFaze(trajanja, 's/t-krivo', 'krivo', 1);
  if (!rez.isDobar) {
    console.log(`Seed ${300+i}: isDobar=false`);
    continue;
  }
  const faze = rez.faze;
  if (!provjeriZanimljivost(faze, 's/t-krivo', 'krivo', 1)) {
    console.log(`Seed ${300+i}: not zanimljiv`);
    continue;
  }
  izracunajKinematikuZaFaze(faze, 's/t-krivo');
  // Disable citljivost check
  if (!provjeriValjanostKinematike(faze, 's/t-krivo', 1, false)) {
    console.log(`Seed ${300+i}: not valid kinematika (no citljivost)`);
    continue;
  }
  try {
    const zadatak = { 
      vrstaGrafa: 's/t-krivo', 
      faze, 
      gradivo: 'krivo', 
      tezina: 1,
      pitaniTip: null,
      kandidati: null
    };
    oblikujPitanjeIZadatak(zadatak);
    console.log(`Seed ${300+i}: SUCCESS - tocanOdgovor=${zadatak.tocanOdgovor}, tip=${zadatak.tip}`);
  } catch(e) {
    console.log(`Seed ${300+i}: ERROR in oblikujPitanjeIZadatak - ${e.message}`);
    console.log(e.stack);
  }
}

// Test tezina 2 without citljivost check
console.log("\n=== Testing forced s/t-krivo for krivo t2 (no citljivost) ===");
for (let i = 0; i < 10; i++) {
  h.reseed(400 + i);
  const trajanja = [2, 3, 4, 2, 3, 5, 1].sort(() => Math.random() - 0.5);
  const rez = generirajSiroveFaze(trajanja, 's/t-krivo', 'krivo', 2);
  if (!rez.isDobar) {
    console.log(`Seed ${400+i}: isDobar=false`);
    continue;
  }
  const faze = rez.faze;
  if (!provjeriZanimljivost(faze, 's/t-krivo', 'krivo', 2)) {
    console.log(`Seed ${400+i}: not zanimljiv`);
    continue;
  }
  izracunajKinematikuZaFaze(faze, 's/t-krivo');
  if (!provjeriValjanostKinematike(faze, 's/t-krivo', 2, false)) {
    console.log(`Seed ${400+i}: not valid kinematika (no citljivost)`);
    continue;
  }
  try {
    const zadatak = { 
      vrstaGrafa: 's/t-krivo', 
      faze, 
      gradivo: 'krivo', 
      tezina: 2,
      pitaniTip: null,
      kandidati: null
    };
    oblikujPitanjeIZadatak(zadatak);
    console.log(`Seed ${400+i}: SUCCESS - tocanOdgovor=${zadatak.tocanOdgovor}, tip=${zadatak.tip}`);
  } catch(e) {
    console.log(`Seed ${400+i}: ERROR in oblikujPitanjeIZadatak - ${e.message}`);
    console.log(e.stack);
  }
}
