// Étape 2, lot 4 : les deux lignes et les changements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { skatersOnRink, form, TIRED } from '../src/sim/state.js';
import { stopPlay, LINE_GAP } from '../src/sim/rules.js';
import { topSpeed } from '../src/sim/physics.js';
import { SPOTS } from '../src/sim/geometry.js';
import { TEAMS } from '../src/data/teams.js';

const make = (opts = {}) => createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [], seed: 12, ...opts });
const whistle = (s) => stopPlay(s, 'freeze', { spot: SPOTS.C, call: null });
function until(s, cond, inputs = () => [], max = 200000) {
  for (let i = 0; i < max && !cond(s); i++) {
    step(s, inputs(s));
    s.events.length = 0;
  }
  assert.ok(cond(s), 'condition jamais atteinte');
}

test('match entier entre ordinateurs : les huit patineurs jouent, temps de jeu proche pour les deux lignes, aucun changement en plein jeu', () => {
  for (const seed of [12, 13, 14]) {
    const s = make({ seed });
    let changes = 0;
    let prev = null;
    for (let i = 0; i < 400000 && s.phase !== 'final'; i++) {
      const before = s.phase;
      step(s);
      for (const e of s.events) {
        if (e.type !== 'lineChange') continue;
        changes++;
        assert.notEqual(before, 'play', 'changement de ligne pendant le jeu');
      }
      // Pendant le jeu, sans pénalité en cours, les patineurs sur la piste ne changent pas.
      const quiet = s.phase === 'play' && before === 'play' && !s.teams[0].penalties.length && !s.teams[1].penalties.length;
      const now = s.players.filter((p) => p.status === 'rink').map((p) => p.id).join();
      if (quiet && prev?.quiet) assert.equal(now, prev.now);
      prev = { quiet, now };
      s.events.length = 0;
    }
    assert.ok(changes >= 4, `changements : ${changes}`);
    for (let t = 0; t < 2; t++) {
      const sk = s.players.filter((p) => p.team === t && !p.goalie);
      for (const p of sk) assert.ok(p.toi > 5, `${p.name} n'a pas joué`);
      const [a, b] = [0, 1].map((l) => sk.filter((p) => p.line === l).reduce((n, p) => n + p.toi, 0));
      assert.ok(a / b > 0.55 && a / b < 1.8, `graine ${seed}, équipe ${t} : ligne 1 ${a.toFixed(0)} s, ligne 2 ${b.toFixed(0)} s`);
    }
  }
});

test('changement automatique : la ligne la plus fraîche entre au premier arrêt de jeu quand l écart est net', () => {
  const s = make();
  until(s, (m) => m.phase === 'play');
  s.teams[0].fresh = [1 - LINE_GAP - 0.05, 1];
  s.teams[1].fresh = [1 - LINE_GAP + 0.1, 1];
  whistle(s);
  until(s, (m) => m.phase === 'play');
  assert.equal(s.teams[0].line, 1);
  assert.equal(s.teams[1].line, 0, 'écart trop faible : pas de changement');
  assert.deepEqual(skatersOnRink(s, 0).map((p) => p.line), [1, 1, 1, 1]);
  assert.equal(skatersOnRink(s, 1).length, 4);
});

test('mode manuel : jamais sans demande, et au prochain arrêt de jeu après la touche', () => {
  const s = make({ humans: [{ team: 0 }], lineChange: 'manuel' });
  until(s, (m) => m.phase === 'play', () => [{}]);
  s.teams[0].fresh = [0.1, 1];
  whistle(s);
  until(s, (m) => m.phase === 'play', () => [{}]);
  assert.equal(s.teams[0].line, 0, 'pas de changement sans demande');
  step(s, [{ line: true }]);
  step(s, [{}]);
  assert.equal(s.teams[0].wantChange, true);
  assert.equal(s.teams[0].line, 0, 'pas de changement en plein jeu');
  for (let i = 0; i < 120; i++) step(s, [{}]);
  assert.equal(s.teams[0].line, 0);
  if (s.phase === 'play') whistle(s);
  until(s, (m) => m.phase === 'play' && m.teams[0].line === 1, () => [{}]);
  assert.equal(s.teams[0].wantChange, false);
  assert.deepEqual(skatersOnRink(s, 0).map((p) => p.line), [1, 1, 1, 1]);
  // En automatique, la touche ne fait rien.
  const a = make({ humans: [{ team: 0 }] });
  until(a, (m) => m.phase === 'play', () => [{}]);
  step(a, [{ line: true }]);
  assert.equal(a.teams[0].wantChange, false);
});

test('une équipe pénalisée reste en infériorité après un changement de ligne', () => {
  const s = make();
  until(s, (m) => m.phase === 'play');
  const off = skatersOnRink(s, 0)[0];
  off.status = 'box';
  s.teams[0].penalties.push({ code: 'CRO', kind: 'minor', offender: off.id, server: off.id, total: 60, remaining: 60 });
  s.teams[0].fresh = [0.2, 1];
  whistle(s);
  until(s, (m) => m.phase === 'play');
  assert.equal(s.teams[0].line, 1);
  assert.equal(skatersOnRink(s, 0).length, 3);
  assert.equal(off.status, 'box');
  assert.equal(skatersOnRink(s, 1).length, 4);
});

test('fatigue : 10 % au plus sur la vitesse, la ligne au banc récupère', () => {
  const s = make();
  until(s, (m) => m.phase === 'play');
  const p = skatersOnRink(s, 0).find((q) => q.id !== s.puck.carrier);
  const fresh = topSpeed(s, p);
  s.teams[0].fresh[0] = 0;
  assert.ok(Math.abs(topSpeed(s, p) / fresh - (1 - TIRED)) < 1e-9);
  assert.equal(TIRED, 0.1);
  assert.equal(form(s, s.players.find((q) => q.goalie)), 1);
  s.teams[0].fresh = [0.5, 0.5];
  const t0 = s.teams[0].fresh.slice();
  for (let i = 0; i < 60 && s.phase === 'play'; i++) step(s);
  assert.ok(s.teams[0].fresh[0] < t0[0] && s.teams[0].fresh[1] > t0[1]);
});

test('chaque période commence avec la ligne 1 ; pas de changement en prolongation', () => {
  const s = make({ overtime: true });
  until(s, (m) => m.phase === 'play');
  s.teams[0].fresh = [0.2, 1];
  whistle(s);
  until(s, (m) => m.phase === 'play');
  assert.equal(s.teams[0].line, 1);
  s.clock = 0.05;
  until(s, (m) => m.period === 2 && m.phase === 'play');
  assert.equal(s.teams[0].line, 0);
  s.score = [1, 1];
  s.teams[1].fresh = [0.3, 0.9];
  s.clock = 0.05;
  until(s, (m) => m.period === 3 && m.phase === 'play');
  assert.deepEqual(skatersOnRink(s, 1).map((p) => p.line), [1, 1, 1], 'la ligne la plus fraîche joue la prolongation');
  s.teams[1].fresh = [1, 0];
  whistle(s);
  until(s, (m) => m.phase === 'play' || m.phase === 'final');
  assert.equal(s.teams[1].line, 1);
});
