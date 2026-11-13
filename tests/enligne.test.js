import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { accepter, MAX_RECU } from '../serveur/ws.mjs';
import { Salons, REGLAGES } from '../serveur/salon.mjs';
import { createMatch } from '../src/sim/match.js';
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
  salon.recevoir(0, { t: 'pret' }, now);
  salon.recevoir(1, { t: 'pret' }, now);
  return { salons, salon, a, b };
}
const local = (d) => createMatch({ home: structuredClone(TEAMS[d.home]), away: structuredClone(TEAMS[d.away]), periodLength: d.periodLength, difficulty: d.difficulty, humans: [{ team: 0 }, { team: 1 }], seed: d.seed, overtime: true });

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
  const c = { mx: 0.5, my: -1, pass: true, shoot: false, steal: true, sw: false, skid: false, dodge: true, check: false, kneel: false, line: false, timeout: true };
  assert.deepEqual(lireCommandes(coderCommandes(c)), c);
  assert.deepEqual(lireCommandes({ x: 99999, y: 'abc', b: 'zzz' }).mx, 1);
  assert.equal(lireCommandes({ x: 99999, y: 'abc', b: 'zzz' }).my, 0);
  assert.equal(lireCommandes({}).pass, false);
});

test('deux joueurs, un code de quatre lettres, le même match sur les deux écrans', () => {
  const { salon, a, b } = partie();
  assert.match(salon.code, /^[A-Z]{4}$/);
  assert.equal(a.dernier('salon').siege, 0);
  assert.equal(b.dernier('salon').siege, 1);
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
  assert.ok(octets / envois < 9000, `instantané de ${Math.round(octets / envois)} octets`);
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
  assert.equal(b2.dernier('salon').siege, 1);
  assert.ok(b2.dernier('s').sheet); // il reçoit le match en cours, feuille comprise
  salon.avancer((now += 1000 / 60));
  assert.equal(salon.state.tick, tick + 1);
  // Nouvelle coupure, plus longue que la pause : l'ordinateur joue pour lui et le match continue.
  salon.partir(b2, now);
  for (let i = 0; i < (REGLAGES.pauseCoupure + 1) * 60; i++) salon.avancer((now += 1000 / 60));
  assert.equal(salon.etat, 'jeu');
  assert.deepEqual(salon.state.humans.map((h) => h.team), [0]);
  assert.deepEqual(a.dernier('etat').ordinateur, [false, true]);
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
  salon.recevoir(1, { t: 'revanche' }, now);
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
  // Un troisième joueur n'a pas de siège ; les spectateurs sont limités.
  const salon = r.salon;
  salon.asseoir(faux(), 0);
  salon.asseoir(faux(), 0);
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
