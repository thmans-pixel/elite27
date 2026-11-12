// Étape 2, lot 6 : tir de pénalité en cours de match, cumul et méconduites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { skatersOnRink, goalieOf, periodLabel } from '../src/sim/state.js';
import { callFoul, stopPlay, lineup } from '../src/sim/rules.js';
import { SPOTS } from '../src/sim/geometry.js';
import { TEAMS } from '../src/data/teams.js';

const make = (opts = {}) => createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [], seed: 21, ...opts });
function until(s, cond, inputs = () => [], max = 200000) {
  for (let i = 0; i < max && !cond(s); i++) {
    step(s, inputs(s));
    s.events.length = 0;
  }
  assert.ok(cond(s), 'condition jamais atteinte');
}
const playing = (s) => until(s, (m) => m.phase === 'play');

/** Met un attaquant de l'équipe 0 seul devant la cage adverse, un défenseur derrière lui. */
function breakaway(s, defenderAhead = false) {
  playing(s);
  const d = s.teams[0].dir;
  const [v, mate] = skatersOnRink(s, 0);
  const opp = skatersOnRink(s, 1);
  Object.assign(v, { x: d * 9, y: 0, vx: d * 4, vy: 0 });
  Object.assign(mate, { x: -d * 5, y: 4 });
  opp.forEach((p, i) => Object.assign(p, { x: d * (7 - i * 2), y: 1 + i }));
  if (defenderAhead) Object.assign(opp[3], { x: d * 15, y: -1 });
  Object.assign(s.puck, { carrier: v.id, x: v.x, y: v.y, lastTouch: v.id });
  return { v, off: opp[0] };
}

test('faute par l arrière sur un joueur seul face au gardien : tir de pénalité tiré par la victime, sans pénalité purgée', () => {
  const s = make();
  const { v, off } = breakaway(s);
  const clock = s.clock;
  assert.equal(callFoul(s, { code: 'ACC', offender: off.id, severity: 'minor', victim: v.id, hadPuck: true }), true);
  assert.equal(s.phase, 'whistle');
  assert.equal(s.call.tir, true);
  assert.equal(s.teams[1].penalties.length, 0, 'pas de pénalité purgée');
  assert.equal(off.minors, 1, 'la faute compte pour le cumul');
  assert.equal(skatersOnRink(s, 1).length, 4);
  until(s, (m) => m.phase === 'shootout' && m.so.stage === 'run');
  assert.equal(periodLabel(s), 'Tir de pénalité');
  assert.equal(s.so.shooter, v.id);
  assert.deepEqual(skatersOnRink(s, 0).map((p) => p.id), [v.id]);
  assert.equal(skatersOnRink(s, 1).length, 0);
  const score = [...s.score];
  s.so.over = 'goal';
  until(s, (m) => m.phase === 'play');
  assert.equal(s.clock <= clock && s.clock > clock - 0.2, true, 'le temps ne tourne pas pendant le tir');
  assert.deepEqual(s.score, [score[0] + 1, score[1]]);
  assert.equal(s.so, null);
  assert.equal(skatersOnRink(s, 0).length, 4);
  assert.equal(skatersOnRink(s, 1).length, 4);
  const g = s.sheet.at(-1);
  assert.equal(g.type, 'goal');
  assert.equal(g.tir, true);
  assert.equal(g.scorer.num, v.num);
});

test('tir de pénalité manqué : pas de but, engagement dans la zone de l équipe qui défendait', () => {
  const s = make();
  const { v, off } = breakaway(s);
  callFoul(s, { code: 'TRE', offender: off.id, severity: 'minor', victim: v.id, hadPuck: true });
  until(s, (m) => m.phase === 'shootout' && m.so.stage === 'run');
  s.so.over = 'miss';
  const seen = [];
  for (let i = 0; i < 2000 && s.phase !== 'play'; i++) {
    step(s);
    seen.push(...s.events.filter((e) => e.type === 'faceoff'));
    s.events.length = 0;
  }
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.sheet.at(-1).type, 'note');
  assert.ok(['EN', 'ES', 'WN', 'WS'].includes(seen[0].spot));
  assert.equal(Math.sign(SPOTS[seen[0].spot].x), -s.teams[1].dir, 'côté de la cage défendue');
});

test('tir de pénalité joué par l ordinateur jusqu au bout, sans intervention', () => {
  const s = make({ seed: 5 });
  const { v, off } = breakaway(s);
  callFoul(s, { code: 'ACC', offender: off.id, severity: 'minor', victim: v.id, hadPuck: true });
  until(s, (m) => m.phase === 'shootout');
  until(s, (m) => m.phase === 'play', () => [], 5000);
  assert.ok(s.score[0] + s.score[1] <= 1);
});

test('majeure sur une échappée : le tir est accordé et la majeure est purgée aussi', () => {
  const s = make();
  const { v, off } = breakaway(s);
  callFoul(s, { code: 'DOS', offender: off.id, severity: 'major', extra: 'MPM', victim: v.id, hadPuck: true });
  assert.equal(s.call.tir, true);
  assert.equal(s.teams[1].penalties.length, 1);
  assert.equal(off.status, 'out');
  until(s, (m) => m.phase === 'shootout');
});

