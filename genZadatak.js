// --- GLAVNI ALGORITAM ---
function generirajZadatak() {
    // Reset UI-a
    vizualnaPomocState = null;
    inputOdgovor.value = "";
    inputOdgovor.disabled = false;
    danOdgovor = 0;
    sakrijMinMax = 0;
    zaustaviSimulaciju(); // Resetiraj animaciju

    // Varijable za simulaciju
    isSimulacijaAktivna = false;
    trenutnoVrijemeSimulacije = null;
    animacijaFrameId = null;

    // Reset "ostalih grafova"
    sakrijOstaleGrafove();

    // Reset točkica traga na cesti
    ocistiTockice();
    
    selectVrsta.value = "";
    selectSmjer.value = "";
    selectVrsta.disabled = false;
    selectSmjer.disabled = false;

    btnProvjeri.disabled = false;
    btnProvjeri.classList.remove('hidden');
    btnDalje.classList.add('hidden');
    //feedbackBox.style.display = 'none';
    feedbackBox.style.visibility = 'visible';
    feedbackBox.className = "feedback hint";
    feedbackBox.innerHTML = (niz => niz[Math.floor(Math.random() * niz.length)])
        (["Hint...?", "Trebam pomoć!", "Ne kužim ...", "Help!!!", "Može neki hint?", "Što je ovo?!", "Kako da to zaključim?", "To mi još nije jasno!", "Treba mi neki hint.", "Može ona sličica?", "Hint? Samo još ovaj puta!","Daj mi ipak sličicu."]);
    
    explanationBox.style.display = 'none';
    oznaciDio = 10;
    
    if (gradivoSelect.value === "jednoliko") {
        zavijaOpcija.disabled = 1;
        if(tezinaSelect.value == 7) { 
            tezinaSelect.value = 0; 
        }
    }
    
    //generirajKrajolik(0);
    generirajNoviKrajolik();

    selectVrsta.addEventListener('change', function() {
        if (this.value === 'mirovanje') {
            selectSmjer.value = 'nepoznat';
            selectSmjer.disabled = true;
        } else {
            selectSmjer.value = '';
            selectSmjer.disabled = false;
        }
    });
        
    let gradivo = gradivoSelect.value;
    
    // Logika za opciju "ili lakše"
    let odabranaTezina = parseInt(tezinaSelect.value);
    const ciljanaTezina = odabranaTezina;
    if (chkLakse.dataset.active === 'true') {
        odabranaTezina = Math.floor(Math.random() * (odabranaTezina + 1));
    }
    const tezina = odabranaTezina;

    let dopusteniGrafovi = [];
    if (gradivo === 'jednoliko') {
        if (tezina === 0 || tezina === 1 || tezina === 2) dopusteniGrafovi = ['s/t', 'v/t'];
        else if (tezina === 3 || tezina === 4) dopusteniGrafovi = ['s/t'];
        else if (tezina === 5) dopusteniGrafovi = ['v/t'];
        else if (tezina === 6) dopusteniGrafovi = ['s/t', 'v/t'];
    } else {
        if (tezina === 0) dopusteniGrafovi = ['s/t', 'v/t', 'a/t']; 
        else if (tezina === 1 || tezina === 2) dopusteniGrafovi = ['s/t', 'v/t', 'a/t'];
        else if (tezina === 3 || tezina === 4) dopusteniGrafovi = ['s/t', 'v/t'];
        else if (tezina === 5) dopusteniGrafovi = ['v/t', 'a/t'];
        else if (tezina === 6) dopusteniGrafovi = 
                          (ciljanaTezina === 7) ? ['s/t', 'v/t', 's/t-krivo'] : ['s/t', 'v/t'];
        else if (tezina === 7) dopusteniGrafovi = ['s/t-krivo'];   // NOVO
    }

    const vrstaGrafa = dopusteniGrafovi[Math.floor(Math.random() * dopusteniGrafovi.length)];

    let faze = [];
    let isDobarGraf = false;
    let pokusaji = 0;

    while (!isDobarGraf && pokusaji < 150) {
        pokusaji++;
        // Svaki pokušaj koristi novi nasumični raspored trajanja triju faza
        const trajanja = [2, 3, 4, 2, 3, 5, 1].sort(() => Math.random() - 0.5);

        // 1. korak: generiraj sirove y0/y1 vrijednosti po fazama
        const rezultat = generirajSiroveFaze(trajanja, vrstaGrafa, gradivo, tezina);
        faze = rezultat.faze;
        if (!rezultat.isDobar) continue; // odbaci ako je prekršeno "nema prelaska preko nule"

        // 2. korak: odbaci "dosadne" grafove (ponovljeni nagibi/vrijednosti)
        if (!provjeriZanimljivost(faze, vrstaGrafa, gradivo, tezina)) continue;

        // 3. korak: izračunaj stvarnu kinematiku (s0, v0, a, s1) za svaku fazu
        izracunajKinematikuZaFaze(faze, vrstaGrafa);

        // 4. korak: provjere koje ovise o (tek izračunatoj) kinematici
        isDobarGraf = provjeriValjanostKinematike(faze, vrstaGrafa, tezina);
        
        //zakrpa za težinu 6: iz nekog razloga v/t graf ne smije imati mirovanje u 2. fazi
        if(tezina === 6 && vrstaGrafa === 'v/t' && gradivo === 'jednoliko' && faze[1].kinematika.v0 == 0) isDobarGraf = false;
    }

    if (!isDobarGraf) {
        console.warn('Glavni graf generiran iz ', pokusaji, '. pokušaja, za', vrstaGrafa, gradivo, tezina);
    }
   
    // ZA TEŽINU 6  (KOJI OD GRAFOVA...?)
    
    let kandidati = null;

   
    
    if (tezina === 6 && isDobarGraf) {
        // Isti vremenski razmaci kao glavni graf, da su kandidati usporedivi
        const trajanja = faze.map(f => f.t1 - f.t0);

        // "Kanonski" tip glavnog grafa (s/t-krivo se i dalje generira/uspoređuje kao s/t)
        const glavniKanonski = (vrstaGrafa === 's/t-krivo') ? 's/t' : vrstaGrafa;
        let moguciTipovi = ['s/t', 'v/t', 'a/t'].filter(v => v !== glavniKanonski);
        if (gradivo === 'jednoliko') moguciTipovi = moguciTipovi.filter(v => v !== 'a/t');

        // Glavni graf je doslovni (nezakrivljeni) s/t => sve faze imaju a=0, pa a/t
        // kandidat ne bi imao smisla (uvijek bi bila ravna linija na nuli).
        if (glavniKanonski === 's/t') {
            moguciTipovi = moguciTipovi.filter(v => v !== 'a/t');
        }
        
        const imaAkceleracije = faze.some(f => Math.abs(f.kinematika.a) > 1e-9);
        if (imaAkceleracije && ciljanaTezina !== 7) {
            moguciTipovi = moguciTipovi.filter(v => v !== 's/t');
        }
        
        
        pitaniTip = moguciTipovi[Math.floor(Math.random() * moguciTipovi.length)];

        // Ako je ponuđeni tip s/t, a gradivo je 'sva' (dakle točan odgovor je vjerojatno
        // zakrivljen jer potječe iz v/t ili a/t grafa s akceleracijom), generiraj lažne
        // kandidate kroz isti "v/t-akceleracijski" mehanizam kao s/t-krivo - ne kroz čisti
        // s/t generator koji uvijek daje a=0 (uvijek ravne linije). Time zakrivljenost više
        // nije razlikovno obilježje pravog odgovora.
        const generatorskiTip = (pitaniTip === 's/t' && gradivo !== 'jednoliko') ? 's/t-krivo' : pitaniTip;
        
        if (pitaniTip === 'v/t' && !imaAkceleracije)  gradivo = 'jednoliko';
        
        kandidati = [{ faze: faze, ispravan: true, razinaOdbacivanja: null }];

        const ciljaneRazine = odaberiCiljaneRazine();

        for (let k = 0; k < 3; k++) {
            let lazniFaze = null;
            let uspjeh = false;
            let pokusajiL = 0;
            const ciljanaRazina = ciljaneRazine[k];

            while (!uspjeh && pokusajiL < 1000) {
                pokusajiL++;
                const rez = generirajSiroveFaze(trajanja, generatorskiTip, gradivo, 0);
                if (!rez.isDobar) continue;
                if (!provjeriZanimljivost(rez.faze, generatorskiTip, gradivo, 0)) continue;

                izracunajKinematikuZaFaze(rez.faze, generatorskiTip);
                if (!provjeriValjanostKinematike(rez.faze, generatorskiTip, 0, false)) continue;

                // Mora se razlikovati od TOČNOG odgovora baš na ciljanoj razini
                const razinaVsTocan = usporediPotpise(faze, rez.faze, generatorskiTip);
                if (razinaVsTocan !== ciljanaRazina) continue;

                // I ne smije biti identičan (razina=null) nekom već prihvaćenom kandidatu
                if (kandidati.some(pos => usporediPotpise(pos.faze, rez.faze, generatorskiTip) === null)) continue;

                lazniFaze = rez.faze;
                uspjeh = true;
            }

            if (pokusajiL > 150) {
                console.warn('Velik broj neuspjelih pokušaja za razinu ' + ciljanaRazina + ': ' + pokusajiL);
            } else {
                //console.warn('  '+k+'. kandidat generiran nakon '+pokusajiL+' pokušaja.');
            }

            // Fallback: ako 100 pokušaja ne uspije pogoditi baš ciljanu razinu, uzmi zadnji
            // generirani (ili sami graf kao krajnji fallback) - bolje blaži zadatak nego rušenje.
            const konacneFaze = lazniFaze || faze;
            const stvarnaRazina = uspjeh ? ciljanaRazina : usporediPotpise(faze, konacneFaze, generatorskiTip);
            kandidati.push({ faze: konacneFaze, ispravan: false, razinaOdbacivanja: stvarnaRazina });
        }

        kandidati.sort(() => Math.random() - 0.5);        
        
        
      
    }

    trenutniZadatak = { vrstaGrafa, faze, gradivo, tezina, pitaniTip, kandidati };
    if (tezina === 6) {
        trenutniZadatak.tocanOdgovor = kandidati.findIndex(k => k.ispravan) + 1; // 1-4, ne 0-3
    }
    
    oblikujPitanjeIZadatak(trenutniZadatak);
    
    // Upravljanje vidljivošću sučelja ovisno o tipu zadatka
    
    if (tezina === 0 || tezina === 7) {
        unosBrojaBox.style.display = 'none';
        unosPrepoznavanjeBox.style.display = 'flex';
        pitanjeGrafoviRed.style.display = 'none';
    } else if (tezina === 6) {
        unosBrojaBox.style.display = 'flex';       // isti numerički input kao za 1-5
        unosPrepoznavanjeBox.style.display = 'none';
        pitanjeGrafoviRed.style.display = 'flex';  // ali dodatno prikaži 4 grafa
    } else {
        unosBrojaBox.style.display = 'flex';
        unosPrepoznavanjeBox.style.display = 'none';
        pitanjeGrafoviRed.style.display = 'none';
    }

    prikazaniDodatniGrafovi = 0;
    prikazaniOdabirGrafovi = 0;
    if (tezina === 6) {
        prikaziKandidateGrafova(trenutniZadatak);
        prikazaniOdabirGrafovi = 1;
    } else {
        //chartContainer.style.height=grafVisina+'px';
    }
    
    skalirajSveGrafove();
    prikaziGraf(trenutniZadatak);
    zadatakSekcija.classList.remove('hidden');

    // Pripremi UI za simulaciju
    
    // Postavi oznake na rubovima ceste (min i max s)
    let tocke = izracunajTockeZaGraf(faze,'s/t',100);
    let minS = Math.min(...tocke.map(p => p.y));
    let maxS = Math.max(...tocke.map(p => p.y));
    
    
    if (minS === maxS) maxS = minS + 10; // Osigurač da raspon nije 0

    // Najveća apsolutna brzina tijekom gibanja (brzina je linearna unutar faze,
    // pa je ekstrem uvijek na početku ili kraju faze) - koristi se za brzinomjer.
    let maxBrzina = Math.max(8, ...faze.map(f => {
        const v1 = f.kinematika.v0 + f.kinematika.a * (f.t1 - f.t0);
        return Math.max(Math.abs(f.kinematika.v0), Math.abs(v1));
    }));

    // Najveća apsolutna akceleracija među 3 faze - koristi se za skaliranje strelice akceleracije.
    let maxAkceleracija = Math.max(...faze.map(f => Math.abs(f.kinematika.a)));
    if (maxAkceleracija === 0) maxAkceleracija = 1; // Osigurač protiv dijeljenja s 0

    trenutniZadatak.simulacijaProps = { minS, maxS, maxBrzina, maxAkceleracija };
    azurirajAuto(0);
}


