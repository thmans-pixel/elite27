import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { accepter, MAX_RECU } from '../serveur/ws.mjs';
import { Salons, REGLAGES, ARBITRE, lireDecision } from '../serveur/salon.mjs';
import { createMatch } from '../src/sim/match.js';
import { goalCrossed, callFoul } from '../src/sim/rules.js';
import { TEAMS } from '../src/data/teams.js';
import { appliquer, coderCommandes, lireCommandes } from '../src/net/protocole.js';

/** Fausse connexion : garde ce que le serveur envoie. */
function faux() {
  const c = { recus: [], ferme: 0, send: (t) => c.recus.push(JSON.parse(t)), close: (code) => (c.ferme = code) };
  c.dernier = (t) => c.recus.findLast((m) => m.t === t);
  return c;
}
const REGL = { t: 'creer', home: 'valence', away: 'rethel', period: 120, difficulty: 'normal' };

/** Une partie lancée, avec ses deux joueurs prêts. */
function partie(now = 1000) {
  const salons = new Salons();
  const { salon } = salons.creer(REGL, now);
  const a = faux();
  const b = faux();
  salon.asseoir(a, now);
  salon.asseoir(b, now);
  salon.message(a, { t: 'pret' }, now);
  salon.message(b, { t: 'pret' }, now);
  return { salons, salon, a, b };
}
const local = (d) => createMatch({ home: structuredClone(TEAMS[d.home]), away: structuredClone(TEAMS[d.away]), periodLength: d.periodLength, difficulty: d.difficulty, humans: d.humans, seed: d.seed, overtime: true, ...(d.referee && { referee: 'humain' }) });

test('WebSocket : poignée de main, messages dans les deux sens, message trop long refusé', async () => {
  const http = createServer();
  http.on('upgrade', (req, socket) => {
    const c = accepter(req, socket);
    c.onmessage = (t) => c.send(`reçu : ${t}`);
  });
  await new Promise((ok) => http.listen(0, '127.0.0.1', ok));
  const url = `ws://127.0.0.1:${http.address().port}/partie`;
  const ws = new WebSocket(url);
  await new Promise((ok, ko) => ((ws.onopen = ok), (ws.onerror = ko)));
  const long = 'é'.repeat(3000); // plus de 125 octets : longueur sur deux octets, caractères accentués
  for (const texte of ['bonjour', long]) {
    const rep = new Promise((ok) => (ws.onmessage = (e) => ok(e.data)));
    ws.send(texte);
    assert.equal(await rep, `reçu : ${texte}`);
  }
  const ferme = new Promise((ok) => (ws.onclose = (e) => ok(e.code)));
  ws.send('x'.repeat(MAX_RECU + 10));
  assert.equal(await ferme, 1009);
  http.close();
});

test('commandes : codées court, relues avec des bornes', () => {
  const c = { mx: 0.5, my: -1, pass: true, shoot: false, steal: true, sw: false, skid: false, dodge: true, check: false, kneel: false, line: false, timeout: true, pull: true, sprint: true };
  assert.deepEqual(lireCommandes(coderCommandes(c)), c);
  assert.deepEqual(lireCommandes({ x: 99999, y: 'abc', b: 'zzz' }).mx, 1);
  assert.equal(lireCommandes({ x: 99999, y: 'abc', b: 'zzz' }).my, 0);
  assert.equal(lireCommandes({}).pass, false);
});

test('deux joueurs, un code de quatre lettres, le même match sur les deux écrans', () => {
  const { salon, a, b } = partie();
  assert.match(salon.code, /^[A-Z]{4}$/);
  assert.equal(a.dernier('salon').siege, 0);
  assert.equal(b.dernier('salon').siege, 2); // le deuxième arrivé prend l'équipe visiteuse
  assert.equal(salon.etat, 'jeu');
  const depart = a.dernier('depart').depart;
  assert.deepEqual(depart, b.dernier('depart').depart);
  // Chaque navigateur part du même match et applique ce que le serveur envoie.
  const ecrans = [a, b].map((c) => ({ c, state: local(depart), lu: 0, events: 0 }));
  salon.recevoir(0, coderCommandes({ mx: 1, my: 0 }), 1000);
  let now = 1000;
  let octets = 0;
  let envois = 0;
  for (let i = 0; i < 1500; i++) {
    salon.avancer((now += 1000 / 60));
    for (const e of ecrans) {
      for (; e.lu < e.c.recus.length; e.lu++) {
        const m = e.c.recus[e.lu];
        if (m.t !== 's') continue;
        e.events += appliquer(e.state, m).length;
        if (e === ecrans[0]) {
          octets += JSON.stringify(m).length;
          envois++;
        }
      }
    }
  }
  const st = salon.state;
  assert.equal(envois, 750 + 0); // un instantané tous les deux pas : 30 par seconde
  assert.ok(octets / envois < 9500, `instantané de ${Math.round(octets / envois)} octets`);
  for (const e of ecrans) {
    assert.equal(e.state.tick, st.tick);
    assert.equal(e.state.phase, st.phase);
    assert.deepEqual(e.state.score, st.score);
    assert.ok(Math.abs(e.state.clock - st.clock) < 0.002);
    st.players.forEach((p, i) => {
      assert.ok(Math.abs(e.state.players[i].x - p.x) < 0.002 && Math.abs(e.state.players[i].y - p.y) < 0.002);
      assert.equal(e.state.players[i].status, p.status);
    });
    assert.ok(Math.abs(e.state.puck.x - st.puck.x) < 0.002);
    assert.ok(e.events > 0);
    assert.equal(e.state.sheet.length, st.sheet.length);
  }
  assert.equal(ecrans[0].events, ecrans[1].events);
});

