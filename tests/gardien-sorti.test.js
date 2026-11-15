// Pendant un avantage (pénalité signalée, le jeu continue), l'équipe non fautive sort son gardien pour un patineur de plus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';
import { goalieOf, skatersOnRink } from '../src/sim/state.js';
import { callFoul, refArm, refWhistle, goalCrossed } from '../src/sim/rules.js';
import { GOAL_X } from '../src/sim/geometry.js';

function enJeu(cfg = {}) {
  // Un joueur humain qui ne touche à rien dirige le porteur : il garde le palet sans tirer ni passer.
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), seed: 7, humans: [{ team: 0 }], ...cfg });
  let n = 0;
  while (s.phase !== 'play' && n++ < 2000) step(s, [{}]);
  return s;
}
/** L'équipe 0 tient le palet loin de tout le monde, pour que l'avantage dure. */
function tenir(s) {
  const c = skatersOnRink(s, 0)[0];
  for (const p of s.players) if (p.team === 1 && !p.goalie && p.status === 'rink') Object.assign(p, { x: 18 * s.teams[1].dir * -1, y: 9, vx: 0, vy: 0, stun: 3 });
  Object.assign(c, { x: 0, y: 0, vx: 0, vy: 0 });
  Object.assign(s.puck, { carrier: c.id, x: c.x, y: c.y, vx: 0, vy: 0, passTarget: -1 });
  s.humans[0].selected = c.id;
  return c;
}
const surPiste = (s, t) => s.players.filter((p) => p.team === t && p.status === 'rink');
/** Avance en gardant le palet chez le porteur et les adversaires au sol ; s'arrête dès que cond est vraie. */
function avancer(s, c, cond, max = 900) {
  for (let i = 0; i < max && !cond(); i++) {
    for (const p of s.players) if (p.team === 1 && !p.goalie) p.stun = 3;
    if (s.puck.carrier !== c.id && s.phase === 'play') Object.assign(s.puck, { carrier: c.id, passTarget: -1 });
    step(s, [{}]);
    // Jamais plus de cinq joueurs d'une équipe sur la piste, à aucun moment.
    for (const t of [0, 1]) assert.ok(surPiste(s, t).length <= 5, `équipe ${t} : ${surPiste(s, t).length} sur la piste`);
    s.events.length = 0;
  }
  return cond();
}

test("avantage : le gardien rejoint son banc, puis un cinquième patineur entre ; retour à l'arrêt de jeu", () => {
  const s = enJeu();
  const c = tenir(s);
  const g = goalieOf(s, 0);
  const fautif = skatersOnRink(s, 1)[0];
  assert.ok(callFoul(s, { code: 'OBS', offender: fautif.id, severity: 'minor', victim: c.id }));
  assert.equal(s.advantage, 1);
  // Le gardien part : tant qu'il n'est pas au banc, ils sont quatre patineurs et lui.
  step(s, [{}]);
  assert.equal(g.pull, 1);
  assert.equal(skatersOnRink(s, 0).length, 4);
  assert.ok(avancer(s, c, () => g.pull === 2), 'le gardien n\'arrive pas à son banc');
  assert.equal(g.status, 'bench');
  const cinq = skatersOnRink(s, 0);
  assert.equal(cinq.length, 5);
  const extra = cinq.find((p) => p.extra);
  assert.ok(extra && !extra.goalie);
  // Le gardien adverse, lui, n'a pas bougé de sa cage.
  assert.equal(goalieOf(s, 1).pull, 0);
  // L'équipe fautive touche le palet : sifflet, puis engagement avec le gardien revenu et quatre patineurs.
  const voleur = skatersOnRink(s, 1)[1];
  voleur.stun = 0;
  Object.assign(s.puck, { carrier: voleur.id });
  step(s, [{}]);
  assert.notEqual(s.phase, 'play');
  let n = 0;
  while (s.phase !== 'faceoff' && n++ < 2000) step(s, [{}]);
  assert.equal(g.status, 'rink');
  assert.equal(g.pull, 0);
  assert.ok(!s.players.some((p) => p.extra));
  assert.ok(skatersOnRink(s, 0).length <= 4);
  while (s.phase !== 'play' && n++ < 4000) step(s, [{}]);
  // À la reprise, il est de retour devant sa cage.
  assert.ok(Math.abs(Math.abs(g.x) - GOAL_X) < 1.5 && Math.abs(g.y) < 1, `gardien en ${g.x.toFixed(1)}, ${g.y.toFixed(1)}`);
});

