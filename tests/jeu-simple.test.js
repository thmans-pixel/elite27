// Jeu simple (mode mobile) : trois boutons à double rôle, tir aidé, changements automatiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';

const ids = Object.keys(TEAMS);
const match = (extra = {}) => createMatch({ home: structuredClone(TEAMS[ids[0]]), away: structuredClone(TEAMS[ids[1]]), humans: [{ team: 0 }], seed: 5, ...extra });
/** Met le match en jeu, palet donné (ou non) au joueur dirigé, loin de tout le monde. */
function enJeu(s, avecPalet) {
  for (let i = 0; i < 600 && s.phase !== 'play'; i++) step(s, [{}]);
  assert.equal(s.phase, 'play');
  const p = s.players[s.humans[0].selected];
  const d = s.teams[0].dir;
  Object.assign(p, { x: d * 8, y: 0, vx: 0, vy: 0, face: d > 0 ? 0 : Math.PI });
  for (const q of s.players) if (q !== p && !q.goalie && q.status === 'rink') Object.assign(q, { x: -d * 15, y: q.id % 2 ? 9 : -9, vx: 0, vy: 0 });
  Object.assign(s.puck, avecPalet ? { carrier: p.id, x: p.x, y: p.y, vx: 0, vy: 0, z: 0, passTarget: -1 } : { carrier: -1, x: -d * 15, y: 0, vx: 0, vy: 0, z: 0, passTarget: -1 });
  return p;
}

test('jeu simple : la configuration force les changements automatiques', () => {
  const s = match({ simple: true, autoSwitch: false, lineChange: 'manuel' });
  assert.equal(s.cfg.simple, true);
  assert.equal(s.cfg.autoSwitch, true);
  assert.equal(s.cfg.lineChange, 'auto');
  assert.equal(match().cfg.simple, false);
});

test('jeu simple : le bouton de vol tire quand on a le palet, même sans viser la cage', () => {
  const s = match({ simple: true });
  const p = enJeu(s, true);
  const d = s.teams[0].dir;
  p.face = d > 0 ? Math.PI : 0; // dos à la cage adverse
  const tirs = [];
  const jouer = (cmd, n) => { for (let i = 0; i < n; i++) { step(s, [cmd]); tirs.push(...s.events.filter((e) => e.type === 'shot')); } };
  jouer({}, 1);
  jouer({ steal: true }, 6); // appui bref sur « voler » : avec le palet, c'est un tir
  jouer({}, 3);
  assert.ok(tirs.length >= 1, 'un tir est parti');
  assert.ok(s.puck.vx * d > 8, `le palet part vers la cage adverse (vx ${s.puck.vx.toFixed(1)})`);
});

test('jeu simple : le bouton de tir vole sans le palet, et ne tire pas tout seul quand on le récupère', () => {
  const s = match({ simple: true });
  const p = enJeu(s, false);
  step(s, [{ shoot: true }]);
  assert.equal(s.humans[0].in.steal, true, 'tir sans palet : vol');
  assert.equal(s.humans[0].in.shoot, false);
  // Le palet arrive pendant que le bouton est encore tenu : pas de tir tant qu'il n'a pas été relâché.
  Object.assign(s.puck, { carrier: p.id, x: p.x, y: p.y });
  const sel = s.humans[0].selected;
  let tirs = 0;
  for (let i = 0; i < 30; i++) { step(s, [{ shoot: true }]); tirs += s.events.filter((e) => e.type === 'shot').length; if (s.puck.carrier !== sel) break; }
  step(s, [{}]);
  tirs += s.events.filter((e) => e.type === 'shot').length;
  assert.equal(tirs, 0, 'bouton tenu depuis avant la récupération : aucun tir');
});

test('jeu simple : sprint, temps mort, changement de ligne et sortie du gardien ne sont pas commandés', () => {
  const s = match({ simple: true });
  enJeu(s, true);
  step(s, [{ sprint: true, timeout: true, line: true, pull: true, skid: true, kneel: true }]);
  const h = s.humans[0];
  for (const k of ['sprint', 'timeout', 'line', 'pull', 'skid', 'kneel']) assert.equal(!!h.in[k], false, k);
  assert.equal(s.teams[0].wantTimeout ?? false, false);
});

test('jeu complet : les boutons gardent leur rôle', () => {
  const s = match();
  enJeu(s, false);
  step(s, [{ shoot: true }]);
  assert.equal(s.humans[0].in.shoot, true);
  assert.equal(s.humans[0].in.steal, false);
});