function getYAtT(faze, t) {
    let f = faze.find(f => t >= f.t0 && t <= f.t1);
    if (!f) f = faze[2]; 
    if (f.t0 === f.t1) return f.y0; 
    return f.y0 + ((f.y1 - f.y0) / (f.t1 - f.t0)) * (t - f.t0);
}


function formatirajVrstuGrafa(vrsta) {
    return '<i>' + vrsta.replace('/', '</i>/<i>') + '</i>';
}


// POMOČNE FUNKCIJE ZA GENERIRANJE ZADATAKA

function generirajSiroveFaze(trajanja, vrstaGrafa, gradivo, tezina) {
    let tTrenutno = 0;
    let yTrenutno;

    // Početna vrijednost y-a ovisi o tipu grafa:
    // - s/t: nasumičan početni položaj (parni brojevi 0-8)
    // - v/t (osim jednolikog): nasumična početna brzina, 50% šanse da je 0
    // - ostalo (v/t+jednoliko, a/t): kreće od 0
    if (vrstaGrafa === 's/t') {
        yTrenutno = Math.floor(Math.random() * 5) * 2;
    } else if (vrstaGrafa === 'v/t' && gradivo !== 'jednoliko') {
        yTrenutno = (Math.random() < 0.5) ? 0 : (Math.floor(Math.random() * 9) - 2);
    } else {
        yTrenutno = Math.floor(Math.random()*5)-2;
    }

    // Za v/t + jednoliko: u 70% slučajeva forsiraj jednu pozitivnu, jednu negativnu
    // i jednu nultu brzinu (u nasumičnom redoslijedu), da vježba pokrije sve slučajeve.
    let jednolikeBrzine = null;
    if (vrstaGrafa === 'v/t' && gradivo === 'jednoliko' && Math.random() < 0.7) {
        const pozitivna = Math.floor(Math.random() * 4) + 1;
        const negativna = -(Math.floor(Math.random() * 4) + 1);
        jednolikeBrzine = [pozitivna, negativna, 0].sort(() => Math.random() - 0.5);
    }

    let faze = [];
    let isDobar = true; // postaje false ako neka faza prekrši pravilo "nema prelaska preko nule"

    // Generiraj y0/y1 za svaku od 3 faze, prema tipu grafa
    for (let i = 0; i < 3; i++) {
        let dt = trajanja[i];
        let tKraj = tTrenutno + dt;
        let yKraj = 0;

        if (vrstaGrafa === 's/t') {
            // s/t: svaka faza je jednoliko gibanje - nasumična brzina v, pomak = v*dt
            let v = Math.floor(Math.random() * 13) - 6;
            if (gradivo === 'jednoliko' && v === 0 && i === 1) v = 1; // izbjegni "mirovanje" u srednjoj fazi kod jednolikog
            yKraj = yTrenutno + (v * dt);
        }
        else if (vrstaGrafa === 'v/t' || vrstaGrafa === 's/t-krivo') {
            // s/t-krivo se generira identično kao v/t (y0/y1 ovdje predstavljaju BRZINU,
            // stvarni - eventualno zakrivljeni - položaj računa se kasnije iz kinematike)
            if (gradivo === 'jednoliko') {
                // jednoliko v/t: svaka faza ima konstantnu brzinu (vodoravna linija)
                let v;
                if (jednolikeBrzine) {
                    v = jednolikeBrzine[i];
                } else {
                    v = Math.floor(Math.random() * 9) - 4;
                    if (v === yTrenutno) v += 1; // izbjegni identičnu brzinu kao prethodna faza
                }
                yTrenutno = v;
                yKraj = v;
            } else {
                // sva gibanja: nasumična akceleracija a, brzina se linearno mijenja unutar faze
                let a = Math.floor(Math.random() * 5) - 2;
                if (tezina === 5) {
                    a = Math.floor(Math.random() * 2); // za težinu 5 akceleracija je uvijek >= 0
                    if (yTrenutno === 0 && a === 0) a = 2;
                }
                yKraj = yTrenutno + (a * dt);

                // Zabrana prelaska brzine preko nule usred faze - potrebno kad se pita
                // za vrstu/smjer gibanja (0/7) ili računa površina/pomak (5), gdje
                // predznak brzine mora biti jednoznačan unutar cijelog segmenta.
                if ((tezina === 0 || tezina === 5 || tezina === 7) && yTrenutno * yKraj < 0) isDobar = false;
            }
        }
        else if (vrstaGrafa === 'a/t') {
            // a/t: svaka faza ima konstantnu (nasumičnu) akceleraciju - "step" graf
            let a = Math.floor(Math.random() * 5) - 2;
            yTrenutno = a;
            yKraj = a;
        }

        faze.push({ t0: tTrenutno, t1: tKraj, y0: yTrenutno, y1: yKraj });
        tTrenutno = tKraj;
        yTrenutno = yKraj;
    }

    return { faze, isDobar };
}