test("coupure : pause, retour avec le jeton, sinon l'ordinateur prend l'équipe", () => {
  const { salon, a, b } = partie();
  let now = 1000;
  for (let i = 0; i < 120; i++) salon.avancer((now += 1000 / 60));
  const jeton = b.dernier('salon').jeton;
  salon.partir(b, now);
  assert.equal(salon.etat, 'pause');
  const tick = salon.state.tick;
  for (let i = 0; i < 300; i++) salon.avancer((now += 1000 / 60));
  assert.equal(salon.state.tick, tick); // le match n'avance pas pendant la pause
  assert.ok(a.dernier('etat').pause > 0);
  // Retour avant la fin de la pause : le match reprend, le joueur retrouve son siège.
  const b2 = faux();
  assert.equal(salon.revenir(faux(), 'mauvais-jeton', now), null);
  assert.ok(salon.revenir(b2, jeton, now));
  assert.equal(salon.etat, 'jeu');
  assert.equal(b2.dernier('salon').siege, 2);
  assert.ok(b2.dernier('s').sheet); // il reçoit le match en cours, feuille comprise
  salon.avancer((now += 1000 / 60));
  assert.equal(salon.state.tick, tick + 1);
  // Nouvelle coupure, plus longue que la pause : l'ordinateur joue pour lui et le match continue.
  salon.partir(b2, now);
  for (let i = 0; i < (REGLAGES.pauseCoupure + 1) * 60; i++) salon.avancer((now += 1000 / 60));
  assert.equal(salon.etat, 'jeu');
  assert.deepEqual(salon.state.humans.map((h) => h.team), [0]);
  assert.deepEqual(a.dernier('etat').ordinateur, [false, false, true, false, false]);
  assert.ok(salon.state.tick > tick + 1);
  // Il revient plus tard : l'ordinateur lui rend son équipe.
  const b3 = faux();
  assert.ok(salon.revenir(b3, jeton, now));
  assert.deepEqual(salon.state.humans.map((h) => h.team), [0, 1]);
});

test('un match va à son terme, puis la revanche repart avec le même code', () => {
  const { salons, salon, a, b } = partie();
  let now = 1000;
  // On saute à la dernière seconde de la seconde période, avec un but d'avance : le match se termine au temps.
  for (let i = 0; i < 400 && salon.state.phase !== 'play'; i++) salons.avancer((now += 1000 / 60));
  Object.assign(salon.state, { period: 2, clock: 0.5, score: [1, 0] });
  for (let i = 0; i < 2000 && salon.etat !== 'fini'; i++) salons.avancer((now += 1000 / 60));
  assert.equal(salon.etat, 'fini');
  assert.equal(salon.state.phase, 'final');
  assert.ok(a.dernier('s').result);
  const graine = salon.seed;
  salon.recevoir(0, { t: 'revanche' }, now);
  assert.equal(salon.etat, 'fini');
  salon.recevoir(2, { t: 'revanche' }, now);
  assert.equal(salon.etat, 'jeu');
  assert.notEqual(salon.seed, graine);
  assert.equal(b.dernier('depart').depart.seed, salon.seed);
});

