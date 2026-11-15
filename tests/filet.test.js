// Le filet des cages réagit au palet : essais sans navigateur, avec la vraie trajectoire du palet à 60 images par seconde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';
import { DT, GOAL_X, GOAL_DEPTH } from '../src/sim/geometry.js';
import { Filets } from '../src/render/filet.js';

const CLES = ['Fond', 'Gauche', 'Droite', 'Dessus'];
/** Une cage de Blender réduite à ce que Filets en lit. */
const cage = (cles = CLES) => {
  const filet = { morphTargetDictionary: Object.fromEntries(cles.map((c, i) => [c, i])), morphTargetInfluences: cles.map(() => 0) };
  return { filet, objet: { getObjectByName: (n) => (n === 'Filet' ? filet : null) } };
};

/** Lance le palet dans un vrai match et renvoie, par clé, la plus forte déformation et l'état final du filet. */
function tir(palet, { sansGardien = true, duree = 2.5 } = {}) {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), seed: 3 });
  let n = 0;
  while (s.phase !== 'play' && n++ < 2000) step(s, []);
  const c = cage();
  const filets = new Filets([{ side: 1, objet: c.objet }, { side: -1, objet: cage().objet }]);
  if (sansGardien) for (const p of s.players) if (p.goalie && p.x > 0) p.y = 9;
  // Les patineurs sont écartés : seul le palet compte.
  for (const p of s.players) if (!p.goalie) Object.assign(p, { x: -15, vx: 0, vy: 0 });
  filets.update(s.puck.x, s.puck.y, s.puck.z, DT);
  Object.assign(s.puck, { carrier: -1, passTarget: -1, vz: 0, z: 0.05, ...palet });
  const max = Object.fromEntries(CLES.map((k) => [k, 0]));
  const score = [...s.score];
  for (let i = 0; i < duree / DT; i++) {
    step(s, []);
    s.events.length = 0;
    filets.update(s.puck.x, s.puck.y, s.puck.z, DT);
    CLES.forEach((k, j) => Math.abs(c.filet.morphTargetInfluences[j]) > Math.abs(max[k]) && (max[k] = c.filet.morphTargetInfluences[j]));
  }
  return { max, fin: c.filet.morphTargetInfluences, but: s.score[0] > score[0] };
}

test('but au fond des filets : le fond se gonfle fort, oscille et revient au repos', () => {
  const r = tir({ x: GOAL_X - 2, y: 0.1, vx: 20, vy: 0 });
  assert.ok(r.but);
  assert.ok(r.max.Fond > 0.6 && r.max.Fond <= 1.1, `fond : ${r.max.Fond}`);
  assert.ok(Math.abs(r.max.Gauche) < 0.05 && Math.abs(r.max.Droite) < 0.05);
  assert.deepEqual(r.fin, [0, 0, 0, 0]);
});

test('but en biais : c\'est le côté touché qui se gonfle', () => {
  const droite = tir({ x: GOAL_X - 0.5, y: -0.5, vx: 6, vy: 14 });
  assert.ok(droite.but);
  assert.ok(droite.max.Droite > 0.4, `droite : ${droite.max.Droite}`);
  assert.ok(droite.max.Droite > droite.max.Fond && Math.abs(droite.max.Gauche) < 0.05);
  const gauche = tir({ x: GOAL_X - 0.5, y: 0.5, vx: 6, vy: -14 });
  assert.ok(gauche.max.Gauche > 0.4 && Math.abs(gauche.max.Droite) < 0.05, `gauche : ${gauche.max.Gauche}`);
});

test('un palet qui roule dans le but fait à peine frémir le filet', () => {
  const r = tir({ x: GOAL_X - 0.4, y: 0, vx: 2.5, vy: 0 });
  assert.ok(r.but);
  assert.ok(r.max.Fond > 0 && r.max.Fond < 0.25, `fond : ${r.max.Fond}`);
});

test("tir qui touche le filet de l'extérieur, par l'arrière : il s'enfonce, plus faiblement", () => {
  const r = tir({ x: GOAL_X + GOAL_DEPTH + 1.5, y: 0.1, vx: -16, vy: 0 }, { sansGardien: false });
  assert.ok(!r.but);
  assert.ok(r.max.Fond < -0.1 && r.max.Fond >= -0.45, `fond : ${r.max.Fond}`);
  assert.deepEqual(r.fin, [0, 0, 0, 0]);
});

test("pas de but, pas de mouvement : palet loin des cages, remise en jeu, image figée", () => {
  const r = tir({ x: 0, y: 3, vx: 14, vy: 2 }, { sansGardien: false, duree: 0.6 });
  assert.deepEqual(r.max, { Fond: 0, Gauche: 0, Droite: 0, Dessus: 0 });
  // Un palet qui apparaît d'un coup dans la cage (saut d'image) ne compte pas, et dt = 0 ne casse rien.
  const c = cage();
  const f = new Filets([{ side: 1, objet: c.objet }]);
  f.update(0, 0, 0, DT);
  f.update(GOAL_X + 0.5, 0, 0.1, DT);
  f.update(GOAL_X + 0.5, 0, 0.1, 0);
  for (let i = 0; i < 60; i++) f.update(GOAL_X + 0.5, 0, 0.1, DT);
  assert.deepEqual(c.filet.morphTargetInfluences, [0, 0, 0, 0]);
});

test('ancienne cage sans clés de forme, ou clés manquantes : rien ne casse', () => {
  const sans = new Filets([{ side: 1, objet: { getObjectByName: () => null } }, { side: -1, objet: { getObjectByName: () => ({}) } }]);
  sans.update(GOAL_X - 1, 0, 0, DT);
  sans.update(GOAL_X + 0.2, 0, 0, DT);
  const c = cage(['Fond']);
  const f = new Filets([{ side: 1, objet: c.objet }]);
  for (let i = 0; i < 30; i++) f.update(GOAL_X - 1 + i * 0.05, 0.8 * (i / 30), 0.1, DT);
  assert.equal(c.filet.morphTargetInfluences.length, 1);
});