test('avantage : la cage est vide, un but contre son camp compte', () => {
  const s = enJeu();
  const c = tenir(s);
  const g = goalieOf(s, 0);
  callFoul(s, { code: 'OBS', offender: skatersOnRink(s, 1)[0].id, severity: 'minor', victim: c.id });
  avancer(s, c, () => g.pull === 2);
  const score = [...s.score];
  // Le palet file dans la cage de l'équipe 0, que personne ne garde.
  const d = s.teams[0].dir;
  Object.assign(s.puck, { carrier: -1, passTarget: -1, x: -d * (GOAL_X - 1.5), y: 0.1, z: 0.05, vx: -d * 18, vy: 0, vz: 0 });
  for (const p of skatersOnRink(s, 0)) Object.assign(p, { x: d * 10, y: 6, vx: 0, vy: 0 });
  for (let i = 0; i < 60 && s.score[1] === score[1]; i++) step(s, [{}]);
  assert.deepEqual(s.score, [score[0], score[1] + 1]);
});

test("sans avantage, ou tant que l'équipe n'a pas le palet, le gardien reste dans sa cage", () => {
  const s = enJeu();
  const g = goalieOf(s, 0);
  for (let i = 0; i < 600; i++) {
    step(s, [{}]);
    s.events.length = 0;
    if (s.advantage < 0) assert.equal(g.pull, 0);
  }
  // Faute sifflée alors que le palet est libre : avantage, mais le gardien attend que son équipe le tienne.
  const t = enJeu({ seed: 9 });
  Object.assign(t.puck, { carrier: -1, passTarget: -1, x: 0, y: -11, vx: 0, vy: 0 });
  for (const p of t.players) if (!p.goalie && p.status === 'rink') Object.assign(p, { x: p.team ? 15 : -15, y: 8, stun: 3 });
  callFoul(t, { code: 'OBS', offender: skatersOnRink(t, 1)[0].id, severity: 'minor', victim: skatersOnRink(t, 0)[0].id });
  step(t, [{}]);
  if (t.advantage === 1 && t.puck.carrier < 0) assert.equal(goalieOf(t, 0).pull, 0);
});

test("arbitre réel : même chose quand c'est lui qui lève le bras", () => {
  const s = enJeu({ referee: 'humain' });
  const c = tenir(s);
  const g = goalieOf(s, 0);
  assert.ok(refArm(s, 1));
  assert.ok(avancer(s, c, () => g.pull === 2));
  assert.equal(skatersOnRink(s, 0).length, 5);
  // Coup de sifflet de l'arbitre : le gardien revient pour l'engagement.
  refWhistle(s);
  assert.equal(s.ref.wait, 'decision');
});

test('but pendant que le gardien est sorti, puis tir de pénalité : tout le monde est à sa place', () => {
  const s = enJeu();
  const c = tenir(s);
  const g = goalieOf(s, 0);
  callFoul(s, { code: 'OBS', offender: skatersOnRink(s, 1)[0].id, severity: 'minor', victim: c.id });
  avancer(s, c, () => g.pull === 2);
  goalCrossed(s, s.teams[0].dir, false);
  let n = 0;
  while (s.phase !== 'play' && n++ < 4000) step(s, [{}]);
  assert.equal(g.status, 'rink');
  assert.equal(g.pull, 0);
  assert.ok(skatersOnRink(s, 0).length <= 4 && !s.players.some((p) => p.extra));
});

// ---------------------------------------------------------------- fin de match
import { lateTrail } from '../src/sim/rules.js';

/** Fin de match : deuxième période, il reste `reste` secondes, score donné. */
function finDeMatch(score, reste, cfg = {}) {
  const s = enJeu(cfg);
  s.period = 2;
  s.clock = reste;
  s.score = [...score];
  return s;
}

test('fin de match : permis seulement à l\'équipe menée d\'un ou deux buts, dans la dernière minute, jamais en prolongation', () => {
  const s = finDeMatch([1, 2], 25);
  assert.equal(lateTrail(s, 0), true);
  assert.equal(lateTrail(s, 1), false); // celle qui mène
  s.score = [0, 3];
  assert.equal(lateTrail(s, 0), false); // trois buts d'écart
  s.score = [2, 2];
  assert.equal(lateTrail(s, 0), false);
  s.score = [1, 2];
  s.clock = 31; // match en 2 × 2 min : les 30 dernières secondes seulement
  assert.equal(lateTrail(s, 0), false);
  s.period = 1;
  s.clock = 10;
  assert.equal(lateTrail(s, 0), false);
  s.period = 3;
  assert.equal(lateTrail(s, 0), false);
  const long = finDeMatch([1, 2], 59, { periodLength: 600 });
  assert.equal(lateTrail(long, 0), true); // dernière minute pour les matchs plus longs
  long.clock = 61;
  assert.equal(lateTrail(long, 0), false);
});