test('limites : réglages vérifiés, dix salons, essais de code comptés, spectateurs, salon vide fermé', () => {
  const salons = new Salons();
  assert.equal(salons.creer({ home: 'valence', away: 'valence' }, 0).erreur, 'reglages');
  assert.equal(salons.creer({ home: '../../etc', away: 'rethel' }, 0).erreur, 'reglages');
  const r = salons.creer({ home: 'caen', away: 'anglet', period: 7, difficulty: 'triche' }, 0);
  assert.deepEqual(r.salon.cfg, { home: 'caen', away: 'anglet', period: 120, difficulty: 'normal' });
  for (let i = 1; i < REGLAGES.maxSalons; i++) assert.ok(salons.creer(REGL, 0).salon);
  assert.equal(salons.creer(REGL, 0).erreur, 'complet');
  // Rejoindre : le code se tape en minuscules aussi ; un mauvais code est refusé, et les essais sont comptés.
  assert.equal(salons.trouver(r.salon.code.toLowerCase(), '1.2.3.4', 0).salon, r.salon);
  for (let i = 1; i < REGLAGES.essaisParMinute; i++) assert.equal(salons.trouver('ZZZZ', '1.2.3.4', 0).erreur, 'code');
  assert.equal(salons.trouver(r.salon.code, '1.2.3.4', 0).erreur, 'essais');
  assert.ok(salons.trouver(r.salon.code, '5.6.7.8', 0).salon); // une autre adresse n'est pas gênée
  assert.ok(salons.trouver(r.salon.code, '1.2.3.4', 61000).salon); // une minute plus tard, c'est reparti
  // Quatre joueurs au plus (la place d'arbitre se choisit) ; les spectateurs sont limités.
  const salon = r.salon;
  for (let i = 0; i < 4; i++) assert.ok(salon.asseoir(faux(), 0));
  assert.equal(salon.asseoir(faux(), 0), null);
  for (let i = 0; i < REGLAGES.maxSpectateurs; i++) assert.equal(salon.regarder(faux(), 0), true);
  assert.equal(salon.regarder(faux(), 0), false);
  // Un salon où personne n'est assis est fermé au bout de deux minutes.
  const vide = [...salons.parCode.values()].find((s) => s !== salon);
  salons.avancer(REGLAGES.fermetureVide * 1000 + 1);
  assert.equal(salons.parCode.has(vide.code), false);
  assert.equal(salons.parCode.has(salon.code), true);
});

test("ni discussion ni liste des parties : un message inconnu est ignoré, rien n'est relayé à l'adversaire", () => {
  const { salon, a, b } = partie();
  const avant = b.recus.length;
  salon.recevoir(0, { t: 'message', texte: 'salut' }, 1000);
  salon.recevoir(0, { t: 'liste' }, 1000);
  salon.recevoir(0, { t: 'pseudo', nom: 'x' }, 1000);
  assert.equal(b.recus.length, avant);
  assert.equal(a.recus.filter((m) => !['salon', 'etat', 'depart', 's'].includes(m.t)).length, 0);
});

test('réactions : liste fermée, spectateurs seulement, une toutes les trois secondes, sans effet sur le match', () => {
  const { salon, a, b } = partie();
  const s1 = faux();
  const s2 = faux();
  salon.regarder(s1, 1000);
  salon.regarder(s2, 1000);
  const avant = JSON.stringify(salon.state);
  // Une réaction de la liste : tout le monde la reçoit, sans savoir de qui elle vient.
  assert.equal(salon.reagir(s1, 'bravo', 2000), true);
  for (const c of [a, b, s1, s2]) assert.deepEqual(c.dernier('reaction'), { t: 'reaction', r: 'bravo' });
  // Trop tôt pour le même spectateur, mais pas pour l'autre.
  assert.equal(salon.reagir(s1, 'bouh', 2000 + 2900), false);
  assert.equal(salon.reagir(s2, 'bouh', 2000 + 2900), true);
  assert.equal(salon.reagir(s1, 'prison', 2000 + 3000), true);
  // Rien d'autre que la liste : ni texte libre, ni objet, ni image choisie.
  for (const faux of ['Salut ça va ?', '', 'BRAVO', { id: 'bravo' }, 12, null, '😀']) assert.equal(salon.reagir(s2, faux, 99000), false);
  // Les joueurs n'envoient pas de réactions, ni par la voie des spectateurs ni par la leur.
  assert.equal(salon.reagir(a, 'bravo', 99000), false);
  const n = b.recus.filter((m) => m.t === 'reaction').length;
  salon.recevoir(0, { t: 'reaction', r: 'bravo' }, 99000);
  assert.equal(b.recus.filter((m) => m.t === 'reaction').length, n);
  assert.equal(n, 3);
  // Le match n'a pas bougé.
  assert.equal(JSON.stringify(salon.state), avant);
  // Un inconnu (connexion jamais entrée dans le salon) ne peut rien envoyer.
  assert.equal(salon.reagir(faux(), 'bravo', 99000), false);
});

test("salon en attente : un message toutes les vingt secondes garde la liaison ouverte", () => {
  const salons = new Salons();
  const { salon } = salons.creer(REGL, 0);
  const a = faux();
  salon.asseoir(a, 0);
  const n = a.recus.length;
  for (let i = 0; i < 1300; i++) salon.avancer(i * 16);
  assert.equal(a.recus.length, n + 1);
  assert.equal(a.recus.at(-1).t, 'etat');
});

