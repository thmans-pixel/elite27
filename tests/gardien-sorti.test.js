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
