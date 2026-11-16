// Mode Entraînement : l'équipe du joueur face au seul gardien adverse, sans chronomètre ni arrêt de jeu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';

const ids = Object.keys(TEAMS);
const seance = (extra = {}) => createMatch({ home: structuredClone(TEAMS[ids[0]]), away: structuredClone(TEAMS[ids[1]]), humans: [{ team: 0 }], seed: 11, training: true, ...extra });
const surPiste = (s, t) => s.players.filter((p) => p.team === t && p.status === 'rink');

test('entraînement : ma ligne et mon gardien, le gardien adverse seul, le palet pour moi tout de suite', () => {
  const s = seance();
  step(s, [{}]);
  assert.equal(s.phase, 'play', 'pas d’engagement');
  assert.equal(surPiste(s, 0).filter((p) => !p.goalie).length, 4);
  assert.deepEqual(surPiste(s, 1).map((p) => p.goalie), [true], 'en face, le gardien seulement');
  assert.equal(s.puck.carrier, s.humans[0].selected, 'le joueur a le palet');
  for (const g of surPiste(s, 0).concat(surPiste(s, 1)).filter((p) => p.goalie)) assert.ok(Math.abs(g.x) > 19, `gardien dans sa cage (${g.x.toFixed(1)})`);
});

test('entraînement : le temps ne passe pas, un but compte et le palet revient', () => {
  const s = seance();
  step(s, [{}]);
  const d = s.teams[0].dir;
  // Tir à bout portant, gardien écarté : but.
  const p = s.players[s.humans[0].selected];
  const g = s.players.find((q) => q.team === 1 && q.goalie);
  Object.assign(p, { x: d * 17, y: 0, vx: 0, vy: 0, face: d > 0 ? 0 : Math.PI });
  Object.assign(s.puck, { x: p.x, y: p.y });
  let buts = 0;
  for (let i = 0; i < 240 && !buts; i++) {
    Object.assign(g, { y: 1.4 }); // le gardien est tenu sur un poteau
    step(s, [{ shoot: i < 30 }]);
    buts = s.drill.buts;
  }
  assert.equal(buts, 1, 'le but est compté');
  assert.ok(s.drill.tirs >= 1);
  for (let i = 0; i < 200; i++) step(s, [{}]);
  assert.equal(s.phase, 'play', 'le jeu a repris sans engagement');
  assert.equal(s.clock, s.cfg.periodLength, 'le chronomètre ne bouge pas');
  assert.deepEqual(surPiste(s, 1).map((q) => q.goalie), [true]);
});

test('entraînement : une longue séance ne s’arrête jamais et ne casse rien, « nouveau palet » le redonne', () => {
  const s = seance({ simple: true });
  let n = 0;
  for (let i = 0; i < 20000; i++) {
    // Un joueur qui fonce vers la cage et tire de temps en temps, et redemande parfois un palet.
    const d = s.teams[0].dir;
    step(s, [{ mx: d, my: Math.sin(i / 90), shoot: i % 140 < 25, pass: i % 333 === 0, timeout: i % 2500 === 7 }]);
    assert.notEqual(s.phase, 'final');
    assert.ok(Number.isFinite(s.puck.x) && Number.isFinite(s.puck.y));
    if (i % 2500 === 7) {
      n++;
      assert.equal(s.puck.carrier, s.humans[0].selected, 'nouveau palet : dans la crosse du joueur');
    }
    s.events.length = 0;
  }
  assert.ok(n >= 7);
  assert.equal(s.period, 1);
  assert.ok(s.drill.tirs > 20, `des tirs ont été comptés (${s.drill.tirs})`);
  assert.ok(s.drill.buts + s.drill.arrets > 0, `buts ${s.drill.buts}, arrêts ${s.drill.arrets}`);
  assert.equal(s.teams[0].penalties.length + s.teams[1].penalties.length, 0, 'aucune pénalité');
});