/** Un salon en attente avec n connexions assises d'office (places 0, 2, 1, 3). */
function attente(n) {
  const salons = new Salons();
  const { salon } = salons.creer(REGL, 0);
  const c = Array.from({ length: n }, faux);
  for (const x of c) salon.asseoir(x, 0);
  return { salon, c };
}
const jouer = (salon, pas, now = 0) => {
  for (let i = 0; i < pas; i++) salon.avancer((now += 1000 / 60));
  return now;
};

test('places : chacun choisit une place libre avant le match, un spectateur peut en prendre une', () => {
  const { salon, c } = attente(2);
  const [a, b] = c;
  // B rejoint A dans l'équipe qui reçoit ; il garde son jeton.
  const jeton = b.dernier('salon').jeton;
  assert.equal(salon.message(b, { t: 'place', i: 0 }, 0), false); // place prise
  assert.equal(salon.message(b, { t: 'place', i: 1 }, 0), true);
  assert.deepEqual([b.dernier('salon').siege, b.dernier('salon').jeton], [1, jeton]);
  assert.deepEqual(a.dernier('etat').sieges, [true, true, false, false, false]);
  for (const i of [7, -2, 1.5, 'x', null]) assert.equal(salon.message(b, { t: 'place', i }, 0), false);
  // Un spectateur prend la place d'arbitre, puis redevient spectateur.
  const s = faux();
  salon.regarder(s, 0);
  assert.equal(salon.message(s, { t: 'place', i: ARBITRE }, 0), true);
  assert.equal(s.dernier('salon').siege, ARBITRE);
  assert.equal(salon.spectateurs.size, 0);
  assert.equal(salon.message(s, { t: 'place', i: -1 }, 0), true);
  assert.equal(salon.sieges[ARBITRE], null);
  assert.equal(salon.spectateurs.size, 1);
  // Changer de place annule « prêt » ; le match ne part qu'avec deux assis, tous prêts.
  salon.message(a, { t: 'pret' }, 0);
  assert.equal(salon.etat, 'attente');
  salon.message(b, { t: 'pret' }, 0);
  assert.equal(salon.etat, 'jeu');
  // Deux amis contre l'ordinateur : deux joueurs dans l'équipe qui reçoit, personne en face.
  assert.deepEqual(salon.state.humans.map((h) => [h.team, h.seat]), [[0, 0], [0, 1]]);
  assert.notEqual(salon.state.humans[0].selected, salon.state.humans[1].selected);
  // Le match commencé, on ne change plus de place et une place libre le reste.
  assert.equal(salon.message(b, { t: 'place', i: 2 }, 0), false);
  assert.equal(salon.message(s, { t: 'place', i: 2 }, 0), false);
  assert.equal(salon.asseoir(faux(), 0), null);
});

test('un joueur seul ne lance pas le match', () => {
  const { salon, c } = attente(1);
  salon.message(c[0], { t: 'pret' }, 0);
  assert.equal(salon.etat, 'attente');
});

test("deux contre deux : chacun commande son patineur, le même match sur les quatre écrans ; coupure d'un coéquipier", () => {
  const { salon, c } = attente(4);
  for (const x of c) salon.message(x, { t: 'pret' }, 0);
  assert.equal(salon.etat, 'jeu');
  const depart = c[0].dernier('depart').depart;
  assert.deepEqual(depart.humans, [{ team: 0, seat: 0 }, { team: 0, seat: 1 }, { team: 1, seat: 2 }, { team: 1, seat: 3 }]);
  assert.deepEqual(c.map((x) => x.dernier('salon').siege), [0, 2, 1, 3]);
  // Celui de la place 1 patine vers la droite, les autres ne touchent à rien.
  let now = jouer(salon, 200);
  const st = salon.state;
  const moi = st.players[st.humans[1].selected];
  const x0 = moi.x;
  salon.message(c[2], coderCommandes({ mx: 1, my: 0 }), now); // c[2] est à la place 1
  now = jouer(salon, 60, now);
  if (st.humans[1].selected === moi.id && st.phase === 'play') assert.ok(moi.x > x0 + 0.5, `patineur de la place 1 : ${x0} → ${moi.x}`);
  const ecran = local(depart);
  for (const m of c[3].recus) if (m.t === 's') appliquer(ecran, m);
  assert.equal(ecran.tick, st.tick);
  assert.deepEqual(ecran.humans.map((h) => [h.seat, h.selected]), st.humans.map((h) => [h.seat, h.selected]));
  // Le coéquipier de la place 1 s'en va pour de bon : l'ordinateur prend son patineur, l'autre continue seul.
  const jeton = c[2].dernier('salon').jeton;
  salon.partir(c[2], now);
  assert.equal(salon.etat, 'pause');
  now = jouer(salon, (REGLAGES.pauseCoupure + 1) * 60, now);
  assert.equal(salon.etat, 'jeu');
  assert.deepEqual(st.humans.map((h) => h.seat), [0, 2, 3]);
  assert.deepEqual(c[0].dernier('etat').ordinateur, [false, true, false, false, false]);
  // Il revient : il retrouve sa place et un patineur que son coéquipier ne dirige pas.
  const retour = faux();
  assert.ok(salon.revenir(retour, jeton, now));
  assert.equal(retour.dernier('salon').siege, 1);
  assert.deepEqual(st.humans.map((h) => h.seat), [0, 1, 2, 3]);
  const sel = st.humans.filter((h) => h.team === 0).map((h) => h.selected);
  assert.ok(sel[1] === -1 || sel[0] !== sel[1]);
});