function provjeriZanimljivost(faze, vrstaGrafa, gradivo, tezina) {
    // Težina 3 (traži se faza s najvećim nagibom): nagib mora biti jednoznačno najveći,
    // dakle nijedna druga faza ne smije imati (skoro) isti maksimalni nagib.
    if (tezina === 3) {
        const iznosiNagiba = faze.map(f => Math.abs((f.y1 - f.y0) / (f.t1 - f.t0)));
        const maxNagib = Math.max(...iznosiNagiba);
        const brojMaksimalnih = iznosiNagiba.filter(n => n === maxNagib).length;
        if (brojMaksimalnih > 1) return false;
    }

    // Osiguraj da graf nije "dosadan": nijedna dva segmenta ne smiju imati jednak
    // nagib (s/t, v/t+sva) odnosno jednaku vrijednost (v/t+jednoliko, a/t).
    if (vrstaGrafa === 's/t') {
        // s/t: uspoređuju se nagibi (brzine) segmenata
        const nagibi = faze.map(f => (f.y1 - f.y0) / (f.t1 - f.t0));
        for (let i = 0; i < nagibi.length; i++)
            for (let j = i + 1; j < nagibi.length; j++)
                if (Math.abs(nagibi[i] - nagibi[j]) < 1e-9) return false;
    } else if (vrstaGrafa === 'v/t' || vrstaGrafa === 's/t-krivo') {
        if (gradivo === 'jednoliko') {
            // vodoravni segmenti - uspoređuju se same (konstantne) vrijednosti brzine
            const vrijednosti = faze.map(f => f.y0);
            for (let i = 0; i < vrijednosti.length; i++)
                for (let j = i + 1; j < vrijednosti.length; j++)
                    if (Math.abs(vrijednosti[i] - vrijednosti[j]) < 1e-9) return false;
        } else {
            // kose linije - uspoređuju se nagibi (akceleracije) segmenata
            const nagibi = faze.map(f => (f.y1 - f.y0) / (f.t1 - f.t0));
            for (let i = 0; i < nagibi.length; i++)
                for (let j = i + 1; j < nagibi.length; j++)
                    if (Math.abs(nagibi[i] - nagibi[j]) < 1e-9) return false;
        }
    } else if (vrstaGrafa === 'a/t') {
        // a/t: uspoređuju se same vrijednosti akceleracije po fazi
        const akceleracije = faze.map(f => f.y0);
        for (let i = 0; i < akceleracije.length; i++)
            for (let j = i + 1; j < akceleracije.length; j++)
                if (Math.abs(akceleracije[i] - akceleracije[j]) < 1e-9) return false;
    }

    return true;
}