test('la même faute avec un défenseur entre le porteur et la cage, ou avant le milieu : pénalité ordinaire', () => {
  let s = make();
  let { v, off } = breakaway(s, true);
  callFoul(s, { code: 'ACC', offender: off.id, severity: 'minor', victim: v.id, hadPuck: true });
  until(s, (m) => m.phase === 'whistle' || m.advantage >= 0);
  assert.equal(s.pshot, null);
  s = make();
  ({ v, off } = breakaway(s));
  v.x = -s.teams[0].dir * 3;
  off.x = -s.teams[0].dir * 6;
  callFoul(s, { code: 'ACC', offender: off.id, severity: 'minor', victim: v.id, hadPuck: true });
  assert.equal(s.pshot, null);
  // Une faute qui n'est pas par l'arrière sur le porteur (obstruction) ne donne pas de tir.
  s = make();
  ({ v, off } = breakaway(s));
  callFoul(s, { code: 'OBS', offender: off.id, severity: 'minor', victim: v.id, hadPuck: true });
  assert.equal(s.pshot, null);
});

test('cumul : 3e mineure, méconduite en plus ; pénalité suivante, exclusion', () => {
  const s = make({ periodLength: 1500 });
  playing(s);
  const p = skatersOnRink(s, 0)[1];
  // Deux mineures déjà prises ; la troisième arrive.
  p.minors = 2;
  s.puck.carrier = p.id;
  assert.equal(callFoul(s, { code: 'OBS', offender: p.id, severity: 'minor' }), true);
  assert.equal(p.minors, 3);
  assert.match(s.call.sanction, /3e mineure : méconduite/);
  assert.equal(s.teams[0].misconducts.length, 1);
  assert.equal(p.status, 'box');
  assert.equal(skatersOnRink(s, 0).length, 3, 'infériorité pour la mineure seulement');
  // La mineure finit : l'équipe revient à quatre, lui reste au banc.
  s.teams[0].penalties[0].remaining = 0.01;
  playing(s);
  for (let i = 0; i < 4; i++) step(s);
  assert.equal(s.teams[0].penalties.length, 0);
  assert.equal(p.status, 'box');
  assert.equal(skatersOnRink(s, 0).length, 4, 'la méconduite ne met pas en infériorité');
  // Fin de la méconduite : retour au premier arrêt de jeu seulement.
  s.teams[0].misconducts[0].remaining = 0.01;
  playing(s);
  for (let i = 0; i < 30 && s.phase === 'play'; i++) step(s);
  if (s.phase === 'play') {
    assert.equal(p.status, 'box', 'pas de retour en plein jeu');
    stopPlay(s, 'freeze', { spot: SPOTS.C, call: null });
  }
  playing(s);
  assert.notEqual(p.status, 'box');
  assert.equal(s.teams[0].misconducts.length, 0);
});

test('cumul : pénalité après la 3e mineure = exclusion ; un coéquipier purge', () => {
  const s = make({ periodLength: 1500 });
  playing(s);
  const p = skatersOnRink(s, 0)[1];
  p.minors = 3;
  p.misc = 1;
  s.puck.carrier = p.id;
  callFoul(s, { code: 'OBS', offender: p.id, severity: 'minor' });
  assert.match(s.call.sanction, /exclusion/);
  assert.equal(p.status, 'out');
  assert.equal(s.teams[0].penalties.length, 1);
  assert.notEqual(s.teams[0].penalties[0].server, p.id);
  assert.equal(skatersOnRink(s, 0).length, 3);
});

test('cumul : trois fautes de crosse = exclusion ; deuxième méconduite = méconduite pour le match', () => {
  let s = make({ periodLength: 1500 });
  playing(s);
  let p = skatersOnRink(s, 0)[2];
  p.stick = 2;
  s.puck.carrier = p.id;
  callFoul(s, { code: 'CIN', offender: p.id, severity: 'minor' });
  assert.match(s.call.sanction, /3e faute de crosse : exclusion/);
  assert.equal(p.status, 'out');
  s = make({ periodLength: 1500 });
  playing(s);
  p = skatersOnRink(s, 0)[2];
  p.minors = 2;
  p.misc = 1;
  s.puck.carrier = p.id;
  callFoul(s, { code: 'OBS', offender: p.id, severity: 'minor' });
  assert.match(s.call.sanction, /méconduite pour le match/);
  assert.equal(p.status, 'out');
});

test('une mineure annulée par un but pendant l avantage compte pour le cumul', async () => {
  const { goalCrossed } = await import('../src/sim/rules.js');
  const s = make();
  playing(s);
  const p = skatersOnRink(s, 1)[0];
  s.puck.carrier = skatersOnRink(s, 0)[0].id;
  callFoul(s, { code: 'OBS', offender: p.id, severity: 'minor' });
  assert.equal(s.advantage, 1);
  goalCrossed(s, s.teams[0].dir, false);
  assert.equal(p.minors, 1);
  assert.equal(s.teams[1].penalties.length, 0);
  assert.equal(s.sheet.find((e) => e.type === 'penalty').nonPurgee, true);
});

test('une équipe aligne toujours ses patineurs, même avec des exclus, et le match va au bout', () => {
  const s = make({ seed: 9 });
  playing(s);
  const sk = s.players.filter((p) => p.team === 0 && !p.goalie);
  for (const p of sk.slice(0, 3)) p.status = 'out';
  lineup(s, 0);
  stopPlay(s, 'freeze', { spot: SPOTS.C, call: null });
  playing(s);
  assert.equal(skatersOnRink(s, 0).length, 4);
  for (const p of sk.slice(3, 6)) p.status = 'out';
  lineup(s, 0);
  stopPlay(s, 'freeze', { spot: SPOTS.C, call: null });
  playing(s);
  assert.equal(skatersOnRink(s, 0).length, 2);
  until(s, (m) => m.phase === 'final');
  assert.ok(goalieOf(s, 0));
});