/** Un contre un avec un arbitre à distance, match lancé. */
function avecArbitre() {
  const { salon, c } = attente(3);
  const [a, b, arb] = c;
  salon.message(arb, { t: 'place', i: ARBITRE }, 0);
  for (const x of c) salon.message(x, { t: 'pret' }, 0);
  let now = 0;
  while (salon.state.phase !== 'play') now = jouer(salon, 1, now);
  return { salon, a, b, arb, now };
}

test("arbitre à distance : il siffle, décide et accorde les buts ; lui seul ; rien de ce que l'ordinateur a vu ne lui est envoyé", () => {
  const { salon, a, b, arb, now: t0 } = avecArbitre();
  let now = t0;
  const st = salon.state;
  assert.equal(a.dernier('depart').depart.referee, true);
  assert.ok(st.ref);
  assert.deepEqual(st.humans.map((h) => h.seat), [0, 2]);
  // Un joueur ne siffle pas, l'arbitre ne commande pas de patineur.
  salon.message(a, { t: 'arb', a: 'siffler' }, now);
  assert.equal(st.phase, 'play');
  salon.message(arb, coderCommandes({ mx: 1, my: 0 }), now);
  assert.deepEqual(salon.sieges[ARBITRE].cmd, { mx: 0, my: 0 });
  // Coup de sifflet : le jeu attend la décision.
  salon.message(arb, { t: 'arb', a: 'siffler' }, now);
  assert.equal(st.ref.wait, 'decision');
  const horloge = st.clock;
  now = jouer(salon, 120, now);
  assert.equal(st.clock, horloge);
  assert.equal(st.phase, 'whistle');
  assert.equal(b.dernier('s').ref.wait, 'decision'); // les joueurs savent que l'arbitre décide
  // Décisions mal formées : ignorées, le jeu attend toujours.
  const fautif = st.players.find((p) => p.team === 1 && !p.goalie && p.status === 'rink').id;
  for (const d of [null, 'x', { faute: true }, { faute: true, fautif: 999, code: 'OBS', sanction: 'minor', engagement: 'zone' }, { faute: true, fautif, code: '__proto__', sanction: 'minor', engagement: 'zone' }, { faute: true, fautif, code: 'OBS', sanction: 'expulsion', engagement: 'zone' }, { faute: true, fautif, code: 'OBS', sanction: 'minor', engagement: 'ailleurs' }]) {
    if (d && typeof d === 'object') assert.equal(lireDecision(d, st), null);
    salon.message(arb, { t: 'arb', a: 'decider', d }, now);
  }
  // null et 'x' ne sont pas des décisions ; aucune des autres n'a été appliquée.
  assert.equal(st.ref.wait, 'decision');
  // Une vraie décision : pénalité mineure, appliquée telle quelle.
  salon.message(arb, { t: 'arb', a: 'decider', d: { faute: true, fautif, code: 'OBS', sanction: 'minor', engagement: 'zone', victime: 3, triche: 1 } }, now);
  assert.equal(st.ref.wait, null);
  assert.equal(st.call.code ?? st.call.titre ? true : false, true);
  assert.ok(st.players[fautif].status !== 'rink' || st.teams[1].penalties?.length || st.sheet.some((l) => l.player === fautif || l.offender === fautif), 'la pénalité est inscrite');
  // But : le palet franchit la ligne, l'arbitre accorde.
  while (st.phase !== 'play') now = jouer(salon, 1, now);
  goalCrossed(st, st.teams[0].dir, false); // le palet franchit la ligne adverse
  now = jouer(salon, 30, now);
  assert.equal(st.ref.wait, 'goal');
  assert.deepEqual(st.score, [0, 0]);
  salon.message(arb, { t: 'arb', a: 'but', accorde: 'oui' }, now); // pas un oui ou non : ignoré
  assert.equal(st.ref.wait, 'goal');
  salon.message(arb, { t: 'arb', a: 'but', accorde: true }, now);
  assert.deepEqual(st.score, [1, 0]);
  // Ce que l'ordinateur a vu en silence ne part jamais vers les navigateurs pendant le match.
  for (const x of [a, b, arb]) for (const m of x.recus) assert.ok(!JSON.stringify(m).includes('"seen"') && m.t !== 'rapport');
});