function izracunajKinematikuZaFaze(faze, vrstaGrafa) {
    let trenutniS = 0;
    let trenutniV = 0;

    // Za a/t graf brzina nije zadana izravno - biramo početnu brzinu tako da
    // najniža relativna brzina tijekom gibanja ispadne 0, 1 ili 2 m/s (nasumično),
    // kako simulacija ne bi imala "nemoguće" (npr. jako negativne) brzine.
    if (vrstaGrafa === 'a/t') {
        let relV = 0, minV = 0;
        faze.forEach(f => {
            relV += f.y0 * (f.t1 - f.t0);
            if (relV < minV) minV = relV;
        });
        let targetMinV = (Math.random() < 0.3) ? 0 : Math.floor(Math.random() * 3) + 1;
        trenutniV = targetMinV - minV;
    }

    // Za svaku fazu izračunaj v0, a i s1 na temelju tipa grafa, te akumuliraj položaj (s)
    faze.forEach((f) => {
        let a, v0;
        let dt = f.t1 - f.t0;
        if (vrstaGrafa === 's/t') {
            // s/t graf izravno diktira položaj; akceleracija je 0, brzina = nagib segmenta
            a = 0;
            v0 = (f.y1 - f.y0) / dt;
            trenutniS = f.y0;
        } else if (vrstaGrafa === 'v/t' || vrstaGrafa === 's/t-krivo') {
            // v/t (i s/t-krivo, koji se generira kao v/t): akceleracija = nagib, v0 = y0
            a = (f.y1 - f.y0) / dt;
            v0 = f.y0;
        } else if (vrstaGrafa === 'a/t') {
            // a/t: akceleracija je zadana (y0), brzina se nadovezuje iz prethodne faze
            a = f.y0;
            v0 = trenutniV;
            trenutniV = v0 + a * dt;
        }

        // s1 po formuli s0 + v0*t + 1/2*a*t^2 - ovo je "prava" (eventualno zakrivljena) putanja
        f.kinematika = { s0: trenutniS, v0: v0, a: a, s1: trenutniS + v0 * dt + 0.5 * a * (dt * dt) };
        trenutniS = f.kinematika.s1; // položaj na kraju faze postaje početak sljedeće
    });
}