test('fin de match : le joueur sort son gardien d\'une touche, un second appui le rappelle', () => {
  const s = finDeMatch([0, 1], 28);
  const c = tenir(s);
  const g = goalieOf(s, 0);
  // Sans appui, rien ne se passe ; trop tôt non plus.
  step(s, [{}]);
  assert.equal(g.pull, 0);
  step(s, [{ pull: true }]);
  step(s, [{}]);
  assert.equal(g.pull, 1);
  assert.equal(s.teams[0].pullWant, true);
  // Il arrive au banc : cinq patineurs, cage vide.
  for (let i = 0; i < 600 && g.pull !== 2; i++) {
    for (const p of s.players) if (p.team === 1 && !p.goalie) p.stun = 3;
    if (s.puck.carrier !== c.id) Object.assign(s.puck, { carrier: c.id, passTarget: -1 });
    s.clock = 28; // on fige l'horloge le temps de l'essai
    step(s, [{}]);
    assert.ok(surPiste(s, 0).length <= 5);
  }
  assert.equal(g.pull, 2);
  assert.equal(skatersOnRink(s, 0).length, 5);
  // Second appui : le patineur en plus sort, le gardien rentre par le banc et rejoint sa cage.
  step(s, [{ pull: true }]);
  step(s, [{}]);
  assert.equal(g.pull, 3);
  assert.equal(g.status, 'rink');
  assert.equal(skatersOnRink(s, 0).length, 4);
  for (let i = 0; i < 900 && g.pull; i++) {
    for (const p of s.players) if (p.team === 1 && !p.goalie) p.stun = 3;
    if (s.puck.carrier !== c.id) Object.assign(s.puck, { carrier: c.id, passTarget: -1 });
    s.clock = 28;
    step(s, [{}]);
  }
  assert.equal(g.pull, 0);
  assert.ok(Math.abs(Math.abs(g.x) - GOAL_X) < 1.6 && Math.abs(g.y) < 1.2, `gardien en ${g.x.toFixed(1)}, ${g.y.toFixed(1)}`);
  // La touche ne fait rien quand ce n'est pas permis (équipe qui mène).
  s.score = [3, 1];
  step(s, [{ pull: true }]);
  step(s, [{}]);
  assert.equal(g.pull, 0);
});

test("fin de match : l'ordinateur sort son gardien quand il tient le palet dans le camp adverse, et repart à cinq après un arrêt de jeu", async () => {
  const s = finDeMatch([2, 1], 28, { humans: [] });
  const g = goalieOf(s, 1); // l'équipe 1, menée, est jouée par l'ordinateur
  const d = s.teams[1].dir;
  const c = skatersOnRink(s, 1)[0];
  for (const p of s.players) if (p.team === 0 && !p.goalie && p.status === 'rink') Object.assign(p, { x: -d * 18, y: 9, vx: 0, vy: 0, stun: 3 });
  // Palet dans son propre camp : il ne sort pas encore.
  Object.assign(c, { x: -d * 8, y: 0 });
  Object.assign(s.puck, { carrier: c.id, passTarget: -1 });
  step(s, []);
  assert.equal(g.pull, 0);
  Object.assign(c, { x: d * 6, y: 0 });
  step(s, []);
  assert.equal(g.pull, 1);
  let cinq = false;
  // L'ordinateur joue son attaque : que le gardien atteigne son banc en plein jeu ou que le jeu s'arrête avant,
  // l'équipe finit à cinq (au plus tard à l'engagement suivant), sans jamais dépasser cinq.
  for (let i = 0; i < 3000 && !cinq; i++) {
    s.clock = 28;
    s.score = [2, 1];
    step(s, []);
    s.events.length = 0;
    assert.ok(surPiste(s, 1).length <= 5);
    cinq = g.pull === 2;
  }
  assert.ok(cinq, 'le gardien n\'est pas arrivé au banc');
  assert.equal(skatersOnRink(s, 1).length, 5);
  // Arrêt de jeu alors que l'équipe est toujours menée d'un but : elle reprend à cinq, gardien au banc.
  const gel = skatersOnRink(s, 0)[0];
  gel.stun = 0;
  s.clock = 20;
  s.phase = 'play';
  Object.assign(s.puck, { carrier: -1, passTarget: -1, x: 0, y: 0, vx: 0, vy: 0 });
  // (arrêt provoqué : palet sorti du jeu selon la logique habituelle des arrêts)
  const { stopPlay } = await import('../src/sim/rules.js');
  const { SPOTS } = await import('../src/sim/geometry.js');
  stopPlay(s, 'freeze', { spot: Object.values(SPOTS)[0], call: { titre: 'Palet immobilisé' } });
  let n = 0;
  while (s.phase !== 'faceoff' && n++ < 2000) step(s, []);
  assert.equal(g.status, 'bench');
  assert.equal(g.pull, 2);
  assert.equal(skatersOnRink(s, 1).length, 5);
  for (const p of skatersOnRink(s, 1)) assert.ok(Number.isFinite(p.fx) && Number.isFinite(p.fy));
  // Égalisation : au prochain engagement, le gardien est revenu.
  s.score = [2, 2];
  while (s.phase !== 'play' && n++ < 4000) step(s, []);
  step(s, []);
  for (let i = 0; i < 900 && g.pull; i++) step(s, []);
  assert.equal(g.pull, 0);
  assert.ok(skatersOnRink(s, 1).length <= 4);
});