test("arbitre à distance : sans décision en 45 secondes le jeu reprend ; rapport pour tous à la fin", () => {
  const { salon, a, b, arb, now: t0 } = avecArbitre();
  let now = t0;
  const st = salon.state;
  salon.message(arb, { t: 'arb', a: 'siffler' }, now);
  now = jouer(salon, REGLAGES.delaiArbitre * 60 - 5, now);
  assert.equal(st.ref.wait, 'decision');
  now = jouer(salon, 10, now);
  assert.equal(st.ref.wait, null);
  assert.equal(st.call.titre, 'Pas de faute');
  assert.equal(st.faceoff.reason, 'referee');
  // But laissé sans réponse : accordé comme l'ordinateur l'aurait fait.
  while (st.phase !== 'play') now = jouer(salon, 1, now);
  goalCrossed(st, st.teams[0].dir, false); // le palet franchit la ligne adverse
  now = jouer(salon, 30, now);
  assert.equal(st.ref.wait, 'goal');
  now = jouer(salon, REGLAGES.delaiArbitre * 60 + 5, now);
  assert.deepEqual(st.score, [1, 0]);
  // Fin du match : le rapport part à tout le monde, avant la dernière image.
  st.period = 2;
  st.clock = 0.3;
  while (salon.etat !== 'fini') now = jouer(salon, 1, now);
  for (const x of [a, b, arb]) {
    const r = x.dernier('rapport');
    assert.ok(Array.isArray(r.lignes) && r.lignes.length >= 1);
    assert.ok(x.recus.indexOf(r) < x.recus.indexOf(x.dernier('s')));
  }
  assert.equal(a.dernier('rapport').lignes[0].note.classe, 'sifflet-a-tort');
  // Un spectateur qui arrive après la fin le reçoit aussi.
  const tard = faux();
  salon.regarder(tard, now);
  assert.ok(tard.dernier('rapport'));
});

test("arbitre à distance : s'il perd la connexion, l'ordinateur arbitre jusqu'à son retour", () => {
  const { salon, a, arb, now: t0 } = avecArbitre();
  let now = t0;
  const st = salon.state;
  const jeton = arb.dernier('salon').jeton;
  salon.message(arb, { t: 'arb', a: 'siffler' }, now);
  salon.partir(arb, now);
  assert.equal(salon.etat, 'pause');
  now = jouer(salon, (REGLAGES.pauseCoupure + 1) * 60, now);
  assert.equal(salon.etat, 'jeu');
  assert.equal(st.ref, null); // l'ordinateur arbitre ; le coup de sifflet en attente a été tranché
  assert.equal(st.call.titre, 'Pas de faute');
  assert.deepEqual(a.dernier('etat').ordinateur, [false, false, false, false, true]);
  const tick = st.tick;
  now = jouer(salon, 600, now);
  assert.ok(st.tick > tick + 500); // le match avance sans attendre personne
  assert.equal(a.dernier('s').ref, null);
  const retour = faux();
  assert.ok(salon.revenir(retour, jeton, now));
  assert.ok(st.ref && st.ref.wait === null);
  now = jouer(salon, 5, now);
  if (st.phase === 'play') {
    salon.message(retour, { t: 'arb', a: 'siffler' }, now);
    assert.equal(st.ref.wait, 'decision');
  }
});

test("arbitre à distance : tir de pénalité, décidé sans engagement comme le panneau l'envoie", () => {
  const { salon, arb, now: t0 } = avecArbitre();
  let now = t0;
  const st = salon.state;
  salon.message(arb, { t: 'arb', a: 'siffler' }, now);
  const fautif = st.players.find((p) => p.team === 1 && !p.goalie && p.status === 'rink').id;
  // Exactement ce que le panneau envoie : pas d'engagement pour un tir.
  salon.message(arb, { t: 'arb', a: 'decider', d: { faute: true, fautif, code: 'ACC', sanction: 'tir', engagement: null } }, now);
  assert.equal(st.ref.wait, null);
  assert.equal(st.pshot.team, 0);
  assert.ok(st.call.tir);
  // Le tir a bien lieu.
  let vu = false;
  for (let i = 0; i < 900 && !vu; i++) {
    now = jouer(salon, 1, now);
    vu = st.phase === 'shootout';
  }
  assert.ok(vu, 'le tir de pénalité ne démarre pas');
  assert.equal(st.so.single, true);
});