function provjeriValjanostKinematike(faze, vrstaGrafa, tezina, provjeriCitljivost = true) {
    // Najviše jedna faza smije biti "mirovanje" (brzina i akceleracija cijelo vrijeme 0)
    const brojMirovanja = faze.filter(f => Math.abs(f.kinematika.v0) < 1e-9 && Math.abs(f.kinematika.a) < 1e-9).length;
    if (brojMirovanja > 1) return false;

    // a/t + težina 0: brzina ne smije mijenjati predznak unutar jedne faze, inače
    // vrsta/smjer gibanja ondje ne bi bili jednoznačno određeni.
    if (vrstaGrafa === 'a/t' && tezina === 0) {
        for (const f of faze) {
            const dt = f.t1 - f.t0;
            const v1 = f.kinematika.v0 + f.kinematika.a * dt;
            if (f.kinematika.v0 * v1 < 0) return false;
        }
    }

    // s/t-krivo: svaki segment mora biti dovoljno "čitljiv" (dovoljno dug s obzirom
    // na akceleraciju) da se zakrivljenost vizualno primijeti na grafu.
    if (provjeriCitljivost && vrstaGrafa === 's/t-krivo') {
        for (const f of faze) {
            const dt = f.t1 - f.t0;
            const aAbs = Math.abs(f.kinematika.a);
            if (!((dt >= 3) || (dt >= 2 && aAbs >= 2))) return false;
        }
    }

    return true;
}