test('réglages : seules les vraies équipes passent (pas un mot piégé), la Nationale 1 seulement pour un match de saison', () => {
  for (const piege of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 12, null, { a: 1 }]) {
    assert.equal(Salons.reglages({ home: piege, away: 'rethel' }), null, String(piege));
    assert.equal(Salons.reglages({ home: 'valence', away: piege }), null, String(piege));
  }
  assert.equal(Salons.reglages({ home: 'valence', away: 'n1' }), null);
  assert.deepEqual(Salons.reglages({ home: 'valence', away: 'n1', saison: true, cote: 0, period: 300, difficulty: 'difficile' }), { home: 'valence', away: 'n1', period: 300, difficulty: 'difficile', saison: true, cote: 0 });
  assert.equal(Salons.reglages({ home: 'valence', away: 'rethel', saison: 'oui' }).saison, undefined);
  assert.equal(Salons.reglages({ home: 'valence', away: 'rethel', saison: true, cote: 7 }).cote, 0);
});

test('match de saison en ligne : le créateur joue son équipe même à l\'extérieur, le barrage se joue, pas de revanche', () => {
  const salons = new Salons();
  const { salon } = salons.creer({ home: 'caen', away: 'n1', saison: true, cote: 1, period: 120 }, 0);
  const a = faux();
  const b = faux();
  salon.asseoir(a, 0);
  salon.placer(a, 2, 0); // ce que fait le point d'entrée pour cote = 1
  salon.asseoir(b, 0);
  assert.deepEqual([a.dernier('salon').siege, b.dernier('salon').siege], [2, 0]);
  assert.equal(a.dernier('salon').cfg.saison, true);
  salon.message(a, { t: 'pret' }, 0);
  salon.message(b, { t: 'pret' }, 0);
  assert.equal(salon.etat, 'jeu');
  assert.equal(salon.state.cfg.teams[1].id ?? 'n1', 'n1');
  // Fin du match : le résultat part avec la dernière image (score, façon de finir, minutes de pénalité).
  const st = salon.state;
  Object.assign(st, { period: 2, clock: 0.3, score: [0, 2] });
  let now = 0;
  while (salon.etat !== 'fini') now = jouer(salon, 1, now);
  const fin = a.dernier('s');
  assert.equal(fin.g.phase, 'final');
  assert.ok(fin.result?.how);
  assert.ok(fin.eq.every((t) => Number.isFinite(t.pim)));
  // Personne ne peut relancer un match de saison.
  const seed = salon.seed;
  salon.message(a, { t: 'revanche' }, now);
  salon.message(b, { t: 'revanche' }, now);
  assert.equal(salon.etat, 'fini');
  assert.equal(salon.seed, seed);
});