// POMOČNE FUNKCIJE ZA GENERIRANJE DOBRIH GRAFOVA KANDIDATA
// (razina 6)

const EPS = 1e-9;
const TOLERANCIJA_RANGA = 0.35; // relativna tolerancija: iznosi unutar ovog postotka smatraju se "praktički jednakima" (isti rang)

// Računa potpis SVAKE faze u nizu, uzimajući u obzir tip grafa. razina3 kod
// v/t, a/t i s/t je RELATIVNI RANG iznosa (0,1,2...) unutar OVOG grafa,
// ne apsolutna vrijednost - bitan je samo redoslijed/omjer, nikad točna razlika.
// Kod s/t-krivo razina3 ostaje predznak zakrivljenosti (gore/dolje).
function izracunajPotpiseZaGraf(faze, tipGrafa) {
    if (tipGrafa === 's/t-krivo') {
        return faze.map(f => {
            const v0 = f.kinematika.v0, a = f.kinematika.a;
            const miruje = Math.abs(v0) < EPS && Math.abs(a) < EPS;
            const smjer = Math.abs(v0) >= EPS ? Math.sign(v0) : (Math.abs(a) >= EPS ? Math.sign(a) : 0);
            return {
                razina1: miruje ? 'vodoravno' : 'koso',
                razina2: miruje ? null : smjer,
                razina3: miruje ? null : (Math.abs(a) < EPS ? 0 : Math.sign(a))
            };
        });
    }

    // v/t, a/t, s/t: prvo razina1/razina2 po fazi, plus "sirovi" iznos za rangiranje
    const sirovi = faze.map(f => {
        const vrijednost = (tipGrafa === 'a/t') ? f.kinematika.a : f.kinematika.v0; // v/t i s/t oboje preko v0
        const naNuli = Math.abs(vrijednost) < EPS;
        return {
            razina1: naNuli ? (tipGrafa === 's/t' ? 'vodoravno' : 'nula') : (tipGrafa === 's/t' ? 'koso' : 'izvan-nule'),
            razina2: naNuli ? null : Math.sign(vrijednost),
            iznos: naNuli ? null : Math.abs(vrijednost),
            razina3: null
        };
    });

    // Dodijeli rang (0,1,2...) po iznosu, grupirajući bliske vrijednosti u isti rang
    const indeksiZaRang = sirovi.map((s, i) => i).filter(i => sirovi[i].iznos !== null);
    indeksiZaRang.sort((a, b) => sirovi[a].iznos - sirovi[b].iznos);
    let trenutniRang = 0;
    indeksiZaRang.forEach((idx, k) => {
        if (k > 0) {
            const prevIdx = indeksiZaRang[k - 1];
            const razlika = Math.abs(sirovi[idx].iznos - sirovi[prevIdx].iznos);
            const referenca = Math.max(sirovi[idx].iznos, sirovi[prevIdx].iznos, EPS);
            if (razlika / referenca > TOLERANCIJA_RANGA) trenutniRang++;
        }
        sirovi[idx].razina3 = trenutniRang;
    });

    return sirovi.map(({ razina1, razina2, razina3 }) => ({ razina1, razina2, razina3 }));
}

function usporediPotpise(fazeA, fazeB, tipGrafa) {
    const potpisiA = izracunajPotpiseZaGraf(fazeA, tipGrafa);
    const potpisiB = izracunajPotpiseZaGraf(fazeB, tipGrafa);

    for (let razina = 1; razina <= 3; razina++) {
        const kljuc = 'razina' + razina;
        for (let i = 0; i < potpisiA.length; i++) {
            const va = potpisiA[i][kljuc];
            const vb = potpisiB[i][kljuc];
            if (va === null && vb === null) continue;
            if (va !== vb) return razina;
        }
    }
    return null;
}


// Svaki string = ciljane razine za tri distraktora (redoslijed dodjele nije bitan,
// jer se kandidati kasnije ionako promiješaju). Ponavljanje istog broja (npr. '123'
// vs '112') namjerno unosi slučajnost - da NE bude uvijek točno jedan distraktor
// po razini.
const OBRASCI_TEZINE_KANDIDATA = ['123', '123'];

function odaberiCiljaneRazine() {
    const izbor = OBRASCI_TEZINE_KANDIDATA[Math.floor(Math.random() * OBRASCI_TEZINE_KANDIDATA.length)];
    return izbor.split('').map(Number); // npr. "112" -> [1, 1, 2]
}