test("arbitre en formation : l'ordinateur arbitre, les situations lui sont envoyées à lui seul, ses réponses sont notées, rapport pour tous", () => {
  const { salon, c } = attente(3);
  const [a, b, arb] = c;
  salon.message(arb, { t: 'place', i: ARBITRE }, 0);
  // Seul celui qui est à la place d'arbitre choisit son rôle.
  salon.message(a, { t: 'role', formation: true }, 0);
  assert.equal(a.dernier('etat').formation, false);
  salon.message(arb, { t: 'role', formation: true }, 0);
  assert.equal(a.dernier('etat').formation, true);
  for (const x of c) salon.message(x, { t: 'pret' }, 0);
  assert.equal(salon.etat, 'jeu');
  const depart = a.dernier('depart').depart;
  assert.deepEqual([depart.referee, depart.formation], [false, true]);
  const st = salon.state;
  assert.equal(st.ref, null); // l'ordinateur arbitre
  // On joue jusqu'à avoir quelques situations ; le match n'attend jamais l'arbitre en formation.
  let now = 0;
  let n = 0;
  while (salon.situations.length < 3 && salon.etat === 'jeu' && n++ < 60 * 400) {
    // Des joueurs qui ne touchent à rien ne font pas de fautes : on en provoque une de temps en temps.
    if (n % 420 === 0 && st.phase === 'play' && st.advantage < 0) {
      const fautif = st.players.find((p) => p.team === 1 && !p.goalie && p.status === 'rink');
      const victime = st.players.find((p) => p.team === 0 && !p.goalie && p.status === 'rink');
      if (fautif && victime) {
        st.events.push({ type: 'foul', code: 'OBS', by: fautif.id, victim: victime.id }); // comme le fait la logique en jugeant un contact
        callFoul(st, { code: 'OBS', offender: fautif.id, severity: 'minor', victim: victime.id });
        Object.assign(st.puck, { carrier: fautif.id, passTarget: -1 }); // l'équipe fautive a le palet : coup de sifflet
      }
    }
    if (st.period === 2 && st.clock < 20) st.clock = 60; // le match dure le temps qu'il faut
    now = jouer(salon, 1, now);
  }
  assert.ok(salon.situations.length >= 3, `situations : ${salon.situations.length}`);
  const recues = arb.recus.filter((m) => m.t === 'situation');
  assert.equal(recues.length, salon.situations.length);
  assert.deepEqual(recues.map((m) => m.n), recues.map((_, i) => i));
  for (const x of [a, b]) assert.ok(!x.recus.some((m) => m.t === 'situation'));
  // Réponses : la bonne à la première, n'importe quoi à la deuxième (refusé), rien à la troisième.
  const v = recues[0].sit.verite;
  const bonne = v.faute ? { faute: true, fautif: v.fautif, code: v.code, sanction: v.sanction, engagement: v.engagement } : { faute: false };
  salon.message(a, { t: 'arb', a: 'reponse', n: 0, rep: { faute: !v.faute } }, now); // un joueur ne répond pas à sa place
  assert.equal(salon.situations[0].rep, null);
  salon.message(arb, { t: 'arb', a: 'reponse', n: 0, rep: bonne }, now);
  assert.ok(salon.situations[0].rep);
  salon.message(arb, { t: 'arb', a: 'reponse', n: 0, rep: { faute: !v.faute } }, now); // une seule réponse par situation
  assert.equal(salon.situations[0].rep.faute, !!v.faute);
  for (const rep of [null, 'x', { faute: true }, { faute: true, fautif: 9999, code: 'OBS', sanction: 'minor' }, { faute: true, fautif: 3, code: 'constructor', sanction: 'minor' }]) salon.message(arb, { t: 'arb', a: 'reponse', n: 1, rep }, now);
  assert.equal(salon.situations[1].rep, null);
  for (const mauvais of [-1, 99, 1.5, '0', null]) salon.message(arb, { t: 'arb', a: 'reponse', n: mauvais, rep: { faute: false } }, now);
  // S'il perd la connexion, le match continue sans pause.
  salon.partir(arb, now);
  assert.equal(salon.etat, 'jeu');
  // Fin du match : rapport pour tous, avec sa note.
  st.period = 2;
  st.clock = 0.3;
  st.score = [1, 0];
  while (salon.etat !== 'fini') now = jouer(salon, 1, now);
  for (const x of [a, b]) {
    const r = x.dernier('rapport');
    assert.equal(r.formation, true);
    assert.equal(r.lignes.length, salon.situations.length);
    assert.equal(r.lignes[0].note.classe, 'juste');
    assert.equal(r.lignes[0].note.points, r.lignes[0].note.max);
    assert.deepEqual([r.lignes[1].rep, r.lignes[1].note.classe, r.lignes[1].note.points], [null, 'sans-reponse', 0]);
    assert.ok(r.lignes[1].note.max > 0);
  }
});

test('jeu simple en ligne : choisi à la création, annoncé à tous, joué par le serveur', () => {
  const salons = new Salons();
  const { salon } = salons.creer({ ...REGL, simple: true }, 1000);
  const a = faux();
  const b = faux();
  salon.asseoir(a, 1000);
  salon.asseoir(b, 1000);
  assert.equal(a.dernier('salon').cfg.simple, true, 'la salle d’attente sait que la partie est en jeu simple');
  salon.message(a, { t: 'pret' }, 1000);
  salon.message(b, { t: 'pret' }, 1000);
  assert.equal(a.dernier('depart').depart.simple, true);
  assert.equal(salon.state.cfg.simple, true);
  assert.equal(salon.state.cfg.lineChange, 'auto');
  // Une partie ordinaire n'en dit rien, et une valeur autre que vrai ne compte pas.
  const { salon: s2, a: a2 } = partie();
  assert.equal(a2.dernier('depart').depart.simple, undefined);
  assert.equal(s2.state.cfg.simple, false);
  assert.equal(Salons.reglages({ ...REGL, simple: 'oui' }).simple, undefined);
});

test('finale de saison jouée en ligne : annoncée à tous pour la salle de la finale, jamais hors saison', () => {
  const r = Salons.reglages({ ...REGL, saison: true, cote: 0, finale: true });
  assert.equal(r.finale, true);
  assert.equal(Salons.reglages({ ...REGL, finale: true }).finale, undefined, 'un match amical ne la demande pas ainsi');
  assert.equal(Salons.reglages({ ...REGL, saison: true, cote: 0, finale: 'oui' }).finale, undefined);
  const salons = new Salons();
  const { salon } = salons.creer(r, 1000);
  const a = faux();
  const b = faux();
  salon.asseoir(a, 1000);
  salon.asseoir(b, 1000);
  salon.message(a, { t: 'pret' }, 1000);
  salon.message(b, { t: 'pret' }, 1000);
  assert.equal(a.dernier('depart').depart.finale, true);
  assert.equal(b.dernier('depart').depart.finale, true);
});
